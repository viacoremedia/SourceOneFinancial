# Changelog — Source One

All notable changes to this project are documented here.
Format: [Added / Changed / Fixed / Removed] + Tests Run section.

----

## [2026-04-14] — Webhook Observability + Light/Dark Theme

### Added
- **Webhook persistent logging** — `WebhookLog` model with 90-day TTL auto-expiry:
  - Tracks 8 event types: `request_received`, `parse_success`, `parse_error`, `ingestion_start`, `ingestion_complete`, `ingestion_failed`, `empty_payload`, `health_check`
  - Every POST to `/webhook` now logs the full request lifecycle to MongoDB
- **Diagnostic endpoints** (unauthenticated — auth recommended before production):
  - `GET /webhook/health` — server time, DB status, last received/ingested timestamps, 24h event breakdown
  - `GET /webhook/logs` — queryable event history with `eventType`, `since`, `until`, `limit` filters
- **Light/Dark theme system**:
  - `ThemeProvider` context with `localStorage` persistence and OS preference fallback on first load
  - Binary light ↔ dark toggle (no "system" third option)
  - Professional SVG Sun/Moon icons in header (Lucide-style, 18px)
  - `[data-theme="light"]` CSS token overrides in `tokens.css`: surfaces, text, borders, accent (Royal Blue `#2563EB`), trends, shadows
  - `--bg-card` semantic token added to `:root` and light mode (was missing — root cause of DigestPanel staying dark)
- **Theme-aware heatmap** — light mode returns crisp solid text colors (no backgrounds); dark mode preserves original HSLA glow
- **Component-level light mode overrides**: DealerTable (status badges, sort toggles, best/worst values), FilterBar (chip hover/active, stats row), DigestPanel (hover states, flow pills, table borders, rep accent), Settings (button styles)

### Changed
- `App.tsx` — Wrapped in `ThemeProvider`, replaced hardcoded navy colors with CSS vars
- `AppShell.tsx` — Added theme toggle button to header
- `global.css` — Added `color-scheme`, selection color, and scrollbar theming for both modes
- `heatmap.ts` — `HeatmapColor.background` made optional; early-return branch for light mode
- `DigestPanel.tsx` — Fixed At-Risk Dealers table alignment (Rep → left, Days Since App → right)

### Fixed
- DigestPanel stuck in dark mode — caused by missing `--bg-card` token definition in `tokens.css`
- Sort column indicators invisible in light mode — caused by accent color set to dark slate (`#0F172A`), reverted to Royal Blue
- Status badge contrast — light mode badges now use darker semantic colors (e.g., `#15803D` green, `#DC2626` red)
- Hover states using `rgba(255,255,255,0.06)` on white backgrounds — inverted to `rgba(0,0,0,0.04)` for light mode

### Removed
- `MonitorIcon` SVG component (dead code from removed "system" toggle)
- `CYCLE_ORDER` constant (dead code from removed 3-state cycle)

### Pipeline Audit
- **Finding:** Source One stopped sending CSV data after April 8. Last 5 payloads span Apr 4–8, all ingested successfully (~2500 dealers each). Zero deliveries since. Server is healthy — issue is upstream.
- **Action:** Contact Source One re: their `node-fetch` automation; deploy logging changes for future observability.

### Tests Run
- Verified production `/webhook` GET returns 5 payloads (Apr 4–8), all with correct report dates
- Verified production `/webhook/ingestion-log` returns 10 logs, all `status: completed`
- Confirmed `/webhook/health` returns 500 on production (expected — `WebhookLog` model not yet deployed)
- Local dev: hot-reload verified for all theme changes across DealerTable, FilterBar, DigestPanel, Settings

---

## [2026-04-08] — Automated Reports (Daily Digest + Health Monitor)

### Added
- **Daily Activity Digest** — automated email sent after each CSV ingestion:
  - Network status breakdown (active/30d/60d/long inactive) with day-over-day changes
  - New applications, approvals, bookings detected (via date-change comparison)
  - Reactivation event count
  - Top 5 at-risk dealers (active but approaching inactivity)
  - Active rate progress bar
  - Dark-themed HTML email matching dashboard aesthetic
- **System Health Monitor** — alert-only email when ingestion issues are detected:
  - Row count anomaly (±20% from 7-day rolling average)
  - Processing time spike (>3x rolling average)
  - New dealer spike (>20 in one ingestion)
  - Report date gaps (>2 days between ingestions)
  - Parse error reporting
  - Severity levels: 🔴 CRITICAL / 🟡 WARNING
  - No email sent when all checks pass (zero inbox noise)
