# Changelog — Source One

All notable changes to this project are documented here.
Format: [Added / Changed / Fixed / Removed] + Tests Run section.

---

## [2026-04-06] — Dealer Performance Dashboard v2

### Added
- **Clickable status filters** in FilterBar: Active, 30d Inactive, 60d Inactive, Long Inactive
  - Click a stat chip to filter groups and independent dealers to only matching statuses
  - Stats row is always visible (not just when rep/state selected)
  - Standalone stats row gets a card-style background when no rep/state filter is active
- **Pre-fetch locations on status filter**: When a status filter is applied, all visible groups' locations are batch-fetched in parallel so best/worst values are computed from filtered children immediately
- **Skeleton shimmer loading**: Group rows show animated skeleton cells while locations are being fetched during status filter
- **Filtered best/worst computation**: Group row days-since values are recomputed from only the filtered child locations (not the full summary) when a status filter is active
- **Filtered status badge**: The STATUS column shows active/total computed from filtered children only
- **Single-value display**: When a group has only 1 location (or filter narrows to 1), group row shows single values instead of best/worst
- **Group alias map** in `dealerGroupDetector.js`: Prevents future CSV imports from re-creating merged duplicate groups (maps known variations to canonical names)
- **Merge script** (`scripts/mergeDuplicateGroups.js`): Safely merges duplicate dealer groups (moves locations + snapshots, deletes empty group)
- **Slug duplicate finder** (`scripts/findSlugDuplicates.js`): Finds potential duplicate groups by matching first 2 slug words

### Changed
- **FilterBar**: Stats are now computed from `stateFilteredGroups` (pre-status-filter) so they remain stable when clicking a status chip
- **Dashboard**: Split group filtering into two layers: `stateFilteredGroups` (for stats) and `filteredGroups` (for table display)
- **Independent dealers**: Status filter now works regardless of rep/state selection (fixed early return in `filteredSmallDealers` memo)
- **DealerTable**: Added `statusFilter` and `isPrefetching` props, passed through to GroupRows
- **ActiveCountBadge**: Now accepts `overrideActive` and `overrideTotal` props for filtered views

### Fixed
- Stats re-computing when clicking a status chip (was passing filtered groups to FilterBar instead of pre-filter groups)
- Independent dealers not filtering by status when no rep/state was selected
- Group location counts not updating when status filter was active

### Removed
- **Reactivated stat chip**: Removed from FilterBar (data was inconsistent/unreliable)

### Data Integrity
- Merged 6 duplicate dealer groups: Blue Compass, Bobby Combs, Campers Inn, General RV, International RV, RV Country
- Added GROUP_ALIASES to prevent re-creation on future imports

### Tests Run
- Manual browser testing: verified stats stay locked on status click, group counts update, skeleton shimmer displays, best/worst recomputes from filtered children, independent dealers filter correctly

---

## [2026-04-06] — Initial Dashboard Build

### Added
- **Dashboard page** with two tabs: Dealer Groups and Independent Dealers
- **DealerTable** with multi-column sort, expandable group rows, best/worst cells, status badges
- **FilterBar** with Rep and State dropdowns, budget display, state chips
- **Server-side filtered aggregation**: `/analytics/groups` endpoint accepts `states` query parameter
- **Webhook receiver** (`POST /webhook`) for daily CSV ingestion
- **CSV Parser Service** with header detection and row extraction
- **Dealer Group Detector** with brand name extraction and multi-location grouping
- **Dealer Metrics Ingestion Service** with idempotent bulk upsert
- **Monthly Rollup Service** for aggregating daily snapshots
- **Budget import script** for rep/state budget data

### Tests Run
- Manual end-to-end testing of webhook → ingestion → dashboard display
