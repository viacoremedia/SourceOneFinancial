# Client — SPECS.md

> Source One Dealer Performance Dashboard — React Frontend

## Tech Stack
- Vite 8 + React 19 + TypeScript 6
- Axios for API requests
- CSS Modules for component-level styling
- Google Fonts (Inter)

## Directory Structure
```
client/
├── src/
│   ├── core/                 # Shared primitives
│   │   ├── components/       # AppShell
│   │   ├── services/         # API client (axios)
│   │   ├── styles/           # Design tokens, typography, global CSS
│   │   └── utils/            # Trend calculator
│   ├── features/
│   │   └── dashboard/        # Main dashboard feature
│   │       ├── components/   # TabBar, StatsBar, DealerTable
│   │       ├── hooks/        # useOverview, useDealerGroups
│   │       ├── pages/        # Dashboard page
│   │       └── types.ts      # TypeScript interfaces
│   ├── App.tsx               # Root component
│   └── main.tsx              # Entry point
├── vite.config.ts            # Dev server + API proxy
└── package.json
```

## Module Index
| Module | Purpose | Files |
|--------|---------|-------|
| `core/styles` | Design system | tokens.css, typography.css, global.css |
| `core/components/AppShell` | App layout shell | AppShell.tsx, AppShell.module.css |
| `core/services/api` | Typed HTTP client | api.ts |
| `core/utils/trendCalculator` | Trend % change math | trendCalculator.ts |
| `features/dashboard` | Dealer analytics view | types.ts, hooks/, components/, pages/ |
