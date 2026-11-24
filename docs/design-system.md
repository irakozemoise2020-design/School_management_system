# UI design system

## Visual language

The product uses a clear, operational interface designed for long daily sessions: white surfaces on a very light blue-grey canvas, deep navy navigation, purposeful blue actions, restrained status colours, rounded 16–20px cards, soft elevation, and dense-but-readable data layouts.

| Token | Value | Use |
|---|---|---|
| `ink` | `#102A56` | Sidebar, primary actions, headings |
| `sky` | `#2B6EF2` | Interactive accent, data series |
| `mist` | `#F5F8FC` | Application canvas |
| `line` | `#E6ECF5` | Boundaries and table rules |
| Success | emerald | Attendance present, completed actions |
| Warning | amber | Pending/review/late states |
| Danger | rose | Errors, absent, destructive actions |

## Component rules

- Use `Button` variants rather than one-off action styles.
- Use cards for conceptual groups; use full-width tables for operational lists.
- Form labels always precede controls; errors render adjacent to the invalid field.
- Use page-specific empty states that explain the next valid action.
- Make status visible with text and colour—never colour alone.
- Charts use live database queries only. Their surrounding copy identifies the metric and time basis.
- Each module gets a dedicated task-oriented dashboard; module previews explain their planned operational layout until the module ships.

## Responsive rules

- Sidebar becomes an overlay under `lg`.
- Dashboard metric cards move from four to two to one column.
- Tables get horizontal containment or a compact card alternative—never invisible columns.
- Primary actions remain reachable in the first viewport on small screens.
- Tap targets are at least 40px high.
