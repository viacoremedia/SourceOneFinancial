# SPECS.md — Dashboard Components

> Feature-specific UI components for the dealer analytics dashboard.

## Components

| Directory      | Component     | Description                                        |
|----------------|---------------|----------------------------------------------------|
| `DealerTable/` | `DealerTable` | Main data table (expandable groups, flat dealer list, sorting, skeleton loading) |
| `FilterBar/`   | `FilterBar`   | Rep/State dropdowns, budget banner, clickable status stats |
| `StatsBar/`    | `StatsBar`    | Header bar with project title and global counts    |
| `TabBar/`      | `TabBar`      | Two-tab toggle (Dealer Groups / Independent Dealers) |

## Component Hierarchy

```
Dashboard (page)
├── StatsBar
├── TabBar
├── FilterBar
│   ├── Rep dropdown
│   ├── State dropdown
│   ├── Summary banner (when rep/state selected)
│   └── Stats row (always visible, clickable status chips)
└── DealerTable
    ├── GroupRows (groups mode)
    │   ├── BestWorstCell
    │   ├── ActiveCountBadge
    │   ├── SkeletonCell
    │   └── Child location rows
    └── Flat dealer rows (dealers mode)
        └── StatusBadge
```
