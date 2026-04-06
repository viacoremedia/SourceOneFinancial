# SPEC PLAN — Dealer Visit Data Pipeline (Branch: `feature/001-dealer-data-pipeline`)

## Context

Source One sends a daily CSV (`andrews_daily_dealer_metrics.csv`) via webhook with ~2,500 rows of dealer application/approval/booking activity. Today, this raw CSV is stored as a string blob in `WebhookPayload`. We need to extract it into structured, indexed documents that support trend analysis, period comparisons, and moving averages.

### Data Shape (13 columns)

| # | Column | Type | Notes |
|---|--------|------|-------|
| 0 | `DEALER ID` | String | State prefix + number (e.g. `TX400`, `SCA161`) |
| 1 | `DEALER NAME` | String | Brand + location (e.g. `Blue Compass RV - Charlotte - NC153`) |
| 2 | `LAST APPLICATION DATE` | Date | Most recent app date |
| 3 | `PRIOR APPLICATION DATE` | Date | Previous app date |
| 4 | `DAYS SINCE LAST APPLICATION` | Number | Computed from report date |
| 5 | `LAST APPROVAL DATE` | Date | |
| 6 | `DAYS SINCE LAST APPROVAL` | Number | |
| 7 | `LAST BOOKED DATE` | Date | Can be empty |
| 8 | `DAYS SINCE LAST BOOKING` | Number | Can be empty |
| 9 | `APPLICATION ACTIVITY STATUS` | Enum | `active`, `30d_inactive`, `60d_inactive`, `long_inactive`, `never_active` |
| 10 | `LATEST COMMUNICATION DATETIME` | DateTime | Last sales rep communication |
| 11 | `REACTIVATED AFTER SALES VISIT FLAG` | 0/1 | Key metric — did a visit cause reactivation? |
| 12 | `DAYS FROM VISIT TO NEXT APPLICATION` | Number | Can be empty |

### Key Design Decisions

> [!IMPORTANT]
> **Dealer Groups are auto-detected** by extracting the brand name from `DEALER NAME` (everything before the location/state suffix). Groups are created on-the-fly during ingestion. A future admin UI could allow manual corrections.

> [!IMPORTANT]
> **Rollups are pre-computed** (not calculated at query time) to keep dashboard queries fast at scale. Daily snapshots are the source of truth; rollups are derived and can be rebuilt.

> [!NOTE]
> **Future-proofing:** The parser is built as a service with a pluggable design so new CSV formats (different reps, different column sets) can be added later without changing the webhook route.

> [!NOTE]
> **Targets** are a future frontend feature. We include a `targets` field on the MonthlyDealerRollup schema (defaulting to empty) so the schema is ready when we get there.

---

## Phase 1: Data Models & Indexes

Create the Mongoose schemas with compound indexes optimized for time-series queries.

- [ ] [server] Create `models/DealerGroup.js` — auto-detected brand groups
  - Fields: `name` (String, unique), `slug` (String, unique, indexed), `dealerCount` (Number), `createdAt`
  - Index: `{ slug: 1 }` (unique)

- [ ] [server] Create `models/DealerLocation.js` — individual dealer locations
  - Fields: `dealerId` (String, unique — e.g. `TX400`), `dealerName` (String), `dealerGroup` (ObjectId ref → DealerGroup), `statePrefix` (String — extracted from dealerId), `createdAt`
  - Index: `{ dealerId: 1 }` (unique), `{ dealerGroup: 1 }`, `{ statePrefix: 1 }`

- [ ] [server] Create `models/DailyDealerSnapshot.js` — one row per dealer per day
  - Fields: `dealerLocation` (ObjectId ref), `dealerGroup` (ObjectId ref — denormalized for fast queries), `reportDate` (Date), `lastApplicationDate`, `priorApplicationDate`, `daysSinceLastApplication`, `lastApprovalDate`, `daysSinceLastApproval`, `lastBookedDate`, `daysSinceLastBooking`, `activityStatus` (enum with validation), `latestCommunicationDatetime`, `reactivatedAfterVisit` (Boolean), `daysFromVisitToNextApp`, `sourcePayload` (ObjectId ref → WebhookPayload)
  - Index: `{ dealerLocation: 1, reportDate: -1 }` (unique compound — prevents duplicate snapshots), `{ dealerGroup: 1, reportDate: -1 }`, `{ reportDate: -1 }`, `{ activityStatus: 1, reportDate: -1 }`

- [ ] [server] Create `models/MonthlyDealerRollup.js` — pre-aggregated monthly stats
  - Fields: `dealerLocation` (ObjectId ref), `dealerGroup` (ObjectId ref), `year` (Number), `month` (Number 1-12), `metrics`: `{ daysActive, daysInactive30, daysInactive60, daysLongInactive, totalSnapshotDays, applicationDatesChanged (count of new apps), approvalDatesChanged, bookingDatesChanged, reactivationEvents, avgDaysSinceLastApp, minDaysSinceLastApp, maxDaysSinceLastApp, avgDaysSinceLastApproval, avgDaysSinceLastBooking }`, `targets` (Mixed — future use, default `{}`), `updatedAt`
  - Index: `{ dealerLocation: 1, year: 1, month: 1 }` (unique compound), `{ dealerGroup: 1, year: 1, month: 1 }`, `{ year: 1, month: 1 }`

- [ ] [server] Create `models/FileIngestionLog.js` — track what's been processed
  - Fields: `sourcePayload` (ObjectId ref → WebhookPayload), `fileName` (String), `reportDate` (Date), `status` (enum: `pending`, `processing`, `completed`, `failed`), `rowCount` (Number), `dealersProcessed` (Number), `newDealers` (Number), `newGroups` (Number), `errorReason` (String), `processingTimeMs` (Number), `createdAt`, `completedAt`
  - Index: `{ sourcePayload: 1 }` (unique), `{ status: 1 }`, `{ reportDate: -1 }`

