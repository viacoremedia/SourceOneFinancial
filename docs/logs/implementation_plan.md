# Dealer 360 & Rep 360 — Unified Intelligence Hubs

## Problem

Right now, to understand a single dealer or rep you have to hop between 5+ features:
- **Main table row click** → Opens `DealerDrawer` (just apps list)
- **Dealer360Modal** → Opens from Visit Impact / DRD clicks (overview, timeline, MoM, touchpoints, apps)
- **AnalyticsDrawer** → Separate MoM, apps, and comm tabs with different filters
- **DealerRelationshipDrawer** → Separate DRD-specific view with its own apps/comms
- **VisitImpactDrawer** → Rep-level visit data, no unified rep profile
- **RepScorecard** → Heat Index and comparison table, no drill-down per rep

We want **one place** for a dealer, and **one place** for a rep, with everything consolidated and the UI elevated to match the quality of the Dealer360Modal we built for Visit Impact / DRD.

---

## Proposed Changes

### Phase 1: Dealer 360 Upgrade

Upgrade the existing [Dealer360Modal.tsx](file:///home/joshg/work/SourceOneFinancial/client/src/components/Dealer360Modal/Dealer360Modal.tsx) to become the **single unified dealer view** that opens from everywhere.

#### What Changes

**Current tabs**: Overview, Cause & Effect Timeline, MoM, Touchpoints, Apps

**New unified tabs** (keeping the good stuff, consolidating the rest):

| Tab | Content | Data Source |
|-----|---------|-------------|
| **Profile** | Dealer identity card (name, ID, state, rep, group), recency gauges, status badge, DRD classification + DNA card, lifetime stats grid (apps, approvals, booked vol, L2B%, A2B%), 12-month sparkline | `dealer-360` API + `dealer-relationship-timeline` API |
| **Activity Feed** | Unified chronological stream of ALL events (visits, calls, apps submitted, apps booked) with the existing cause-and-effect flow chart anchored on visits | `dealer-360/timeline` API |
| **Financials** | MoM table (enhanced with approval & booked columns), apps table with status badges and inline detail expansion, avg deal size and APR summaries | `dealer-360` sparkline + `dealer-applications-history` API |
| **Field Ops** | Touchpoints table (visits, calls, emails with notes), DRD behavioral metrics grid, recommended cadence, post-visit lift %, visit yield per dollar | `rep-communication-history` API + `dealer-relationship-timeline` API |

#### UI/UX Upgrades
- Replace all emojis with Lucide React icons (consistent with rest of app)
- Redesign tab bar into a segmented pill strip matching ScorecardReports configurator style
- Add a "Rep 360" link on the rep name that opens the Rep 360 modal
- Make the main `DealerTable` row click open THIS modal instead of the old `DealerDrawer`
- Standardize the modal width/height and add smooth slide-in animation

---

### Phase 2: Rep 360 — New Component

Create a new `Rep360Modal` component that consolidates all rep-level data into one unified view.

#### [NEW] `client/src/components/Rep360Modal/Rep360Modal.tsx`
#### [NEW] `client/src/components/Rep360Modal/Rep360Modal.module.css`

| Tab | Content | Data Source |
|-----|---------|-------------|
| **Profile** | Rep identity (name, assigned territory states, dealer count), Heat Index score badge with 10-factor breakdown, classification, peer rank, capacity ratio | `computeRepScorecard` via `/analytics/rep-scorecard` API |
| **Portfolio** | Territory dealer table: all assigned dealers with status, days since app, booked vol — sortable, searchable, with click-through to Dealer 360 | `/analytics/dealers` API filtered by rep |
| **Financials** | Pipeline funnel: total apps, approvals, booked count/volume, L2B%, A2B%, avg deal size, avg APR, time-to-book. State-by-state breakdown. | `computeRepScorecard` financials |
| **Field Ops** | Visit Impact metrics: total visits, reactivation count/rate, 2×2 matrix, growth effort %. Paginated communication history log. | `computeVisitImpactV2` per-rep + `rep-communication-history` API |
| **DRD Routing** | High TLC accounts list with urgency status, overdue queue, comfort stop waste list, recommended cadence compliance | `DealerProfile` filtered by rep |

#### Trigger Points
- Clicking a rep name in any table (main dashboard, Rep Scorecard, Visit Impact) opens Rep 360
- Add to `AnalyticsContext` with `openRep360(repName)` / `closeRep360()`

---

### Phase 3: Wiring & Cleanup

#### [MODIFY] `client/src/core/contexts/AnalyticsContext.tsx`
- Add `rep360Open`, `focusedRepName`, `openRep360()`, `closeRep360()` state
- Ensure Dealer360 and Rep360 can cross-link (dealer → rep, rep → dealer)

#### [MODIFY] `client/src/features/dashboard/components/DealerTable/DealerTable.tsx`
- Change `onSelectDealer` row click to open `Dealer360Modal` (via `openDealer360`) instead of old `DealerDrawer`

#### [MODIFY] `client/src/core/components/AppShell/AppShell.tsx`
- Mount `Rep360Modal` alongside `Dealer360Modal`

#### Backend — No new endpoints needed
All data is already served by existing APIs:
- `GET /analytics/dealer-360/:dealerId` (overview)
- `GET /analytics/dealer-360/:dealerId/timeline` (activity stream)
- `GET /analytics/dealer-applications-history/:dealerId` (apps)
- `GET /analytics/rep-communication-history` (touchpoints)
- `GET /analytics/dealer-relationship-timeline/:dealerId` (DRD profile)
- `GET /analytics/rep-scorecard` (Heat Index + financials)
- `GET /analytics/visit-impact` (visit attribution)

> [!IMPORTANT]
> We may need one new endpoint: `GET /analytics/rep-360/:repName` that consolidates rep-level data into a single payload to avoid N+1 waterfall requests in the Rep 360 modal.

---

## Open Questions

1. **Should clicking a dealer row in the main table open the full Dealer 360 modal, or keep the lightweight DealerDrawer for quick app history glances?**
   - Option A: Always open Dealer 360 (one unified experience)
   - Option B: Keep DealerDrawer for quick view, add a "Full 360" button that escalates to the modal

2. **Rep 360 trigger from header nav bar?** Should there be a top-level "Rep 360" button in the nav cell strip, or is it sufficient to just click rep names throughout the app?

3. **Priority order?** Should I do Dealer 360 upgrade first (Phase 1), then Rep 360 (Phase 2), or both in parallel?

---

## Verification Plan

### Manual Verification
- Click a dealer row in main table → Dealer 360 opens with all 4 tabs populated
- Click a rep name anywhere → Rep 360 opens with all 5 tabs populated
- Cross-link: Dealer 360 rep name → Rep 360; Rep 360 dealer row → Dealer 360
- All data matches what you'd see in the individual features (Visit Impact, DRD, RepScorecard, etc.)
- Zero emojis, all Lucide icons
- Smooth animations, premium glassmorphism styling
