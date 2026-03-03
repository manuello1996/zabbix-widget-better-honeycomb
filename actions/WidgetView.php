<?php declare(strict_types = 0);
/*
** Copyright (C) 2001-2026 Zabbix SIA
**
** This program is free software: you can redistribute it and/or modify it under the terms of
** the GNU Affero General Public License as published by the Free Software Foundation, version 3.
**
** This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
** without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
** See the GNU Affero General Public License for more details.
**
** You should have received a copy of the GNU Affero General Public License along with this program.
** If not, see <https://www.gnu.org/licenses/>.
**/


namespace Modules\BetterHoneycomb\Actions;

use API,
	CArrayHelper,
	CControllerDashboardWidgetView,
	CControllerResponseData,
	CMacrosResolverHelper,
	CNumberParser,
	CSettingsHelper,
	Manager;

use Modules\BetterHoneycomb\Includes\WidgetForm;

class WidgetView extends CControllerDashboardWidgetView {

	private const LABEL_MAX_LINES = 10;
	private const LABEL_MAX_LINE_LENGTH = 250;
	private const MAX_ITEMS = 1000;
	private const SPACER_CELLS_BETWEEN_GROUPS = 1;

	protected function init(): void {
		parent::init();

		$this->addValidationRules([
			'with_config' => 'in 1',
			'max_items' => 'int32'
		]);
	}

	protected function doAction(): void {
		$force_show_all = ($this->fields_values['force_show_all'] ?? 0) == 1;
		$cells_limit = $force_show_all
			? null
			: $this->getInput('max_items', self::MAX_ITEMS) + 1;

		$data = [
			'name' => $this->getInput('name', $this->widget->getDefaultName()),
			'user' => [
				'debug_mode' => $this->getDebugMode()
			],
			'vars' => [
				'cells' => $this->getCells($cells_limit)
			]
		];

		if ($this->hasInput('with_config')) {
			$data['vars']['config'] = $this->getConfig();
		}

		$this->setResponse(new CControllerResponseData($data));
	}

