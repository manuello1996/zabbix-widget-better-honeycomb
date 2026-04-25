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
	private const FORCE_SHOW_ALL_MAX_ITEMS = 5000;
	private const COMPACT_RENDERING_THRESHOLD = 1500;
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
			? self::FORCE_SHOW_ALL_MAX_ITEMS + 1
			: $this->getInput('max_items', self::MAX_ITEMS) + 1;

		$cells = $this->getCells($cells_limit);
		$has_more = $force_show_all && count($cells) > self::FORCE_SHOW_ALL_MAX_ITEMS;

		if ($has_more) {
			$cells = array_slice($cells, 0, self::FORCE_SHOW_ALL_MAX_ITEMS);
		}

		$data = [
			'name' => $this->getInput('name', $this->widget->getDefaultName()),
			'user' => [
				'debug_mode' => $this->getDebugMode()
			],
			'vars' => [
				'cells' => $cells
			]
		];

		if ($this->hasInput('with_config')) {
			$data['vars']['config'] = $this->getConfig();
			$data['vars']['config']['force_show_all_limit'] = self::FORCE_SHOW_ALL_MAX_ITEMS;
			$data['vars']['config']['compact_rendering_threshold'] = self::COMPACT_RENDERING_THRESHOLD;
			$data['vars']['config']['has_more'] = $has_more;
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
			'selectHosts' => ['name', 'maintenance_status'],
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
		$group_by = $this->fields_values['group_by'] ?? WidgetForm::GROUP_BY_NONE;
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
		$show = array_flip($this->fields_values['show']);
		$config = $this->getConfig();
		$acknowledged_problem_itemids = $this->getAcknowledgedProblemItemIds(array_column($items, 'itemid'));
		$history_period = timeUnitToSeconds(CSettingsHelper::get(CSettingsHelper::HISTORY_PERIOD));
		$group_new_line = ($this->fields_values['group_new_line'] ?? 0) == 1;
		$cells = [];
		$previous_group_key = null;
		$spacer_index = 0;
		$group_header_index = 0;
		$group_break_index = 0;

		for ($batch = 0; $batch < $batches && count($cells) < $result_limit; $batch++) {
			$batch_items = array_slice($items, $batch * $batch_size, $batch_size);
			$db_history = Manager::History()->getLastValues($batch_items, 2, $history_period);

			foreach ($batch_items as $item) {
				if (!array_key_exists($item['itemid'], $db_history)) {
					continue;
				}

				$last_value = $db_history[$item['itemid']][0]['value'];
				$last_clock = $db_history[$item['itemid']][0]['clock'] ?? null;
				$previous_value = $db_history[$item['itemid']][1]['value'] ?? null;

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
						$cells[] = $this->makeSpacerCell($spacer_index++);
					}
				}

				if (
					$is_grouping_enabled
					&& $group_new_line
					&& $previous_group_key !== null
					&& $group_key !== $previous_group_key
					&& count($cells) < $result_limit - 2
				) {
					$cells[] = $this->makeGroupBreakCell($group_break_index++);
				}

				if (
					$requires_group_header
					&& ($previous_group_key === null || $group_key !== $previous_group_key)
					&& count($cells) < $result_limit - 1
				) {
					$cells[] = $this->makeGroupHeaderCell($group_header_index++, $item, $group_by);
				}

				if (count($cells) < $result_limit) {
					$cells[] = $this->makeDataCell(
						$item,
						$group_by,
						$group_key,
						$primary_label,
						$secondary_label,
						$last_value,
						$last_clock,
						$this->getSeverityScore($item, $last_value, $config),
						$this->getValueTrend($item, $last_value, $previous_value),
						array_key_exists($item['itemid'], $acknowledged_problem_itemids)
					);
				}

				$previous_group_key = $group_key;

				if (count($cells) >= $result_limit) {
					break;
				}
			}
		}

		return $this->applyGroupSummaries($cells);
	}

	private function makeSpacerCell(int $index): array {
		return [
			'hostid' => null,
			'itemid' => 'spacer-'.$index,
			'primary_label' => '',
			'secondary_label' => '',
			'value' => null,
			'is_numeric' => false,
			'is_binary_units' => false,
			'key_' => null,
			'is_spacer' => true
		];
	}

	private function makeGroupBreakCell(int $index): array {
		return [
			'hostid' => null,
			'itemid' => 'group-break-'.$index,
			'primary_label' => '',
			'secondary_label' => '',
			'value' => null,
			'is_numeric' => false,
			'is_binary_units' => false,
			'key_' => null,
			'is_group_break' => true
		];
	}

	private function makeGroupHeaderCell(int $index, array $item, int $group_by): array {
		return [
			'hostid' => null,
			'itemid' => 'group-header-'.$index,
			'group_id' => $this->getGroupKey($item, $group_by),
			'primary_label' => $this->getGroupTitle($item, $group_by),
			'secondary_label' => '',
			'value' => null,
			'is_numeric' => false,
			'is_binary_units' => false,
			'key_' => null,
			'is_group_header' => true
		];
	}

	private function makeDataCell(
		array $item,
		int $group_by,
		string $group_key,
		string $primary_label,
		string $secondary_label,
		$last_value,
		?int $last_clock,
		int $severity_score,
		array $trend,
		bool $has_acknowledged_problem
	): array {
		return [
			'hostid' => $item['hostid'],
			'itemid' => $item['itemid'],
			'group_id' => $group_key,
			'group_name' => $this->getGroupTitle($item, $group_by),
			'hostname' => $item['hostname'],
			'item_name' => $item['name'],
			'primary_label' => $primary_label,
			'secondary_label' => $secondary_label,
			'value' => $last_value,
			'formatted_value' => formatHistoryValue($last_value, $item, false),
			'last_clock' => $last_clock,
			'is_numeric' => in_array($item['value_type'], [ITEM_VALUE_TYPE_FLOAT, ITEM_VALUE_TYPE_UINT64]),
			'is_binary_units' => isBinaryUnits($item['units']),
			'severity_score' => $severity_score,
			'is_problem' => $severity_score > 0,
			'is_maintenance' => ((int) ($item['hosts'][0]['maintenance_status'] ?? HOST_MAINTENANCE_STATUS_OFF))
				== HOST_MAINTENANCE_STATUS_ON,
			'has_acknowledged_problem' => $has_acknowledged_problem,
			'trend' => $trend['trend'],
			'trend_delta' => $trend['delta'],
			'key_' => $item['key_']
		];
	}

	private function applyGroupSummaries(array $cells): array {
		$group_summaries = [];
		$current_group_id = null;

		foreach ($cells as $cell) {
			if (($cell['is_group_header'] ?? false) === true) {
				$current_group_id = (string) $cell['group_id'];
				$group_summaries[$current_group_id] = [
					'item_count' => 0,
					'problem_count' => 0,
					'worst_severity' => 0,
					'maintenance_count' => 0,
					'acknowledged_problem_count' => 0,
					'trend_up_count' => 0,
					'trend_down_count' => 0
				];

				continue;
			}

			if ($current_group_id === null || ($cell['is_spacer'] ?? false) === true
					|| ($cell['is_group_break'] ?? false) === true) {
				continue;
			}

			$severity_score = (int) ($cell['severity_score'] ?? 0);
			$group_summaries[$current_group_id]['item_count']++;
			$group_summaries[$current_group_id]['problem_count'] += $severity_score > 0 ? 1 : 0;
			$group_summaries[$current_group_id]['maintenance_count'] += ($cell['is_maintenance'] ?? false) ? 1 : 0;
			$group_summaries[$current_group_id]['acknowledged_problem_count'] +=
				($cell['has_acknowledged_problem'] ?? false) ? 1 : 0;
			$group_summaries[$current_group_id]['trend_up_count'] += ($cell['trend'] ?? '') === 'up' ? 1 : 0;
			$group_summaries[$current_group_id]['trend_down_count'] += ($cell['trend'] ?? '') === 'down' ? 1 : 0;
			$group_summaries[$current_group_id]['worst_severity'] = max(
				$group_summaries[$current_group_id]['worst_severity'],
				$severity_score
			);
		}

		foreach ($cells as &$cell) {
			if (($cell['is_group_header'] ?? false) !== true) {
				continue;
			}

			$group_id = (string) $cell['group_id'];
			$summary = $group_summaries[$group_id] ?? [
				'item_count' => 0,
				'problem_count' => 0,
				'worst_severity' => 0,
				'maintenance_count' => 0,
				'acknowledged_problem_count' => 0,
				'trend_up_count' => 0,
				'trend_down_count' => 0
			];

			$cell += [
				'group_item_count' => $summary['item_count'],
				'group_problem_count' => $summary['problem_count'],
				'group_worst_severity' => $summary['worst_severity'],
				'group_maintenance_count' => $summary['maintenance_count'],
				'group_acknowledged_problem_count' => $summary['acknowledged_problem_count'],
				'group_trend_up_count' => $summary['trend_up_count'],
				'group_trend_down_count' => $summary['trend_down_count']
			];
			$cell['secondary_label'] = $this->getGroupSummaryLabel($summary);
		}
		unset($cell);

		return $cells;
	}

	private function getGroupSummaryLabel(array $summary): string {
		$item_count = (int) $summary['item_count'];
		$problem_count = (int) $summary['problem_count'];
		$count_label = $item_count.' '.($item_count == 1 ? _('item') : _('items'));

		return $problem_count > 0
			? $count_label.' | '.$problem_count.' '.($problem_count == 1 ? _('problem') : _('problems'))
			: $count_label.' | '._('OK');
	}

	private function getSeverityScore(array $item, $last_value, array $config): int {
		if (!in_array($item['value_type'], [ITEM_VALUE_TYPE_FLOAT, ITEM_VALUE_TYPE_UINT64])) {
			return 0;
		}

		$value = (float) $last_value;

		if ($config['auto_color_binary']) {
			if ($value == (float) $config['binary_problem_value']) {
				return 100;
			}

			return 0;
		}

		$threshold_type = isBinaryUnits($item['units']) ? 'threshold_binary' : 'threshold';
		$score = 0;

		foreach ($config['thresholds'] as $threshold) {
			if ($value >= (float) $threshold[$threshold_type]) {
				$score++;
			}
		}

		return $score;
	}

	private function getValueTrend(array $item, $last_value, $previous_value): array {
		if ($previous_value === null) {
			return [
				'trend' => 'unknown',
				'delta' => null
			];
		}

		if (in_array($item['value_type'], [ITEM_VALUE_TYPE_FLOAT, ITEM_VALUE_TYPE_UINT64])) {
			$delta = (float) $last_value - (float) $previous_value;

			return [
				'trend' => $delta > 0 ? 'up' : ($delta < 0 ? 'down' : 'flat'),
				'delta' => $delta
			];
		}

		return [
			'trend' => (string) $last_value === (string) $previous_value ? 'flat' : 'changed',
			'delta' => null
		];
	}

	private function getAcknowledgedProblemItemIds(array $itemids): array {
		$itemids = array_values(array_unique(array_filter($itemids)));

		if (!$itemids) {
			return [];
		}

		try {
			$triggers = API::Trigger()->get([
				'output' => ['triggerid'],
				'itemids' => $itemids,
				'filter' => [
					'value' => defined('TRIGGER_VALUE_TRUE') ? constant('TRIGGER_VALUE_TRUE') : 1
				],
				'selectItems' => ['itemid'],
				'preservekeys' => true
			]);

			if (!$triggers) {
				return [];
			}

			$problems = API::Problem()->get([
				'output' => ['objectid', 'acknowledged'],
				'objectids' => array_keys($triggers),
				'source' => defined('EVENT_SOURCE_TRIGGERS') ? constant('EVENT_SOURCE_TRIGGERS') : 0,
				'object' => defined('EVENT_OBJECT_TRIGGER') ? constant('EVENT_OBJECT_TRIGGER') : 0
			]);
		}
		catch (\Throwable $exception) {
			return [];
		}

		$acknowledged_itemids = [];

		foreach ($problems as $problem) {
			if ((int) ($problem['acknowledged'] ?? 0) !== 1) {
				continue;
			}

			foreach ($triggers[$problem['objectid']]['items'] ?? [] as $item) {
				$acknowledged_itemids[$item['itemid']] = true;
			}
		}

		return $acknowledged_itemids;
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
			case WidgetForm::GROUP_BY_NONE:
				return '';

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
			'collapse_persistence' => (int) ($this->fields_values['collapse_persistence']
				?? WidgetForm::COLLAPSE_PERSISTENCE_SESSION),
			'drilldown_new_tab' => ($this->fields_values['drilldown_new_tab'] ?? 1) == 1,
			'show_filter' => ($this->fields_values['show_filter'] ?? 0) == 1,
			'show_legend' => ($this->fields_values['show_legend'] ?? 0) == 1,
			'group_sort' => (int) ($this->fields_values['group_sort'] ?? WidgetForm::GROUP_SORT_NAME),
			'cell_sort' => (int) ($this->fields_values['cell_sort'] ?? WidgetForm::CELL_SORT_DEFAULT)
		];

		$show = array_flip($this->fields_values['show']);

		if (array_key_exists(WidgetForm::SHOW_PRIMARY_LABEL, $show)) {
			$config['primary_label'] = [
				'show' => true,
				'is_custom_size' => $this->fields_values['primary_label_size_type'] == WidgetForm::LABEL_SIZE_CUSTOM,
				'is_bold' => $this->fields_values['primary_label_bold'] == 1,
				'color' => $this->normalizeColor($this->fields_values['primary_label_color'])
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
				'color' => $this->normalizeColor($this->fields_values['secondary_label_color'])
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
		$config['binary_problem_value'] = (int) ($this->fields_values['binary_problem_value']
			?? WidgetForm::BINARY_ZERO_PROBLEM);
		$config['bg_color'] = $this->normalizeColor($config['bg_color']);
		$config['auto_color_zero'] = $this->normalizeColor(
			$this->fields_values['auto_color_zero'] ?? 'FF465C',
			'FF465C'
		);
		$config['auto_color_one'] = $this->normalizeColor(
			$this->fields_values['auto_color_one'] ?? '0EC9AC',
			'0EC9AC'
		);

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
			$threshold['color'] = $this->normalizeColor($threshold['color'] ?? '');

			$number_parser_binary->parse($threshold['threshold']);
			$threshold['threshold_binary'] = $number_parser_binary->calcValue();

			$number_parser->parse($threshold['threshold']);
			$threshold['threshold'] = $number_parser->calcValue();
		}
		unset($threshold);

		$config['thresholds'] = array_values(array_filter($config['thresholds'],
			static function (array $threshold): bool {
				return $threshold['color'] !== '';
			}
		));

		return $config;
	}

	private function normalizeColor($color, string $fallback = ''): string {
		$color = strtoupper(ltrim(trim((string) $color), '#'));

		return preg_match('/^[0-9A-F]{6}$/', $color) === 1
			? $color
			: $fallback;
	}

}