---

## Phase 2: CSV Parser Service & Dealer Group Detection

Build the service layer that transforms raw CSV content into structured documents.

- [ ] [server] Create `services/csvParserService.js` — generic CSV-to-rows parser
  - Handles quoted fields with commas (e.g. `"Family Boating & Marine Centers of FLA, Inc."`)
  - Returns `{ headers: string[], rows: object[] }` with column-name keys
  - Validates expected headers against a schema map
  - Extensible for future CSV formats (parser registry pattern)

- [ ] [server] Create `services/dealerGroupDetector.js` — brand name extraction
  - Extracts the brand/group name from `DEALER NAME` by stripping location suffixes, state codes, and dealer IDs
  - Upserts `DealerGroup` documents (find-or-create by normalized name)
  - Upserts `DealerLocation` documents (find-or-create by `dealerId`, link to group)
  - Returns a map of `dealerId → { dealerLocationId, dealerGroupId }` for the batch

- [ ] [server] Create `services/dealerMetricsIngestionService.js` — orchestrates the full pipeline
  - Takes raw CSV content string + WebhookPayload ID
  - Calls `csvParserService` to parse rows
  - Calls `dealerGroupDetector` to resolve/create dealers
  - Bulk-upserts `DailyDealerSnapshot` documents (upsert on `dealerLocation + reportDate` to handle re-processing)
  - Creates/updates `FileIngestionLog` with status tracking
  - Returns summary: `{ rowCount, dealersProcessed, newDealers, newGroups, errors }`

- [ ] [server] Add JSDoc annotations to all service functions per team-standards §8

---

## Phase 3: Webhook Integration & Data Backfill

Wire the parser into the existing webhook route and process the 8 CSVs already in the database.

- [ ] [server] Modify `webhook/routes.js` POST handler — after saving `WebhookPayload`, detect if the file is a known CSV format and trigger the ingestion service
  - Detection: check filename pattern or header row against registered parsers
  - Run ingestion async (don't block the webhook response — respond 200 immediately, process in background)
  - Log ingestion result to `FileIngestionLog`

- [ ] [server] Create `scripts/backfill.js` — one-time script to process existing 8 WebhookPayloads
  - Queries all `WebhookPayload` docs with CSV files
  - Runs each through the ingestion pipeline in chronological order
  - Reports summary of what was created
  - Safe to re-run (upsert logic prevents duplicates)

- [ ] [server] Add GET `/webhook/ingestion-log` route — view processing status
  - Returns recent `FileIngestionLog` entries for monitoring
  - Supports `?status=failed` filter for debugging

- [ ] [server] Update WEBHOOK_GUIDE.md with new processing flow documentation

---

## Phase 4: Rollup Engine & Query Routes

Build the aggregation layer and API endpoints for trend consumption.

- [ ] [server] Create `services/rollupService.js` — computes monthly rollups from daily snapshots
  - `buildMonthlyRollup(dealerLocationId, year, month)` — aggregates all daily snapshots for that dealer/month
  - `rebuildRollupsForDate(reportDate)` — rebuilds rollups for all dealers that have a snapshot on that date (called after ingestion)
  - `rebuildAllRollups()` — full rebuild from scratch (for backfill or corrections)
  - Detects "new application" events by comparing `lastApplicationDate` between consecutive snapshots

- [ ] [server] Create `routes/analytics/index.js` — query API for frontend consumption
  - `GET /analytics/dealers/:dealerId/trend` — daily snapshots for a dealer over a date range
  - `GET /analytics/dealers/:dealerId/monthly` — monthly rollups for a dealer
  - `GET /analytics/groups/:groupId/monthly` — aggregated monthly rollups for an entire dealer group
  - `GET /analytics/groups/:groupId/locations` — all locations in a group with latest snapshot
  - `GET /analytics/overview` — high-level stats (total active, inactive, reactivations this month vs last)

- [ ] [server] Add moving-average computation to analytics routes
  - Support `?movingAvg=30` / `60` / `90` query param on trend endpoints
  - Computed from daily snapshots using `$setWindowFields` aggregation (MongoDB 5.0+) or in-app sliding window

- [ ] [server] Wire rollup rebuild into the ingestion pipeline (after daily snapshot insert, trigger rollup for affected month)

- [ ] [server] Update docs with new analytics API documentation

---

## Future Work (Not in Scope)

These are noted for when we get to them:

- **Frontend dashboard** — React UI consuming the analytics routes
- **User-inputted targets** — `targets` field on `MonthlyDealerRollup` is pre-baked but empty; frontend will populate via a settings UI
- **Additional CSV formats** — Parser registry in `csvParserService.js` is extensible; new formats get their own ingestion service
- **Yearly rollups** — Can be derived from monthly rollups when needed; schema is identical to monthly but grouped by year
- **Email/Slack alerts** — Trigger when a dealer goes inactive or reactivates

## Verification Plan

### Automated Tests
- Run `scripts/backfill.js` against the 8 existing CSVs and verify:
  - All ~2,500 unique dealers have `DealerLocation` docs
  - ~40 multi-location `DealerGroup` docs are created
  - 8 × ~2,500 = ~20,000 `DailyDealerSnapshot` docs exist
  - Monthly rollups are generated for March and April 2026
  - `FileIngestionLog` shows 8 completed entries
- Query validation: test trend, monthly, and moving-average endpoints against known data

### Manual Verification
- Send a new CSV via the webhook and confirm it's processed automatically
- Compare rollup values against manual spot-checks of the raw CSV
