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
  inactive90Count?: number;
  longInactiveCount: number;
  reactivatedCount: number;
  daysSinceApp: BestWorst;
  daysSinceApproval: BestWorst;
  daysSinceBooking: BestWorst;
  visitToApp: BestWorst;
  avgVisitToApp: number | null;
  latestComm: string | null;
  oldestComm: string | null;
  drd?: {
    minDaysSinceLastVisit: number | null;
    latestVisitDate: string | null;
    avgLift: number | null;
    maxLift: number | null;
    yieldPerVisit: number | null;
    totalVisits: number;
  } | null;
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
  stats?: DealerStats;
}

export interface MetricTrend {
  value: number;
  baseline: number;
  diff: number;
  pct: number;
}

export interface DealerStats {
  apps: number;
  approvals: number;
  inHouse: number;
  booked: number;
  bookedDollars: number;
  leadBooked?: number;
  leadBookedDollars?: number;
  closeBooked?: number;
  closeBookedDollars?: number;
  inMonthBooked?: number;
  inMonthBookedDollars?: number;
  outOfMonthBooked?: number;
  outOfMonthBookedDollars?: number;
  avgFico?: number | null;
  lookToBook: number;
  approvalToBook: number;
  trends?: {
    apps: MetricTrend;
    approvals: MetricTrend;
    inHouse: MetricTrend;
    booked: MetricTrend;
    bookedDollars: MetricTrend;
    leadBooked?: MetricTrend;
    leadBookedDollars?: MetricTrend;
    closeBooked?: MetricTrend;
    closeBookedDollars?: MetricTrend;
    lookToBook: MetricTrend;
    approvalToBook: MetricTrend;
  };
}

export interface DealerStatusBreakdown {
  active: number;
  inactive30d: number;
  inactive60d: number;
  inactive90d: number;
  longInactive: number;
}

export interface ApplicationHistoryItem {
  _id: string;
  applicationId: string;
  status: string | null;
  underwriter?: string | null;
  lender?: string | null;
  applicationDate: string | null;
  approvalDate?: string | null;
  bookedDate?: string | null;
  amountFinanced: number | null;
  term?: number | null;
  apr?: number | null;
  cashDown?: number | null;
  totalDown?: number | null;
  ltv?: number | null;
  dealerReserveAmount?: number | null;
  dealerReservePercent?: number | null;
  backend?: number | null;
  invoice?: number | null;
  dealerMinimumRate?: number | null;
  coficoAuto8?: number | null;
  primaryFicoAuto8: number | null;
  dti?: number | null;
  pti?: number | null;
  collateralYear?: string | null;
  collateralType?: string | null;
  collateralNewUsed?: string | null;
  dealerName?: string | null;
  dealerGroup?: string | null;
  dealerState?: string | null;
  dealerCity?: string | null;
  dealerRepresentative?: string | null;
  clientDealerId?: string | null;
  timeToBook?: number | null;
  timeToDecision?: number | null;
  timeToLastFund?: number | null;
  timeToLastDecisionToLastContract?: number | null;
  programManual?: string | null;
  programDefault?: string | null;
  primaryState?: string | null;
  applicationSubmittedUser?: string | null;
  isBusinessApp?: boolean | null;
  wasApproved?: boolean | null;
  wasApprovedNotBooked?: boolean | null;
  applicationClass?: string | null;
  daysAgo: number | null;
}

export interface DealerApplicationHistorySummary {
  allTime: { apps: number; approvals: number; booked: number; bookedDollars: number; leadBooked?: number; leadBookedDollars?: number; closeBooked?: number; closeBookedDollars?: number };
  ytd: { apps: number; approvals: number; booked: number; bookedDollars: number; leadBooked?: number; leadBookedDollars?: number; closeBooked?: number; closeBookedDollars?: number };
  mtd: { apps: number; approvals: number; booked: number; bookedDollars: number; leadBooked?: number; leadBookedDollars?: number; closeBooked?: number; closeBookedDollars?: number };
}

