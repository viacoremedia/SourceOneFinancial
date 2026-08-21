# Dealer Relationship Demand (DRD) & Visit Allocation Engine
## Production Implementation Plan & Detailed Tasks (v6.2 Final)

---

## 1. Cleaned TypeScript Interfaces & Data Contracts

```typescript
export type RelationshipDemandSegment = 
  | 'high_tlc'           // Spike & Decay: deal flow strictly follows visits
  | 'self_sufficient'    // Autonomous Locomotive: portal-driven organic deal flow
  | 'comfort_stop'       // Empty Friction: 3+ visits with $0 in lifetime booked loans
  | 'insufficient_data'; // Discovery Queue: <2 visits and <5 applications

export type UrgencyStatus = 
  | 'overdue'            // High TLC: daysSinceLastVisit > recommendedCadenceDays
  | 'due_soon'           // High TLC: daysSinceLastVisit >= recommendedCadenceDays - 7
  | 'on_track'           // High TLC: daysSinceLastVisit < recommendedCadenceDays - 7
  | 'self_sufficient'    // Autonomous: digital/quarterly monitoring only
  | 'not_monitored';     // Comfort Stop / Discovery

export interface InteractionCycle {
  cycleNumber: number;
  startDate: string; // ISO date
  endDate: string;
  triggerDate: string;
  triggerType: 'visit' | 'call';
  repName: string;
  visitCountInCluster: number;
  metrics: {
    daysToFirstBooked: number | null;
    bookedInWindow: number;
    bookedVolumeInWindow: number;
    appsInWindow: number;
    relativeBookedLift: number;
    dormancyDurationDaysAfter: number;
    patternObserved: 'spike_and_decay' | 'empty_friction' | 'autonomous_flow' | 'escalation';
  };
  summaryText: string; // e.g. "Visit Cluster (2 visits) on Jan 14 → $48.5K Booked (1 deal), 4 apps → Flatlined at Day 42"
}

export interface DealerRelationshipProfile {
  dealerLocationId: string;
  clientDealerId: string;
  dealerName: string;
  statePrefix: string;
  dealerGroup: string | null;
  assignedRep: string | null;

  // 4 Core Primary Buckets
  relationshipDemand: RelationshipDemandSegment;
  confidenceScore: number; // 0.0 to 1.0
  recommendedCadenceDays: number | null; // 30, 45, 60, 90

  // Secondary Diagnostic Flags
  flags: {
    isFadingTlc: boolean;          // Yield per visit dropped >40% over consecutive cycles
    isEmergingTlc: boolean;        // Exactly 1 verified cycle -> schedule confirmation visit
    isCatalyticActivation: boolean;// Single onboarding visit unlocked sustained organic flow
  };

  // Operational Urgency
  urgencyStatus: UrgencyStatus;
  daysSinceLastVisit: number | null;
  lastVisitDate: string | null;
  daysSinceLastTouch: number | null;
  lastTouchDate: string | null;
  lastTouchType: 'visit' | 'call' | 'email' | 'other' | null;

  // Key Empirical Business Metrics
  postVisitBookedLiftPct: number | null; // e.g. +240%
  organicBookedRatio: number;            // % of booked $ occurring >45d from any visit
  lifetimeYieldPerVisit: number;          // Total Booked $ / Total In-Person Visits
  verifiedCycleCount: number;             // Count of independent visit clusters

  // Lifetime Production Totals
  lifetimeStats: {
    totalBookings: number;
    totalBookedVolume: number;
    totalApplications: number;
    totalVisits: number;
    totalCalls: number;
    totalEmails: number;
  };

  // Human-Auditable Decision Trail
  decisionRationale: string[];
  interactionCycles: InteractionCycle[];

  // Monthly Pre-Aggregated Chart Overlays
  timelineMonthly: Array<{
    monthKey: string; // "2026-03"
    bookedVolume: number;
    bookedCount: number;
    appCount: number;
    visitCount: number;
    callCount: number;
  }>;
}
```

---

## 2. SPEC PLAN (Branch: `feature/drd-visit-impact-engine`)

### Phase 1: Backend Channel Normalizer, Pattern Engine & Database Recompute
- [ ] [server] Task 1.1: Build Channel Normalizer & Visit Clusterer in `dealerRelationshipEngine.js`
- [ ] [server] Task 1.2: Implement Relative Booked Lift, Seasonality Normalizer & 4 Core Classifiers
- [ ] [server] Task 1.3: Update `server/models/DealerProfile.js` Schema with unified `'comfort_stop'` enum & fields
- [ ] [server] Task 1.4: Execute Bulk Database Recompute & Verify Golden Test Cases (`FL319`, `FL340`, `TX569`, `AR126`, `MN329`)
- [ ] [server] Task 1.5: Update `server/routes/analytics/SPECS.md` & engine tests