	private function getCells(?int $limit): array {
		if ($this->isTemplateDashboard() && !$this->fields_values['hostids']) {
			return [];
		}

		$result_limit = $limit ?? PHP_INT_MAX;
		$batch_size = $limit ?? self::MAX_ITEMS;

		$groupids = null;
		$evaltype = null;
		$tags = null;

		if (!$this->isTemplateDashboard()) {
			if ($this->fields_values['groupids']) {
				$groupids = getSubGroups($this->fields_values['groupids']);
			}

			if ($this->fields_values['host_tags']) {
				$evaltype = $this->fields_values['evaltype_host'];
				$tags = $this->fields_values['host_tags'];
			}
		}

		$hostids = $this->fields_values['hostids'] ?: null;
		$filter = $this->fields_values['maintenance'] != 1
			? ['maintenance_status' => HOST_MAINTENANCE_STATUS_OFF]
			: null;

		if ($groupids !== null || $hostids !== null || $tags !== null || $filter !== null) {
			$db_hosts = API::Host()->get([
				'output' => [],
				'groupids' => $groupids,
				'hostids' => $hostids,
				'filter' => $filter,
				'evaltype' => $evaltype,
				'tags' => $tags,
				'monitored_hosts' => true,
				'preservekeys' => true
			]);

			if (!$db_hosts) {
				return [];
			}

			$hostids = array_keys($db_hosts);
		}

		$search_field = $this->isTemplateDashboard() ? 'name' : 'name_resolved';

		$options = [
			'output' => ['itemid', 'hostid', 'units', 'value_type', 'name_resolved', 'key_'],
			'selectHosts' => ['name'],
			'webitems' => true,
			'hostids' => $hostids,
			'evaltype' => $this->fields_values['evaltype_item'],
			'tags' => $this->fields_values['item_tags'] ?: null,
			'selectValueMap' => ['mappings'],
			'searchWildcardsEnabled' => true,
			'searchByAny' => true,
			'search' => [
				$search_field => in_array('*', $this->fields_values['items'], true)
					? null
					: $this->fields_values['items']
			],
			'filter' => ['status' => ITEM_STATUS_ACTIVE]
		];

		$db_items = API::Item()->get($options);

		if (!$db_items) {
			return [];
		}

		$items = CArrayHelper::renameObjectsKeys($db_items, ['name_resolved' => 'name']);
		$group_by = $this->fields_values['group_by'] ?? WidgetForm::GROUP_BY_HOST;
		$is_grouping_enabled = $group_by != WidgetForm::GROUP_BY_NONE;
		$item_patterns = $this->fields_values['items'] ?? ['*'];
		$item_pattern_matchers = $this->compileItemPatternMatchers($item_patterns);
		$hosts = [];

		if ($is_grouping_enabled && $group_by != WidgetForm::GROUP_BY_HOST) {
			$hosts = API::Host()->get([
				'output' => ['hostid'],
				'hostids' => array_values(array_unique(array_column($items, 'hostid'))),
				'selectHostGroups' => ['name'],
				'preservekeys' => true
			]);
		}

		foreach ($items as &$item) {
			$item['hostname'] = $item['hosts'][0]['name'];
			$item['item_pattern_index'] = $this->getPatternIndex($item['name'], $item_pattern_matchers);
			$item['hostgroup_names'] = '';

			if ($hosts && array_key_exists($item['hostid'], $hosts)) {
				$hostgroup_names = array_column($hosts[$item['hostid']]['hostgroups'], 'name');

				sort($hostgroup_names, SORT_NATURAL | SORT_FLAG_CASE);

				$item['hostgroup_names'] = implode(', ', $hostgroup_names);
			}
		}
		unset($item);

		switch ($group_by) {
			case WidgetForm::GROUP_BY_NONE:
				CArrayHelper::sort($items, ['item_pattern_index', 'name', 'hostname']);
				break;

			case WidgetForm::GROUP_BY_HOSTGROUP:
				CArrayHelper::sort($items, ['hostgroup_names', 'item_pattern_index', 'hostname', 'name']);
				break;

			case WidgetForm::GROUP_BY_HOSTGROUP_AND_HOST:
				CArrayHelper::sort($items, ['hostgroup_names', 'hostname', 'item_pattern_index', 'name']);
				break;

			case WidgetForm::GROUP_BY_HOST:
			default:
				CArrayHelper::sort($items, ['hostname', 'item_pattern_index', 'name']);
				break;
		}

		$total_items = count($items);
		$batches = (int) ceil($total_items / $batch_size);
		$group_item_counts = [];

		foreach ($items as $item) {
			$group_key = $this->getGroupKey($item, $group_by);
			$group_item_counts[$group_key] = ($group_item_counts[$group_key] ?? 0) + 1;
		}

		$show = array_flip($this->fields_values['show']);
		$history_period = timeUnitToSeconds(CSettingsHelper::get(CSettingsHelper::HISTORY_PERIOD));
		$group_new_line = ($this->fields_values['group_new_line'] ?? 0) == 1;
		$cells = [];
		$previous_group_key = null;
		$spacer_index = 0;
		$group_header_index = 0;
		$group_break_index = 0;

		for ($batch = 0; $batch < $batches && count($cells) < $result_limit; $batch++) {
			$batch_items = array_slice($items, $batch * $batch_size, $batch_size);
			$db_history = Manager::History()->getLastValues($batch_items, 1, $history_period);

			foreach ($batch_items as $item) {
				if (!array_key_exists($item['itemid'], $db_history)) {
					continue;
				}

				$last_value = $db_history[$item['itemid']][0]['value'];

				$primary_label = array_key_exists(WidgetForm::SHOW_PRIMARY_LABEL, $show)
					? $this->getCellLabel($item, $last_value, [
						'label' => $this->fields_values['primary_label'],
						'label_decimal_places' => $this->fields_values['primary_label_decimal_places'],
						'label_type' => $this->fields_values['primary_label_type'],
						'label_units' => $this->fields_values['primary_label_units'],
						'label_units_pos' => $this->fields_values['primary_label_units_pos'],
						'label_units_show' => $this->fields_values['primary_label_units_show']
					])
					: '';

				$secondary_label = array_key_exists(WidgetForm::SHOW_SECONDARY_LABEL, $show)
					? $this->getCellLabel($item, $last_value, [
						'label' => $this->fields_values['secondary_label'],
						'label_decimal_places' => $this->fields_values['secondary_label_decimal_places'],
						'label_type' => $this->fields_values['secondary_label_type'],
						'label_units' => $this->fields_values['secondary_label_units'],
						'label_units_pos' => $this->fields_values['secondary_label_units_pos'],
						'label_units_show' => $this->fields_values['secondary_label_units_show']
					])
					: '';

				$group_key = $this->getGroupKey($item, $group_by);
				$requires_group_header = $is_grouping_enabled;

				if (
					$is_grouping_enabled
					&&
					$previous_group_key !== null
					&& $group_key !== $previous_group_key
					&& self::SPACER_CELLS_BETWEEN_GROUPS > 0
					&& count($cells) < $result_limit - (2 + self::SPACER_CELLS_BETWEEN_GROUPS - 1)
				) {
					for ($i = 0; $i < self::SPACER_CELLS_BETWEEN_GROUPS; $i++) {
						$cells[] = [
							'hostid' => null,
							'itemid' => 'spacer-'.$spacer_index++,
							'primary_label' => '',
							'secondary_label' => '',
							'value' => null,
							'is_numeric' => false,
							'is_binary_units' => false,
							'key_' => null,
							'is_spacer' => true
						];
					}
				}

				if (
					$is_grouping_enabled
					&& $group_new_line
					&& $previous_group_key !== null
					&& $group_key !== $previous_group_key
					&& count($cells) < $result_limit - 2
				) {
					$cells[] = [
						'hostid' => null,
						'itemid' => 'group-break-'.$group_break_index++,
						'primary_label' => '',
						'secondary_label' => '',
						'value' => null,
						'is_numeric' => false,
						'is_binary_units' => false,
						'key_' => null,
						'is_group_break' => true
					];
				}

				if (
					$requires_group_header
					&& ($previous_group_key === null || $group_key !== $previous_group_key)
					&& count($cells) < $result_limit - 1
				) {
					$cells[] = [
						'hostid' => null,
						'itemid' => 'group-header-'.$group_header_index++,
						'group_id' => $group_key,
						'primary_label' => $this->getGroupTitle($item, $group_by),
						'secondary_label' => ($group_item_counts[$group_key] ?? 0).' items',
						'value' => null,
						'is_numeric' => false,
						'is_binary_units' => false,
						'key_' => null,
						'is_group_header' => true
					];
				}

				if (count($cells) < $result_limit) {
					$cells[] = [
						'hostid' => $item['hostid'],
						'itemid' => $item['itemid'],
						'group_id' => $group_key,
						'hostname' => $item['hostname'],
						'item_name' => $item['name'],
						'primary_label' => $primary_label,
						'secondary_label' => $secondary_label,
						'value' => $last_value,
						'is_numeric' => in_array($item['value_type'], [ITEM_VALUE_TYPE_FLOAT, ITEM_VALUE_TYPE_UINT64]),
						'is_binary_units' => isBinaryUnits($item['units']),
						'key_' => $item['key_']
					];
				}

				$previous_group_key = $group_key;

				if (count($cells) >= $result_limit) {
					break;
				}
			}
		}

		return $cells;
	}

