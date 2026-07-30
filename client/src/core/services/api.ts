/**
 * API service layer for Source One analytics endpoints.
 * All methods return typed responses matching server shapes.
 */

import axios from 'axios';
import type {
  DealerGroup,
  DealerLocation,
  DailySnapshot,
  MonthlyRollup,
  OverviewStats,
} from '../../features/dashboard/types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Auth interceptors ──
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sourceone_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid — clear and redirect to login
      localStorage.removeItem('sourceone_token');
      localStorage.removeItem('sourceone_user');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/invite') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ── Overview ──
export async function getOverview(year?: number, month?: number): Promise<OverviewStats> {
  const params: Record<string, number> = {};
  if (year) params.year = year;
  if (month) params.month = month;
  const { data } = await api.get('/analytics/overview', { params });
  return data.overview;
}

// ── Dealer Groups ──
export async function getGroups(
  states?: string[],
  activityMode?: string,
  startDate?: string,
  endDate?: string,
  trend?: string,
  status?: string | null,
  rep?: string
): Promise<DealerGroup[]> {
  const params: Record<string, string> = {};
  if (states && states.length > 0) params.states = states.join(',');
  if (activityMode && activityMode !== 'application') params.activityMode = activityMode;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (trend) params.trend = trend;
  if (status) params.status = status;
  if (rep) params.rep = rep;
  const { data } = await api.get('/analytics/groups', { params });
  return data.groups;
}

// ── Group Locations ──
export async function getGroupLocations(
  slug: string,
  startDate?: string,
  endDate?: string,
  trend?: string
): Promise<{
  group: { name: string; slug: string; dealerCount: number };
  locations: DealerLocation[];
}> {
  const params: Record<string, string> = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (trend) params.trend = trend;
  const { data } = await api.get(`/analytics/groups/${slug}/locations`, { params });
  return { group: data.group, locations: data.locations };
}

// ── Group Monthly Rollup ──
export async function getGroupMonthly(
  slug: string,
  year?: number
): Promise<{
  group: { name: string; slug: string; dealerCount: number };
  months: Array<{
    month: number;
    year: number;
    locationCount: number;
    metrics: MonthlyRollup['metrics'];
  }>;
}> {
  const params: Record<string, number> = {};
  if (year) params.year = year;
  const { data } = await api.get(`/analytics/groups/${slug}/monthly`, { params });
  return { group: data.group, months: data.months };
}

// ── Independent Dealers (no group) — server-side sort + pagination ──
export interface SmallDealerParams {
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  status?: string | null;
  scope?: 'ungrouped' | 'all';
  states?: string[];
  rep?: string;
  activityMode?: 'application' | 'approval' | 'booking';
  search?: string;
  transition?: string;  // e.g. "active→30d_inactive"
  startDate?: string;
  endDate?: string;
  trend?: string;
}

export interface DealerStatusBreakdown {
  total: number;
  active: number;
  inactive30: number;
  inactive60: number;
  inactive90?: number;
  inactive30d?: number;
  inactive60d?: number;
  inactive90d?: number;
  longInactive: number;
}

