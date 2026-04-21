# Rolling Averages Dashboard

Build a real-time rolling averages intelligence layer into the Source One dashboard — giving Joseph instant visibility into network health, rep performance, and churn velocity across 7-day and 30-day windows.

## Proposed Changes

### Phase 1: Server — Rolling Averages API

Build the backend aggregation endpoints that power all frontend components. Uses `DailyDealerSnapshot` data windowed by the N most recent report dates (not calendar days) to handle data gaps gracefully.

---

#### [NEW] `server/services/rollingAverages.js`

Core aggregation service with two main functions:

**`computeNetworkRollingAvg(windowSize, states?)`** — Company-wide or state-filtered:
- Finds the N most recent distinct `reportDate` values
- Aggregates across all snapshots in that window:
  - `avgDaysSinceApp` — mean of `daysSinceLastApplication`
  - `avgDaysSinceApproval` — mean of `daysSinceLastApproval`
  - `avgDaysSinceBooking` — mean of `daysSinceLastBooking`
  - `avgContactDays` — mean of days since `latestCommunicationDatetime`
  - `avgVisitResponse` — mean of `daysFromVisitToNextApp`
- Also computes **period-over-period delta** (current window vs previous window of same size)

**`computeRepScorecard(windowSize)`** — Per-rep breakdown:
- Joins `DealerLocation.statePrefix` → `SalesBudget.state` → `SalesBudget.rep`
- Groups snapshots by rep, computing:
  - All 5 rolling averages above
  - Dealer counts: total, active, 30d, 60d, long inactive
  - Reactivation count within window
  - **Churn flow**: gained active, lost active, net delta (by comparing consecutive day statuses)
- Returns array of rep objects

**`computeStatusFlows(windowSize, states?)`** — Churn velocity:
- For each pair of consecutive report dates in the window, count status transitions
- Compute daily averages: `avgGainedActive`, `avgLostActive`, `avgReactivated`, `netDelta`

#### [MODIFY] `server/routes/analytics/index.js`

Add two new endpoints:

```
GET /analytics/rolling-averages?window=7|30&states=TX,FL
GET /analytics/rep-scorecard?window=7|30
```

Both are read-only, no auth required (matches existing pattern), response cached in-memory for 5 minutes since data only changes on daily ingestion.

#### Tasks

- [ ] Task 1: Create `rollingAverages.js` service with `computeNetworkRollingAvg`
- [ ] Task 2: Add `computeRepScorecard` with per-rep grouping via SalesBudget join
- [ ] Task 3: Add `computeStatusFlows` for churn velocity metrics
- [ ] Task 4: Wire both endpoints into `analytics/index.js` with 5-min cache
- [ ] Task 5: Update `server/routes/analytics/SPECS.md` + `server/services/SPECS.md`

---

### Phase 2: Client — Rolling Averages Strip

A compact, information-dense strip positioned between the FilterBar stats row and the DealerTable. Shows the 5 core metrics with period-over-period deltas and churn flow summary.

---

#### [NEW] `client/src/features/dashboard/components/RollingAvgStrip/RollingAvgStrip.tsx`

Horizontal strip component:
- **Left**: Window toggle pills: `7d` | `30d` (shared state, lifted to Dashboard)
- **Center**: 5 metric cards in a row, each showing:
  - Metric label (e.g., "Avg App Days")
  - Current rolling avg value (large, heatmap-colored)
  - Delta badge: `↓2.3` green (improving) or `↑1.8` red (worsening)
  - Tiny sparkline (optional Phase 4 enhancement)
- **Right**: Compact churn summary: `+3.2/day gained · -1.8/day lost · Net +1.4`
- Respects existing Rep/State filter — passes `targetStates` to the API
- Skeleton loading state while data fetches

> [!IMPORTANT]
> **Design principle**: Each card is ~100px wide, single-line values, no wrapping. The strip should feel like a data ticker, not a dashboard within a dashboard. Muted labels, bold values, subtle deltas.

