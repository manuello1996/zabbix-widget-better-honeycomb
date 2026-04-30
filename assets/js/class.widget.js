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
	 * @type {string}
	 */
	#filter_text = '';

	/**
	 * @type {HTMLDivElement|null}
	 */
	#toolbar = null;

	/**
	 * @type {HTMLInputElement|null}
	 */
	#filter_input = null;

	/**
	 * @type {HTMLDivElement|null}
	 */
	#legend = null;

	/**
	 * @type {HTMLDivElement|null}
	 */
	#warning = null;

	/**
	 * @type {HTMLDivElement|null}
	 */
	#drilldown_menu = null;

	/**
	 * @type {number}
	 */
	#filter_update_timeout_id;

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
		clearTimeout(this.#filter_update_timeout_id);
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
			collapse_persistence: 0,
			drilldown_new_tab: true,
			show_filter: false,
			show_legend: false,
			has_more: false,
			force_show_all_limit: 5000,
			compact_rendering_threshold: 1500,
			group_sort: 0,
			cell_sort: 0,
			highlight_problem_items: true,
			active_problem_color: 'FFC107',
			binary_problem_value: 0,
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
					this.#openCellDrilldown(this.#cells_data.get(this.#selected_itemid), e.detail);
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
		this.#updateToolbar();
		this.#updateLegend();
		this.#updateWarning();
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

	#updateToolbar() {
		const show_filter = this.#last_config?.show_filter === true;

		if (!show_filter) {
			this.#toolbar?.remove();
			this.#toolbar = null;
			this.#filter_input = null;
			this.#filter_text = '';

			return;
		}

		if (this.#toolbar === null) {
			this.#toolbar = document.createElement('div');
			this.#toolbar.className = 'better-honeycomb-toolbar';

			this.#filter_input = document.createElement('input');
			this.#filter_input.type = 'search';
			this.#filter_input.placeholder = t('Filter honeycombs');
			this.#filter_input.setAttribute('aria-label', t('Filter honeycombs'));
			this.#filter_input.value = this.#filter_text;
			this.#filter_input.className = 'better-honeycomb-filter';
			this.#filter_input.addEventListener('input', () => {
				this.#filter_text = this.#filter_input.value.trim().toLocaleLowerCase();
				clearTimeout(this.#filter_update_timeout_id);
				this.#filter_update_timeout_id = setTimeout(() => this.#renderCurrentState(), 100);
			});

			this.#toolbar.append(this.#filter_input);
			this._body.prepend(this.#toolbar);
		}
	}

	#updateLegend() {
		const show_legend = this.#last_config?.show_legend === true;

		if (!show_legend) {
			this.#legend?.remove();
			this.#legend = null;

			return;
		}

		if (this.#legend === null) {
			this.#legend = document.createElement('div');
			this.#legend.className = 'better-honeycomb-legend';
			this.#legend.setAttribute('aria-label', t('Honeycomb color legend'));
			this._body.append(this.#legend);
		}

		this.#legend.replaceChildren(...this.#getLegendItems().map(item => {
			const label = document.createElement('span');
			const swatch = document.createElement('span');
			const text = document.createElement('span');

			label.className = 'better-honeycomb-legend-item';
			swatch.className = 'better-honeycomb-legend-swatch';
			swatch.style.setProperty('--better-honeycomb-legend-color', `#${item.color}`);
			text.textContent = item.label;
			label.append(swatch, text);

			return label;
		}));
	}

	#getLegendItems() {
		const items = [];

		if (this.#last_config?.auto_color_binary === true) {
			items.push(
				{color: this.#last_config.auto_color_zero, label: t('Value 0')},
				{color: this.#last_config.auto_color_one, label: t('Value 1')}
			);
		}

		if (this.#last_config?.highlight_problem_items !== false) {
			items.push({color: this.#last_config.active_problem_color ?? 'FFC107', label: t('Active problem')});
		}

		for (const threshold of this.#last_config?.thresholds ?? []) {
			if (threshold.color !== undefined && `${threshold.threshold}` !== '') {
				items.push({color: threshold.color, label: `>= ${threshold.threshold}`});
			}
		}

		return items;
	}

	#updateWarning() {
		const has_more = this.#last_config?.has_more === true;

		if (!has_more) {
			this.#warning?.remove();
			this.#warning = null;

			return;
		}

		if (this.#warning === null) {
			this.#warning = document.createElement('div');
			this.#warning.className = 'better-honeycomb-warning';
			this.#warning.setAttribute('role', 'status');
			this._body.append(this.#warning);
		}

		this.#warning.textContent = `Showing first ${this.#last_config.force_show_all_limit} honeycombs. ` +
			'Refine filters to reduce the result set.';
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
		if (Number(this.#last_config?.collapse_persistence ?? 0) === 2) {
			return null;
		}

		try {
			const storage = Number(this.#last_config?.collapse_persistence ?? 0) === 1
				? localStorage
				: sessionStorage;
			const raw = storage.getItem(this.#getCollapsedGroupsStorageKey());

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
		if (Number(this.#last_config?.collapse_persistence ?? 0) === 2) {
			return;
		}

		try {
			const known_group_ids = group_ids ?? this.#collectGroupIds(this.#last_cells);

			if (known_group_ids.length === 0) {
				return;
			}

			const storage = Number(this.#last_config?.collapse_persistence ?? 0) === 1
				? localStorage
				: sessionStorage;

			storage.setItem(this.#getCollapsedGroupsStorageKey(), JSON.stringify({
				collapsed: [...this.#collapsed_groups],
				known: known_group_ids
			}));
		}
		catch (error) {
		}
	}

	#prepareCellsForRender(cells) {
		const has_groups = cells.some(cell => cell.is_group_header === true);

		if (!has_groups) {
			return this.#sortCells(cells
				.filter(cell => this.#matchesFilter(cell))
				.map(cell => ({...cell}))
			);
		}

		const segments = [];
		let current = null;

		for (const cell of cells) {
			if (cell.is_group_header === true) {
				current = {
					header: {...cell},
					children: []
				};
				segments.push(current);
				continue;
			}

			if (current !== null && cell.is_spacer !== true && cell.is_group_break !== true) {
				current.children.push({...cell});
			}
		}

		const rendered = [];
		const has_group_breaks = cells.some(cell => cell.is_group_break === true);
		const has_group_spacers = cells.some(cell => cell.is_spacer === true && cell.is_layout_spacer !== true);
		let segment_index = 0;

		for (const segment of this.#sortGroupSegments(segments)) {
			const children = this.#sortCells(segment.children.filter(cell => this.#matchesFilter(cell)));

			if (children.length === 0 && this.#filter_text !== '') {
				continue;
			}

			const header = segment.header;
			const group_id = header.group_id ?? null;
			const is_collapsed = group_id !== null && this.#collapsed_groups.has(group_id);

			header.group_children = children;
			header.is_collapsed = is_collapsed;

			if (this.#filter_text !== '' || header.group_item_count === undefined) {
				header.secondary_label = this.#getGroupSummaryLabel(children);
				header.group_problem_count = this.#getProblemCount(children);
				header.group_worst_severity = this.#getWorstSeverity(children);
				header.group_maintenance_count = children.filter(cell => cell.is_maintenance === true).length;
				header.group_acknowledged_problem_count =
					children.filter(cell => cell.has_acknowledged_problem === true).length;
				header.group_trend_up_count = children.filter(cell => cell.trend === 'up').length;
				header.group_trend_down_count = children.filter(cell => cell.trend === 'down').length;
			}

			if (rendered.length > 0 && has_group_spacers) {
				rendered.push({
					itemid: `client-spacer-${segment_index}`,
					is_spacer: true
				});
			}

			if (rendered.length > 0 && has_group_breaks) {
				rendered.push({
					itemid: `client-group-break-${segment_index}`,
					is_group_break: true
				});
			}

			rendered.push(header);

			if (!is_collapsed) {
				rendered.push(...children);
			}

			segment_index++;
		}

		return rendered;
	}

	#matchesFilter(cell) {
		if (this.#filter_text === '' || cell.is_spacer === true || cell.is_group_break === true) {
			return true;
		}

		return [
			cell.hostname,
			cell.item_name,
			cell.key_,
			cell.primary_label,
			cell.secondary_label,
			cell.group_name,
			cell.formatted_value,
			cell.value
		]
			.some(value => `${value ?? ''}`.toLocaleLowerCase().includes(this.#filter_text));
	}

	#sortGroupSegments(segments) {
		const group_sort = Number(this.#last_config?.group_sort ?? 0);

		if (group_sort === 0) {
			return segments;
		}

		return [...segments].sort((left, right) => {
			const left_score = group_sort === 1
				? Number(left.header.group_worst_severity ?? this.#getWorstSeverity(left.children))
				: Number(left.header.group_problem_count ?? this.#getProblemCount(left.children));
			const right_score = group_sort === 1
				? Number(right.header.group_worst_severity ?? this.#getWorstSeverity(right.children))
				: Number(right.header.group_problem_count ?? this.#getProblemCount(right.children));

			if (left_score !== right_score) {
				return right_score - left_score;
			}

			return `${left.header.primary_label}`.localeCompare(`${right.header.primary_label}`);
		});
	}

	#sortCells(cells) {
		const cell_sort = Number(this.#last_config?.cell_sort ?? 0);

		if (cell_sort === 0) {
			return cells;
		}

		return [...cells].sort((left, right) => {
			if (cell_sort === 1) {
				const severity_delta =
					Number(right.severity_score ?? this.#getSeverityScore(right))
					- Number(left.severity_score ?? this.#getSeverityScore(left));

				if (severity_delta !== 0) {
					return severity_delta;
				}
			}
			else {
				const left_value = Number.parseFloat(left.value);
				const right_value = Number.parseFloat(right.value);

				if (Number.isFinite(left_value) && Number.isFinite(right_value) && left_value !== right_value) {
					return cell_sort === 2 ? left_value - right_value : right_value - left_value;
				}
			}

			return `${left.hostname} ${left.item_name}`.localeCompare(`${right.hostname} ${right.item_name}`);
		});
	}

	#getGroupSummaryLabel(children) {
		const problem_count = this.#getProblemCount(children);
		const count_label = `${children.length} ${children.length === 1 ? 'item' : 'items'}`;

		return problem_count > 0
			? `${count_label} | ${problem_count} problem${problem_count === 1 ? '' : 's'}`
			: `${count_label} | OK`;
	}

	#getProblemCount(cells) {
		return cells.filter(cell =>
			Number(cell.severity_score ?? this.#getSeverityScore(cell)) > 0 || cell.has_active_problem === true
		).length;
	}

	#getWorstSeverity(cells) {
		return cells.reduce(
			(severity, cell) => Math.max(severity, Number(cell.severity_score ?? this.#getSeverityScore(cell))),
			0
		);
	}

	#getSeverityScore(cell) {
		if (this.#last_config?.auto_color_binary === true && cell.is_numeric) {
			const value = Number.parseFloat(cell.value);
			const problem_value = Number(this.#last_config.binary_problem_value ?? 0);

			if (Number.isFinite(value)) {
				return value === problem_value ? 100 : 0;
			}
		}

		if (!cell.is_numeric) {
			return 0;
		}

		const value = Number.parseFloat(cell.value);
		const threshold_type = cell.is_binary_units ? 'threshold_binary' : 'threshold';

		if (!Number.isFinite(value)) {
			return 0;
		}

		return (this.#last_config?.thresholds ?? [])
			.filter(threshold => value >= Number(threshold[threshold_type]))
			.length;
	}

	#openCellDrilldown(cell, event_detail = {}) {
		if (this.#isProblemFallbackColored(cell)) {
			this.#showDrilldownMenu(cell, event_detail);
		}
		else {
			this.#openLatestDataDrilldown(cell);
		}
	}

	#openLatestDataDrilldown(cell) {
		if (cell === undefined) {
			return;
		}

		const itemid = `${cell.itemid ?? ''}`.trim();

		if (itemid === '') {
			return;
		}

		const params = new URLSearchParams();
		params.set('action', 'showlatest');
		params.append('itemids[]', itemid);

		const url = `history.php?${params.toString()}`;

		window.open(url, this.#last_config?.drilldown_new_tab === false ? '_self' : '_blank');
	}

	#showDrilldownMenu(cell, event_detail = {}) {
		this.#closeDrilldownMenu();

		const menu = document.createElement('div');
		menu.className = 'better-honeycomb-drilldown-menu';
		menu.setAttribute('role', 'menu');

		const latest = document.createElement('button');
		latest.type = 'button';
		latest.textContent = t('Latest data');
		latest.setAttribute('role', 'menuitem');
		latest.addEventListener('click', () => {
			this.#closeDrilldownMenu();
			this.#openLatestDataDrilldown(cell);
		});

		const problems = document.createElement('button');
		problems.type = 'button';
		problems.textContent = t('Active problem');
		problems.setAttribute('role', 'menuitem');
		problems.addEventListener('click', () => {
			this.#closeDrilldownMenu();
			this.#openProblemDrilldown(cell);
		});

		menu.append(latest, problems);
		document.body.append(menu);

		const menu_rect = menu.getBoundingClientRect();
		const x = Number(event_detail.client_x ?? 0);
		const y = Number(event_detail.client_y ?? 0);

		menu.style.left = `${Math.min(Math.max(4, x), window.innerWidth - menu_rect.width - 4)}px`;
		menu.style.top = `${Math.min(Math.max(4, y), window.innerHeight - menu_rect.height - 4)}px`;

		const close_on_pointer = event => {
			if (!menu.contains(event.target)) {
				this.#closeDrilldownMenu();
			}
		};
		const close_on_key = event => {
			if (event.key === 'Escape') {
				this.#closeDrilldownMenu();
			}
		};

		menu._better_honeycomb_cleanup = () => {
			document.removeEventListener('pointerdown', close_on_pointer);
			document.removeEventListener('keydown', close_on_key);
		};

		setTimeout(() => document.addEventListener('pointerdown', close_on_pointer), 0);
		document.addEventListener('keydown', close_on_key);
		this.#drilldown_menu = menu;
		latest.focus();
	}

	#closeDrilldownMenu() {
		this.#drilldown_menu?._better_honeycomb_cleanup?.();
		this.#drilldown_menu?.remove();
		this.#drilldown_menu = null;
	}

	#openProblemDrilldown(cell) {
		if (cell === undefined) {
			return;
		}

		const hostid = `${cell.hostid ?? ''}`.trim();
		const triggerids = Array.isArray(cell.problem_triggerids) ? cell.problem_triggerids : [];

		if (hostid === '' && triggerids.length === 0) {
			return;
		}

		const params = new URLSearchParams();
		params.set('action', 'problem.view');
		params.set('filter_set', '1');

		if (hostid !== '') {
			params.append('hostids[]', hostid);
		}

		for (const triggerid of triggerids) {
			params.append('triggerids[]', triggerid);
		}

		const url = `zabbix.php?${params.toString()}`;

		window.open(url, this.#last_config?.drilldown_new_tab === false ? '_self' : '_blank');
	}

	#isProblemFallbackColored(cell) {
		if (cell === undefined || this.#last_config?.highlight_problem_items === false || cell.has_active_problem !== true) {
			return false;
		}

		if (this.#last_config?.auto_color_binary === true && cell.is_numeric) {
			const value = Number.parseFloat(cell.value);

			if (Number.isFinite(value) && (value === 0 || value === 1)) {
				return false;
			}
		}

		if (!cell.is_numeric) {
			return true;
		}

		const value = Number.parseFloat(cell.value);
		const threshold_type = cell.is_binary_units ? 'threshold_binary' : 'threshold';

		if (!Number.isFinite(value)) {
			return true;
		}

		return !(this.#last_config?.thresholds ?? [])
			.some(threshold => value >= Number(threshold[threshold_type]));
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
		clearTimeout(this.#filter_update_timeout_id);
		this.#closeDrilldownMenu();

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
				downloadSvgImage(this.#honeycomb.getSVGElement(), `${this.#getExportBaseName()}.png`);
			}
		});

		return menu;
	}

	hasPadding() {
		return false;
	}

	#getExportBaseName() {
		const date = new Date().toISOString().slice(0, 10);
		const name = `${this.getName?.() ?? 'better-honeycomb'}`
			.toLocaleLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'better-honeycomb';

		return `${name}-${date}`;
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
