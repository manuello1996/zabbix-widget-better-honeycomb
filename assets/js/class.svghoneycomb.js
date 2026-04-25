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


class CSVGBetterHoneycomb {

	static ZBX_COLOR_CELL_FILL_LIGHT =		'#a5c6d4';
	static ZBX_COLOR_CELL_FILL_DARK =		'#668696';
	static ZBX_COLOR_CELL_GROUP_HEADER_LIGHT = '#d8e3ea';
	static ZBX_COLOR_CELL_GROUP_HEADER_DARK = '#536a78';
	static ZBX_STYLE_CLASS =				'svg-honeycomb';
	static ZBX_STYLE_HONEYCOMB_CONTAINER =	'svg-honeycomb-container';
	static ZBX_STYLE_CELL =					'svg-honeycomb-cell';
	static ZBX_STYLE_CELL_SELECTED =		'svg-honeycomb-cell-selected';
	static ZBX_STYLE_CELL_NO_DATA =			'svg-honeycomb-cell-no-data';
	static ZBX_STYLE_CELL_SHADOW =			'svg-honeycomb-cell-shadow';
	static ZBX_STYLE_CELL_GROUP_HEADER =	'svg-honeycomb-cell-group-header';
	static ZBX_STYLE_CELL_SPACER =			'svg-honeycomb-cell-spacer';
	static ZBX_STYLE_CELL_MAINTENANCE =	'svg-honeycomb-cell-maintenance';
	static ZBX_STYLE_CELL_ACKNOWLEDGED =	'svg-honeycomb-cell-acknowledged';
	static ZBX_STYLE_CELL_TREND_UP =		'svg-honeycomb-cell-trend-up';
	static ZBX_STYLE_CELL_TREND_DOWN =		'svg-honeycomb-cell-trend-down';
	static ZBX_STYLE_CELL_OTHER =			'svg-honeycomb-cell-other';
	static ZBX_STYLE_CELL_OTHER_ELLIPSIS =	'svg-honeycomb-cell-other-ellipsis';
	static ZBX_STYLE_CONTENT =				'svg-honeycomb-content';
	static ZBX_STYLE_BACKDROP =				'svg-honeycomb-backdrop';
	static ZBX_STYLE_INDICATORS =			'svg-honeycomb-indicators';
	static ZBX_STYLE_GROUP_BADGE =			'svg-honeycomb-group-badge';
	static ZBX_STYLE_GROUP_CHEVRON =		'svg-honeycomb-group-chevron';
	static ZBX_STYLE_LABEL =				'svg-honeycomb-label';
	static ZBX_STYLE_LABEL_PRIMARY =		'svg-honeycomb-label-primary';
	static ZBX_STYLE_LABEL_SECONDARY =		'svg-honeycomb-label-secondary';

	static ID_COUNTER = 0;

	static CELL_WIDTH_MIN = 50;
	static LABEL_WIDTH_MIN = 56;
	static FONT_SIZE_MIN = 12;
	static LINE_HEIGHT = 1.15;

	static EVENT_CELL_CLICK = 'cell.click';
	static EVENT_CELL_ENTER = 'cell.enter';
	static EVENT_CELL_LEAVE = 'cell.leave';
	static EVENT_GROUP_HEADER_CLICK = 'group.header.click';

	/**
	 * Widget configuration.
	 *
	 * @type {Object}
	 */
	#config;

	/**
	 * Inner padding of the root SVG element.
	 *
	 * @type {Object}
	 */
	#padding;

	/**
	 * Usable width of widget without padding.
	 *
	 * @type {number}
	 */
	#width;

	/**
	 * Full viewport width of widget.
	 *
	 * @type {number}
	 */
	#viewport_width = 0;

	/**
	 * Usable height of widget without padding.
	 *
	 * @type {number}
	 */
	#height;

	/**
	 * Full viewport height of widget.
	 *
	 * @type {number}
	 */
	#viewport_height = 0;