#### [NEW] `client/src/features/dashboard/components/RollingAvgStrip/RollingAvgStrip.module.css`

Styling: glassmorphic strip with subtle border, flex layout, heatmap-colored values, delta badges with directional arrows.

#### [NEW] `client/src/features/dashboard/hooks/useRollingAvg.ts`

Custom hook wrapping the `/analytics/rolling-averages` endpoint. Accepts `windowSize` and `states` params. Returns `{ data, isLoading }`. Refetches when params change.

#### [MODIFY] `client/src/features/dashboard/pages/Dashboard.tsx`

- Add `rollingWindow` state (`7 | 30`, default `7`)
- Place `<RollingAvgStrip>` between the FilterBar/TabBar row and `<DealerTable>`
- Pass `targetStates` and `rollingWindow` down

#### Tasks

- [ ] Task 1: Create `useRollingAvg` hook with API integration
- [ ] Task 2: Build `RollingAvgStrip` component with 5 metric cards + churn summary
- [ ] Task 3: Style the strip (CSS module) — compact, heatmap-colored, responsive
- [ ] Task 4: Integrate into `Dashboard.tsx` with window toggle state
- [ ] Task 5: Add types to `dashboard/types.ts`, update feature SPECS.md

---

### Phase 3: Client — Rep Scorecard Drawer

A bottom-opening drawer (like a sheet) showing all reps in a sortable comparison table. Triggered from a button in the AppShell header area.

---

#### [NEW] `client/src/features/dashboard/components/RepScorecard/RepScorecard.tsx`

Bottom drawer component:
- **Header**: "Rep Scorecard" title + window toggle (synced with strip) + close button
- **Table columns** (curated for clarity, not clutter):

| Heat Index | Rep | Dealers | Active | 30d | 60d | Long | Reactivated | Avg App | Avg Appr | Avg Bkd | Avg Contact | Visit Resp | Gained/d | Lost/d | Net |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

- Each numeric cell uses heatmap coloring consistent with the main DealerTable
- Sortable columns (reuse the same sort pattern)
- Heat Index column shows a colored circle (green/amber/red) + score number
- Rows are clickable → sets the Rep filter in the main dashboard and closes drawer

#### [NEW] `client/src/features/dashboard/components/RepScorecard/RepScorecard.module.css`

Bottom drawer animation (slide up from bottom, semi-transparent backdrop, max-height 60vh, scrollable table body).

#### [NEW] `client/src/features/dashboard/hooks/useRepScorecard.ts`

Hook wrapping `/analytics/rep-scorecard`. Returns `{ reps, isLoading }`.

#### [MODIFY] `client/src/core/components/AppShell/AppShell.tsx`

- Add "Rep Scorecard" button (📋 icon) next to the Daily Digest button
- Add `repScorecardOpen` state
- Render `<RepScorecard>` at root level (portal or inline)
- Pass `onSelectRep` callback to bridge drawer → Dashboard filter

> [!NOTE]
> The drawer needs to communicate the selected rep back to Dashboard. We'll either lift state via a shared context or use a callback prop passed through AppShell's `children` render pattern. The simplest approach is a custom event or a shared context provider.

#### [MODIFY] `client/src/features/dashboard/pages/Dashboard.tsx`

- Listen for rep selection from the scorecard drawer
- Add `rollingWindow` as shared state accessible by both Strip and Scorecard

#### Tasks

- [ ] Task 1: Create `useRepScorecard` hook
- [ ] Task 2: Build `RepScorecard` drawer component with table layout
- [ ] Task 3: Style the bottom drawer (CSS, animation, responsive)
- [ ] Task 4: Add trigger button to `AppShell.tsx` header
- [ ] Task 5: Wire rep selection callback (drawer → Dashboard filter)
- [ ] Task 6: Update SPECS.md for new components

---

