# Core — SPECS.md

> Shared frontend primitives: components, services, styles, utilities.

## Components
| Component | Path | Purpose |
|-----------|------|---------|
| `AppShell` | `components/AppShell/` | Sticky header + full-height content layout |

## Services
| Service | Path | Purpose |
|---------|------|---------|
| `api` | `services/api.ts` | Axios instance + typed methods for all analytics endpoints |

## Styles
| File | Purpose |
|------|---------|
| `styles/tokens.css` | CSS custom properties: colors, spacing, shadows, transitions |
| `styles/typography.css` | Inter font import, type scale, weights |
| `styles/global.css` | Reset, body defaults, scrollbar, base elements |

## Utils
| Utility | Path | Purpose |
|---------|------|---------|
| `trendCalculator` | `utils/trendCalculator.ts` | `computePercentChange()`, `formatTrend()`, `isTrendPositive()` |