	private function getCellLabel(array $item, $last_value, array $context_fields_values): string {
		if ($context_fields_values['label_type'] == WidgetForm::LABEL_TYPE_TEXT) {
			$label = $context_fields_values['label'];

			if (!$this->isTemplateDashboard() || $this->fields_values['hostids']) {
				$resolved_label = CMacrosResolverHelper::resolveItemBasedWidgetMacros(
					[$item['itemid'] => $item + ['label' => $label]],
					['label' => 'label']
				);
				$label = $resolved_label[$item['itemid']]['label'];
			}

			return $this->trimCellLabel($label);
		}

		switch ($item['value_type']) {
			case ITEM_VALUE_TYPE_FLOAT:
			case ITEM_VALUE_TYPE_UINT64:
				if ($context_fields_values['label_units_show'] == 1) {
					if ($context_fields_values['label_units'] !== '') {
						$item['units'] = $context_fields_values['label_units'];
					}
				}
				else {
					$item['units'] = '';
				}

				$formatted_value = formatHistoryValueRaw($last_value, $item, false, [
					'decimals' => $context_fields_values['label_decimal_places'],
					'decimals_exact' => true,
					'small_scientific' => false,
					'zero_as_zero' => false
				]);

				if ($context_fields_values['label_units_show'] == 1) {
					return $context_fields_values['label_units_pos'] == WidgetForm::UNITS_POSITION_BEFORE
						? $formatted_value['units'].' '.$formatted_value['value']
						: $formatted_value['value'].' '.$formatted_value['units'];
				}

				return $formatted_value['value'];

			default:
				return $this->trimCellLabel(formatHistoryValue($last_value, $item, false));
		}
	}

	private function trimCellLabel(string $label): string {
		$result = '';

		foreach (array_slice(explode("\n", $label, self::LABEL_MAX_LINES + 1), 0, self::LABEL_MAX_LINES) as $line) {
			$result .= ($result !== '' ? "\n" : '').mb_substr(trim($line), 0, self::LABEL_MAX_LINE_LENGTH);
		}

		return $result;
	}

	private function getPatternIndex(string $item_name, array $item_pattern_matchers): int {
		foreach ($item_pattern_matchers as $index => $matcher) {
			if ($matcher['is_all'] || preg_match($matcher['regex'], $item_name) === 1) {
				return $index;
			}
		}

		return count($item_pattern_matchers);
	}