### Phase 4: Intelligence — Heat Index & Capacity Analysis

The composite scoring system that transforms raw numbers into actionable signals.

---

#### [NEW] `server/services/heatIndex.js`

**Heat Index Formula** — a 0–100 composite score per rep:

```
Score = w1 * AppDaysScore + w2 * ApprovalDaysScore + w3 * BookingDaysScore
      + w4 * ContactScore + w5 * VisitResponseScore + w6 * ActiveRatioScore
      + w7 * ReactivationScore + w8 * ChurnNetScore
```

- Each sub-score normalizes the metric to 0–100 using min/max across all reps
- Lower "days since" = better score (inverted)
- Higher active ratio = better score
- Positive net churn = better score
- Default weights: `[0.20, 0.10, 0.10, 0.15, 0.10, 0.20, 0.10, 0.05]`
  - Heavy on App Days (the primary metric) and Active Ratio (outcome)

**Capacity Classification:**

```
avgDealersPerRep = totalDealers / repCount
capacityRatio = repDealerCount / avgDealersPerRep

IF capacityRatio > 1.3 AND heatIndex < 50:
  → "Overburdened" (amber flag — too many dealers, metrics suffering)
IF capacityRatio <= 1.0 AND heatIndex < 40:
  → "Underperforming" (red flag — normal load, poor metrics)
IF heatIndex >= 70:
  → "Strong" (green)
ELSE:
  → "Average" (neutral)
```

The 1.3 capacity threshold and 50/40 heat index thresholds are **configurable** via the settings panel (stored in localStorage for now, server config later).

#### [MODIFY] `server/services/rollingAverages.js`

Integrate Heat Index computation into the `computeRepScorecard` response. Each rep object gets:
```json
{
  "heatIndex": 72,
  "heatClass": "strong",
  "capacityRatio": 1.1,
  "capacityFlag": null
}
```

#### [MODIFY] Rep Scorecard UI

- Heat Index column shows colored dot + number + optional capacity badge ("⚡ Overburdened" or "⚠ Underperforming")
- Add tooltip explaining the score breakdown on hover
- FilterBar rep dropdown gets a small colored dot next to each rep name (green/amber/red)

#### [MODIFY] `client/src/core/components/AppShell/AppShell.tsx` (FilterBar dropdown enhancement)

- Rep dropdown options show Heat Index dot for instant signal

#### Tasks

- [ ] Task 1: Create `heatIndex.js` service with composite scoring + capacity classification
- [ ] Task 2: Integrate into `computeRepScorecard` response
- [ ] Task 3: Update `RepScorecard` UI with Heat Index column + capacity badges
- [ ] Task 4: Add Heat Index dots to FilterBar rep dropdown
- [ ] Task 5: Add configurable thresholds (localStorage for now)
- [ ] Task 6: Update all SPECS.md + CHANGELOG.md

---

## Verification Plan

### Automated Tests
- `server/services/__tests__/rollingAverages.test.js` — Unit tests with mock snapshot data
- `server/services/__tests__/heatIndex.test.js` — Composite score validation
- API endpoint integration tests via Supertest

### Manual Verification
- Run locally with existing April 7th data
- Verify 7d window correctly uses last 7 report dates (not calendar days)
- Verify Rep Scorecard drawer animation and table rendering
- Verify Heat Index scoring produces sensible rankings
- Verify FilterBar rep dropdown shows colored dots
- Cross-check rolling avg numbers against manual calculations from raw snapshot data

---

## Open Questions

> [!NOTE]
> **Sparklines**: Mentioned as a value-add in Phase 2. These would require fetching daily-granularity data for the strip (30 data points per metric). Recommend deferring to a Phase 5 polish pass to keep initial scope tight. Worth it?

> [!NOTE]
> **Configurable Heat Index weights**: Phase 4 stores thresholds in localStorage. Should we eventually persist these in a server-side `UserPreferences` collection so Joseph's settings survive across devices?
