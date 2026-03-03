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


class CWidgetBetterHoneycomb extends CWidget {

	static ZBX_STYLE_DASHBOARD_WIDGET_PADDING_V = 8;
	static ZBX_STYLE_DASHBOARD_WIDGET_PADDING_H = 10;

	/**
	 * @type {CSVGBetterHoneycomb|null}
	 */
	#honeycomb = null;

	/**
	 * @type {boolean}
	 */
	#user_interacting = false;

	/**
	 * @type {number}
	 */
	#interacting_timeout_id;

	/**
	 * @type {number}
	 */
	#resize_timeout_id;

	/**
	 * @type {number}
	 */
	#items_max_count = 1000;

	/**
	 * @type {number}
	 */
	#items_loaded_count = 0;

	/**
	 * @type {boolean}
	 */
	#force_show_all = false;

	/**
	 * @type {Set<string>}
	 */
	#collapsed_groups = new Set();

	/**
	 * @type {boolean}
	 */
	#collapsed_groups_initialized = false;

	/**
	 * @type {Array}
	 */
	#last_cells = [];

	/**
	 * @type {Object}
	 */
	#last_config = {};

	/**
	 * Cells data from the request.
	 *
	 * @type {Map<string, Object>}
	 */
	#cells_data = new Map();

	/**
	 * Host ID of selected cell
	 *
	 * @type {string|null}
	 */
	#selected_hostid = null;

	/**
	 * Item ID of selected cell
	 *
	 * @type {string|null}
	 */
	#selected_itemid = null;

	/**
	 * Key of selected item.
	 *
	 * @type {string|null}
	 */
	#selected_key_ = null;

	onActivate() {
		this.#items_max_count = this.#getItemsMaxCount();
	}

	onDeactivate() {
		clearTimeout(this.#resize_timeout_id);
	}

	isUserInteracting() {
		return this.#user_interacting || super.isUserInteracting();
	}

	onResize() {
		if (this.getState() !== WIDGET_STATE_ACTIVE) {
			return;
		}

		clearTimeout(this.#resize_timeout_id);

		const old_items_max_count = this.#items_max_count;
		this.#items_max_count = this.#getItemsMaxCount();

		if (this.#items_max_count > old_items_max_count && this.#items_loaded_count >= old_items_max_count) {
			this._startUpdating();
		}

		this.#resize_timeout_id = setTimeout(() => {
			if (this.#honeycomb !== null) {
				this.#honeycomb.setSize(super._getContentsSize());
			}
		}, 100);
	}

	getUpdateRequestData() {
		return {
			...super.getUpdateRequestData(),
			max_items: this.#items_max_count,
			with_config: 1
		};
	}

	setContents(response) {
		this._body.style.overflow = 'auto';

		const cells = Array.isArray(response?.cells) ? response.cells : [];
		const config = response?.config ?? {
			bg_color: '',
			force_show_all: this.#force_show_all,
			collapse_groups_on_load: false,
			drilldown_new_tab: true,
			auto_color_binary: false,
			auto_color_zero: 'FF465C',
			auto_color_one: '0EC9AC',
			primary_label: {
				show: true,
				is_custom_size: false,
				is_bold: false,
				color: ''
			},
			secondary_label: {
				show: true,
				is_custom_size: false,
				is_bold: true,
				color: ''
			},
			apply_interpolation: false,
			thresholds: []
		};

		if (this.#honeycomb === null) {
			const padding = {
				vertical: CWidgetBetterHoneycomb.ZBX_STYLE_DASHBOARD_WIDGET_PADDING_V,
				horizontal: CWidgetBetterHoneycomb.ZBX_STYLE_DASHBOARD_WIDGET_PADDING_H,
			};

			this.#honeycomb = new CSVGBetterHoneycomb(padding, config);
			this._body.prepend(this.#honeycomb.getSVGElement());

			this.#honeycomb.setSize(super._getContentsSize());

			this.#honeycomb.getSVGElement().addEventListener(CSVGBetterHoneycomb.EVENT_CELL_CLICK, e => {
					this.#selected_hostid = e.detail.hostid;
					this.#selected_itemid = e.detail.itemid;
					this.#selected_key_ = this.#cells_data.get(this.#selected_itemid).key_;

					this.#broadcast();
					this.#openDrilldown(this.#cells_data.get(this.#selected_itemid));
			});

			this.#honeycomb.getSVGElement().addEventListener(CSVGBetterHoneycomb.EVENT_CELL_ENTER, e => {
				clearTimeout(this.#interacting_timeout_id);
				this.#user_interacting = true;
			});