	/**
	 * Container calculated parameters based on SVG size and cells data.
	 *
	 * @type {Object}
	 */
	#container_params = {
		x: 0,
		y: 0,
		width: 0,
		height: 0,
		columns: 1,
		rows: 1,
		scale: 1
	}

	/**
	 * Data about cells.
	 *
	 * @type {Array | null}
	 */
	#cells_data = null;

	/**
	 * Maximum number of cells based on the container size.
	 *
	 * @type {number}
	 */
	#cells_max_count;

	/**
	 * Limit for maximum number of cells to display in the widget.
	 *
	 * @type {number}
	 */
	#cells_max_count_limit = 1000;

	/**
	 * Width of cell (inner radius).
	 * It is large number because SVG works more precise that way (later it will be scaled according to widget size).
	 *
	 * @type {number}
	 */
	#cell_width = 1000;

	/**
	 * Height of cell (outer radius).
	 * @type {number}
	 */
	#cell_height = this.#cell_width / Math.sqrt(3) * 2;

	/**
	 * Gap between cells.
	 *
	 * @type {number}
	 */
	#cells_gap = this.#cell_width / 12;

	/**
	 * d attribute of path element to display hexagonal cell.
	 *
	 * @type {string}
	 */
	#cell_path;

	/**
	 * Unique ID of root SVG element.
	 *
	 * @type {string}
	 */
	#svg_id;

	/**
	 * Root SVG element.
	 *
	 * @type {SVGSVGElement}
	 * @member {Selection}
	 */
	#svg;

	/**
	 * SVG group element implementing scaling and fitting of its contents inside the root SVG element.
	 *
	 * @type {SVGGElement}
	 * @member {Selection}
	 */
	#container;

	/**
	 * Created SVG child elements of honeycomb.
	 *
	 * @type {SVGSVGElement}
	 * @member {Selection}
	 */
	#honeycomb_container;

	/**
	 * Canvas context for text measuring.
	 *
	 * @type {CanvasRenderingContext2D}
	 */
	#canvas_context;

	/**
	 * @param {Object} padding             Inner padding of the root SVG element.
	 *        {number} padding.horizontal
	 *        {number} padding.vertical
	 *
	 * @param {Object} config              Widget configuration.
	 */
	constructor(padding, config) {
		this.#config = config;
		this.#padding = padding;

		this.#svg_id = CSVGBetterHoneycomb.#getUniqueId();

		this.#svg = d3.create('svg')
			.attr('id', this.#svg_id)
			.attr('class', CSVGBetterHoneycomb.ZBX_STYLE_CLASS)
			.attr('role', 'list')
			// Add filter element for shadow of popped cell.
			.call(svg => svg
				.append('defs')
				.append('filter')
				.attr('id', `${CSVGBetterHoneycomb.ZBX_STYLE_CELL_SHADOW}-${this.#svg_id}`)
				.attr('x', '-50%')
				.attr('y', '-50%')
				.attr('width', '200%')
				.attr('height', '200%')
				.append('feDropShadow')
				.attr('dx', 0)
				.attr('dy', 0)
				.attr('flood-color', 'rgba(0, 0, 0, .2)')
			);

		this.#container = this.#svg
			.append('g')
			.attr('transform', `translate(${this.#padding.horizontal} ${this.#padding.vertical})`)
			.append('g');

		this.#honeycomb_container = this.#container
			.append('g')
			.attr('class', CSVGBetterHoneycomb.ZBX_STYLE_HONEYCOMB_CONTAINER)
			.style('--line-height', CSVGBetterHoneycomb.LINE_HEIGHT);

		this.#cell_path = this.#generatePath(this.#cell_height, this.#cells_gap);
		this.#canvas_context = document.createElement('canvas').getContext('2d');
	}

	/**
	 * Set size of the root SVG element and re-position the elements.
	 *
	 * @param {number} width
	 * @param {number} height
	 */
	setSize({width, height}) {
		this.#viewport_width = Math.max(0, width);
		this.#viewport_height = Math.max(0, height);

		this.#svg
			.attr('width', this.#viewport_width)
			.attr('height', this.#viewport_height);

		this.#width = Math.max(0, width - this.#padding.horizontal * 2);
		this.#height = Math.max(0, height - this.#padding.vertical * 2);

		if (this.#width === 0 || this.#height === 0) {
			return;
		}

		this.#adjustSize();

		if (this.#cells_data !== null) {
			this.#updateCells();
		}
	}

	/**
	 * Set value (cells) of honeycomb.
	 *
	 * @param {Array} cells  Array of cells to show in honeycomb.
	 */
	setValue({cells}) {
		this.#cells_data = cells;

		if (this.#width === 0 || this.#height === 0) {
			return;
		}

		this.#adjustSize();
		this.#updateCells();
	}

	setConfig(config) {
		this.#config = config ?? this.#config;
	}

	selectCell(itemid) {
		let has_selected = false;

		this.#honeycomb_container
			.selectAll(`g.${CSVGBetterHoneycomb.ZBX_STYLE_CELL}`)
			.each((d, i, cells) => {
				const selected = d.itemid == itemid;

				if (selected) {
					has_selected = true;
				}

				d3.select(cells[i])
					.classed(CSVGBetterHoneycomb.ZBX_STYLE_CELL_SELECTED, selected)
					.attr('aria-selected', d.is_group_header === true || d.is_spacer === true ? null : `${selected}`)
					.style('--stroke-selected', d => this.#getStrokeColor(d, selected))
			});

		return has_selected;
	}

	/**
	 * Get the root SVG element.
	 *
	 * @returns {SVGSVGElement}
	 */
	getSVGElement() {
		return this.#svg.node();
	}

	/**
	 * Remove created SVG element from the container.
	 */
	destroy() {
		this.#svg.node().remove();
	}

	/**
	 * Adjust size of honeycomb.
	 */
	#adjustSize() {
		const calculateContainerParams = (rows, max_columns) => {
			const columns = Math.max(1, Math.min(max_columns, Math.floor(this.#cells_max_count / rows)));

			rows = Math.ceil(Math.max(1, this.#cells_max_count) / columns);

			const width = this.#cell_width * columns +
				(rows > 1 && columns * 2 <= this.#cells_max_count ? this.#cell_width / 2 : 0);

			const height = this.#cell_height * .25 * (3 * rows + 1) - this.#cells_gap;
			const scale = Math.min(this.#width / (width - this.#cells_gap * .5), this.#height / height);

			return {
				x: (this.#width - width * scale) / 2,
				y: (this.#height - (height + this.#cells_gap) * scale) / 2,
				width,
				height,
				columns,
				rows,
				scale,
				cell_padding: 4 / scale
			};
		};

		const {max_rows, max_columns} = CSVGBetterHoneycomb.getContainerMaxParams(
			{width: this.#width, height: this.#height}
		);

		const force_show_all = this.#config?.force_show_all === true;

		this.#cells_max_count = this.#cells_data !== null
			? (force_show_all
				? this.#cells_data.length
				: Math.min(this.#cells_max_count_limit, this.#cells_data.length, max_rows * max_columns))
			: 0;

		const rows = Math.max(1, Math.min(max_rows, this.#cells_max_count,
			Math.sqrt(this.#height * this.#cells_max_count / this.#width))
		);

		const params_0 = calculateContainerParams(Math.floor(rows), max_columns);
		const params_1 = calculateContainerParams(Math.ceil(rows), max_columns);

		this.#container_params = (params_0.scale > params_1.scale) ? params_0 : params_1;

		if (force_show_all) {
			const fit_scale = Math.min(
				this.#width / (this.#container_params.width - this.#cells_gap * .5),
				this.#height / this.#container_params.height
			);
			const min_scale = CSVGBetterHoneycomb.CELL_WIDTH_MIN / this.#cell_width;
			const scale = Math.max(min_scale, fit_scale);

			this.#container_params.scale = scale;
			this.#container_params.cell_padding = 4 / scale;
		}

		this.#applyContainerViewport();
	}

	#updateCells() {
		let data;
		const layout_cells = this.#getLayoutCells(this.#cells_data ?? []);
		const force_show_all = this.#config?.force_show_all === true;
		const compact_rendering = force_show_all
			&& layout_cells.length > Number(this.#config?.compact_rendering_threshold ?? 1500);

		if (force_show_all) {
			data = layout_cells;
		}
		else if (layout_cells.length > this.#cells_max_count && this.#cells_max_count > 0) {
			data = [...layout_cells.slice(0, this.#cells_max_count - 1), {itemid: 0, has_more: true}];
		}
		else if (layout_cells.length > 0) {
			data = layout_cells.slice(0, this.#cells_max_count);
		}
		else {
			data = [{itemid: 1, no_data: true}];
		}

		if (force_show_all) {
			const columns = Math.max(1, this.#container_params.columns);
			const rows = Math.max(1, Math.ceil(data.length / columns));
			const width = this.#cell_width * columns + (rows > 1 && columns * 2 <= data.length ? this.#cell_width / 2 : 0);
			const height = this.#cell_height * .25 * (3 * rows + 1) - this.#cells_gap;
			const fit_scale = Math.min(
				this.#width / (width - this.#cells_gap * .5),
				this.#height / height
			);
			const min_scale = CSVGBetterHoneycomb.CELL_WIDTH_MIN / this.#cell_width;

			this.#container_params.scale = Math.max(min_scale, fit_scale);

			this.#container_params.rows = rows;
			this.#container_params.width = width;
			this.#container_params.height = height;
			this.#container_params.cell_padding = 4 / this.#container_params.scale;

			this.#applyContainerViewport();
		}

		this.#calculateLabelsParams(
			data.filter(d =>
				d.has_more !== true
				&& d.no_data !== true
				&& d.is_spacer !== true
				&& (!compact_rendering || d.is_group_header === true)
			),
			this.#cell_width - this.#cells_gap, this.#cell_height / 2.25
		);

		const columns = Math.max(1, this.#container_params.columns);
		const positioned_data = data.map((d, i) => {
			const row = Math.floor(i / columns);
			const column = i % columns;

			d.position = {
				x: this.#cell_width * (column + row % 2 * .5) + this.#cell_width * .5,
				y: this.#cell_height * row * .75 + this.#cell_height * .5
			};

			d.index = i;

			return d;
		});

		this.#leaveAll();

		this.#honeycomb_container
			.style('--stroke-width', `${2 / this.#container_params.scale}px`)
			.selectAll(`g.${CSVGBetterHoneycomb.ZBX_STYLE_CELL}`)
			.data(positioned_data, d => d.itemid)
			.join(
				enter => enter
					.append('g')
					.attr('class', CSVGBetterHoneycomb.ZBX_STYLE_CELL)
					.attr('data-index', d => d.index)
					.call(cell => this.#applyCellStateClasses(cell))
					.style('--x', d => `${d.position.x}px`)
					.style('--y', d => `${d.position.y}px`)
					.style('--fill', d => this.#getFillColor(d))
					.style('--stroke', d => this.#getFillColor(d))
					.call(cell => cell
						.append('path')
						.attr('d', this.#cell_path)
					)
					.each((d, i, cells) => {
						const cell = d3.select(cells[i]);

						if (d.no_data === true) {
							this.#drawCellNoData(cell);
						}
						else if (d.has_more === true) {
							this.#drawCellHasMore(cell);
						}
						else if (d.is_spacer === true) {
							this.#drawCellSpacer(cell);
						}
						else if (d.is_group_header === true) {
							this.#drawCellGroupHeader(cell);
						}
						else if (compact_rendering) {
							this.#drawCompactCell(cell);
						}
						else {
							this.#drawCell(cell);
						}
					}),
				update => update
					.attr('data-index', d => d.index)
					.call(cell => this.#applyCellStateClasses(cell))
					.style('--x', d => `${d.position.x}px`)
					.style('--y', d => `${d.position.y}px`)
					.style('--fill', d => this.#getFillColor(d))
					.style('--stroke', d => this.#getFillColor(d))
					.each((d, i, cells) => {
						const cell = d3.select(cells[i]);

						if (d.no_data === true) {
							this.#drawNoDataLabel(cell);
						}
						else if (d.is_spacer === true) {
							this.#drawCellSpacer(cell);
						}
						else if (d.is_group_header === true) {
							this.#drawTitle(cell);
							this.#drawCellGroupHeader(cell);
						}
						else if (compact_rendering && d.has_more !== true) {
							this.#drawCompactCell(cell);
						}
						else if (d.has_more !== true) {
							this.#drawTitle(cell);
							this.#drawCellIndicators(cell);
							this.#drawLabel(cell);
						}

						cell.style('--stroke-selected', d => this.#getStrokeColor(d,
							cell.classed(CSVGBetterHoneycomb.ZBX_STYLE_CELL_SELECTED))
						);
					}),
				exit => exit.remove()
			);
	}

	#applyContainerViewport() {
		const content_width = this.#container_params.width * this.#container_params.scale + this.#padding.horizontal * 2;
		const content_height = (this.#container_params.height + this.#cells_gap) * this.#container_params.scale
			+ this.#padding.vertical * 2;

		this.#container_params.x = content_width < this.#viewport_width
			? (this.#width - this.#container_params.width * this.#container_params.scale) / 2
			: 0;
		this.#container_params.y = content_height < this.#viewport_height
			? (this.#height - (this.#container_params.height + this.#cells_gap) * this.#container_params.scale) / 2
			: 0;

		this.#svg
			.attr('width', Math.max(this.#viewport_width, content_width))
			.attr('height', Math.max(this.#viewport_height, content_height));

		this.#container.attr('transform',
			`translate(${this.#container_params.x} ${this.#container_params.y}) scale(${this.#container_params.scale})`
		);
	}

	#getLayoutCells(cells) {
		const layout_cells = [];
		const columns = Math.max(1, this.#container_params.columns);
		let col = 0;

		for (const cell of cells) {
			if (cell.is_group_break === true) {
				if (col === 0) {
					continue;
				}

				for (let i = col; i < columns; i++) {
					layout_cells.push({
						itemid: `group-break-spacer-${cell.itemid}-${i}`,
						is_spacer: true,
						is_layout_spacer: true
					});
				}

				col = 0;
				continue;
			}

			layout_cells.push(cell);
			col = (col + 1) % columns;
		}

		return layout_cells;
	}

	#applyCellStateClasses(cell) {
		cell
			.classed(CSVGBetterHoneycomb.ZBX_STYLE_CELL_MAINTENANCE, d =>
				d.is_maintenance === true || Number(d.group_maintenance_count ?? 0) > 0
			)
			.classed(CSVGBetterHoneycomb.ZBX_STYLE_CELL_ACKNOWLEDGED, d =>
				d.has_acknowledged_problem === true || Number(d.group_acknowledged_problem_count ?? 0) > 0
			)
			.classed(CSVGBetterHoneycomb.ZBX_STYLE_CELL_TREND_UP, d =>
				d.trend === 'up' || Number(d.group_trend_up_count ?? 0) > Number(d.group_trend_down_count ?? 0)
			)
			.classed(CSVGBetterHoneycomb.ZBX_STYLE_CELL_TREND_DOWN, d =>
				d.trend === 'down' || Number(d.group_trend_down_count ?? 0) > Number(d.group_trend_up_count ?? 0)
			);
	}

	/**
	 * Draw "has more" cell that indicates that all cells do not fit in available space in widget.
	 *
	 * @param {Selection} cell
	 */
	#drawCellHasMore(cell) {
		cell
			.classed(CSVGBetterHoneycomb.ZBX_STYLE_CELL_OTHER, true)
			.attr('role', 'status')
			.attr('aria-label', t('More honeycombs are available'))
			.append('g')
			.attr('class', CSVGBetterHoneycomb.ZBX_STYLE_CELL_OTHER_ELLIPSIS)
			.call(ellipsis => {
				for (let i = -1; i <= 1; i++) {
					ellipsis
						.append('circle')
						.attr('cx', this.#cell_width / 5 * i)
						.attr('r', this.#cell_width / 20);
				}
			});
	}

	/**
	 * @param {Selection} cell
	 */
	#drawCellNoData(cell) {
		cell
			.classed(CSVGBetterHoneycomb.ZBX_STYLE_CELL_NO_DATA, true)
			.attr('role', 'status')
			.attr('aria-label', t('No data'))
			.call(cell => this.#drawNoDataLabel(cell));
	}

	/**
	 * @param {Selection} cell
	 */
	#drawCellSpacer(cell) {
		cell
			.classed(CSVGBetterHoneycomb.ZBX_STYLE_CELL_SPACER, true)
			.attr('aria-hidden', 'true')
			.attr('tabindex', null)
			.attr('role', null)
			.attr('aria-label', null)
			.on('click', null)
			.on('keydown', null)
			.on('mouseenter', null)
			.on('mouseleave', null)
			.style('--fill', 'transparent')
			.style('--stroke', 'transparent')
			.style('--stroke-selected', 'transparent')
			.style('pointer-events', 'none')
			.call(cell => cell.select(`.${CSVGBetterHoneycomb.ZBX_STYLE_INDICATORS}`)?.remove())
			.call(cell => cell.select(`.${CSVGBetterHoneycomb.ZBX_STYLE_GROUP_BADGE}`)?.remove())
			.call(cell => cell.select(`.${CSVGBetterHoneycomb.ZBX_STYLE_GROUP_CHEVRON}`)?.remove())
			.call(cell => cell.select('foreignObject')?.remove())
			.call(cell => cell.select(`.${CSVGBetterHoneycomb.ZBX_STYLE_BACKDROP}`)?.remove());
	}

	/**
	 * @param {Selection} cell
	 */
	#drawCellGroupHeader(cell) {
		cell
			.classed(CSVGBetterHoneycomb.ZBX_STYLE_CELL_GROUP_HEADER, true)
			.call(cell => this.#drawTitle(cell))
			.attr('role', 'button')
			.attr('tabindex', 0)
			.attr('aria-expanded', d => d.is_collapsed === true ? 'false' : 'true')
			.attr('aria-label', d => `${d.primary_label}. ${d.secondary_label}. Press Enter to toggle group.`)
			.call(cell => this.#drawGroupHeaderChrome(cell))
			.on('click', (e, d) => {
				this.#svg.dispatch(CSVGBetterHoneycomb.EVENT_GROUP_HEADER_CLICK, {
					detail: {
						group_id: d.group_id ?? null
					}
				});
			})
			.on('keydown', (e, d) => {
				if (e.key !== 'Enter' && e.key !== ' ') {
					return;
				}

				e.preventDefault();
				this.#svg.dispatch(CSVGBetterHoneycomb.EVENT_GROUP_HEADER_CLICK, {
					detail: {
						group_id: d.group_id ?? null
					}
				});
			})
			.style('pointer-events', 'auto')
			.call(cell => this.#drawLabel(cell));

		cell
			.on('mouseenter', (e, d) => {
				if (d.enter_timeout === undefined && d.scale_timeout === undefined && !d.scaled) {
					d.enter_timeout = setTimeout(() => {
						delete d.enter_timeout;
						cell.raise();
						this.#leaveAll();

						d.scale_timeout = setTimeout(() => {
							delete d.scale_timeout;
							d.scaled = true;
							this.#cellEnter(cell, d);
						}, 50);
					}, 150);
				}

				this.#svg.dispatch(CSVGBetterHoneycomb.EVENT_CELL_ENTER, {
					detail: {
						hostid: d.hostid ?? null,
						itemid: d.itemid ?? null
					}
				});
			})
			.on('mouseleave', (e, d) => {
				if (d.enter_timeout !== undefined) {
					clearTimeout(d.enter_timeout);
					delete d.enter_timeout;
				}

				if (d.scale_timeout !== undefined) {
					clearTimeout(d.scale_timeout);
					delete d.scale_timeout;
				}

				if (d.scaled) {
					this.#cellLeave(cell, d);
					d.scaled = false;
				}

				this.#svg.dispatch(CSVGBetterHoneycomb.EVENT_CELL_LEAVE, {
					detail: {
						hostid: d.hostid ?? null,
						itemid: d.itemid ?? null
					}
				});
			});
	}

	#drawCell(cell) {
		cell
			.call(cell => this.#drawTitle(cell))
			.call(cell => this.#drawLabel(cell))
			.attr('role', 'button')
			.attr('tabindex', 0)
			.attr('aria-label', d => this.#getCellAriaLabel(d))
			.call(cell => this.#drawCellIndicators(cell))
			.on('click', (e, d) => {
				if (this.selectCell(d.itemid)) {
					this.#svg.dispatch(CSVGBetterHoneycomb.EVENT_CELL_CLICK, {
						detail: {
							hostid: d.hostid,
							itemid: d.itemid
						}
					});
				}
			})
			.on('keydown', (e, d) => {
				if (e.key !== 'Enter' && e.key !== ' ') {
					return;
				}

				e.preventDefault();

				if (this.selectCell(d.itemid)) {
					this.#svg.dispatch(CSVGBetterHoneycomb.EVENT_CELL_CLICK, {
						detail: {
							hostid: d.hostid,
							itemid: d.itemid
						}
					});
				}
			})
			.on('mouseenter', (e, d) => {
				if (d.enter_timeout === undefined && d.scale_timeout === undefined && !d.scaled) {
					d.enter_timeout = setTimeout(() => {
						delete d.enter_timeout;
						cell.raise();
						this.#leaveAll();

						d.scale_timeout = setTimeout(() => {
							delete d.scale_timeout;
							d.scaled = true;
							this.#cellEnter(cell, d);
						}, 50);
					}, 150);
				}

				this.#svg.dispatch(CSVGBetterHoneycomb.EVENT_CELL_ENTER, {
					detail: {
						hostid: d.hostid,
						itemid: d.itemid
					}
				});
			})
			.on('mouseleave', (e, d) => {
				if (d.enter_timeout !== undefined) {
					clearTimeout(d.enter_timeout);
					delete d.enter_timeout;
				}

				if (d.scale_timeout !== undefined) {
					clearTimeout(d.scale_timeout);
					delete d.scale_timeout;
				}

				if (d.scaled) {
					this.#cellLeave(cell, d);
					d.scaled = false;
				}

				this.#svg.dispatch(CSVGBetterHoneycomb.EVENT_CELL_LEAVE, {
					detail: {
						hostid: d.hostid,
						itemid: d.itemid
					}
				});
			});
	}

	#cellEnter(cell, d) {
		const margin = {
			horizontal: (this.#padding.horizontal / 2 + this.#container_params.x) / this.#container_params.scale,
			vertical: (this.#padding.vertical / 2 + this.#container_params.y) / this.#container_params.scale
		};

		const scale = Math.min(
			this.#container_params.width / Math.sqrt(3) * 2 + margin.horizontal * 2,
			this.#container_params.height + this.#cells_gap + margin.vertical * 2,
			this.#cell_height * Math.max(1.1, (0.15 / this.#container_params.scale + 0.55))
		);

		const scaled_size = {
			width: scale * Math.sqrt(3) / 2,
			height: scale
		}

		const cell_scale = scale / (this.#cell_height - this.#cells_gap);

		const scaled_position = {
			dx: Math.max(
				scaled_size.width / 2 - margin.horizontal,
				Math.min(
					this.#container_params.width - scaled_size.width / 2 + margin.horizontal,
					d.position.x
				)
			) - d.position.x,
			dy: Math.max(
				scaled_size.height / 2 - margin.vertical,
				Math.min(
					this.#container_params.height + this.#cells_gap - scaled_size.height / 2 + margin.vertical,
					d.position.y
				)
			) - d.position.y
		};

		if (cell.select(`.${CSVGBetterHoneycomb.ZBX_STYLE_BACKDROP}`).empty()) {
			cell
				.append('path')
				.classed(CSVGBetterHoneycomb.ZBX_STYLE_BACKDROP, true)
				.attr('d', this.#generatePath(Math.min(this.#cell_height * 1.75, scaled_size.height * .75), 0));
		}
		else {
			clearTimeout(d.backdrop_timeout);
		}

		d.stored_labels = d.labels;

		this.#calculateLabelsParams([d], scaled_size.width, (scaled_size.height + this.#cells_gap) / 2.25);
		this.#resizeLabels(cell, {
			x: scaled_position.dx + d.position.x,
			y: scaled_position.dy + d.position.y,
			width: scaled_size.width * .975,
			height: (scaled_size.height + this.#cells_gap) / 2.25
		});

		this.#svg
			.select(`#${CSVGBetterHoneycomb.ZBX_STYLE_CELL_SHADOW}-${this.#svg_id} feDropShadow`)
			.attr('stdDeviation', 25 / this.#container_params.scale / cell_scale);

		cell
			.style('--dx', `${scaled_position.dx}px`)
			.style('--dy', `${scaled_position.dy}px`)
			.style('--stroke', d => this.#getStrokeColor(d))
			.style('--stroke-width', `${2 / this.#container_params.scale / cell_scale}px`)
			.style('--scale', cell_scale)
			.select('path')
			.style('filter', `url(#${CSVGBetterHoneycomb.ZBX_STYLE_CELL_SHADOW}-${this.#svg_id})`);

		this.#svg.style('--shadow-opacity', 1);
	}

	#leaveAll() {
		this.#honeycomb_container
			.selectAll(`g.${CSVGBetterHoneycomb.ZBX_STYLE_CELL}`)
			.each((d, i, cells) => {
				if (d.enter_timeout !== undefined) {
					clearTimeout(d.enter_timeout);
					delete d.enter_timeout;
				}

				if (d.scale_timeout !== undefined) {
					clearTimeout(d.scale_timeout);
					delete (d.scale_timeout);
				}

				if (d.scaled) {
					d.scaled = false;

					this.#cellLeave(d3.select(cells[i]), d);
				}
			});
	}

	#cellLeave(cell, d) {
		d.labels = d.stored_labels;

		this.#resizeLabels(cell);

		cell
			.style('--dx', null)
			.style('--dy', null)
			.style('--stroke', d => this.#getFillColor(d))
			.style('--stroke-width', null)
			.style('--scale', null)
			.select('path')
			.style('filter', null);

		this.#svg.style('--shadow-opacity', null);

		d.backdrop_timeout = setTimeout(() => {
			cell
				.select(`.${CSVGBetterHoneycomb.ZBX_STYLE_BACKDROP}`)
				.remove();
		}, UI_TRANSITION_DURATION);
	}

	#drawLabel(cell) {
		cell.call(cell => cell.select('foreignObject')?.remove());

		const makeLabel = (label) => {
			return d3.create('div')
				.attr('class', CSVGBetterHoneycomb.ZBX_STYLE_LABEL)
				.call(label_container => {
					for (const line of label.lines.values()) {
						label_container
							.append('div')
							.text(line);
					}
				});
		};

		cell
			.append('foreignObject')
			.append('xhtml:div')
			.attr('class', CSVGBetterHoneycomb.ZBX_STYLE_CONTENT)
			.call(container => {
				const show_primary = this.#config.primary_label.show || container.datum().is_group_header === true;
				const show_secondary = (this.#config.secondary_label.show || container.datum().is_group_header === true)
					&& container.datum().secondary_label !== '';

				if (show_primary) {
					container.append(d => makeLabel(d.labels.primary)
						.classed(CSVGBetterHoneycomb.ZBX_STYLE_LABEL_PRIMARY, true)
						.node()
					);
				}

				if (show_secondary) {
					container.append(d => makeLabel(d.labels.secondary)
						.classed(CSVGBetterHoneycomb.ZBX_STYLE_LABEL_SECONDARY, true)
						.node()
					);
				}
			});

		this.#resizeLabels(cell);
	}

	#drawNoDataLabel(cell) {
		cell.call(cell => cell.select('foreignObject')?.remove());

		if ((this.#cell_width - this.#cells_gap) * this.#container_params.scale < CSVGBetterHoneycomb.LABEL_WIDTH_MIN) {
			return;
		}

		cell
			.append('foreignObject')
			.append('xhtml:div')
			.attr('class', CSVGBetterHoneycomb.ZBX_STYLE_CONTENT)
			.append('span')
			.text(t('No data'))
			.style('font-size',
				`${Math.max(CSVGBetterHoneycomb.FONT_SIZE_MIN / this.#container_params.scale, this.#cell_width / 10)}px`
			);

		this.#resizeLabels(cell);
	}

	#resizeLabels(cell, box = {}) {
		const d = cell.datum();

		box = {
			...d.position,
			width: this.#cell_width - this.#cells_gap * 1.25,
			height: this.#cell_height / 2.25,
			...box
		};

		cell
			.call(cell => cell.select('foreignObject')
				.attr('x', box.x + this.#container_params.cell_padding - box.width / 2)
				.attr('y', box.y - box.height / 2)
				.attr('width', box.width - this.#container_params.cell_padding * 2)
				.attr('height', box.height)
			)
			.call(cell => cell.select(`.${CSVGBetterHoneycomb.ZBX_STYLE_LABEL_PRIMARY}`)
				.style('max-height', d => `${d.labels.primary.lines_count * CSVGBetterHoneycomb.LINE_HEIGHT}em`)
				.style('font-size', d => `${d.labels.primary.font_size}px`)
				.style('font-weight', d => d.labels.primary.font_weight)
				.style('color', d => d.labels.primary.color)

			)
			.call(cell => cell.select(`.${CSVGBetterHoneycomb.ZBX_STYLE_LABEL_SECONDARY}`)
				.style('max-height', d => `${d.labels.secondary.lines_count * CSVGBetterHoneycomb.LINE_HEIGHT}em`)
				.style('font-size', d => `${d.labels.secondary.font_size}px`)
				.style('font-weight', d => d.labels.secondary.font_weight)
				.style('color', d => d.labels.secondary.color)
			);
	}

	#calculateLabelsParams(data, cell_width, container_height) {
		if (!data.length) {
			return;
		}

		for (const d of data) {
			d.labels = {primary: null, secondary: null};
		}

		const calculateLabelParams = (data, container_width, container_height, is_primary) => {
			const c_param = is_primary ? 'primary_label' : 'secondary_label';
			const d_param = is_primary ? 'primary' : 'secondary';

			const is_custom_size = this.#config[c_param].is_custom_size;
			const font_weight = this.#config[c_param].is_bold ? 'bold' : null;

			for (const d of data) {
				const lines = d[c_param].split('\n');
				const lines_count = lines.length;

				d.labels[d_param] = {
					lines,
					lines_count,
					line_max_length: Math.ceil(Math.max(...lines.map(line => line.length)) / 8) * 8,
					color: this.#config[c_param].color !== '' ? `#${this.#config[c_param].color}` : null,
					font_size: 0,
					font_weight,
					is_custom_size
				};
			}

			if (container_width * this.#container_params.scale < CSVGBetterHoneycomb.LABEL_WIDTH_MIN * .875) {
				return;
			}

			for (const d of data) {
				if (is_custom_size) {
					const label_height = container_height * this.#config[c_param].size / 100;
					const temp_font_size = Math.max(
						CSVGBetterHoneycomb.FONT_SIZE_MIN / this.#container_params.scale,
						label_height / d.labels[d_param].lines_count
					);

					d.labels[d_param].lines_count = Math.max(1, Math.floor(label_height / temp_font_size));
					d.labels[d_param].font_size = label_height / d.labels[d_param].lines_count;
				}
				else {
					d.labels[d_param].font_size = this.#getFontSizeByWidth(d.labels[d_param].lines, container_width,
						font_weight ?? ''
					);
				}
			}

			if (is_custom_size) {
				return;
			}

			const thresholds = new Map();

			for (const d of data) {
				const step = d.labels[d_param].line_max_length;

				thresholds.set(step, thresholds.has(step)
					? Math.min(thresholds.get(step), d.labels[d_param].font_size)
					: d.labels[d_param].font_size
				);
			}

			for (const d of data) {
				if (!d.labels[d_param].is_custom_size) {
					d.labels[d_param].font_size = Math.max(
						CSVGBetterHoneycomb.FONT_SIZE_MIN / this.#container_params.scale,
						Math.min(
							thresholds.get(d.labels[d_param].line_max_length),
							Math.floor(container_height / d.labels[d_param].lines_count)
						)
					);
				}
			}
		}

		const container_width = cell_width - this.#container_params.cell_padding * 2;
		container_height /= CSVGBetterHoneycomb.LINE_HEIGHT;

		const primary_data = this.#config.primary_label.show
			? data
			: data.filter(d => d.is_group_header === true);

		if (primary_data.length > 0) {
			calculateLabelParams(primary_data, container_width, container_height, true)
		}

		const secondary_data = this.#config.secondary_label.show
			? data
			: data.filter(d => d.is_group_header === true && d.secondary_label !== '');

		if (secondary_data.length > 0) {
			calculateLabelParams(secondary_data, container_width, container_height, false)
		}

		const font_size_min = CSVGBetterHoneycomb.FONT_SIZE_MIN / this.#container_params.scale;

		for (const d of data) {
			const {primary, secondary} = d.labels;

			let p_height = primary !== null ? primary.font_size * primary.lines_count : 0;
			let s_height = secondary !== null ? secondary.font_size * secondary.lines_count : 0;

			while ((primary?.lines_count ?? 0) > 1 || (secondary?.lines_count ?? 0) > 1) {
				if (p_height + s_height <= container_height) {
					break;
				}

				if (secondary !== null) {
					const s_font_size = (container_height - p_height) / secondary.lines_count;

					if (s_font_size < font_size_min) {
						secondary.lines_count = Math.max(1, secondary.lines_count - 1);
					}
					else {
						secondary.font_size = s_font_size;
					}

					s_height = secondary.font_size * secondary.lines_count;
				}

				if (primary !== null) {
					const p_font_size = (container_height - s_height) / primary.lines_count;

					if (p_font_size < font_size_min) {
						primary.lines_count = Math.max(1, primary.lines_count - 1);
					}
					else {
						primary.font_size = p_font_size;
					}

					p_height = primary.font_size * primary.lines_count;
				}
			}

			if (p_height + s_height > container_height) {
				const p_scalable = primary?.is_custom_size ? 1 : 0;
				const s_scalable = secondary?.is_custom_size ? 1 : 0;

				const font_scale = (container_height - p_height * p_scalable - s_height * s_scalable)
					/ (p_height * (1 - p_scalable) + s_height * (1 - s_scalable));

				if (primary !== null) {
					primary.font_size = Math.max(font_size_min,
						primary.font_size * (primary.is_custom_size ? 1 : font_scale)
					);
				}

				if (secondary !== null) {
					secondary.font_size = Math.max(font_size_min,
						secondary.font_size * (secondary.is_custom_size ? 1 : font_scale)
					);
				}
			}
		}
	}

	#getFillColor(d) {
		if (d.no_data === true || d.has_more === true) {
			return null;
		}

		if (d.is_group_header === true) {
			if (d.is_collapsed === true && Array.isArray(d.group_children) && d.group_children.length > 0) {
				const worst_color = this.#getWorstGroupColor(d.group_children);

				if (worst_color !== null) {
					return worst_color;
				}
			}

			return document.documentElement.getAttribute('color-scheme') === ZBX_COLOR_SCHEME_LIGHT
				? CSVGBetterHoneycomb.ZBX_COLOR_CELL_GROUP_HEADER_LIGHT
				: CSVGBetterHoneycomb.ZBX_COLOR_CELL_GROUP_HEADER_DARK;
		}

		const bg_color = this.#config.bg_color !== '' ? `#${this.#config.bg_color}` : null;

		if (this.#config.auto_color_binary === true && d.is_numeric) {
			const value = Number.parseFloat(d.value);

			if (Number.isFinite(value)) {
				if (value === 0) {
					return `#${this.#config.auto_color_zero}`;
				}

				if (value === 1) {
					return `#${this.#config.auto_color_one}`;
				}
			}

			return bg_color;
		}

		if (this.#config.thresholds.length === 0 || !d.is_numeric) {
			return bg_color;
		}

		const value = parseFloat(d.value);
		const threshold_type = d.is_binary_units ? 'threshold_binary' : 'threshold';
		const apply_interpolation = this.#config.apply_interpolation && this.#config.thresholds.length > 1;

		let prev = null;
		let curr;

		for (let i = 0; i < this.#config.thresholds.length; i++) {
			curr = this.#config.thresholds[i];

			if (value < curr[threshold_type]) {
				if (prev === null) {
					return bg_color;
				}

				if (apply_interpolation) {
					// Position [0..1] of cell value between two adjacent thresholds
					const position = (value - prev[threshold_type]) / (curr[threshold_type] - prev[threshold_type]);

					return d3.color(d3.interpolateRgb(`#${prev.color}`, `#${curr.color}`)(position)).formatHex();
				}

				return `#${prev.color}`;
			}

			prev = curr;
		}

		return `#${curr.color}`;
	}

	#drawCompactCell(cell) {
		cell
			.call(cell => this.#drawTitle(cell))
			.attr('role', 'button')
			.attr('tabindex', 0)
			.attr('aria-label', d => this.#getCellAriaLabel(d))
			.call(cell => this.#drawCellIndicators(cell))
			.call(cell => cell.select('foreignObject')?.remove())
			.call(cell => cell.select(`.${CSVGBetterHoneycomb.ZBX_STYLE_BACKDROP}`)?.remove())
			.on('click', (e, d) => {
				if (this.selectCell(d.itemid)) {
					this.#svg.dispatch(CSVGBetterHoneycomb.EVENT_CELL_CLICK, {
						detail: {
							hostid: d.hostid,
							itemid: d.itemid
						}
					});
				}
			})
			.on('keydown', (e, d) => {
				if (e.key !== 'Enter' && e.key !== ' ') {
					return;
				}

				e.preventDefault();

				if (this.selectCell(d.itemid)) {
					this.#svg.dispatch(CSVGBetterHoneycomb.EVENT_CELL_CLICK, {
						detail: {
							hostid: d.hostid,
							itemid: d.itemid
						}
					});
				}
			})
			.on('mouseenter', null)
			.on('mouseleave', null);
	}

	#drawCellIndicators(cell) {
		cell.call(cell => cell.select(`.${CSVGBetterHoneycomb.ZBX_STYLE_INDICATORS}`)?.remove());

		cell
			.filter(d =>
				d.is_maintenance === true
				|| d.has_acknowledged_problem === true
				|| Number(d.group_maintenance_count ?? 0) > 0
				|| Number(d.group_acknowledged_problem_count ?? 0) > 0
				|| Number(d.group_trend_up_count ?? 0) > 0
				|| Number(d.group_trend_down_count ?? 0) > 0
				|| ['up', 'down', 'flat', 'changed'].includes(d.trend)
			)
			.append('g')
			.attr('class', CSVGBetterHoneycomb.ZBX_STYLE_INDICATORS)
			.each((d, i, cells) => {
				const indicators = d3.select(cells[i]);
				const entries = [];

				if (d.is_maintenance === true || Number(d.group_maintenance_count ?? 0) > 0) {
					entries.push({label: 'M', class_name: 'maintenance'});
				}

				if (d.has_acknowledged_problem === true || Number(d.group_acknowledged_problem_count ?? 0) > 0) {
					entries.push({label: 'A', class_name: 'acknowledged'});
				}

				if (d.trend === 'up' || Number(d.group_trend_up_count ?? 0) > Number(d.group_trend_down_count ?? 0)) {
					entries.push({label: '+', class_name: 'trend-up'});
				}
				else if (
					d.trend === 'down'
					|| Number(d.group_trend_down_count ?? 0) > Number(d.group_trend_up_count ?? 0)
				) {
					entries.push({label: '-', class_name: 'trend-down'});
				}
				else if (d.trend === 'flat') {
					entries.push({label: '=', class_name: 'trend-flat'});
				}
				else if (d.trend === 'changed') {
					entries.push({label: '*', class_name: 'trend-changed'});
				}

				entries.slice(0, 3).forEach((entry, index) => {
					const x = -this.#cell_width * 0.26 + index * this.#cell_width * 0.18;
					const y = -this.#cell_height * 0.28;

					const badge = indicators.append('g')
						.attr('class', `svg-honeycomb-indicator svg-honeycomb-indicator-${entry.class_name}`)
						.attr('transform', `translate(${x} ${y})`);

					badge.append('circle')
						.attr('r', this.#cell_width * 0.07);

					badge.append('text')
						.attr('text-anchor', 'middle')
						.attr('dominant-baseline', 'central')
						.text(entry.label);
				});
			});
	}

	#drawGroupHeaderChrome(cell) {
		cell.call(cell => cell.select(`.${CSVGBetterHoneycomb.ZBX_STYLE_GROUP_BADGE}`)?.remove());
		cell.call(cell => cell.select(`.${CSVGBetterHoneycomb.ZBX_STYLE_GROUP_CHEVRON}`)?.remove());
		cell.call(cell => this.#drawCellIndicators(cell));

		cell
			.append('text')
			.attr('class', CSVGBetterHoneycomb.ZBX_STYLE_GROUP_CHEVRON)
			.attr('x', -this.#cell_width * 0.34)
			.attr('y', -this.#cell_height * 0.31)
			.attr('text-anchor', 'middle')
			.attr('dominant-baseline', 'central')
			.text(d => d.is_collapsed === true ? '+' : '-');

		cell
			.filter(d => Number(d.group_problem_count ?? 0) > 0)
			.append('g')
			.attr('class', CSVGBetterHoneycomb.ZBX_STYLE_GROUP_BADGE)
			.attr('transform', `translate(${this.#cell_width * 0.29} ${-this.#cell_height * 0.31})`)
			.call(badge => {
				badge.append('circle')
					.attr('r', this.#cell_width * 0.095);

				badge.append('text')
					.attr('text-anchor', 'middle')
					.attr('dominant-baseline', 'central')
					.text(d => Number(d.group_problem_count) > 99 ? '99+' : d.group_problem_count);
			});
	}

	#drawTitle(cell) {
		cell.call(cell => cell.select('title')?.remove());

		cell.append('title')
			.text(d => {
				if (d.is_group_header === true) {
					const state = d.is_collapsed === true ? 'collapsed' : 'expanded';
					const details = [
						Number(d.group_maintenance_count ?? 0) > 0
							? `${d.group_maintenance_count} in maintenance`
							: null,
						Number(d.group_acknowledged_problem_count ?? 0) > 0
							? `${d.group_acknowledged_problem_count} acknowledged`
							: null,
						Number(d.group_trend_up_count ?? 0) > 0 ? `${d.group_trend_up_count} up` : null,
						Number(d.group_trend_down_count ?? 0) > 0 ? `${d.group_trend_down_count} down` : null
					].filter(line => line !== null).join('\n');

					return `${d.primary_label}\n${d.secondary_label}\nGroup is ${state}`
						+ (details !== '' ? `\n${details}` : '');
				}

				const lines = [
					d.hostname !== undefined ? `Host: ${d.hostname}` : null,
					d.item_name !== undefined ? `Item: ${d.item_name}` : null,
					d.key_ !== undefined && d.key_ !== null ? `Key: ${d.key_}` : null,
					d.formatted_value !== undefined ? `Value: ${d.formatted_value}` : `Value: ${d.value}`,
					d.trend !== undefined && d.trend !== 'unknown' ? `Trend: ${d.trend}` : null,
					d.is_maintenance === true ? 'Host is in maintenance' : null,
					d.has_acknowledged_problem === true ? 'Current problem is acknowledged' : null,
					d.last_clock !== undefined && d.last_clock !== null
						? `Last update: ${new Date(Number(d.last_clock) * 1000).toLocaleString()}`
						: null,
					d.group_name !== undefined && d.group_name !== '' ? `Group: ${d.group_name}` : null
				];

				return lines.filter(line => line !== null).join('\n');
			});
	}

	#getCellAriaLabel(d) {
		const parts = [
			d.hostname !== undefined ? `Host ${d.hostname}` : null,
			d.item_name !== undefined ? `Item ${d.item_name}` : null,
			d.formatted_value !== undefined ? `Value ${d.formatted_value}` : `Value ${d.value}`,
			d.trend !== undefined && d.trend !== 'unknown' ? `Trend ${d.trend}` : null,
			d.is_maintenance === true ? 'Maintenance' : null,
			d.has_acknowledged_problem === true ? 'Acknowledged problem' : null
		];

		return `${parts.filter(part => part !== null).join('. ')}. Press Enter to open latest data.`;
	}

	#getWorstGroupColor(group_children) {
		let worst = null;

		for (const child of group_children) {
			const color = this.#getFillColor({
				...child,
				is_group_header: false
			});
			const score = this.#getSeverityScore(child);

			if (worst === null || score > worst.score) {
				worst = {
					color,
					score
				};
			}
		}

		return worst?.color ?? null;
	}

	#getSeverityScore(cell) {
		if (this.#config.auto_color_binary === true && cell.is_numeric) {
			const value = Number.parseFloat(cell.value);

			if (Number.isFinite(value)) {
				const problem_value = Number(this.#config.binary_problem_value ?? 0);

				if (value === problem_value) {
					return 100;
				}

				if (value === 0 || value === 1) {
					return 0;
				}
			}
		}

		if (this.#config.thresholds.length === 0 || !cell.is_numeric) {
			return 0;
		}

		const value = Number.parseFloat(cell.value);
		const threshold_type = cell.is_binary_units ? 'threshold_binary' : 'threshold';
		let score = 0;

		for (const threshold of this.#config.thresholds) {
			if (value >= threshold[threshold_type]) {
				score++;
			}
		}

		return score;
	}

	#getStrokeColor(d, wide = false) {
		const fill_color = d3.color(this.#getFillColor(d));

		return document.documentElement.getAttribute('color-scheme') === ZBX_COLOR_SCHEME_LIGHT
			? (fill_color ?? d3.color(CSVGBetterHoneycomb.ZBX_COLOR_CELL_FILL_LIGHT)).darker(wide ? .6 : .3).formatHex()
			: (fill_color ?? d3.color(CSVGBetterHoneycomb.ZBX_COLOR_CELL_FILL_DARK)).brighter(wide ? 1 : .6).formatHex();
	}

	/**
	 * Generate d attribute of path element to display hexagonal cell.
	 *
	 * @param {number} cell_size  Cell size equals height.
	 * @param {number} cells_gap
	 *
	 * @returns {string}  The d attribute of path element.
	 */
	#generatePath(cell_size, cells_gap) {
		const getPositionOnLine = (start, end, distance) => {
			const x = start[0] + (end[0] - start[0]) * distance;
			const y = start[1] + (end[1] - start[1]) * distance;

			return [x, y];
		};

		const cell_radius = (cell_size - cells_gap) / 2;
		const corner_count = 6;
		const corner_radius = 0.075;
		const handle_distance = corner_radius / 2;
		const offset = Math.PI / 2;

		const corner_position = d3.range(corner_count).map(side => {
			const radian = side * Math.PI * 2 / corner_count;
			const x = Math.cos(radian + offset) * cell_radius;
			const y = Math.sin(radian + offset) * cell_radius;
			return [x, y];
		});

		const corners = corner_position.map((corner, index) => {
			const prev = index === 0 ? corner_position[corner_position.length - 1] : corner_position[index - 1];
			const curr = corner;
			const next = index <= corner_position.length - 2 ? corner_position[index + 1] : corner_position[0];

			return {
				start: getPositionOnLine(prev, curr, 0.5),
				start_curve: getPositionOnLine(prev, curr, 1 - corner_radius),
				handle_1: getPositionOnLine(prev, curr, 1 - handle_distance),
				handle_2: getPositionOnLine(curr, next, handle_distance),
				end_curve: getPositionOnLine(curr, next, corner_radius)
			};
		});

		let path = `M${corners[0].start}`;
		path += corners.map(c => `L${c.start}L${c.start_curve}C${c.handle_1} ${c.handle_2} ${c.end_curve}`);
		path += 'Z';

		return path.replaceAll(',', ' ');
	}

	/**
	 * Get text width using canvas measuring.
	 *
	 * @param {string} text
	 * @param {number} font_size
	 * @param {number|string} font_weight
	 *
	 * @returns {number}
	 */
	#getMeasuredTextWidth(text, font_size, font_weight = '') {
		this.#canvas_context.font = `${font_weight} ${font_size}px '${this.#svg.style('font-family')}'`;

		return this.#canvas_context.measureText(text).width;
	}

	#getFontSizeByWidth(lines, fit_width, font_weight = '') {
		return Math.max(CSVGBetterHoneycomb.FONT_SIZE_MIN / this.#container_params.scale,
			Math.min(...lines
				.filter(line => line !== '')
				.map(line => fit_width * .875 / this.#getMeasuredTextWidth(line, 10, font_weight) * 9)
			)
		);
	}

	/**
	 * Get unique ID.
	 *
	 * @returns {string}
	 */
	static #getUniqueId() {
		return `CSVGBetterHoneycomb-${this.ID_COUNTER++}`;
	}

	/**
	 * Get honeycomb container max row and max column count.
	 *
	 * @param {number} width
	 * @param {number} height
	 *
	 * @returns {{max_rows: number, max_columns: number}}
	 */
	static getContainerMaxParams({width, height}) {
		const cell_min_width = CSVGBetterHoneycomb.CELL_WIDTH_MIN;
		const cell_min_height = CSVGBetterHoneycomb.CELL_WIDTH_MIN / Math.sqrt(3) * 2;

		const max_rows = Math.max(0, Math.floor((height - cell_min_height) / (cell_min_height * .75)) + 1);
		const max_columns = Math.max(0, Math.floor((width - (max_rows > 1 ? cell_min_width / 2 : 0)) / cell_min_width));

		return {max_rows, max_columns};
	}

	/**
	 * Get cells data.
	 *
	 * @returns {Array|null}
	 */
	getCellsData () {
		return this.#cells_data;
	}
}
