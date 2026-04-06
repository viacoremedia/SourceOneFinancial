# SPECS.md — Client Core

> Shared primitives reused across all features.

## Directories

| Path           | Purpose                                          |
|----------------|--------------------------------------------------|
| `components/`  | Global UI components                              |
| `hooks/`       | Shared React hooks                                |
| `services/`    | API client and data-fetching utilities            |
| `styles/`      | Global CSS variables, design tokens, base styles  |
| `utils/`       | Pure utility functions                            |

## Key Files

### `services/api.ts`
Central API client. All backend calls go through this module.

| Export                  | Type     | Endpoint                           | Description                         |
|-------------------------|----------|------------------------------------|-------------------------------------|
| `getGroups(states?)`    | Async    | `GET /analytics/groups`            | Fetch groups with summaries         |
| `getGroupLocations(slug)` | Async | `GET /analytics/groups/:slug/locations` | Fetch locations in a group     |
| `getSmallDealers(opts)` | Async    | `GET /analytics/small-dealers`     | Paginated independent dealers       |
| `getOverview()`         | Async    | `GET /analytics/overview`          | Total counts                        |
| `getStateRepMap()`      | Async    | `GET /analytics/state-rep-map`     | State → rep mapping                 |
| `getStateBudgets()`     | Async    | `GET /analytics/budget/states`     | State budget data                   |

**Types exported**:
- `StateRepMap` — `Record<string, string>`
- `StateBudget` — `{ state, rep, annualTotal, monthlyBudgets }`

### `components/AppShell/`
Layout wrapper providing consistent page structure (header, sidebar).

### `styles/`
CSS design tokens: `--bg-surface`, `--text-primary`, `--border-subtle`, `--radius-lg`, spacing scale, etc.
