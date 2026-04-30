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


namespace Modules\BetterHoneycomb\Includes;

use Zabbix\Widgets\{
	CWidgetField,
	CWidgetForm,
	Fields\CWidgetFieldCheckBox,
	Fields\CWidgetFieldCheckBoxList,
	Fields\CWidgetFieldColor,
	Fields\CWidgetFieldIntegerBox,
	Fields\CWidgetFieldMultiSelectGroup,
	Fields\CWidgetFieldMultiSelectHost,
	Fields\CWidgetFieldPatternSelectItem,
	Fields\CWidgetFieldRadioButtonList,
	Fields\CWidgetFieldSelect,
	Fields\CWidgetFieldTags,
	Fields\CWidgetFieldTextArea,
	Fields\CWidgetFieldTextBox,
	Fields\CWidgetFieldThresholds
};

use CWidgetsData;

/**
 * Honeycomb widget form.
 */
class WidgetForm extends CWidgetForm {

	public const SHOW_PRIMARY_LABEL = 1;
	public const SHOW_SECONDARY_LABEL = 2;

	public const LABEL_TYPE_TEXT = 0;
	public const LABEL_TYPE_VALUE = 1;

	public const LABEL_SIZE_AUTO = 0;
	public const LABEL_SIZE_CUSTOM = 1;

	public const UNITS_POSITION_BEFORE = 0;
	public const UNITS_POSITION_AFTER = 1;

	public const GROUP_BY_HOST = 0;
	public const GROUP_BY_HOSTGROUP = 1;
	public const GROUP_BY_HOSTGROUP_AND_HOST = 2;
	public const GROUP_BY_NONE = 3;

	public const BINARY_ZERO_PROBLEM = 0;
	public const BINARY_ONE_PROBLEM = 1;

	public const GROUP_SORT_NAME = 0;
	public const GROUP_SORT_SEVERITY = 1;
	public const GROUP_SORT_PROBLEM_COUNT = 2;

	public const CELL_SORT_DEFAULT = 0;
	public const CELL_SORT_SEVERITY = 1;
	public const CELL_SORT_VALUE_ASC = 2;
	public const CELL_SORT_VALUE_DESC = 3;

	public const COLLAPSE_PERSISTENCE_SESSION = 0;
	public const COLLAPSE_PERSISTENCE_LOCAL = 1;
	public const COLLAPSE_PERSISTENCE_RESET = 2;