export interface PaginatedDealers {
  dealers: DealerLocation[];
  statusBreakdown: DealerStatusBreakdown | null;
  statusTransitions: { from: string; to: string; count: number }[];
  comparisonLabel?: string;
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export async function getSmallDealers(params: SmallDealerParams = {}): Promise<PaginatedDealers> {
  const queryParams: Record<string, string | number> = {
    sort: params.sort || 'apps',
    dir: params.dir || 'desc',
    page: params.page || 1,
    limit: params.limit || 50,
  };
  if (params.status) queryParams.status = params.status;
  if (params.scope) queryParams.scope = params.scope;
  if (params.states && params.states.length > 0) queryParams.states = params.states.join(',');
  if (params.rep) queryParams.rep = params.rep;
  if (params.activityMode && params.activityMode !== 'application') queryParams.activityMode = params.activityMode;
  if (params.search) queryParams.search = params.search;
  if (params.transition) queryParams.transition = params.transition;
  if (params.startDate) queryParams.startDate = params.startDate;
  if (params.endDate) queryParams.endDate = params.endDate;
  if (params.trend) queryParams.trend = params.trend;
  const { data } = await api.get('/analytics/dealers/small', { params: queryParams });
  return { dealers: data.dealers, statusBreakdown: data.statusBreakdown || null, statusTransitions: data.statusTransitions || [], pagination: data.pagination };
}

// ── Single Dealer Trend ──
export async function getDealerTrend(
  dealerId: string,
  options?: { start?: string; end?: string; movingAvg?: 30 | 60 | 90 }
): Promise<{
  dealerId: string;
  dealerName: string;
  snapshots: DailySnapshot[];
}> {
  const params: Record<string, string | number> = {};
  if (options?.start) params.start = options.start;
  if (options?.end) params.end = options.end;
  if (options?.movingAvg) params.movingAvg = options.movingAvg;
  const { data } = await api.get(`/analytics/dealers/${dealerId}/trend`, { params });
  return { dealerId: data.dealerId, dealerName: data.dealerName, snapshots: data.snapshots };
}

// ── Single Dealer Monthly ──
export async function getDealerMonthly(
  dealerId: string,
  year?: number
): Promise<{
  dealerId: string;
  dealerName: string;
  rollups: MonthlyRollup[];
}> {
  const params: Record<string, number> = {};
  if (year) params.year = year;
  const { data } = await api.get(`/analytics/dealers/${dealerId}/monthly`, { params });
  return { dealerId: data.dealerId, dealerName: data.dealerName, rollups: data.rollups };
}

// ── State → Rep Map ──
export type StateRepMap = Record<string, string>;

export async function getStateRepMap(year?: number): Promise<StateRepMap> {
  const params: Record<string, number> = {};
  if (year) params.year = year;
  const { data } = await api.get('/analytics/budget/state-rep-map', { params });
  return data.stateRepMap;
}

// ── Rep → States/Groups Mappings (from actual DealerLocation data) ──
export interface RepMappings {
  repStates: Record<string, string[]>;
  repGroups: Record<string, { name: string; slug: string }[]>;
  allReps: string[];
  allStates: string[];
  allGroups: { name: string; slug: string }[];
}

export async function getRepMappings(): Promise<RepMappings> {
  const { data } = await api.get('/analytics/rep-mappings');
  return {
    repStates: data.repStates,
    repGroups: data.repGroups,
    allReps: data.allReps,
    allStates: data.allStates,
    allGroups: data.allGroups,
  };
}

// ── Budget by State ──
export interface StateBudget {
  state: string;
  rep: string;
  growthTarget: number | null;
  marketShare: number | null;
  annualTotal: number;
}

export async function getBudgetByState(year?: number): Promise<StateBudget[]> {
  const params: Record<string, number> = {};
  if (year) params.year = year;
  const { data } = await api.get('/analytics/budget/by-state', { params });
  return data.states;
}

// ── Rolling Averages ──
import type {
  NetworkRollingAvgResponse,
  RepScorecardResponse,
  RollingWindow,
} from '../../features/dashboard/types';

export async function getRollingAverages(
  windowSize: RollingWindow = 7,
  states?: string[],
  statusFilter?: string[],
  activityMode?: string
): Promise<NetworkRollingAvgResponse> {
  const params: Record<string, string | number> = { window: windowSize };
  if (states && states.length > 0) params.states = states.join(',');
  if (statusFilter && statusFilter.length > 0) params.status = statusFilter.join(',');
  if (activityMode && activityMode !== 'application') params.mode = activityMode;
  const { data } = await api.get('/analytics/rolling-averages', { params });
  return data;
}

export async function getRepScorecard(
  windowSize: RollingWindow = 7,
  statusFilter?: string[],
  activityMode?: string,
  finPeriod?: string
): Promise<RepScorecardResponse> {
  const params: Record<string, string | number> = { window: windowSize };
  if (statusFilter && statusFilter.length > 0) params.status = statusFilter.join(',');
  if (activityMode && activityMode !== 'application') params.mode = activityMode;
  if (finPeriod && finPeriod !== 'mtd') params.finPeriod = finPeriod;
  const { data } = await api.get('/analytics/rep-scorecard', { params });
  return data;
}

import type {
  DealerApplicationHistoryResponse,
  ExecutiveSummaryResponse,
  HistoricalMoMResponse
} from '../../features/dashboard/types';

export async function getDealerApplicationsHistory(
  dealerId: string,
  page: number = 1,
  limit: number = 20,
  state?: string,
  rep?: string,
  group?: string
): Promise<DealerApplicationHistoryResponse> {
  const { data } = await api.get(`/analytics/dealers/${dealerId}/applications`, {
    params: { page, limit, state, rep, group }
  });
  return data;
}

export async function getExecutiveSummary(
  startDate?: string,
  endDate?: string,
  trend?: string,
  state?: string,
  rep?: string,
  groupSlug?: string,
  status?: string | null
): Promise<ExecutiveSummaryResponse> {
  const params: Record<string, string> = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (trend) params.trend = trend;
  if (state) params.state = state;
  if (rep) params.rep = rep;
  if (groupSlug) params.groupSlug = groupSlug;
  if (status) params.status = status;
  const { data } = await api.get('/analytics/executive-summary', { params });
  return data;
}

export async function getHistoricalMoM(
  trend: 'mom' | 'yoy' = 'mom',
  state?: string,
  rep?: string,
  groupSlug?: string,
  dealerId?: string
): Promise<HistoricalMoMResponse> {
  const params: Record<string, string> = { trend };
  if (state) params.state = state;
  if (rep) params.rep = rep;
  if (groupSlug) params.groupSlug = groupSlug;
  if (dealerId) params.dealerId = dealerId;
  const { data } = await api.get('/analytics/historical/mom', { params });
  return data;
}

export async function searchDealers(query: string, limit: number = 50): Promise<{ success: boolean; dealers: Array<{ _id: string; dealerName: string; dealerId: string; clientDealerId: string; statePrefix: string }> }> {
  const { data } = await api.get('/analytics/dealers/search', { params: { q: query, limit } });
  return data;
}

// ── Communication & Visit Impact ──
export type DealerOutcome = 'reactivated' | 'no_response' | 'maintenance';

export interface RepDealerBreakdown {
  clientDealerId: string;
  dealerName: string;
  state: string | null;
  groupName: string | null;
  statusAtVisit: string;
  outcome: DealerOutcome;
  firstContactDate: string;
  daysToReactivation: number | null;
  reactivatedVolume: number;
  visitCount: number;
  callCount: number;
  touchpoints: number;
}

export interface RepMatrix {
  targeted: number;
  neglected: number;
  maintained: number;
  selfSufficient: number;
}

export interface VisitImpactResponse {
  success: boolean;
  windowDays: number;
  touchpointMode: 'visits' | 'all';
  inactiveThresholdDays: number;
  dateRangeLabel?: string;
  maxReportDate?: string;
  overall: {
    totalVisits: number;
    totalCalls: number;
    inactiveDealersVisited: number;
    reactivatedCount: number;
    reactivationRate: number | null;
    avgDaysToReactivation: number | null;
    reactivatedVolume: number;
    activeDealersVisited: number;
    growthVisitPct: number | null;
  };
  reps: Array<{
    rep: string;
    visits: number;
    calls: number;
    inactiveDealersVisited: number;
    reactivatedCount: number;
    reactivationRate: number | null;
    avgDaysToReactivation: number | null;
    reactivatedVolume: number;
    activeDealersVisited: number;
    growthVisitPct: number | null;
    hasEnoughData: boolean;
    matrix: RepMatrix;
    dealers?: RepDealerBreakdown[];
  }>;
  insufficientData: boolean;
}

export interface EffortVsYieldResponse {
  success: boolean;
  windowDays: number;
  timeSinks: Array<{
    dealerId: string;
    clientDealerId: string;
    dealerName: string;
    state: string;
    rep: string;
    touchpoints: number;
    bookedVolume: number;
    flagType: 'time_sink';
    reason: string;
  }>;
  atRiskGems: Array<{
    dealerId: string;
    clientDealerId: string;
    dealerName: string;
    state: string;
    rep: string;
    touchpoints: number;
    bookedVolume: number;
    flagType: 'at_risk_gem';
    reason: string;
  }>;
  summary: {
    timeSinkCount: number;
    atRiskGemCount: number;
  };
}

export async function getVisitImpact(
  windowDays: number = 30,
  mode: 'visits' | 'all' = 'visits',
  rep?: string,
  timeframe: 'ytd' | '30d' | '60d' = 'ytd'
): Promise<VisitImpactResponse> {
  const params: Record<string, string | number> = { window: windowDays, mode, timeframe };
  if (rep) params.rep = rep;
  const { data } = await api.get('/analytics/communication/impact', { params });
  return data;
}

export async function getEffortVsYieldFlags(windowDays: number = 30): Promise<EffortVsYieldResponse> {
  const { data } = await api.get('/analytics/communication/effort-yield', { params: { window: windowDays } });
  return data;
}

export interface RepCommunicationHistoryResponse {
  success: boolean;
  items: Array<{
    id: string;
    sourceCommunicationId: string;
    date: string;
    daysAgo?: number | null;
    repName: string;
    userEmail: string | null;
    dealerName: string;
    clientDealerId: string;
    state: string | null;
    groupName: string | null;
    groupSlug: string | null;
    type: string;
    result: string | null;
    notes: string | null;
    feedback: string | null;
    sourceSystem: string | null;
    timezone: string | null;
    isProspect: boolean | null;
    isActiveRelationship: boolean | null;
    isInactiveRelationship: boolean | null;
    lastIngestionDate: string | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export async function getRepCommunicationHistory(params: {
  rep?: string;
  state?: string;
  groupSlug?: string;
  dealerId?: string;
  type?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<RepCommunicationHistoryResponse> {
  const { data } = await api.get('/analytics/communication/history', { params });
  return data;
}

export interface Dealer360Response {
  success: boolean;
  location: {
    _id: string;
    dealerName: string;
    clientDealerId: string;
    dealerId: string;
    statePrefix: string;
    repName: string;
    groupName: string | null;
    groupSlug: string | null;
  };
  status: string;
  recencies: {
    daysSinceApp: number | null;
    daysSinceApproval: number | null;
    daysSinceBooking: number | null;
    daysSinceVisit: number | null;
    daysVisitToNextApp: number | null;
  };
  stats: {
    totalApps: number;
    totalApproved: number;
    totalBooked: number;
    totalBookedDollars: number;
    lookToBookPct: number;
    approvalToBookPct: number;
  };
  sparkline: Array<{
    month: string;
    apps: number;
    bookedDollars: number;
  }>;
}

export async function getDealer360(dealerId: string): Promise<Dealer360Response> {
  const { data } = await api.get(`/analytics/dealer-360/${encodeURIComponent(dealerId)}`);
  return data;
}

export interface TimelineEvent {
  id: string;
  eventType: 'touchpoint' | 'application';
  date: string;
  timestamp: number;
  // Touchpoint fields
  repName?: string;
  touchpointType?: 'visit' | 'call' | 'other';
  typeLabel?: string;
  notes?: string | null;
  // Application fields
  applicationId?: string;
  status?: string;
  amountFinanced?: number;
  fico?: number | string | null;
  lender?: string;
  attribution?: {
    repName: string;
    daysAfterVisit: number;
    visitDate: string;
  } | null;
}

export interface Dealer360TimelineResponse {
  success: boolean;
  timeline: TimelineEvent[];
  totalVisits: number;
  totalApps: number;
}

export async function getDealer360Timeline(dealerId: string): Promise<Dealer360TimelineResponse> {
  const { data } = await api.get(`/analytics/dealer-360/${encodeURIComponent(dealerId)}/timeline`);
  return data;
}

export default api;
