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
  daysSinceApp: BestWorst;
  daysSinceApproval: BestWorst;
  daysSinceBooking: BestWorst;
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
  format?: (value: unknown) => string;
}

// ── Grouped data for the table ──
export interface DealerGroupRow {
  group: DealerGroup;
  locations: DealerLocation[];
  isExpanded: boolean;
}
