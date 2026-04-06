# SPECS.md — DealerTable Component

> Main data table for displaying dealer groups (expandable) and independent dealers (flat list).

## Files

| File                     | Lines | Description                                    |
|--------------------------|-------|------------------------------------------------|
| `DealerTable.tsx`        | ~660  | Main component + sub-components                |
| `DealerTable.module.css` | ~530  | Scoped styles (dark theme, sticky headers)     |
| `columns.ts`             | ~60   | Column definitions for sortable headers        |
| `StatusBadge.tsx`        | ~30   | Activity status badge component                |
| `index.ts`               | 1     | Barrel export                                  |

## Props (`DealerTableProps`)

| Prop                | Type                                   | Description                         |
|---------------------|----------------------------------------|-------------------------------------|
| `mode`              | `'groups' \| 'dealers'`                | Current tab                         |
| `groups`            | `DealerGroup[]`                        | Filtered group list                 |
| `groupLocations`    | `Record<string, DealerLocation[]>`     | Cached child locations per slug     |
| `smallDealers`      | `DealerLocation[]`                     | Independent dealers list            |
| `isLoading`         | `boolean`                              | Main loading state                  |
| `isLoadingMore`     | `boolean`                              | Pagination loading (dealers tab)    |
| `hasMore`           | `boolean`                              | More pages available                |
| `statusFilter`      | `string \| null`                       | Active status filter                |
| `isPrefetching`     | `boolean`                              | Bulk location fetch in progress     |
| `onExpandGroup`     | `(slug: string) => void`              | Lazy-load group locations           |
| `onLoadMore`        | `() => void`                           | Load next page (dealers tab)        |
| `onDealerSortChange`| `(key, dir) => void`                   | Server-side sort change             |

## Sub-components (internal)

### `GroupRows`
Renders an expandable group row + child location rows.

**Key behaviors**:
- Computes `displayCount` based on status filter (e.g., only active locations)
- When `statusFilter` active + locations loaded → recomputes best/worst from **filtered children only** via `computeBestWorstFromLocations()`
- When `statusFilter` active + locations loading → shows `SkeletonCell` shimmer
- Passes filtered active count to `ActiveCountBadge` via override props
- Forces single-value display when `displayCount === 1`

### `BestWorstCell`
Displays best/worst day counts with heatmap coloring.

| Prop          | Type            | Description                           |
|---------------|-----------------|---------------------------------------|
| `data`        | `BestWorst`     | `{ best, worst }` values              |
| `forceSingle` | `boolean`       | Show only best value (for 1-location) |

**Heatmap colors** (via `getDaysSinceHeatmap()`):
- `0–14 days` → green
- `15–30 days` → yellow/amber
- `31–60 days` → orange
- `61+ days` → red

### `ActiveCountBadge`
Shows active/total as a colored badge.

| Prop             | Type     | Description                     |
|------------------|----------|---------------------------------|
| `summary`        | Object   | Group summary (fallback values) |
| `overrideActive` | `number` | Filtered active count           |
| `overrideTotal`  | `number` | Filtered total count            |

**Color logic**: green (≥75%), yellow (50–74%), red (<50%)

### `SkeletonCell`
Animated shimmer placeholder during data loading.

## Sorting
- Client-side sort for group mode (columns defined in `columns.ts`)
- Server-side sort for dealer mode (delegates to `onDealerSortChange`)
- Sort indicator arrows in header cells

## CSS Highlights
- Sticky table headers (`position: sticky`)
- Dark theme variables
- Skeleton shimmer animation (`@keyframes skeleton-shimmer`)
- Responsive breakpoints for mobile