### Phase 2: Backend API Endpoints & Drawer Payload Service
- [ ] [server] Task 2.1: Add multi-parameter filter queries (`?rep=...&demand=high_tlc&urgency=overdue`) in `relationshipDemand.js`
- [ ] [server] Task 2.2: Add detail endpoint `GET /api/analytics/relationship-demand/dealer/:id` returning drawer payload
- [ ] [both] Task 2.3: Update TypeScript interfaces in `client/src/core/services/api.ts`

### Phase 3: Frontend Slide-Out Drawer & Relationship View Overhaul
- [ ] [client] Task 3.1: Build `DealerRelationshipDrawer.tsx` with header audit box, Recharts Cause & Effect chart (bars + visit pins), and structured cycle accordions
- [ ] [client] Task 3.2: Rebuild `RelationshipDemandView.tsx` with 3 inner tabs (*Executive Allocation*, *Dealer Explorer*, *Rep Diagnostics*) & wire matrix click-to-filter
- [ ] [client] Task 3.3: Deprecate `Dealer360Modal.tsx` and redirect all modal triggers to the new drawer
- [ ] [client] Task 3.4: Run `npm run build` in `client` and execute end-to-end user interaction validation

---

## 3. Phase 1 Detailed Tasks (Ready for Implementation)

### Task 1.1: Channel Normalizer & Visit Clusterer
**Description:** Unify Jeriko (`communicationType`) and Badger Maps (`communicationResult1`) records to standard channels (`visit`, `call`, `email`, `other`). Merge in-person visits occurring within $<45$ days of each other into single discrete `VisitCluster` objects $[t_{\text{start}}, t_{\text{end}}]$.  
**Files:** `server/services/dealerRelationshipEngine.js`  
**Acceptance Criteria:**
- [ ] Correctly maps 2026 Badger records (`"Met with existing contact"`, `"Training completed"`, etc.) to in-person visits.
- [ ] Merges visits $<45$ days apart into single clusters; measures post-window strictly from $t_{\text{end}}$.
- [ ] Correctly computes `verifiedCycleCount` based on independent clusters separated by $\ge 45$-day cold gaps.

### Task 1.2: Relative Booked Lift & 4 Core Pattern Engine
**Description:** Implement relative booked lift formula focused primarily on funded volume ($) and booked deals, apply lightweight monthly seasonal index, verify post-window decay, and classify into High TLC, Self-Sufficient, Comfort Stop, and Discovery.  
**Files:** `server/services/dealerRelationshipEngine.js`  
**Acceptance Criteria:**
- [ ] Measures funded loan volume ($) as primary signal; dealers with $0 booked are never classified as High TLC.
- [ ] Confirmed High TLC requires $\ge 2$ independent clusters, relative booked lift $\ge 2.0\times$, and post-window decay.
- [ ] Single cycle flagged as `isEmergingTlc: true`.
- [ ] $\ge 3$ visits with $0 booked classified as `comfort_stop`.
- [ ] Generates plain-English `decisionRationale` array with actual dates and dollars.

### Task 1.3: Update DealerProfile Schema
**Description:** Update Mongoose model to support unified `'comfort_stop'` enum, `interactionCycles[]`, `timelineMonthly[]`, `flags`, and empirical metrics.  
**Files:** `server/models/DealerProfile.js`  
**Acceptance Criteria:**
- [ ] `relationshipDemand` enum strictly `['high_tlc', 'self_sufficient', 'comfort_stop', 'insufficient_data']`.
- [ ] Mongoose schema validates clean types with index on `{ assignedRep: 1, relationshipDemand: 1, urgencyStatus: 1 }`.

### Task 1.4: Bulk Database Recomputation & Golden Benchmark Verification
**Description:** Run bulk recompute across all 3,940 dealer records in MongoDB and verify against golden benchmarks.  
**Files:** `server/scripts/classifyDealers.js`  
**Acceptance Criteria:**
- [ ] `FL319` (Auction Direct RV) & `FL340` (LDRV Tampa) $\implies$ **`high_tlc`** ($>90\%$ confidence, $572K/$3.1M booked).
- [ ] `TX569` (RGV RV) & `AR126` (Fun Town Little Rock) $\implies$ **`self_sufficient`** (53/62 booked deals with $\le 2$ visits).
- [ ] `MN329` (Hilltop Trailer Sales) & `FL321` (Como RV) $\implies$ **`comfort_stop`** (28/6 visits with $0 booked).
- [ ] Recomputation completes in $<5$ seconds.

### Task 1.5: Update Analytics SPECS.md & Tests
**Description:** Update backend analytics specs and run test suite.  
**Files:** `server/routes/analytics/SPECS.md`  
**Acceptance Criteria:**
- [ ] `SPECS.md` reflects the v6.2 architecture and naming conventions.
- [ ] All unit tests pass.
