# Source One Dealer Performance Dashboard — React Frontend

> **Branch:** `feature/002-dealer-dashboard-frontend`
> **From:** `dev` (or `main` if no dev branch exists yet)

## Context

Source One Financial Services (~$1B/year RV & Marine lender, 3,500+ dealers) needs a premium single-page React dashboard to visualize dealer activity data ingested daily via webhook CSV. The backend already exists (Express + MongoDB with 172 dealer groups, 2,498 locations, daily snapshots). This is the **foundational frontend template** — currently only activity metrics (days since last app/approval/booking, status) are populated; future data sources will fill in remaining columns.

## User Review Required

> [!IMPORTANT]
> **Design direction:** Corporate fintech aesthetic inspired by Source One's brand — deep navy/slate backgrounds, clean whites, subtle teal accents. Bloomberg-level data density on desktop, Apple-level simplicity on mobile. No playful startup vibes.

> [!IMPORTANT]
> **Columns with real data today:** Days Since Last App, Days Since Last Approval, Days Since Last Booking, Activity Status, Last App Date, Last Approval Date, Last Booked Date, Reactivated After Visit
> **Columns stubbed empty for future:** APPS, APPR, DECL, IN-H, BKD, BOOKED $, L-B%, A-B%, EOM PROJ, MO BGT, % MO BGT, % YR BGT
> **Dropped:** Actions/Pipeline column (permanently removed)

---

## Proposed Changes

### Phase 1: Project Scaffolding & Design System
Set up the Vite + React + TypeScript project, establish the design system, and create the core layout shell.

- [ ] Initialize Vite + React + TS in `client/` with proper tsconfig, ESLint
- [ ] Install core deps: axios (API), Inter/Outfit from Google Fonts
- [ ] Create design system in `client/src/core/` — color tokens (navy/slate/teal/white palette), typography scale, spacing scale, breakpoints, CSS custom properties
- [ ] Build the app shell layout: header with Source One branding, main content area that fills viewport height (minimal scroll philosophy)
- [ ] Create `SPECS.md` files for `client/`, `client/src/core/`, and root-level updates

---

### Phase 2: Core Data Layer & API Integration
Build the API service layer, TypeScript types, and state management hooks.

- [ ] Define TypeScript interfaces in `client/src/features/dashboard/types.ts` — `DealerGroup`, `DealerLocation`, `DailySnapshot`, `MonthlyRollup`, `OverviewStats`, `TrendComparison`
- [ ] Build API service in `client/src/core/services/api.ts` — axios instance with base URL config, typed methods for all analytics endpoints
- [ ] Create custom hooks: `useOverview()`, `useDealerGroups()`, `useGroupLocations(slug)`, `useDealerTrend(dealerId)` with loading/error states
- [ ] Add trend calculation utility: compute % change for YoY, MoM, 30d, 60d moving averages — gracefully return `null` when insufficient data
- [ ] Create `SPECS.md` for `client/src/features/dashboard/`

---

### Phase 3: Dashboard UI — Table & Tabs
Build the main dealer table with tabs, expandable groups, and the full column layout.

- [ ] Build tab bar component: "Dealer Groups" | "All Dealers" — toggles between grouped vs independent dealer views
- [ ] Build the dealer table component with all columns: Activity columns (populated) + future metric columns (empty/dashed)
- [ ] Implement expandable group rows — click a group to reveal child locations inline with smooth animation
- [ ] Build trend comparison dropdown (top-level): YoY, MoM, 30d Moving Avg, 60d Moving Avg — selection applies trend indicators to all columns
- [ ] Per-column trend badges: green ↑ / red ↓ with % value, or "—" when data is insufficient
- [ ] Mobile responsive: collapse to essential columns on small screens, swipe/scroll for full table, touch-friendly expand targets

---

### Phase 4: Overview Stats Bar & Polish
Add the summary stats header, budget data storage, and final visual polish.

- [ ] Build stats summary bar at top: Total Dealers, Active %, Groups, Latest Report Date — compact KPI cards
- [ ] Store budget CSV data: create a `Budget` model on the server, parse and persist the 2026 budget CSV to MongoDB (accessible but not wired to UI yet)
- [ ] Search/filter: quick-search bar to filter dealer groups or dealers by name
- [ ] Loading states: skeleton loaders for table and stats
- [ ] Final visual polish: micro-animations (row expand, tab switch, hover effects), consistent spacing, dark mode readiness
- [ ] Create/update all `SPECS.md` and `CHANGELOG.md`

---

## Open Questions

> [!NOTE]
> No blocking questions remain. All ambiguities resolved in CLARIFY step.

## Verification Plan

### Automated Tests
- Vitest unit tests for trend calculation utilities
- Vitest component tests for table rendering, tab switching, group expansion
- API service tests with mocked responses

### Manual Verification
- Launch dev server (`npm run dev` in client), connect to live backend
- Verify dealer groups load and expand correctly
- Verify responsive behavior on mobile viewport sizes
- Verify trend dropdown switches comparison modes
- Verify empty columns render cleanly with dashes