			this.#honeycomb.getSVGElement().addEventListener(CSVGBetterHoneycomb.EVENT_CELL_LEAVE, e => {
				this.#interacting_timeout_id = setTimeout(() => {
					this.#user_interacting = false;
				}, 1000);
			});

			this.#honeycomb.getSVGElement().addEventListener(CSVGBetterHoneycomb.EVENT_GROUP_HEADER_CLICK, e => {
				const group_id = e.detail?.group_id ?? null;

				if (group_id === null) {
					return;
				}

				if (this.#collapsed_groups.has(group_id)) {
					this.#collapsed_groups.delete(group_id);
				}
				else {
					this.#collapsed_groups.add(group_id);
				}

				this.#saveCollapsedGroupsToSession();
				this.#renderCurrentState();
			});
		}
		else {
			this.#honeycomb.setConfig(config);
		}

		const new_force_show_all = config?.force_show_all === true;

		if (new_force_show_all !== this.#force_show_all) {
			this.#force_show_all = new_force_show_all;
			this.#items_max_count = this.#getItemsMaxCount();
			this._startUpdating();
		}

		this.#last_cells = cells;
		this.#last_config = config;
		this.#initializeCollapsedGroups();
		this.#renderCurrentState();

		this.#items_loaded_count = this.#cells_data.size;

		if (this.#items_loaded_count === 0) {
			return;
		}

		if (this.isReferred() && (this.isFieldsReferredDataUpdated() || !this.hasEverUpdated())) {
			if (this.#selected_itemid === null || (!this.#hasSelectable() && !this.#selectItemidByKey())) {
				const selected_cell = this.#getDefaultSelectable();

				if (selected_cell !== null) {
					this.#selected_hostid = selected_cell.hostid;
					this.#selected_itemid = selected_cell.itemid;
					this.#selected_key_ = this.#cells_data.get(this.#selected_itemid).key_;
				}
			}

			this.#honeycomb.selectCell(this.#selected_itemid);
			this.#broadcast();
		}
		else if (this.#selected_itemid !== null) {
			if (!this.#hasSelectable() && this.#selectItemidByKey()) {
				this.#broadcast();
			}

			this.#honeycomb.selectCell(this.#selected_itemid);
		}
	}

	#selectItemidByKey() {
		for (let [itemid, cell] of this.#cells_data) {
			if (cell.key_ === this.#selected_key_) {
				this.#selected_itemid = itemid;
				this.#selected_hostid = cell.hostid;

				return true;
			}
		}

		return false;
	}

	#broadcast() {
		this.broadcast({
			[CWidgetsData.DATA_TYPE_HOST_ID]: [this.#selected_hostid],
			[CWidgetsData.DATA_TYPE_HOST_IDS]: [this.#selected_hostid],
			[CWidgetsData.DATA_TYPE_ITEM_ID]: [this.#selected_itemid],
			[CWidgetsData.DATA_TYPE_ITEM_IDS]: [this.#selected_itemid]
		});
	}

	#getDefaultSelectable() {
		return this.#honeycomb.getCellsData()
			.find(cell =>
				cell.is_spacer !== true && cell.is_group_header !== true && cell.is_group_break !== true && cell.itemid !== 0
			) ?? null;
	}

	#hasSelectable() {
		return this.#cells_data.has(this.#selected_itemid);
	}

	#renderCurrentState() {
		const prepared_cells = this.#prepareCellsForRender(this.#last_cells);
		const selectable_cells = prepared_cells.filter(cell =>
			cell.is_spacer !== true && cell.is_group_header !== true && cell.is_group_break !== true
		);

		this.#honeycomb.setValue({
			cells: prepared_cells
		});

		this.#cells_data.clear();
		selectable_cells.forEach(cell => this.#cells_data.set(cell.itemid, cell));
	}

	#initializeCollapsedGroups() {
		const group_ids = this.#collectGroupIds(this.#last_cells);

		if (group_ids.length === 0) {
			return;
		}

		if (!this.#collapsed_groups_initialized) {
			const stored_state = this.#loadCollapsedGroupsFromSession();
			const collapse_by_default = this.#last_config?.collapse_groups_on_load === true;

			if (stored_state === null) {
				this.#collapsed_groups = collapse_by_default ? new Set(group_ids) : new Set();
			}
			else {
				const stored_collapsed = new Set(stored_state.collapsed ?? []);
				const known_groups = new Set(stored_state.known ?? []);
				const collapsed = new Set();

				for (const group_id of group_ids) {
					if (stored_collapsed.has(group_id)) {
						collapsed.add(group_id);
						continue;
					}

					if (!known_groups.has(group_id) && collapse_by_default) {
						collapsed.add(group_id);
					}
				}

				this.#collapsed_groups = collapsed;
			}

			this.#collapsed_groups_initialized = true;
		}
		else {
			this.#collapsed_groups = new Set(
				[...this.#collapsed_groups].filter(group_id => group_ids.includes(group_id))
			);
		}

		this.#saveCollapsedGroupsToSession(group_ids);
	}

	#collectGroupIds(cells) {
		const group_ids = [];

		for (const cell of cells) {
			if (cell?.is_group_header === true && cell.group_id !== undefined && cell.group_id !== null) {
				group_ids.push(`${cell.group_id}`);
			}
		}

		return [...new Set(group_ids)];
	}

	#getCollapsedGroupsStorageKey() {
		const widget_key = this.getWidgetId() ?? this.getUniqueId();

		return `better_honeycomb.collapsed_groups.${widget_key}`;
	}

	#loadCollapsedGroupsFromSession() {
		try {
			const raw = sessionStorage.getItem(this.#getCollapsedGroupsStorageKey());

			if (raw === null) {
				return null;
			}

			const parsed = JSON.parse(raw);

			if (Array.isArray(parsed)) {
				return {
					collapsed: parsed.map(value => `${value}`),
					known: []
				};
			}

			if (typeof parsed !== 'object' || parsed === null) {
				return null;
			}

			return {
				collapsed: Array.isArray(parsed.collapsed) ? parsed.collapsed.map(value => `${value}`) : [],
				known: Array.isArray(parsed.known) ? parsed.known.map(value => `${value}`) : []
			};
		}
		catch (error) {
			return null;
		}
	}

	#saveCollapsedGroupsToSession(group_ids = null) {
		try {
			const known_group_ids = group_ids ?? this.#collectGroupIds(this.#last_cells);

			if (known_group_ids.length === 0) {
				return;
			}

			sessionStorage.setItem(this.#getCollapsedGroupsStorageKey(), JSON.stringify({
				collapsed: [...this.#collapsed_groups],
				known: known_group_ids
			}));
		}
		catch (error) {
		}
	}

	#prepareCellsForRender(cells) {
		const group_children = new Map();
		let current_group_id = null;

		for (const cell of cells) {
			if (cell.is_group_header === true) {
				current_group_id = cell.group_id ?? null;

				if (current_group_id !== null && !group_children.has(current_group_id)) {
					group_children.set(current_group_id, []);
				}

				continue;
			}

			if (current_group_id !== null && cell.is_spacer !== true && cell.is_group_break !== true) {
				group_children.get(current_group_id)?.push(cell);
			}
		}

		const rendered = [];
		let header_group_id = null;

		for (const original of cells) {
			const cell = {...original};

			if (cell.is_group_header === true) {
				header_group_id = cell.group_id ?? null;
				cell.group_children = header_group_id !== null
					? (group_children.get(header_group_id) ?? [])
					: [];
				cell.is_collapsed = header_group_id !== null && this.#collapsed_groups.has(header_group_id);
				rendered.push(cell);
				continue;
			}

			if (header_group_id !== null && this.#collapsed_groups.has(header_group_id)) {
				if (cell.is_group_break === true || cell.is_spacer === true) {
					continue;
				}

				continue;
			}

			rendered.push(cell);
		}

		return rendered;
	}

	#openDrilldown(cell) {
		if (cell === undefined) {
			return;
		}

		const hostid = `${cell.hostid ?? ''}`.trim();
		const item_name = `${cell.item_name ?? ''}`.trim();

		if (hostid === '' || item_name === '') {
			return;
		}

		const params = new URLSearchParams();
		params.set('action', 'latest.view');
		params.set('filter_set', '1');
		params.append('hostids[]', hostid);
		params.set('name', item_name);

		const url = `zabbix.php?${params.toString()}`;

		window.open(url, this.#last_config?.drilldown_new_tab === false ? '_self' : '_blank');
	}

	onReferredUpdate() {
		if (this.#items_loaded_count === 0 || this.#selected_itemid !== null) {
			return;
		}

		const selected_cell = this.#getDefaultSelectable();

		if (selected_cell !== null) {
			this.#selected_hostid = selected_cell.hostid;
			this.#selected_itemid = selected_cell.itemid;
			this.#selected_key_ = this.#cells_data.get(this.#selected_itemid).key_;

			this.#honeycomb.selectCell(this.#selected_itemid);
			this.#broadcast();
		}
	}

	onClearContents() {
		if (this.#honeycomb !== null) {
			this.#honeycomb.destroy();
			this.#honeycomb = null;
		}
	}

	onDestroy() {
		this.clearContents();
	}

	onFeedback({type, value, descriptor}) {
		if (type === CWidgetsData.DATA_TYPE_ITEM_ID) {
			return this.#honeycomb.selectCell(value);
		}

		return false;
	}

	getActionsContextMenu({can_copy_widget, can_paste_widget}) {
		const menu = super.getActionsContextMenu({can_copy_widget, can_paste_widget});

		if (this.isEditMode()) {
			return menu;
		}

		let menu_actions = null;

		for (const search_menu_actions of menu) {
			if ('label' in search_menu_actions && search_menu_actions.label === t('Actions')) {
				menu_actions = search_menu_actions;

				break;
			}
		}

		if (menu_actions === null) {
			menu_actions = {
				label: t('Actions'),
				items: []
			};

			menu.unshift(menu_actions);
		}

		menu_actions.items.push({
			label: t('Download image'),
			disabled: this.#honeycomb === null,
			clickCallback: () => {
				downloadSvgImage(this.#honeycomb.getSVGElement(), 'image.png');
			}
		});

		return menu;
	}

	hasPadding() {
		return false;
	}

	#getItemsMaxCount() {
		let {width, height} = super._getContentsSize();

		width -= CWidgetBetterHoneycomb.ZBX_STYLE_DASHBOARD_WIDGET_PADDING_H * 2;
		height -= CWidgetBetterHoneycomb.ZBX_STYLE_DASHBOARD_WIDGET_PADDING_V * 2;

		if (this.#force_show_all) {
			return 1000;
		}

		const {max_rows, max_columns} = CSVGBetterHoneycomb.getContainerMaxParams({width, height});

		return Math.min(1000, max_rows * max_columns);
	}
}
