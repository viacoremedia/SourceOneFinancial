import { create } from 'zustand';
import type { DatePreset, TrendPeriod, TabId } from '../types';

export interface DashboardFilterState {
  // Active Filter Slices
  activeTab: TabId;
  selectedRep: string;
  selectedState: string;
  statusFilter: string | null;
  activityMode: 'application' | 'approval' | 'booking';
  datePreset: DatePreset;
  customStartDate: string;
  customEndDate: string;
  startDate?: string;
  endDate?: string;
  trend: TrendPeriod;
  transitionFilter: string | null;
  searchQuery: string;
  latestReportDate?: string;
  filterVersion: number; // Monotonically increasing counter to trigger hard cache invalidation

  // Actions
  setTab: (tab: TabId) => void;
  setRep: (rep: string) => void;
  setState: (state: string) => void;
  setStatusFilter: (status: string | null) => void;
  setActivityMode: (mode: 'application' | 'approval' | 'booking') => void;
  setDatePreset: (preset: DatePreset) => void;
  setCustomDates: (start?: string, end?: string) => void;
  setTrend: (trend: TrendPeriod) => void;
  setTransitionFilter: (transition: string | null) => void;
  setSearchQuery: (query: string) => void;
  setLatestReportDate: (date: string) => void;
  resetAllFilters: () => void;
}

export function computeResolvedDates(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string,
  latestReportDate?: string
): { startDate?: string; endDate?: string } {
  const anchorDate = latestReportDate ? new Date(latestReportDate) : new Date();
  const year = anchorDate.getUTCFullYear();
  const month = anchorDate.getUTCMonth();
  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  const maxEndStr = formatDate(anchorDate);

  switch (preset) {
    case 'this_month':
      return { startDate: formatDate(new Date(Date.UTC(year, month, 1))), endDate: maxEndStr };
    case 'last_month':
      return {
        startDate: formatDate(new Date(Date.UTC(year, month - 1, 1))),
        endDate: formatDate(new Date(Date.UTC(year, month, 0))),
      };
    case 'last_30':
      return { startDate: formatDate(new Date(anchorDate.getTime() - 29 * 86400000)), endDate: maxEndStr };
    case 'last_60':
      return { startDate: formatDate(new Date(anchorDate.getTime() - 59 * 86400000)), endDate: maxEndStr };
    case 'last_90':
      return { startDate: formatDate(new Date(anchorDate.getTime() - 89 * 86400000)), endDate: maxEndStr };
    case 'ytd':
      return { startDate: formatDate(new Date(Date.UTC(year, 0, 1))), endDate: maxEndStr };
    case 'last_year':
      return {
        startDate: formatDate(new Date(Date.UTC(year - 1, 0, 1))),
        endDate: formatDate(new Date(Date.UTC(year - 1, 11, 31))),
      };
    case 'all_time':
      return { startDate: '2025-01-01', endDate: maxEndStr };
    case 'custom': {
      const start = customStart || undefined;
      let end = customEnd || undefined;
      if (end && end > maxEndStr) end = maxEndStr;
      return { startDate: start, endDate: end };
    }
    default:
      return { startDate: '2025-01-01', endDate: maxEndStr };
  }
}

export function getDefaultTrendForPreset(preset: DatePreset): TrendPeriod {
  switch (preset) {
    case 'all_time':
      return 'none';
    case 'ytd':
    case 'last_year':
      return 'yoy';
    case 'this_month':
    case 'last_month':
      return 'mom';
    default:
      return 'prior';
  }
}

const initialDates = computeResolvedDates('this_month');

export const useDashboardStore = create<DashboardFilterState>((set) => ({
  activeTab: 'all',
  selectedRep: '',
  selectedState: '',
  statusFilter: null,
  activityMode: 'application',
  datePreset: 'this_month',
  customStartDate: '',
  customEndDate: '',
  startDate: initialDates.startDate,
  endDate: initialDates.endDate,
  trend: 'mom',
  transitionFilter: null,
  searchQuery: '',
  latestReportDate: undefined,
  filterVersion: 1,

  setTab: (tab: TabId) => set({ activeTab: tab }),

  setRep: (rep: string) =>
    set((state) => ({
      selectedRep: rep,
      filterVersion: state.filterVersion + 1,
    })),

  setState: (stateName: string) =>
    set((state) => ({
      selectedState: stateName,
      filterVersion: state.filterVersion + 1,
    })),

  setStatusFilter: (status: string | null) =>
    set((state) => ({
      statusFilter: status,
      filterVersion: state.filterVersion + 1,
    })),

  setActivityMode: (mode: 'application' | 'approval' | 'booking') =>
    set((state) => ({
      activityMode: mode,
      filterVersion: state.filterVersion + 1,
    })),

  setDatePreset: (preset: DatePreset) =>
    set((state) => {
      if (preset === 'custom') {
        if (state.customStartDate && state.customEndDate) {
          const dates = computeResolvedDates('custom', state.customStartDate, state.customEndDate, state.latestReportDate);
          return {
            datePreset: 'custom',
            startDate: dates.startDate,
            endDate: dates.endDate,
            filterVersion: state.filterVersion + 1,
          };
        }
        return {
          datePreset: 'custom',
        };
      }
      const newTrend = getDefaultTrendForPreset(preset);
      const dates = computeResolvedDates(preset, state.customStartDate, state.customEndDate, state.latestReportDate);
      return {
        datePreset: preset,
        trend: newTrend,
        startDate: dates.startDate,
        endDate: dates.endDate,
        filterVersion: state.filterVersion + 1,
      };
    }),

  setCustomDates: (start?: string, end?: string) =>
    set((state) => {
      const customStart = start || '';
      const customEnd = end || '';
      const dates = computeResolvedDates('custom', customStart, customEnd, state.latestReportDate);
      return {
        datePreset: 'custom',
        customStartDate: customStart,
        customEndDate: customEnd,
        startDate: dates.startDate,
        endDate: dates.endDate,
        filterVersion: state.filterVersion + 1,
      };
    }),

  setTrend: (trend: TrendPeriod) =>
    set((state) => ({
      trend,
      filterVersion: state.filterVersion + 1,
    })),

  setTransitionFilter: (transition: string | null) =>
    set((state) => ({
      transitionFilter: transition,
      filterVersion: state.filterVersion + 1,
    })),

  setSearchQuery: (query: string) =>
    set({ searchQuery: query }),

  setLatestReportDate: (latestDate: string) =>
    set((state) => {
      if (state.latestReportDate === latestDate) return state;
      const dates = computeResolvedDates(state.datePreset, state.customStartDate, state.customEndDate, latestDate);
      return {
        latestReportDate: latestDate,
        startDate: dates.startDate,
        endDate: dates.endDate,
      };
    }),

  resetAllFilters: () =>
    set((state) => {
      const dates = computeResolvedDates('this_month', '', '', state.latestReportDate);
      return {
        selectedRep: '',
        selectedState: '',
        statusFilter: null,
        activityMode: 'application',
        datePreset: 'this_month',
        customStartDate: '',
        customEndDate: '',
        startDate: dates.startDate,
        endDate: dates.endDate,
        trend: 'mom',
        transitionFilter: null,
        searchQuery: '',
        filterVersion: state.filterVersion + 1,
      };
    }),
}));
