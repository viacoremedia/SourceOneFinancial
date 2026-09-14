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

function resolveBaseURL(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // Route dev client previews directly to the dev server
    if (host.includes('source-one-client-dev') || host.includes('client-dev')) {
      return 'https://source-one-server-dev.vercel.app';
    }
    // Route production client domains to the production server if VITE_API_URL not specified
    if (host.includes('source-one-data-transfer') || host.includes('sourceone-client')) {
      return 'https://source-one-data-transfer.vercel.app';
    }
  }
  return import.meta.env.VITE_API_URL || '';
}

const api = axios.create({
  baseURL: resolveBaseURL(),
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
      const publicPaths = ['/login', '/invite', '/forgot-password', '/reset-password'];
      if (!publicPaths.includes(window.location.pathname)) {
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
  rep?: string,
  drd?: string | null,
  signal?: AbortSignal,
  businessType?: string,
  tags?: string[],
  excludeTags?: string[]
): Promise<DealerGroup[]> {
  const params: Record<string, string> = {};
  if (states && states.length > 0) params.states = states.join(',');
  if (activityMode && activityMode !== 'application') params.activityMode = activityMode;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (trend) params.trend = trend;
  if (status) params.status = status;
  if (rep) params.rep = rep;
  if (drd) params.drd = drd;
  if (businessType) params.businessType = businessType;
  if (tags && tags.length > 0) params.tags = tags.join(',');
  if (excludeTags && excludeTags.length > 0) params.excludeTags = excludeTags.join(',');
  const { data } = await api.get('/analytics/groups', { params, signal });
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
  drd?: string | null;
  businessType?: string;
  tags?: string[];
  excludeTags?: string[];
  signal?: AbortSignal;
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
  neverActive?: number;
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
  if (params.drd) queryParams.drd = params.drd;
  if (params.businessType) queryParams.businessType = params.businessType;
  if (params.tags && params.tags.length > 0) queryParams.tags = params.tags.join(',');
  if (params.excludeTags && params.excludeTags.length > 0) queryParams.excludeTags = params.excludeTags.join(',');
  const { data } = await api.get('/analytics/dealers/small', { params: queryParams, signal: params.signal });
  return {
    dealers: data.dealers,
    statusBreakdown: data.statusBreakdown || null,
    statusTransitions: data.statusTransitions || [],
    comparisonLabel: data.comparisonLabel,
    pagination: data.pagination,
  };
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
  HistoricalMoMResponse,
  ApplicationHistoryItem
} from '../../features/dashboard/types';

export async function getDealerApplicationsHistory(
  dealerId: string,
  page: number = 1,
  limit: number = 20,
  state?: string,
  rep?: string,
  group?: string,
  underwriter?: string,
  startDate?: string,
  endDate?: string,
  tags?: string[],
  excludeTags?: string[],
  search?: string
): Promise<DealerApplicationHistoryResponse> {
  const params: Record<string, any> = { page, limit };
  if (state) params.state = state;
  if (rep) params.rep = rep;
  if (group) params.group = group;
  if (underwriter) params.underwriter = underwriter;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (tags && tags.length > 0) params.tags = tags.join(',');
  if (excludeTags && excludeTags.length > 0) params.excludeTags = excludeTags.join(',');
  if (search && search.trim()) params.search = search.trim();

  const { data } = await api.get(`/analytics/dealers/${encodeURIComponent(dealerId)}/applications`, {
    params
  });
  return data;
}

export async function getUserPreferences(): Promise<{ success: boolean; preferences: any }> {
  const { data } = await api.get('/auth/me/preferences');
  return data;
}

export async function updateUserPreferences(preferences: any): Promise<{ success: boolean; preferences: any }> {
  const { data } = await api.patch('/auth/me/preferences', preferences);
  return data;
}

export async function getExecutiveSummary(
  startDate?: string,
  endDate?: string,
  trend?: string,
  state?: string,
  rep?: string,
  groupSlug?: string,
  status?: string | null,
  drd?: string | null,
  businessType?: string | null,
  tags?: string[] | null,
  scope?: string | null,
  excludeTags?: string[] | null
): Promise<ExecutiveSummaryResponse> {
  const params: Record<string, string> = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (trend) params.trend = trend;
  if (state) params.state = state;
  if (rep) params.rep = rep;
  if (groupSlug) params.groupSlug = groupSlug;
  if (status) params.status = status;
  if (drd) params.drd = drd;
  if (businessType) params.businessType = businessType;
  if (tags && tags.length > 0) params.tags = tags.join(',');
  if (excludeTags && excludeTags.length > 0) params.excludeTags = excludeTags.join(',');
  if (scope) params.scope = scope;
  const { data } = await api.get('/analytics/executive-summary', { params });
  return data;
}

export async function getHistoricalMoM(
  trend: 'mom' | 'yoy' = 'mom',
  state?: string,
  rep?: string,
  groupSlug?: string,
  dealerId?: string,
  businessType?: string,
  tags?: string[],
  excludeTags?: string[]
): Promise<HistoricalMoMResponse> {
  const params: Record<string, string> = { trend };
  if (state) params.state = state;
  if (rep) params.rep = rep;
  if (groupSlug) params.groupSlug = groupSlug;
  if (dealerId) params.dealerId = dealerId;
  if (businessType) params.businessType = businessType;
  if (tags && tags.length > 0) params.tags = tags.join(',');
  if (excludeTags && excludeTags.length > 0) params.excludeTags = excludeTags.join(',');
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
    businessType?: 'franchise' | 'non-franchise' | 'broker' | null;
    tags?: string[];
    industry?: 'rv' | 'marine' | 'both' | null;
    systemStatus?: string;
    systemStatusReason?: string | null;
    isFundingParent?: boolean;
    fundingParent?: {
      _id: string;
      dealerName: string;
      dealerId: string;
      clientDealerId: string;
      statePrefix?: string;
    } | null;
    fundingChildren?: Array<{
      _id: string;
      dealerName: string;
      dealerId: string;
      clientDealerId: string;
      statePrefix?: string;
    }>;
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

export async function getUnderwriterScorecardApi(startDate?: string, endDate?: string) {
  const params: Record<string, string> = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  const { data } = await api.get('/analytics/underwriters', { params });
  return data;
}

// ── Relationship Demand & DRD Engine (v6.2 Final) ──
export type RelationshipDemandSegment = 'high_tlc' | 'self_sufficient' | 'comfort_stop' | 'lapsed' | 'insufficient_data';
export type UrgencyStatus = 'overdue' | 'due_soon' | 'on_track' | 'dormant' | 'self_sufficient' | 'not_monitored';

export interface InteractionCycleItem {
  cycleNumber: number;
  startDate: string;
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
  summaryText: string;
}

export interface DealerProfileItem {
  _id: string;
  dealerLocation: string;
  clientDealerId: string;
  dealerName: string;
  statePrefix?: string | null;
  assignedRep?: string | null;
  systemStatus?: 'active' | 'closed' | 'bought_out' | 'no_longer_in_service';
  systemStatusReason?: string | null;
  businessType?: 'franchise' | 'non-franchise' | 'broker' | null;
  tags?: string[];
  industry?: 'rv' | 'marine' | 'both' | null;
  isFundingParent?: boolean;
  fundingParent?: {
    _id: string;
    dealerName: string;
    dealerId: string;
    clientDealerId: string;
    statePrefix?: string;
  } | null;
  fundingChildren?: Array<{
    _id: string;
    dealerName: string;
    dealerId: string;
    clientDealerId: string;
    statePrefix?: string;
  }>;
  dealerGroup?: {
    _id: string;
    name: string;
    slug: string;
    isCustom?: boolean;
  } | null;
  contacts?: Array<{
    name: string;
    title: string;
    phone: string;
    email: string;
    isPrimary?: boolean;
  }>;
  badgerData?: {
    badgerId?: number | null;
    accountName?: string | null;
    matchedCode?: string | null;
    matchMethod?: string | null;
    accountOwner?: string | null;
    notes?: string | null;
    lastCheckinDate?: string | null;
    daysSinceLastCheckin?: number | null;
    lastSyncedAt?: string | null;
  } | null;
  isExcludedByRep?: boolean;
  dealerPhoneNumber?: string | null;
  dealerAddress?: string | null;
  dealerCity?: string | null;
  dealerState?: string | null;
  dealerPostalCode?: string | null;
  relationshipDemand: RelationshipDemandSegment;
  patternType?: string;
  confidenceScore: number;
  recommendedCadenceDays?: number | null;
  flags?: {
    isFadingTlc: boolean;
    isEmergingTlc: boolean;
    isCatalyticActivation: boolean;
    isStrategicTlc?: boolean;
    isUnderwritingFriction?: boolean;
    isDormant?: boolean;
  };
  pipelineStats?: {
    totalApplications: number;
    totalApproved: number;
    totalBookings: number;
    totalDeclined: number;
    approvalRatePct: number;
    lookToBookPct: number;
    approvalToBookPct: number;
    topUnderwriter?: string | null;
    topLender?: string | null;
  };
  daysSinceLastVisit?: number | null;
  lastVisitDate?: string | null;
  daysSinceLastTouch?: number | null;
  lastTouchDate?: string | null;
  lastTouchType?: string | null;
  urgencyStatus: UrgencyStatus;
  postVisitBookedLiftPct?: number | null;
  organicBookedRatio?: number;
  lifetimeYieldPerVisit?: number;
  verifiedCycleCount?: number;
  lifetimeStats: {
    totalVisits: number;
    totalCalls: number;
    totalEmails: number;
    totalTouchpoints: number;
    totalApplications: number;
    totalBookings: number;
    totalBookedVolume: number;
  };
  decisionRationale?: string[];
  interactionCycles?: InteractionCycleItem[];
  manualOverride?: {
    isOverridden: boolean;
    originalSegment?: string | null;
    overriddenSegment?: string | null;
    reason?: string | null;
    overriddenBy?: {
      userId?: string | null;
      name?: string | null;
      email?: string | null;
    };
    overriddenAt?: string | null;
    history?: Array<{
      action: 'override' | 'reset';
      previousSegment?: string | null;
      newSegment?: string | null;
      reason?: string | null;
      changedBy?: {
        userId?: string | null;
        name?: string | null;
        email?: string | null;
      };
      changedAt: string;
    }>;
  };
  timelineMonthly?: Array<{
    monthKey: string;
    bookedVolume: number;
    bookedCount: number;
    appCount: number;
    visitCount: number;
    callCount: number;
  }>;
  lastCalculatedAt: string;
}

export interface RelationshipDemandSummaryResponse {
  success: boolean;
  totalDealers: number;
  segments: Record<RelationshipDemandSegment, {
    count: number;
    pct: number;
    bookedVolume: number;
    totalVisits: number;
    totalBookings: number;
  }>;
  urgency: {
    overdue: number;
    due_soon: number;
    on_track: number;
    self_sufficient: number;
    not_monitored: number;
  };
  lastCalculatedAt: string | null;
}

export interface RelationshipDemandDealersResponse {
  success: boolean;
  dealers: DealerProfileItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface RelationshipDemandDrawerResponse {
  success: boolean;
  profile: DealerProfileItem;
  recentCommunications: Array<{
    _id: string;
    date: string;
    channel: 'visit' | 'call' | 'email' | 'text' | 'other';
    repName: string;
    result: string;
    feedback: string;
  }>;
  recentApplications: ApplicationHistoryItem[];
}

export type RelationshipDemandTimelineResponse = RelationshipDemandDrawerResponse;

export interface RepAllocationDiagnosticResponse {
  success: boolean;
  repAllocations: Array<{
    rep: string;
    totalDealers: number;
    highTlcCount: number;
    selfSuffCount: number;
    comfortStopCount: number;
    insufficientCount: number;
    overdueCount: number;
    dueSoonCount: number;
    onTrackCount: number;
    totalVisits: number;
    highTlcVisits: number;
    selfSuffVisits: number;
    comfortStopVisits: number;
    totalBookedVolume: number;
    highTlcVisitPct: number;
    selfSuffVisitPct: number;
    comfortStopVisitPct: number;
    misallocatedWarning: boolean;
  }>;
}

export async function getRelationshipDemandSummary(params?: { rep?: string; state?: string }): Promise<RelationshipDemandSummaryResponse> {
  const { data } = await api.get('/analytics/relationship-demand/summary', { params });
  return data;
}

export async function getRelationshipDemandDealers(params?: {
  demand?: string;
  urgency?: string;
  rep?: string;
  state?: string;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}): Promise<RelationshipDemandDealersResponse> {
  const { data } = await api.get('/analytics/relationship-demand/dealers', { params });
  return data;
}

export async function getDealerRelationshipDrawer(clientDealerId: string): Promise<RelationshipDemandDrawerResponse> {
  const { data } = await api.get(`/analytics/relationship-demand/dealers/${encodeURIComponent(clientDealerId)}/drawer`);
  return data;
}

export const getDealerRelationshipTimeline = getDealerRelationshipDrawer;

export async function getRepAllocationDiagnostics(): Promise<RepAllocationDiagnosticResponse> {
  const { data } = await api.get('/analytics/relationship-demand/rep-allocation');
  return data;
}

export async function overrideDealerRelationshipSegment(
  clientDealerId: string,
  overriddenSegment: 'high_tlc' | 'self_sufficient' | 'comfort_stop' | 'lapsed' | 'insufficient_data',
  reason: string
): Promise<{ success: boolean; profile: any; message?: string }> {
  const { data } = await api.post(`/analytics/relationship-demand/dealers/${encodeURIComponent(clientDealerId)}/override`, {
    segment: overriddenSegment,
    overriddenSegment,
    reason,
  });
  return data;
}

export async function resetDealerRelationshipOverride(
  clientDealerId: string,
  reason?: string
): Promise<{ success: boolean; profile: any; message?: string }> {
  const { data } = await api.post(`/analytics/relationship-demand/dealers/${encodeURIComponent(clientDealerId)}/reset-override`, {
    reason,
  });
  return data;
}

export async function triggerRecalculateDemandProfiles(): Promise<{ success: boolean; totalDealers: number; durationMs: number }> {
  const { data } = await api.post('/analytics/relationship-demand/recalculate');
  return data;
}

// ══════════════════════════════════════════════════
// PDF SCORECARD REPORTING & VIEWER APIS
// ══════════════════════════════════════════════════

export interface ScorecardReportFile {
  _id: string;
  label: string;
  filename: string;
  repName: string | null;
  type: 'company' | 'rep';
  fileSizeBytes: number;
  pageCount: number;
}

export interface ScorecardReportItem {
  _id: string;
  name: string;
  config: {
    scorecard: {
      windowSize: number;
      statusFilter: string[] | null;
      activityMode: string;
      finPeriod: string;
    };
    visitImpact: {
      reactivationWindow: number;
      touchpointMode: string;
      timeframe: string;
    };
    drd: {
      includeTlcList: boolean;
    };
  };
  repCount: number;
  status: 'generating' | 'ready' | 'failed';
  error: string | null;
  files: ScorecardReportFile[];
  summaryStats: {
    totalDealers: number;
    totalBookedVolume: number;
    totalBookedCount: number;
    totalVisits: number;
    totalReactivated: number;
    avgHeatIndex: number;
  };
  generatedAt: string;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScorecardReportsListResponse {
  success: boolean;
  reports: ScorecardReportItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GenerateScorecardReportPayload {
  name?: string;
  scorecard: {
    windowSize: number;
    statusFilter?: string[] | null;
    activityMode: 'application' | 'approval' | 'booking';
    finPeriod: 'mtd' | '30d' | '90d' | 'ytd' | 'all' | 'custom';
    customStartDate?: string;
    customEndDate?: string;
    weights?: Record<string, number>;
    thresholds?: Record<string, number>;
  };
  visitImpact: {
    reactivationWindow: number;
    touchpointMode: 'visits' | 'all';
    timeframe: 'ytd' | '30d' | '60d' | 'custom';
    customStartDate?: string;
    customEndDate?: string;
  };
  drd: {
    includeTlcList: boolean;
  };
}

export async function generateScorecardReport(payload: GenerateScorecardReportPayload): Promise<{ success: boolean; reportId: string; status: string; message: string }> {
  const { data } = await api.post('/analytics/pdf-scorecard/generate', payload, { timeout: 120000 });
  return data;
}

export async function getScorecardReports(page: number = 1, limit: number = 10): Promise<ScorecardReportsListResponse> {
  const { data } = await api.get('/analytics/pdf-scorecard/reports', { params: { page, limit } });
  return data;
}

export async function getScorecardReport(id: string): Promise<{ success: boolean; report: ScorecardReportItem }> {
  const { data } = await api.get(`/analytics/pdf-scorecard/reports/${id}`);
  return data;
}

export async function deleteScorecardReport(id: string): Promise<{ success: boolean; message: string }> {
  const { data } = await api.delete(`/analytics/pdf-scorecard/reports/${id}`);
  return data;
}

export function getScorecardPdfUrl(reportId: string, filename: string): string {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem('sourceone_token');
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${baseUrl}/analytics/pdf-scorecard/reports/${reportId}/files/${encodeURIComponent(filename)}${tokenParam}`;
}

export function getScorecardZipUrl(reportId: string): string {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem('sourceone_token');
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${baseUrl}/analytics/pdf-scorecard/reports/${reportId}/download${tokenParam}`;
}

// ══════════════════════════════════════════════════
// BADGER MAPS & DEALER LIFECYCLE APIS
// ══════════════════════════════════════════════════

export interface DealerContact {
  name: string;
  title: string;
  phone: string;
  email: string;
  isPrimary?: boolean;
}

export interface DeadDealerItem {
  _id: string;
  dealerId: string;
  dealerName: string;
  statePrefix?: string;
  dealerRepresentative?: string;
  systemStatus: 'closed' | 'bought_out' | 'no_longer_in_service';
  systemStatusReason?: string;
  systemStatusChangedAt?: string;
  systemStatusChangedBy?: string;
  dealerPhoneNumber?: string;
  dealerCity?: string;
  dealerState?: string;
}

export async function syncBadgerAll(): Promise<{ success: boolean; message: string; status: any }> {
  const { data } = await api.post('/dealers/sync-badger-all');
  return data;
}

export async function getBadgerSyncStatus(): Promise<{ success: boolean; status: any }> {
  const { data } = await api.get('/dealers/sync-badger-status');
  return data;
}

export async function syncDealerBadger(dealerId: string): Promise<{ success: boolean; message: string; data: any }> {
  const { data } = await api.post(`/dealers/${encodeURIComponent(dealerId)}/sync-badger`);
  return data;
}

export async function setDealerSystemStatus(
  dealerId: string,
  status: 'active' | 'closed' | 'bought_out' | 'no_longer_in_service',
  reason?: string
): Promise<{ success: boolean; message: string; dealer: any }> {
  const { data } = await api.post(`/dealers/${encodeURIComponent(dealerId)}/system-status`, {
    status,
    reason
  });
  return data;
}

export async function getDeadDealers(): Promise<{ success: boolean; total: number; dealers: DeadDealerItem[] }> {
  const { data } = await api.get('/dealers/dead');
  return data;
}

export async function reviveDealer(dealerId: string): Promise<{ success: boolean; message: string; dealer: any }> {
  const { data } = await api.post(`/dealers/${encodeURIComponent(dealerId)}/revive`);
  return data;
}

export async function excludeDealer(
  dealerId: string,
  exclude?: boolean
): Promise<{ success: boolean; excluded: boolean; excludedDealers: string[]; message: string }> {
  const { data } = await api.post('/auth/exclude-dealer', { dealerId, exclude });
  return data;
}

export async function getExcludedDealers(): Promise<{ success: boolean; excludedIds: string[]; dealers: any[] }> {
  const { data } = await api.get('/auth/excluded-dealers');
  return data;
}

// ── Badger Activity Types ──

export interface BadgerAppointment {
  id: number;
  logDatetime: string;
  userName: string;
  disposition: string;
  feedback: string;
  notes: string;
}

export interface BadgerUpdateLogItem {
  _id: string;
  dealerId: string;
  badgerId: number;
  action: 'notepad_update' | 'checkin_create';
  user: {
    name?: string;
    email?: string;
  };
  payload: {
    previousNotepad?: string;
    updatedNotepad?: string;
    noteText?: string;
    appointmentId?: number;
    disposition?: string;
    feedback?: string;
    checkinNotes?: string;
  };
  isUndone: boolean;
  undoneAt?: string;
  createdAt: string;
}

export interface BadgerContact {
  name: string;
  title?: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
}

export interface BadgerActivityData {
  dealerId: string;
  dealerName: string;
  badgerId: number;
  accountOwner: string;
  notepad: string;
  appointments: BadgerAppointment[];
  recentLogs?: BadgerUpdateLogItem[];
  contacts?: BadgerContact[];
}

export interface BadgerCheckinPayload {
  disposition: string;
  feedback: string;
  notes?: string;
}

// ── Badger Activity API ──

export async function getDealerBadgerActivity(
  dealerId: string
): Promise<{ success: boolean; activity: BadgerActivityData }> {
  const { data } = await api.get(`/dealers/${encodeURIComponent(dealerId)}/badger-activity`);
  return data;
}

export async function updateDealerBadgerNotepad(
  dealerId: string,
  noteText: string
): Promise<{ success: boolean; notepad: string; logId?: string }> {
  const { data } = await api.post(`/dealers/${encodeURIComponent(dealerId)}/badger-notepad`, { noteText });
  return data;
}

export async function createDealerBadgerCheckin(
  dealerId: string,
  payload: BadgerCheckinPayload
): Promise<{ success: boolean; appointment: BadgerAppointment; communicationId: string; logId?: string }> {
  const { data } = await api.post(`/dealers/${encodeURIComponent(dealerId)}/badger-checkin`, payload);
  return data;
}

export async function undoBadgerNotepadUpdate(
  dealerId: string,
  logId?: string
): Promise<{ success: boolean; notepad: string; undoneLogId: string }> {
  const { data } = await api.post(`/dealers/${encodeURIComponent(dealerId)}/badger-notepad/undo`, { logId });
  return data;
}

export async function undoBadgerCheckin(
  dealerId: string,
  appointmentId: number
): Promise<{ success: boolean; appointmentId: number; message: string }> {
  const { data } = await api.post(`/dealers/${encodeURIComponent(dealerId)}/badger-checkin/${appointmentId}/undo`);
  return data;
}

export async function getDealerBadgerAuditLogs(
  dealerId: string
): Promise<{ success: boolean; logs: BadgerUpdateLogItem[] }> {
  const { data } = await api.get(`/dealers/${encodeURIComponent(dealerId)}/badger-audit-logs`);
  return data;
}

export interface QuickActionPayload {
  systemStatus?: 'active' | 'closed' | 'bought_out' | 'no_longer_in_service';
  systemStatusReason?: string | null;
  businessType?: 'franchise' | 'non-franchise' | 'broker' | null;
  tags?: string[];
}

export async function updateDealerQuickAction(
  dealerId: string,
  payload: QuickActionPayload
): Promise<{ success: boolean; dealer: any; logId: string; message: string }> {
  const { data } = await api.patch(`/dealers/${encodeURIComponent(dealerId)}/quick-action`, payload);
  return data;
}

export async function undoDealerQuickAction(
  logId: string
): Promise<{ success: boolean; revertedDealer: any; message: string }> {
  const { data } = await api.post(`/dealers/audit-history/${encodeURIComponent(logId)}/undo`);
  return data;
}

export interface UniversalTag {
  tag: string;
  count: number;
  color?: string;
  description?: string;
  isGlobal?: boolean;
}

export async function getDealerTags(): Promise<{ success: boolean; tags: UniversalTag[] }> {
  const { data } = await api.get('/dealers/tags');
  return data;
}

export async function createGlobalTag(
  tag: string,
  color?: string,
  description?: string
): Promise<{ success: boolean; tag: UniversalTag; alreadyExists?: boolean }> {
  const { data } = await api.post('/dealers/tags', { tag, color, description });
  return data;
}

export async function deleteGlobalTag(
  tag: string,
  cascade: boolean = false
): Promise<{ success: boolean; message: string }> {
  const { data } = await api.delete(`/dealers/tags/${encodeURIComponent(tag)}`, {
    params: { cascade: cascade ? 'true' : 'false' }
  });
  return data;
}

export interface BatchActionPayload {
  dealerIds?: string[];
  selectAllMatching?: boolean;
  filterQuery?: {
    scope?: string;
    state?: string | string[];
    states?: string | string[];
    rep?: string;
    businessType?: string;
    tags?: string | string[];
    search?: string;
    status?: string;
  };
  action: 'add_tags' | 'remove_tags' | 'set_business_type' | 'set_status';
  payload: {
    tags?: string[];
    businessType?: 'franchise' | 'non-franchise' | 'broker' | null;
    systemStatus?: 'active' | 'closed' | 'bought_out' | 'no_longer_in_service';
    systemStatusReason?: string | null;
  };
}

export async function executeBatchDealerAction(
  data: BatchActionPayload
): Promise<{ success: boolean; updatedCount: number; batchId: string; updatedDealers: any[]; message: string }> {
  const res = await api.post('/dealers/batch-action', data);
  return res.data;
}

export async function undoBatchDealerAction(
  batchId: string
): Promise<{ success: boolean; revertedCount: number; revertedDealers: any[]; message: string }> {
  const res = await api.post(`/dealers/batch-action/${encodeURIComponent(batchId)}/undo`);
  return res.data;
}

// ── Funding Hierarchy (Parent-Child Central Funder vs Satellite Stores) ──
export async function setFundingHierarchy(
  parentId: string,
  childIds: string[]
): Promise<{ success: boolean; parent: any; linkedCount: number; batchId: string; message: string }> {
  const res = await api.post('/dealers/hierarchy/set-parent', { parentId, childIds });
  return res.data;
}

export async function unlinkFundingChild(
  childId: string
): Promise<{ success: boolean; child: any; parent?: any; message: string }> {
  const res = await api.post('/dealers/hierarchy/unlink-child', { childId });
  return res.data;
}

export async function dissolveFundingHierarchy(
  parentId: string
): Promise<{ success: boolean; dissolvedCount: number; message: string }> {
  const res = await api.post('/dealers/hierarchy/dissolve', { parentId });
  return res.data;
}

export async function getDealerHierarchy(
  dealerId: string
): Promise<{
  success: boolean;
  dealer: {
    _id: string;
    dealerId: string;
    clientDealerId?: string;
    dealerName: string;
    isFundingParent: boolean;
    fundingParent: any;
    fundingChildren: any[];
  };
}> {
  const res = await api.get(`/dealers/hierarchy/${encodeURIComponent(dealerId)}`);
  return res.data;
}

// ── System Audit Log & Universal Undos ──
export interface SystemAuditLogItem {
  _id: string;
  dealerId: string;
  dealerName: string;
  batchId?: string | null;
  action: string;
  user?: { id?: string; name: string; email?: string };
  changedBy?: { name: string; email?: string };
  previousState: any;
  newState: any;
  metadata?: any;
  reason?: string;
  isUndone: boolean;
  undoneAt?: string;
  undoneBy?: { name: string; email?: string };
  createdAt: string;
}

export async function getSystemAuditLogs(params?: {
  page?: number;
  limit?: number;
  action?: string;
  search?: string;
  showUndone?: boolean;
}): Promise<{
  success: boolean;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  logs: SystemAuditLogItem[];
}> {
  const res = await api.get('/dealers/audit-history', { params });
  return res.data;
}

export async function undoAuditLogAction(
  logId: string
): Promise<{ success: boolean; revertedDealer?: any; message: string }> {
  const res = await api.post(`/dealers/audit-history/${encodeURIComponent(logId)}/undo`);
  return res.data;
}

// ── Dealer Groups & Rep-to-Admin Approval Desk ──
export interface DealerGroupItem {
  _id: string;
  name: string;
  slug: string;
  dealerCount: number;
  isCustom?: boolean;
  description?: string;
  createdBy?: string | null;
  updatedAt?: string;
  createdAt?: string;
}

export interface GroupMemberLocation {
  _id: string;
  dealerId: string;
  dealerName: string;
  dealerCity?: string;
  dealerState?: string;
  systemStatus?: string;
  businessType?: string;
  tags?: string[];
  fundingParent?: any;
  isFundingParent?: boolean;
  createdAt?: string;
}

export interface DealerGroupProposalDealer {
  dealerLocation: string;
  dealerId: string;
  dealerName: string;
  currentGroupName?: string | null;
  currentGroupId?: string | null;
  action: 'add' | 'remove';
  status?: 'pending' | 'approved' | 'rejected';
}

export interface DealerGroupRequestItem {
  _id: string;
  requestType: 'create_group' | 'add_dealers' | 'remove_dealers' | 'transfer_dealers' | 'delete_group' | 'edit_group';
  groupId?: string | null;
  groupName: string;
  groupDescription?: string;
  dealers: DealerGroupProposalDealer[];
  requestedBy: string;
  requesterName?: string;
  requesterEmail?: string;
  repNote: string;
  status: 'pending' | 'approved' | 'rejected' | 'partially_approved';
  reviewedBy?: string | null;
  reviewerName?: string | null;
  reviewNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export async function getDealerGroupsList(params?: {
  search?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
}): Promise<{
  success: boolean;
  total: number;
  groups: DealerGroupItem[];
  pendingRequestsCount: number;
}> {
  const res = await api.get('/dealers/groups', { params });
  return res.data;
}

export async function getDealerGroupMembers(
  groupId: string
): Promise<{
  success: boolean;
  group: DealerGroupItem;
  total: number;
  members: GroupMemberLocation[];
}> {
  const res = await api.get(`/dealers/groups/${encodeURIComponent(groupId)}/members`);
  return res.data;
}

export async function createOrProposeDealerGroup(data: {
  name: string;
  description?: string;
  dealerLocationIds?: string[];
  dealers?: DealerGroupProposalDealer[];
  repNote?: string;
}): Promise<{
  success: boolean;
  isProposal: boolean;
  group?: DealerGroupItem;
  proposal?: DealerGroupRequestItem;
  message: string;
}> {
  const res = await api.post('/dealers/groups', data);
  return res.data;
}

export async function updateOrProposeDealerGroup(
  groupId: string,
  data: {
    name?: string;
    description?: string;
    addDealerLocationIds?: string[];
    removeDealerLocationIds?: string[];
    dealers?: DealerGroupProposalDealer[];
    repNote?: string;
  }
): Promise<{
  success: boolean;
  isProposal: boolean;
  group?: DealerGroupItem;
  proposal?: DealerGroupRequestItem;
  message: string;
}> {
  const res = await api.put(`/dealers/groups/${encodeURIComponent(groupId)}`, data);
  return res.data;
}

export async function deleteOrProposeDealerGroup(
  groupId: string,
  repNote?: string
): Promise<{
  success: boolean;
  isProposal: boolean;
  deletedGroupName?: string;
  proposal?: DealerGroupRequestItem;
  message: string;
}> {
  const res = await api.delete(`/dealers/groups/${encodeURIComponent(groupId)}`, {
    data: { repNote }
  });
  return res.data;
}

export async function getDealerGroupRequests(params?: {
  status?: string;
}): Promise<{
  success: boolean;
  total: number;
  pendingCount: number;
  requests: DealerGroupRequestItem[];
}> {
  const res = await api.get('/dealers/groups/requests', { params });
  return res.data;
}

export async function reviewDealerGroupRequest(
  requestId: string,
  data: {
    decision: 'approved' | 'rejected';
    reviewNote?: string;
    itemDecisions?: Record<string, 'approved' | 'rejected'>;
  }
): Promise<{
  success: boolean;
  proposal: DealerGroupRequestItem;
  message: string;
}> {
  const res = await api.post(`/dealers/groups/requests/${encodeURIComponent(requestId)}/review`, data);
  return res.data;
}

export default api;



