# Changelog — Source One

All notable changes to this project are documented here.
Format: [Added / Changed / Fixed / Removed] + Tests Run section.

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
