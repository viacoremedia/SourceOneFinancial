/**
 * TypeScript interfaces for Source One dealer analytics data.
 * Maps directly to the server API response shapes.
 */

// ── Group Summary (aggregated from latest snapshots) ──
export interface BestWorst {
  best: number | null;
  worst: number | null;
}

export interface GroupSummary {
  locationCount: number;
  activeCount: number;
  inactive30Count: number;
  inactive60Count: number;
  longInactiveCount: number;
  reactivatedCount: number;
  daysSinceApp: BestWorst;
  daysSinceApproval: BestWorst;
  daysSinceBooking: BestWorst;
  visitToApp: BestWorst;
  avgVisitToApp: number | null;
  latestComm: string | null;
  oldestComm: string | null;
}

// ── Dealer Group ──
export interface DealerGroup {
  _id: string;
  name: string;
  slug: string;
  dealerCount: number;
  states: string[];  // 2-letter state codes from locations
  createdAt: string;
  summary: GroupSummary | null;
}

// ── Dealer Location ──
export interface DealerLocation {
  _id: string;
  dealerId: string;
  dealerName: string;
  statePrefix: string;
  dealerGroup: string | null;
  createdAt: string;
  latestSnapshot: DailySnapshot | null;
}

// ── Daily Snapshot ──
export interface DailySnapshot {
  _id?: string;
  dealerLocation: string;
  dealerGroup: string | null;
  reportDate: string;
  lastApplicationDate: string | null;
  priorApplicationDate: string | null;
  daysSinceLastApplication: number | null;
  lastApprovalDate: string | null;
  daysSinceLastApproval: number | null;
  lastBookedDate: string | null;
  daysSinceLastBooking: number | null;
  activityStatus: ActivityStatus;
  latestCommunicationDatetime: string | null;
  reactivatedAfterVisit: boolean;
  daysFromVisitToNextApp: number | null;
  movingAvgDaysSinceApp?: number;
}

export type ActivityStatus =
  | 'active'
  | '30d_inactive'
  | '60d_inactive'
  | 'long_inactive'
  | 'never_active';

// ── Monthly Rollup Metrics ──
export interface RollupMetrics {
  daysActive: number;
  daysInactive30: number;
  daysInactive60: number;
  daysLongInactive: number;
  totalSnapshotDays: number;
  applicationDatesChanged: number;
  approvalDatesChanged: number;
  bookingDatesChanged: number;
  reactivationEvents: number;
  avgDaysSinceLastApp: number | null;
  minDaysSinceLastApp?: number | null;
  maxDaysSinceLastApp?: number | null;
  avgDaysSinceLastApproval: number | null;
  avgDaysSinceLastBooking: number | null;
}

export interface MonthlyRollup {
  dealerLocation: string;
  dealerGroup: string | null;
  year: number;
  month: number;
  metrics: RollupMetrics;
  targets: Record<string, unknown>;
}

// ── Overview Stats ──
export interface OverviewStats {
  latestReportDate: string;
  totalDealers: number;
  totalGroups: number;
  statusBreakdown: Array<{ status: ActivityStatus; count: number }>;
  reactivations: {
    thisMonth: number;
    lastMonth: number;
    change: number;
  };
  activeDealerAvg: {
    avgDaysSinceLastApp: number;
    activeDealerCount: number;
  } | null;
  period: { year: number; month: number };
}

// ── Trend Types ──
export type TrendPeriod = 'yoy' | 'mom' | '30d' | '60d';

export interface TrendResult {
  value: number | null;
  direction: 'up' | 'down' | 'flat' | null;
  label: string;
}

// ── API Response Wrappers ──
export interface ApiResponse<T> {
  success: boolean;
  [key: string]: T | boolean | string | number;
}

// ── Table Column Definition ──
export interface TableColumn {
  key: string;
  label: string;
  shortLabel?: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  minWidth?: string;
  sortable?: boolean;
  hasData: boolean; // false = stubbed for future
  groupOnly?: boolean; // only shown in group mode
  dealerOnly?: boolean; // only shown in dealer/all mode
  format?: (value: unknown) => string;
}