- **Report Recipient management** — admin-configurable via Settings panel:
  - `ReportRecipient` model for storing email addresses
  - Add/remove recipients from Settings → "Report Recipients" section
  - Default seeded: `joshua@viacoremedia.com`
- **Report API** (admin+, JWT-protected):
  - `GET /reports/recipients` — list all recipients
  - `POST /reports/recipients` — add a recipient
  - `DELETE /reports/recipients/:id` — remove a recipient
  - `POST /reports/daily-digest` — manually trigger digest for any date
  - `POST /reports/health-check` — manually trigger health check
  - `GET /reports/preview/daily-digest` — preview digest HTML in browser
- **Report Service** (`services/reportService.js`) — central orchestrator
- **Post-ingestion hook** — reports fire automatically after CSV ingestion (Step 9, non-fatal)
- **Generic `sendEmail()`** added to `emailService.js` for reusable email sending

### Changed
- **`dealerMetricsIngestionService.js`**: Added non-fatal Step 9 after rollup rebuild to trigger automated reports
- **`index.js`**: Mounted `/reports` routes behind auth gate
- **`vite.config.ts`**: Added `/reports` proxy for dev server
- **`SettingsPanel.tsx`**: Added "Report Recipients" section with add/remove functionality

### Tests Run
- All modules verified loading cleanly via `require()` test
- Seed script confirmed: default recipient created in DB

---

## [2026-04-07] — Invite-Only Auth System

### Added
- **Invite-only authentication**: No public registration — users invited by admins via email
  - `POST /auth/login` — email + password → JWT (90-day expiry)
  - `POST /auth/accept-invite` — set password from invite link
  - `POST /auth/invite` — admin+ sends invite email via Nodemailer (Gmail SMTP)
  - `GET /auth/users` — admin+ lists all system users
  - `DELETE /auth/users/:id` — admin+ removes users (role-scoped, double confirmation)
  - `POST /auth/change-password` — any authenticated user
  - `GET /auth/me` — return current user profile
- **User model** (`models/User.js`): email, passwordHash, name, role (employee/admin/super_admin), status (invited/active/disabled), inviteToken
- **Auth middleware** (`middleware/authMiddleware.js`): `requireAuth` (JWT verify) + `requireRole(minRole)` role hierarchy
- **Email service** (`services/emailService.js`): Nodemailer transport, styled invite email
- **Route protection**: All `/analytics` routes now require valid JWT; `/webhook` and `/auth` remain open
- **Login page** — dark-themed, matches dashboard aesthetic
- **Accept invite page** — `/invite?token=xxx`, set name + password
- **Settings panel** — slide-out from ⚙ gear icon in header: profile, change password, invite users, manage team
- **Double confirmation modal** for user removal (type email to confirm)
- **Seed script** (`scripts/seedAdmin.js`): creates initial super_admin account
- **Axios interceptors**: auto-attach JWT to all requests, auto-redirect to login on 401

### Changed
- **`index.js`**: Auth gate middleware inserted between webhook/auth and analytics routes
- **`vite.config.ts`**: Added `/auth` proxy to dev server
- **`App.tsx`**: Wrapped with `BrowserRouter` + `AuthProvider`, route-based login/invite/dashboard
- **`AppShell.tsx`**: Added ⚙ settings gear icon to header
- **`api.ts`**: Request interceptor attaches Bearer token; response interceptor handles 401

### Dependencies Added
- Server: `bcryptjs`, `jsonwebtoken`, `nodemailer`
- Client: `react-router-dom`

---

## [2026-04-07] — Dynamic Activity Mode & Dashboard Enhancements

### Added
- **Status By dropdown** (Application / Approval / Booking): dynamically derives dealer activity status from different metrics
  - Server-side: `/analytics/groups` and `/analytics/dealers/small` accept `activityMode` parameter
  - Client-side: `deriveStatus()` function computes status from `daysSinceLastApproval` or `daysSinceLastBooking`
- **Server-side search** for independent/all dealers: debounced regex matching on dealerName
- **Infinite scroll** parity for Independent Dealers and All Dealers tabs
- **Multi-column sort** with per-column removal (✕ button)
- **Orphan analysis script** (`scripts/analyzeOrphans.js`): finds ungrouped dealers that should belong to existing groups
- **Orphan reassignment script** (`scripts/reassignOrphans.js`): reassigns orphaned dealers with `--commit` flag

### Fixed
- **Status badge mismatch**: Individual location status badges now correctly reflect selected activity mode
- **Status filter leak**: Clicking "Active" with booking mode no longer shows non-active-by-booking locations
- **Group active count**: `GroupRows` `filteredActive` computation now uses `deriveStatusFn` for mode-aware counting

### Tests Run
- Manual browser verification: status badges, status filters, search, infinite scroll, sort removal, auth login/logout

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
