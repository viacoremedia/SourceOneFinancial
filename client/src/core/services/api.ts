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
export async function getGroups(states?: string[], activityMode?: string): Promise<DealerGroup[]> {
  const params: Record<string, string> = {};
  if (states && states.length > 0) params.states = states.join(',');
  if (activityMode && activityMode !== 'application') params.activityMode = activityMode;
  const { data } = await api.get('/analytics/groups', { params });
  return data.groups;
}

// ── Group Locations ──
export async function getGroupLocations(slug: string): Promise<{
  group: { name: string; slug: string; dealerCount: number };
  locations: DealerLocation[];
}> {
  const { data } = await api.get(`/analytics/groups/${slug}/locations`);
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
  dir?: string; // 'asc', 'desc', or comma-separated for multi-sort (e.g. 'asc,desc')
  page?: number;
  limit?: number;
  status?: string | null;
  scope?: 'ungrouped' | 'all';
  states?: string[];
  activityMode?: 'application' | 'approval' | 'booking';
  search?: string;
  transition?: string;  // e.g. "active→30d_inactive"
}

export interface DealerStatusBreakdown {
  total: number;
  active: number;
  inactive30: number;
  inactive60: number;
  longInactive: number;
}

export interface PaginatedDealers {
  dealers: DealerLocation[];
  statusBreakdown: DealerStatusBreakdown | null;
  statusTransitions: { from: string; to: string; count: number }[];
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
    sort: params.sort || 'dealerName',
    dir: params.dir || 'asc',
    page: params.page || 1,
    limit: params.limit || 50,
  };
  if (params.status) queryParams.status = params.status;
  if (params.scope) queryParams.scope = params.scope;
  if (params.states && params.states.length > 0) queryParams.states = params.states.join(',');
  if (params.activityMode && params.activityMode !== 'application') queryParams.activityMode = params.activityMode;
  if (params.search) queryParams.search = params.search;
  if (params.transition) queryParams.transition = params.transition;
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
  activityMode?: string
): Promise<RepScorecardResponse> {
  const params: Record<string, string | number> = { window: windowSize };
  if (statusFilter && statusFilter.length > 0) params.status = statusFilter.join(',');
  if (activityMode && activityMode !== 'application') params.mode = activityMode;
  const { data } = await api.get('/analytics/rep-scorecard', { params });
  return data;
}

export default api;