// ── Grouped data for the table ──
export interface DealerGroupRow {
  group: DealerGroup;
  locations: DealerLocation[];
  isExpanded: boolean;
}

// ── Rolling Window Types ──
export type RollingWindow = 7 | 30;

// ── Rolling Averages (Network-Level) ──

/** The 5 core rolling average metrics */
export interface RollingAvgMetrics {
  avgDaysSinceApp: number | null;
  avgDaysSinceApproval: number | null;
  avgDaysSinceBooking: number | null;
  avgContactDays: number | null;
  avgVisitResponse: number | null;
}

/** Churn flow velocity — daily averages of status transitions */
export interface StatusFlowData {
  avgGainedActive: number;   // avg dealers/day moving INTO active
  avgLostActive: number;     // avg dealers/day moving OUT of active
  avgReactivated: number;    // avg reactivations/day
  netDelta: number;          // gained - lost per day
}

/** Debug info: which report dates were used in the window */
export interface ReportDateRange {
  first: string;   // earliest date in window (ISO)
  last: string;    // latest date in window (ISO)
  count: number;   // number of distinct report dates used
}

/** Full response from GET /analytics/rolling-averages */
export interface NetworkRollingAvgResponse {
  current: RollingAvgMetrics;
  previous: RollingAvgMetrics;
  deltas: RollingAvgMetrics;        // current - previous (negative = improving for daysSince metrics)
  statusFlows: StatusFlowData;
  statusFlowDeltas: StatusFlowData | null;  // churn deltas vs previous window (null if insufficient data)
  reportDateRange: ReportDateRange;
  insufficientData: boolean;         // true when < 2 report dates exist
  windowSize: number;
}

// ── Rep Scorecard ──

/** Heat Index classification */
export type HeatClass = 'strong' | 'average' | 'overburdened' | 'underperforming';

/** Capacity flag for overburdened/underperforming distinction */
export type CapacityFlag = 'overburdened' | 'underperforming' | null;

/** Single rep row in the scorecard */
export interface RepScorecardEntry {
  rep: string;

  // Dealer counts (latest snapshot)
  totalDealers: number;
  activeCount: number;
  inactive30Count: number;
  inactive60Count: number;
  longInactiveCount: number;
  reactivatedCount: number;     // reactivations within the rolling window

  // Rolling averages (current window)
  rollingAvg: RollingAvgMetrics;

  // Period-over-period deltas
  deltas: RollingAvgMetrics;

  // Churn flow for this rep
  statusFlows: StatusFlowData;

  // Heat Index (Phase 4 — nullable until implemented)
  heatIndex: number | null;       // 0–100 composite score
  heatClass: HeatClass | null;    // green/amber/red classification
  capacityRatio: number | null;   // repDealerCount / avgDealersPerRep
  capacityFlag: CapacityFlag;     // overburdened / underperforming / null

  // Heat Index sub-score breakdown (for tooltip transparency)
  _heatBreakdown?: Record<string, {
    raw: number | null;
    normalized: number | null;
    weighted: number | null;
  }>;

  // Per-state rolling averages breakdown
  stateBreakdown?: StateBreakdown[];
}

/** Per-state performance data for a single rep */
export interface StateBreakdown {
  state: string;
  totalDealers: number;
  activeCount: number;
  inactive30Count: number;
  inactive60Count: number;
  longInactiveCount: number;
  reactivatedCount: number;
  rollingAvg: RollingAvgMetrics;
  statusFlows?: StatusFlowData;
}

/** Full response from GET /analytics/rep-scorecard */
export interface RepScorecardResponse {
  reps: RepScorecardEntry[];
  networkAvgDealersPerRep: number;
  reportDateRange: ReportDateRange;
  insufficientData: boolean;
  windowSize: number;
}
