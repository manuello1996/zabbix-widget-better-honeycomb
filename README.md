# Better Honeycomb (Zabbix Widget)

An enhanced version of the standard Zabbix Honeycomb widget.

It keeps the original concept, but adds practical features for grouped views, usability, and navigation.

## Comparison

Standard Honeycomb vs Better Honeycomb using the same item pattern:

![Standard vs Better Honeycomb](docs/compare.png)

## Screenshots

The repository currently includes a comparison screenshot:

- [Standard vs Better Honeycomb](docs/compare.png)

Recommended additional captures for releases:

- Grouping modes: host, host group, and host group + host.
- Collapsed state: collapsed group headers with problem summaries.
- Binary coloring: `0/1` values with the configured OK/problem semantics and legend visible.

## Added Features (vs standard widget)

- Grouping modes:
  - `None`
  - `Host`
  - `Host group`
  - `Host group + host`
- Group header honeycomb per group (shows group label + item count).
- Group headers summarize visible item count and problem count.
- Optional group sorting by name, worst severity, or problem count.
- Optional cell sorting by default order, severity, or numeric value.
- Click group header to collapse/expand child honeycombs.
- Optional setting: **Load all groups collapsed**.
- Configurable collapse/expand persistence:
  - browser session
  - browser local storage
  - reset on every load
- Optional setting: **Start each group on a new line**.
- Optional setting: **Show all honeycombs (no hiding)** (disables adaptive hiding logic).
- Large `Show all` result sets are capped and use compact rendering to keep dashboards responsive.
- Optional rendered search filter for host, item, key, group, label, and value.
- Optional legend for binary colors and thresholds.
- Scrollable widget body when content overflows.
- Auto color by binary value (optional):
  - apply color only when value is exactly `0` or `1`
  - configurable problem value semantics (`0` or `1`)
  - configurable color for `0`
  - configurable color for `1`
- Cell and group header tooltips with operational details.
- Maintenance and acknowledged-problem indicators on cells and group headers.
- Value trend hints based on the latest two values.
- Stronger group header styling, problem badges, and clearer selection/focus outlines.
- Drill-down on cell click to **Latest data** filtered for the clicked item context.
- Optional setting: open Latest data in same tab or new tab.
- Exported image filenames include widget name and date.

## Notes

- The module is implemented as a separate widget with its own manifest ID and namespace:
  - ID: `better-honeycomb`
  - Namespace: `BetterHoneycomb`
- The widget is designed to be a drop-in operational alternative to the standard Honeycomb, especially when many items must be displayed and grouped.
- Compatibility target: Zabbix 7.x module/widget API. Test against the exact Zabbix minor version used in production before rollout, because widget field and dashboard APIs can change between Zabbix releases.