	private function compileItemPatternMatchers(array $item_patterns): array {
		$matchers = [];

		foreach ($item_patterns as $item_pattern) {
			if ($item_pattern === '*') {
				$matchers[] = [
					'is_all' => true,
					'regex' => null
				];
			}
			else {
				$matchers[] = [
					'is_all' => false,
					'regex' => '/^'.str_replace(['\\*', '\\?'], ['.*', '.'], preg_quote($item_pattern, '/')).'$/ui'
				];
			}
		}

		return $matchers;
	}

	private function getGroupKey(array $item, int $group_by): string {
		switch ($group_by) {
			case WidgetForm::GROUP_BY_HOSTGROUP:
				return $item['hostgroup_names'];

			case WidgetForm::GROUP_BY_HOSTGROUP_AND_HOST:
				return $item['hostgroup_names'].'|'.$item['hostname'];

			case WidgetForm::GROUP_BY_HOST:
			default:
				return $item['hostname'];
		}
	}

	private function getGroupTitle(array $item, int $group_by): string {
		switch ($group_by) {
			case WidgetForm::GROUP_BY_HOSTGROUP:
				return $item['hostgroup_names'] !== '' ? $item['hostgroup_names'] : _('Ungrouped');

			case WidgetForm::GROUP_BY_HOSTGROUP_AND_HOST:
				return $item['hostgroup_names'] !== ''
					? $item['hostgroup_names'].' / '.$item['hostname']
					: $item['hostname'];

			case WidgetForm::GROUP_BY_HOST:
			default:
				return $item['hostname'];
		}
	}

	private function getConfig(): array {
		$config = [
			'bg_color' => $this->fields_values['bg_color'],
			'force_show_all' => ($this->fields_values['force_show_all'] ?? 0) == 1,
			'collapse_groups_on_load' => ($this->fields_values['collapse_groups_on_load'] ?? 0) == 1,
			'drilldown_new_tab' => ($this->fields_values['drilldown_new_tab'] ?? 1) == 1
		];

		$show = array_flip($this->fields_values['show']);

		if (array_key_exists(WidgetForm::SHOW_PRIMARY_LABEL, $show)) {
			$config['primary_label'] = [
				'show' => true,
				'is_custom_size' => $this->fields_values['primary_label_size_type'] == WidgetForm::LABEL_SIZE_CUSTOM,
				'is_bold' => $this->fields_values['primary_label_bold'] == 1,
				'color' => $this->fields_values['primary_label_color']
			];

			if ($this->fields_values['primary_label_size_type'] == WidgetForm::LABEL_SIZE_CUSTOM) {
				$config['primary_label']['size'] = $this->fields_values['primary_label_size'];
			}
		}
		else {
			$config['primary_label']['show'] = false;
		}

		if (array_key_exists(WidgetForm::SHOW_SECONDARY_LABEL, $show)) {
			$config['secondary_label'] = [
				'show' => true,
				'is_custom_size' => $this->fields_values['secondary_label_size_type'] == WidgetForm::LABEL_SIZE_CUSTOM,
				'is_bold' => $this->fields_values['secondary_label_bold'] == 1,
				'color' => $this->fields_values['secondary_label_color']
			];

			if ($this->fields_values['secondary_label_size_type'] == WidgetForm::LABEL_SIZE_CUSTOM) {
				$config['secondary_label']['size'] = $this->fields_values['secondary_label_size'];
			}
		}
		else {
			$config['secondary_label']['show'] = false;
		}

		$config['apply_interpolation'] = $this->fields_values['interpolation'] == 1;
		$config['thresholds'] = $this->fields_values['thresholds'];
		$config['auto_color_binary'] = ($this->fields_values['auto_color_binary'] ?? 0) == 1;
		$config['auto_color_zero'] = strtoupper(ltrim((string) ($this->fields_values['auto_color_zero'] ?? 'FF465C'), '#'));
		$config['auto_color_one'] = strtoupper(ltrim((string) ($this->fields_values['auto_color_one'] ?? '0EC9AC'), '#'));

		$number_parser = new CNumberParser([
			'with_size_suffix' => true,
			'with_time_suffix' => true,
			'is_binary_size' => false
		]);

		$number_parser_binary = new CNumberParser([
			'with_size_suffix' => true,
			'with_time_suffix' => true,
			'is_binary_size' => true
		]);

		foreach ($config['thresholds'] as &$threshold) {
			$number_parser_binary->parse($threshold['threshold']);
			$threshold['threshold_binary'] = $number_parser_binary->calcValue();

			$number_parser->parse($threshold['threshold']);
			$threshold['threshold'] = $number_parser->calcValue();
		}
		unset($threshold);

		if ($config['auto_color_zero'] === '') {
			$config['auto_color_zero'] = 'FF465C';
		}

		if ($config['auto_color_one'] === '') {
			$config['auto_color_one'] = '0EC9AC';
		}

		return $config;
	}

}

