# Dashboard Feature — SPECS.md

> Single-page dealer performance analytics dashboard.

## Pages
| Page | Path | Purpose |
|------|------|---------|
| `Dashboard` | `pages/Dashboard.tsx` | Main orchestrator: StatsBar + TabBar + DealerTable |

## Components
| Component | Path | Purpose |
|-----------|------|---------|
| `TabBar` | `components/TabBar/` | Toggle between "Dealer Groups" and "All Dealers" |
| `StatsBar` | `components/StatsBar/` | 4 KPI cards: total dealers, active count, avg days since app, reactivations |
| `DealerTable` | `components/DealerTable/` | Main data table with search, sort, expand, trend dropdown |
| `StatusBadge` | `components/DealerTable/StatusBadge.tsx` | Color-coded activity status pill |

## Hooks
| Hook | Path | Purpose |
|------|------|---------|
| `useOverview` | `hooks/useOverview.ts` | Fetch `/analytics/overview` |
| `useDealerGroups` | `hooks/useDealerGroups.ts` | Fetch `/analytics/groups` |
| `useGroupLocations` | `hooks/useDealerGroups.ts` | Fetch `/analytics/groups/:slug/locations` |

## Types
| Type | Purpose |
|------|---------|
| `DealerGroup` | Multi-location dealer brand |
| `DealerLocation` | Individual dealer with optional group + latest snapshot |
| `DailySnapshot` | Single day's dealer activity data |
| `MonthlyRollup` | Pre-aggregated monthly metrics |
| `OverviewStats` | Dashboard-level KPIs |
| `TrendPeriod` | `'yoy' \| 'mom' \| '30d' \| '60d'` |
| `TrendResult` | Computed trend with value, direction, label |
| `TableColumn` | Column definition (key, label, hasData, sortable, etc.) |

## Data Columns
| Column | Key | Has Data | Source |
|--------|-----|----------|--------|
| Dealer | name | ✅ | DealerLocation.dealerName |
| Days Since App | daysSinceLastApplication | ✅ | DailySnapshot |
| Days Since Appr | daysSinceLastApproval | ✅ | DailySnapshot |
| Days Since Bkd | daysSinceLastBooking | ✅ | DailySnapshot |
| Status | activityStatus | ✅ | DailySnapshot |
| Apps | apps | ❌ | Future CSV |
| Appr | approvals | ❌ | Future CSV |
| Decl | declines | ❌ | Future CSV |
| In-H | inHouse | ❌ | Future CSV |
| Bkd | booked | ❌ | Future CSV |
| Booked $ | bookedDollars | ❌ | Future CSV |
| L-B% | lookToBook | ❌ | Future CSV |
| A-B% | approvalToBook | ❌ | Future CSV |
| EOM Proj | eomProjection | ❌ | Future CSV |