	public function addFields(): self {
		return $this
			->addField($this->isTemplateDashboard()
				? null
				: new CWidgetFieldMultiSelectGroup('groupids', _('Host groups'))
			)
			->addField(
				(new CWidgetFieldMultiSelectHost('hostids', _('Hosts')))
					->setDefault($this->isTemplateDashboard()
						? [
							CWidgetField::FOREIGN_REFERENCE_KEY => CWidgetField::createTypedReference(
								CWidgetField::REFERENCE_DASHBOARD, CWidgetsData::DATA_TYPE_HOST_IDS
							)
						]
						: []
					)
			)
			->addField($this->isTemplateDashboard()
				? null
				: (new CWidgetFieldRadioButtonList('evaltype_host', _('Host tags'), [
					TAG_EVAL_TYPE_AND_OR => _('And/Or'),
					TAG_EVAL_TYPE_OR => _('Or')
				]))->setDefault(TAG_EVAL_TYPE_AND_OR)
			)
			->addField($this->isTemplateDashboard()
				? null
				: new CWidgetFieldTags('host_tags')
			)
			->addField(
				(new CWidgetFieldPatternSelectItem('items', _('Item patterns')))
					->setFlags(CWidgetField::FLAG_NOT_EMPTY | CWidgetField::FLAG_LABEL_ASTERISK)
			)
			->addField(
				(new CWidgetFieldRadioButtonList('group_by', _('Grouping'), [
					self::GROUP_BY_NONE => _('None'),
					self::GROUP_BY_HOST => _('Host'),
					self::GROUP_BY_HOSTGROUP => _('Host group'),
					self::GROUP_BY_HOSTGROUP_AND_HOST => _('Host group + host')
				]))->setDefault(self::GROUP_BY_NONE)
			)
			->addField(
				new CWidgetFieldCheckBox('group_new_line', _('Start each group on a new line'))
			)
			->addField(
				new CWidgetFieldCheckBox('collapse_groups_on_load', _('Load all groups collapsed'))
			)
			->addField(
				(new CWidgetFieldSelect('collapse_persistence', _('Collapse state'), [
					self::COLLAPSE_PERSISTENCE_SESSION => _('Remember during browser session'),
					self::COLLAPSE_PERSISTENCE_LOCAL => _('Remember in this browser'),
					self::COLLAPSE_PERSISTENCE_RESET => _('Reset on every load')
				]))->setDefault(self::COLLAPSE_PERSISTENCE_SESSION)
			)
			->addField(
				new CWidgetFieldCheckBox('force_show_all', _('Show all honeycombs (no hiding)'))
			)
			->addField(
				new CWidgetFieldCheckBox('show_filter', _('Show search filter'))
			)
			->addField(
				new CWidgetFieldCheckBox('show_legend', _('Show legend'))
			)
			->addField(
				(new CWidgetFieldSelect('group_sort', _('Group sorting'), [
					self::GROUP_SORT_NAME => _('Name'),
					self::GROUP_SORT_SEVERITY => _('Worst severity'),
					self::GROUP_SORT_PROBLEM_COUNT => _('Problem count')
				]))->setDefault(self::GROUP_SORT_NAME)
			)
			->addField(
				(new CWidgetFieldSelect('cell_sort', _('Cell sorting'), [
					self::CELL_SORT_DEFAULT => _('Default'),
					self::CELL_SORT_SEVERITY => _('Severity'),
					self::CELL_SORT_VALUE_ASC => _('Value ascending'),
					self::CELL_SORT_VALUE_DESC => _('Value descending')
				]))->setDefault(self::CELL_SORT_DEFAULT)
			)
			->addField(
				(new CWidgetFieldCheckBox('drilldown_new_tab', _('Open latest data in new tab')))->setDefault(1)
			)
			->addField(
				(new CWidgetFieldRadioButtonList('evaltype_item', _('Item tags'), [
					TAG_EVAL_TYPE_AND_OR => _('And/Or'),
					TAG_EVAL_TYPE_OR => _('Or')
				]))->setDefault(TAG_EVAL_TYPE_AND_OR)
			)
			->addField(
				new CWidgetFieldTags('item_tags')
			)
			->addField(
				new CWidgetFieldCheckBox('maintenance',
					$this->isTemplateDashboard() ? _('Show data in maintenance') : _('Show hosts in maintenance')
				)
			)
			->addField(
				(new CWidgetFieldCheckBoxList('show', _('Show'), [
					self::SHOW_PRIMARY_LABEL => _('Primary label'),
					self::SHOW_SECONDARY_LABEL => _('Secondary label')
				]))
					->setDefault([self::SHOW_PRIMARY_LABEL, self::SHOW_SECONDARY_LABEL])
					->setFlags(CWidgetField::FLAG_LABEL_ASTERISK)
			)
			->addField(
				(new CWidgetFieldRadioButtonList('primary_label_type', _('Type'), [
					self::LABEL_TYPE_TEXT => _('Text'),
					self::LABEL_TYPE_VALUE => _('Value')
				]))->setDefault(self::LABEL_TYPE_TEXT)
			)
			->addField(
				(new CWidgetFieldIntegerBox('primary_label_decimal_places', _('Decimal places'), 0, 6))
					->setDefault(2)
					->setFlags(CWidgetField::FLAG_NOT_EMPTY)
					->prefixLabel(_('Primary label'))
			)
			->addField(
				(new CWidgetFieldTextArea('primary_label', _('Text')))
					->setDefault('{HOST.NAME}')
					->setFlags(CWidgetField::FLAG_NOT_EMPTY | CWidgetField::FLAG_LABEL_ASTERISK)
					->prefixLabel(_('Primary label'))
			)
			->addField(
				(new CWidgetFieldRadioButtonList('primary_label_size_type', null, [
					self::LABEL_SIZE_AUTO => _('Auto'),
					self::LABEL_SIZE_CUSTOM => _('Custom')
				]))->setDefault(self::LABEL_SIZE_AUTO)
			)
			->addField(
				(new CWidgetFieldIntegerBox('primary_label_size', _('Size'), 1, 100))
					->setDefault(20)
					->prefixLabel(_('Primary label'))
			)
			->addField(
				new CWidgetFieldCheckBox('primary_label_bold', _('Bold'))
			)
			->addField(
				(new CWidgetFieldColor('primary_label_color', _('Color')))->prefixLabel(_('Primary label'))
			)
			->addField(
				(new CWidgetFieldCheckBox('primary_label_units_show'))->setDefault(1)
			)
			->addField(
				new CWidgetFieldTextBox('primary_label_units', _('Units'))
			)
			->addField(
				(new CWidgetFieldSelect('primary_label_units_pos', _('Position'), [
					self::UNITS_POSITION_BEFORE => _('Before value'),
					self::UNITS_POSITION_AFTER => _('After value')
				]))->setDefault(self::UNITS_POSITION_AFTER)
			)
			->addField(
				(new CWidgetFieldRadioButtonList('secondary_label_type', _('Type'), [
					self::LABEL_TYPE_TEXT => _('Text'),
					self::LABEL_TYPE_VALUE => _('Value')
				]))->setDefault(self::LABEL_TYPE_VALUE)
			)
			->addField(
				(new CWidgetFieldIntegerBox('secondary_label_decimal_places', _('Decimal places'), 0, 6))
					->setDefault(2)
					->setFlags(CWidgetField::FLAG_NOT_EMPTY)
					->prefixLabel(_('Secondary label'))
			)
			->addField(
				(new CWidgetFieldTextArea('secondary_label', _('Text')))
					->setDefault('{{ITEM.LASTVALUE}.fmtnum(2)}')
					->setFlags(CWidgetField::FLAG_NOT_EMPTY | CWidgetField::FLAG_LABEL_ASTERISK)
					->prefixLabel(_('Secondary label'))
			)
			->addField(
				(new CWidgetFieldRadioButtonList('secondary_label_size_type', null, [
					self::LABEL_SIZE_AUTO => _('Auto'),
					self::LABEL_SIZE_CUSTOM => _('Custom')
				]))->setDefault(self::LABEL_SIZE_AUTO)
			)
			->addField(
				(new CWidgetFieldIntegerBox('secondary_label_size', _('Size'), 1, 100))
					->setDefault(30)
					->prefixLabel(_('Secondary label'))
			)
			->addField(
				(new CWidgetFieldCheckBox('secondary_label_bold', _('Bold')))->setDefault(1)
			)
			->addField(
				(new CWidgetFieldColor('secondary_label_color', _('Color')))->prefixLabel(_('Secondary label'))
			)
			->addField(
				(new CWidgetFieldCheckBox('secondary_label_units_show'))->setDefault(1)
			)
			->addField(
				(new CWidgetFieldTextBox('secondary_label_units', _('Units')))
			)
			->addField(
				(new CWidgetFieldSelect('secondary_label_units_pos', _('Position'), [
					self::UNITS_POSITION_BEFORE => _('Before value'),
					self::UNITS_POSITION_AFTER => _('After value')
				]))->setDefault(self::UNITS_POSITION_AFTER)
			)
			->addField(
				new CWidgetFieldColor('bg_color', _('Background color'))
			)
			->addField(
				new CWidgetFieldCheckBox('interpolation', _('Color interpolation'))
			)
			->addField(
				(new CWidgetFieldCheckBox('highlight_problem_items', _('Highlight items in active problems')))
					->setDefault(1)
			)
			->addField(
				(new CWidgetFieldColor('active_problem_color', _('Active problem color')))->setDefault('FFC107')
			)
			->addField(
				new CWidgetFieldCheckBox('auto_color_binary', _('Auto color by value (0/1)'))
			)
			->addField(
				(new CWidgetFieldSelect('binary_problem_value', _('Binary problem value'), [
					self::BINARY_ZERO_PROBLEM => _('0 is problem, 1 is OK'),
					self::BINARY_ONE_PROBLEM => _('1 is problem, 0 is OK')
				]))->setDefault(self::BINARY_ZERO_PROBLEM)
			)
			->addField(
				(new CWidgetFieldColor('auto_color_zero', _('Color for 0')))->setDefault('FF465C')
			)
			->addField(
				(new CWidgetFieldColor('auto_color_one', _('Color for 1')))->setDefault('0EC9AC')
			)
			->addField(
				new CWidgetFieldThresholds('thresholds', _('Thresholds'))
			);
	}

	public function validate(bool $strict = false): array {
		if ($strict && $this->isTemplateDashboard()) {
			$this->getField('hostids')->setValue([
				CWidgetField::FOREIGN_REFERENCE_KEY => CWidgetField::createTypedReference(
					CWidgetField::REFERENCE_DASHBOARD, CWidgetsData::DATA_TYPE_HOST_IDS
				)
			]);
		}

		$errors = parent::validate($strict);

		if ($errors) {
			return $errors;
		}

		if (!$this->getFieldValue('show')) {
			$errors[] = _s('Invalid parameter "%1$s": %2$s.', _('Show'), _('at least one option must be selected'));
		}

		return $errors;
	}
}
