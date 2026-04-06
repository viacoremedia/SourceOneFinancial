# SPECS.md — Dashboard Feature

> Main feature: Dealer Performance Analytics Dashboard.
> Displays dealer groups and independent dealers with activity metrics, filtering, and sorting.

## Directory Structure

| Path           | Purpose                                          |
|----------------|--------------------------------------------------|
| `pages/`       | Page-level components (Dashboard.tsx)             |
| `components/`  | Feature-specific UI components                    |
| `hooks/`       | Data-fetching hooks                               |
| `types.ts`     | TypeScript type definitions                       |

## Pages

### `Dashboard.tsx` (~300 lines)
Main dashboard page. Manages all state and data flow.

**State**:
| State                | Type                           | Description                              |
|----------------------|--------------------------------|------------------------------------------|
| `selectedRep`        | `string`                       | Active rep filter                        |
| `selectedState`      | `string`                       | Active state filter                      |
| `statusFilter`       | `string \| null`               | Active status chip (active, 30d_inactive, etc.) |
| `activeTab`          | `'groups' \| 'dealers'`        | Current tab                              |
| `groupLocations`     | `Record<string, DealerLocation[]>` | Cached expanded group locations      |
| `smallDealers`       | `DealerLocation[]`             | Paginated independent dealers            |
| `prefetchingLocations` | `boolean`                    | Loading state for bulk location fetch    |

**Key memos**:
- `stateFilteredGroups` — Groups filtered by rep/state only (used for stable FilterBar stats)
- `filteredGroups` — Groups filtered by rep/state + status (used for table display)
- `filteredSmallDealers` — Independent dealers filtered by rep/state + status

**Data flow**:
```
useOverview() → header counts
useDealerGroups(targetStates) → groups with summaries
getStateBudgets() → budget data
getStateRepMap() → rep mapping
                  ↓
stateFilteredGroups → FilterBar (stable stats)
filteredGroups → DealerTable (display)
```

## Hooks

### `useDealerGroups(states?)`
Fetches dealer groups with server-side aggregated summaries.

| Return       | Type             | Description                        |
|-------------|------------------|------------------------------------|
| `groups`     | `DealerGroup[]`  | Groups with computed summaries     |
| `isLoading`  | `boolean`        | Loading state                      |

### `useOverview()`
Fetches high-level counts.

| Return       | Type     | Description                |
|-------------|----------|----------------------------|
| `groupCount` | `number` | Total dealer groups        |
| `dealerCount`| `number` | Total dealer locations     |

## Types (`types.ts`)

| Type               | Description                                     |
|--------------------|-------------------------------------------------|
| `DealerGroup`      | Group with name, slug, dealerCount, summary     |
| `DealerLocation`   | Location with dealerId, dealerName, latestSnapshot |
| `DailySnapshot`    | Snapshot metrics (daysSince*, activityStatus)    |
| `GroupSummary`     | Aggregated: locationCount, activeCount, best/worst |
| `BestWorst`        | `{ best: number \| null, worst: number \| null }`  |
| `ActivityStatus`   | `'active' \| '30d_inactive' \| '60d_inactive' \| 'long_inactive' \| 'never_active'` |
| `TabId`           | `'groups' \| 'dealers'`                          |