export interface DealerApplicationHistoryResponse {
  success: boolean;
  location: {
    _id: string;
    dealerName: string;
    dealerId: string;
    clientDealerId: string;
    statePrefix: string;
  } | null;
  summary: DealerApplicationHistorySummary;
  applications: ApplicationHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface DealerDRDMeta {
  segment: 'high_tlc' | 'self_sufficient' | 'comfort_stop' | 'lapsed' | 'insufficient_data';
  urgencyStatus?: string;
  isOverridden?: boolean;
  overriddenSegment?: string | null;
  reason?: string | null;
  overriddenBy?: {
    userId?: string | null;
    name?: string | null;
    email?: string | null;
  };
  lastVisitDate?: string | null;
  daysSinceLastVisit?: number | null;
  postVisitLiftPct?: number | null;
  yieldPerVisit?: number | null;
  totalVisits?: number;
}

// ── Dealer Location ──
export interface DealerLocation {
  _id: string;
  dealerId: string;
  dealerName: string;
  statePrefix: string;
  dealerRepresentative?: string | null;
  repName?: string | null;
  clientDealerId?: string | null;
  dealerGroup: string | null;
  createdAt: string;
  latestSnapshot: DailySnapshot | null;
  stats?: DealerStats;
  drd?: DealerDRDMeta | null;
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
  | '90d_inactive'
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
export type TrendPeriod = 'mom' | 'yoy' | '30d' | '60d' | 'prior' | 'none';

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
  description?: string;
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
/** Financial metrics from Application data */
export interface RepFinancials {
  totalApps: number;
  approvedCount: number;
  bookedCount: number;
  bookedVolume: number;
  leadBookedCount?: number;
  leadBookedVolume?: number;
  closeBookedCount?: number;
  closeBookedVolume?: number;
  avgFico?: number | null;
  avgDealSize: number | null;
  lookToBookPct: number | null;       // booked / totalApps * 100
  approvalToBookPct: number | null;   // booked / approvedCount * 100
  avgReserveAmt: number | null;
  avgReservePct: number | null;
  avgAPR: number | null;
  avgTimeToBookDays: number | null;   // converted from minutes
}

export interface UnderwriterStats {
  underwriter: string;
  totalApps: number;
  approvedCount: number;
  conditionalCount: number;
  declinedCount: number;
  bookedCount: number;
  bookedVolume: number;
  leadBookedCount?: number;
  leadBookedVolume?: number;
  closeBookedCount?: number;
  closeBookedVolume?: number;
  approvalRate: number;
  winRate: number; // Approval to Book
  declineRate: number;
  conditionalPct: number;
  sourceOnePct: number;
  uniqueLenderCount?: number;
  uniqueLenders?: string[];
  lenderBreakdown?: Array<{ lender: string; count: number; pct: number }>;
  avgTurnTimeMinutes: number | null;
  avgTurnTimeHours: number | null;
  avgFico: number | null;
}

export type FinPeriod = 'mtd' | '30d' | '90d' | 'ytd' | 'all';

export interface RepScorecardEntry {
  rep: string;

  // Dealer counts (latest snapshot)
  totalDealers: number;
  activeCount: number;
  inactive30Count: number;
  inactive60Count: number;
  inactive90Count?: number;
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

  // Financial metrics (Application data)
  financials: RepFinancials;

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
  inactive90Count?: number;
  longInactiveCount: number;
  reactivatedCount: number;
  rollingAvg: RollingAvgMetrics;
  statusFlows?: StatusFlowData;
  financials?: RepFinancials;
}

/** Full response from GET /analytics/rep-scorecard */
export interface RepScorecardResponse {
  reps: RepScorecardEntry[];
  networkAvgDealersPerRep: number;
  finPeriod: FinPeriod;
  reportDateRange: ReportDateRange;
  insufficientData: boolean;
  windowSize: number;
}

export interface ExecutiveSummaryResponse {
  success: boolean;
  dateRange: {
    startStr: string;
    endStr: string;
    label: string;
  };
  comparisonLabel: string | null;
  totals: DealerStats;
  trends: {
    apps: MetricTrend;
    approvals: MetricTrend;
    booked: MetricTrend;
    bookedDollars: MetricTrend;
    leadBooked?: MetricTrend;
    leadBookedDollars?: MetricTrend;
    closeBooked?: MetricTrend;
    closeBookedDollars?: MetricTrend;
    lookToBook: MetricTrend;
    approvalToBook: MetricTrend;
  };
  budget: {
    annual2026Budget: number;
    targetBookedDollars: number;
    actualBookedDollars: number;
    varianceDollars: number;
    percentAchieved: number;
    isOverBudget: boolean;
  };
  pacing: {
    mtdActualBookedDollars: number;
    mtdPace: number;
    daysElapsedCurrentMonth: number;
    daysInCurrentMonth: number;
    ytdActualBookedDollars: number;
    fullYearPace: number;
    annualBudget: number;
    ytdTargetBudget: number;
  };
}

export interface HistoricalMoMItem {
  key: string;
  label: string;
  year: number;
  monthIndex: number;
  stats: DealerStats;
  cohorts: {
    active: number;
    inactive30: number;
    inactive60: number;
    inactive90: number;
    longInactive: number;
    total: number;
    activePct: number;
  };
  budgetTarget: number;
  trends: {
    apps: MetricTrend;
    approvals: MetricTrend;
    booked: MetricTrend;
    bookedDollars: MetricTrend;
    leadBooked?: MetricTrend;
    leadBookedDollars?: MetricTrend;
    closeBooked?: MetricTrend;
    closeBookedDollars?: MetricTrend;
    lookToBook: MetricTrend;
    approvalToBook: MetricTrend;
  };
}

export interface HistoricalMoMResponse {
  success: boolean;
  trendMode: 'mom' | 'yoy';
  count: number;
  months: HistoricalMoMItem[];
}

export type DatePreset = 'this_month' | 'last_month' | 'last_30' | 'last_60' | 'last_90' | 'ytd' | 'last_year' | 'all_time' | 'custom';
export type TabId = 'groups' | 'dealers' | 'all';

