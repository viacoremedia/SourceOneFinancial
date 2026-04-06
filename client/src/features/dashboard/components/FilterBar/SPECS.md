# SPECS.md — FilterBar Component

> Dropdown filters (Rep, State) + clickable status stat chips + budget summary banner.

## Files

| File                    | Lines | Description                              |
|-------------------------|-------|------------------------------------------|
| `FilterBar.tsx`         | ~270  | Main component                           |
| `FilterBar.module.css`  | ~290  | Scoped styles                            |
| `index.ts`              | 1     | Barrel export                            |

## Props (`FilterBarProps`)

| Prop                   | Type                        | Description                          |
|------------------------|-----------------------------|--------------------------------------|
| `stateRepMap`          | `StateRepMap`               | State → rep mapping                  |
| `budgets`              | `StateBudget[]`             | State budget data                    |
| `filteredGroups`       | `DealerGroup[]`             | Groups for stats computation (pre-status-filter) |
| `selectedRep`         | `string`                    | Current rep filter                   |
| `selectedState`       | `string`                    | Current state filter                 |
| `statusFilter`        | `string \| null`            | Active status chip                   |
| `onRepChange`         | `(rep: string) => void`    | Rep filter change handler            |
| `onStateChange`       | `(state: string) => void`  | State filter change handler          |
| `onStatusFilterChange`| `(status: string \| null) => void` | Status chip click handler  |

## Layout / Sections

### 1. Filter Row (always visible)
- **Rep dropdown**: All Reps / individual rep names
- **State dropdown**: All States / filtered by selected rep
- **Clear button (✕)**: Resets all filters

### 2. Summary Banner (only when rep/state selected)
- **Rep mode**: Shows rep name + clickable state chips + annual budget total
- **State mode**: Shows state name + rep + annual budget

### 3. Stats Row (ALWAYS visible)
Computed from `filteredGroups` (pre-status-filter groups for stability).

| Stat           | Clickable | Description                              |
|----------------|-----------|------------------------------------------|
| Groups         | No        | Count of visible groups                  |
| Locations      | No        | Total locations across groups            |
| Active (%)     | Yes       | Active locations + percentage            |
| 30d Inactive   | Yes       | 30-day inactive count                    |
| 60d Inactive   | Yes       | 60-day inactive count                    |
| Long Inactive  | Yes       | 60+ day inactive count                   |

**Click behavior**: Toggles status filter (click again to deselect). Active chip gets teal border highlight.

### CSS Layout
- `statsRowStandalone` class applied when no summary banner is above (adds card-style background)
- `statSelected` class for active chip (teal border)
- `statClickable` — hover/cursor styles for interactive chips
