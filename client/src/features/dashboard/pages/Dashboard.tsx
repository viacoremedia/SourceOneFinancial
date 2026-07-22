/**
 * Dashboard — Main page component that composes all dashboard widgets.
 * StatsBar + FilterBar + TabBar + DealerTable with server-side sort + infinite scroll.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AppShell } from '../../../core/components/AppShell';
import { TabBar, type TabId } from '../components/TabBar';
import { FilterBar, type DatePreset } from '../components/FilterBar';
import { DealerTable } from '../components/DealerTable';
import { DealerDrawer } from '../components/DealerDrawer/DealerDrawer';
import { ExecutiveSummaryBanner } from '../components/ExecutiveSummaryBanner/ExecutiveSummaryBanner';
import { AnalyticsDrawer } from '../components/AnalyticsDrawer/AnalyticsDrawer';
import { useOverview, useDealerGroups } from '../hooks';
import { useRepScorecard } from '../hooks/useRepScorecard';
import { getGroupLocations, getSmallDealers, getStateRepMap, getBudgetByState } from '../../../core/services/api';
import type { StateRepMap, StateBudget, DealerStatusBreakdown } from '../../../core/services/api';
import type { DealerLocation, RollingWindow, HeatClass } from '../types';

// Map frontend sort keys to server sort keys
const SORT_KEY_MAP: Record<string, string> = {
  name: 'dealerName',
  daysSinceLastApplication: 'daysSinceLastApplication',
  daysSinceLastApproval: 'daysSinceLastApproval',
  daysSinceLastBooking: 'daysSinceLastBooking',
  activityStatus: 'activityStatus',
  commDays: 'commDays',
  visitToApp: 'visitToApp',
  apps: 'apps',
  approvals: 'approvals',
  inHouse: 'inHouse',
  booked: 'booked',
  bookedDollars: 'bookedDollars',
  lookToBook: 'lookToBook',
  approvalToBook: 'approvalToBook',
};

export function Dashboard() {
  const { data: overview } = useOverview();
  const [momDrawerOpen, setMomDrawerOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [groupLocations, setGroupLocations] = useState<
    Record<string, DealerLocation[]>
  >({});

  // ── Filter state ──
  const [stateRepMap, setStateRepMap] = useState<StateRepMap>({});
  const [budgets, setBudgets] = useState<StateBudget[]>([]);
  const [selectedRep, setSelectedRep] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [activityMode, setActivityMode] = useState<'application' | 'approval' | 'booking'>('application');
  const activityModeRef = useRef<'application' | 'approval' | 'booking'>('application');

  // ── Drawer state ──
  const [rollingWindow, setRollingWindow] = useState<RollingWindow>(7);
  const [selectedDealerIdForDrawer, setSelectedDealerIdForDrawer] = useState<string | null>(null);

  // Fetch state-rep map + budgets on mount
  useEffect(() => {
    getStateRepMap().then(setStateRepMap).catch(console.error);
    getBudgetByState().then(setBudgets).catch(console.error);
  }, []);

  // Build reverse map: rep → states[]
  const repStatesMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const [state, rep] of Object.entries(stateRepMap)) {
      if (!map[rep]) map[rep] = [];
      map[rep].push(state);
    }
    return map;
  }, [stateRepMap]);

  // Compute target states from current filter
  const targetStates = useMemo(() => {
    if (selectedState) return [selectedState];
    return undefined;
  }, [selectedState]);

  // Rep scorecard (always fetched for heat dots in FilterBar — server caches 5 min)
  const { data: scorecardData } = useRepScorecard(rollingWindow, true, undefined, activityMode);
  const repHeatMap = useMemo(() => {
    if (!scorecardData?.reps) return undefined;
    const map: Record<string, HeatClass> = {};
    for (const r of scorecardData.reps) {
      if (r.heatClass) map[r.rep] = r.heatClass;
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }, [scorecardData]);

  // ── Date Range state (defaults to This Month / MTD) ──
  const nowUtc = new Date();
  const defaultStartDate = `${nowUtc.getUTCFullYear()}-${String(nowUtc.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const defaultEndDate = nowUtc.toISOString().split('T')[0];
  const [datePreset, setDatePreset] = useState<DatePreset>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [startDate, setStartDate] = useState<string | undefined>(defaultStartDate);
  const [endDate, setEndDate] = useState<string | undefined>(defaultEndDate);
  const startDateRef = useRef<string | undefined>(defaultStartDate);
  const endDateRef = useRef<string | undefined>(defaultEndDate);

  // ── Trend state (defaults to vs Last Month / MoM) ──
  const [trend, setTrend] = useState<'mom' | 'yoy' | '30d' | '60d' | 'prior' | 'none'>('mom');
  const trendRef = useRef<'mom' | 'yoy' | '30d' | '60d' | 'prior' | 'none'>('mom');
  const [comparisonLabel, setComparisonLabel] = useState<string | undefined>(undefined);

  // Fetch groups — re-fetches automatically via useEffect when targetStates, activityMode, dates, trend, statusFilter, or selectedRep change
  const { groups, isLoading: groupsLoading } = useDealerGroups(
    targetStates,
    activityMode,
    startDate,
    endDate,
    trend,
    statusFilter,
    selectedRep
  );

  // Groups filtered by state only — used for stats computation (stable numbers)
  const stateFilteredGroups = useMemo(() => {
    if (!targetStates) return groups;
    return groups.filter((g) => g.summary && g.summary.locationCount > 0);
  }, [groups, targetStates]);

  // Groups filtered by state + status — used for table display
  const filteredGroups = useMemo(() => {
    if (!statusFilter) return stateFilteredGroups;
    return stateFilteredGroups.filter((g) => {
      if (!g.summary) return false;
      switch (statusFilter) {
        case 'active': return g.summary.activeCount > 0;
        case '30d_inactive': return g.summary.inactive30Count > 0;
        case '60d_inactive': return g.summary.inactive60Count > 0;
        case 'long_inactive': return g.summary.longInactiveCount > 0;
        default: return true;
      }
    });
  }, [stateFilteredGroups, statusFilter]);

  // ── Flat dealer state (shared for 'dealers' and 'all' tabs) ──
  const [smallDealers, setSmallDealers] = useState<DealerLocation[]>([]);
  const [allDealers, setAllDealers] = useState<DealerLocation[]>([]);
  const [smallDealersLoading, setSmallDealersLoading] = useState(false);
  const [smallDealersLoadingMore, setSmallDealersLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalSmallDealers, setTotalSmallDealers] = useState(0);
  const [totalAllDealers, setTotalAllDealers] = useState(0);
  const [dealerStatusBreakdown, setDealerStatusBreakdown] = useState<DealerStatusBreakdown | null>(null);
  const [statusTransitions, setStatusTransitions] = useState<{ from: string; to: string; count: number }[]>([]);
  const [transitionFilter, setTransitionFilter] = useState<string | null>(null);
  const transitionRef = useRef<string | null>(null);
  const pageRef = useRef(1);
  const sortStateRef = useRef({ sorts: ['apps'], dirs: ['desc'] as ('asc' | 'desc')[] });
  const statusRef = useRef<string | null>(null);
  const statesRef = useRef<string[] | undefined>(undefined);
  const searchRef = useRef('');

  const scopeForTab = (tab: TabId): 'ungrouped' | 'all' | undefined =>
    tab === 'all' ? 'all' : tab === 'dealers' ? 'ungrouped' : undefined;

  // Fetch a page of dealers (works for both 'dealers' and 'all' tabs)
  const fetchDealers = useCallback(
    async (
      page: number, sorts: string[], dirs: ('asc' | 'desc')[],
      append: boolean, status: string | null,
      scope: 'ungrouped' | 'all', states?: string[]
    ) => {
      if (page === 1) {
        setSmallDealersLoading(true);
      } else {
        setSmallDealersLoadingMore(true);
      }
      try {
        const result = await getSmallDealers({
          sort: sorts.join(','), dir: dirs.join(',') as any,
          page, limit: 50, status, scope, states,
          rep: selectedRep || undefined,
          activityMode: activityModeRef.current,
          search: searchRef.current || undefined,
          transition: transitionRef.current || undefined,
          startDate: startDateRef.current,
          endDate: endDateRef.current,
          trend: trendRef.current,
        });
        const setDealers = scope === 'all' ? setAllDealers : setSmallDealers;
        const setTotal = scope === 'all' ? setTotalAllDealers : setTotalSmallDealers;
        if (append) {
          setDealers((prev) => [...prev, ...result.dealers]);
        } else {
          setDealers(result.dealers);
        }
        if (result.statusBreakdown) {
          setDealerStatusBreakdown(result.statusBreakdown);
        }
        if (result.statusTransitions) {
          setStatusTransitions(result.statusTransitions);
        }
        setComparisonLabel(result.comparisonLabel);
        setHasMore(result.pagination.hasMore);
        setTotal(result.pagination.totalCount);
        pageRef.current = page;
      } catch (err) {
        console.error('Failed to load dealers:', err);
      } finally {
        setSmallDealersLoading(false);
        setSmallDealersLoadingMore(false);
      }
    },
    [selectedRep]
  );


  // Load first page when a flat-dealer tab activates
  const loadedTabs = useRef<Set<string>>(new Set());
  useEffect(() => {
    const scope = scopeForTab(activeTab);
    if (!scope) return;
    if (loadedTabs.current.has(activeTab) || smallDealersLoading) return;
    loadedTabs.current.add(activeTab);
    fetchDealers(1, sortStateRef.current.sorts, sortStateRef.current.dirs, false, null, scope, statesRef.current);
  }, [activeTab, smallDealersLoading, fetchDealers]);

  // Fetch transition data for the groups tab (lightweight — just needs the summary)
  useEffect(() => {
    if (activeTab !== 'groups') return;
    (async () => {
      try {
        const result = await getSmallDealers({
          page: 1, limit: 1, scope: 'all',
          states: statesRef.current,
          activityMode: activityModeRef.current,
        });
        if (result.statusTransitions) {
          setStatusTransitions(result.statusTransitions);
        }
        if (result.statusBreakdown) {
          setDealerStatusBreakdown(result.statusBreakdown);
        }
      } catch { /* ignore */ }
    })();
  }, [activeTab, targetStates, activityMode]);

  // Re-fetch flat tabs when target server params change
  const refetchFlatTab = useCallback(() => {
    const scope = scopeForTab(activeTab);
    if (!scope) return;
    pageRef.current = 1;
    fetchDealers(1, sortStateRef.current.sorts, sortStateRef.current.dirs, false, statusRef.current, scope, statesRef.current);
  }, [activeTab, fetchDealers]);

  // Status filter change
  const handleStatusFilterChange = useCallback((newStatus: string | null) => {
    setStatusFilter(newStatus);
    statusRef.current = newStatus;
    // Clear transition filter when status filter changes
    setTransitionFilter(null);
    transitionRef.current = null;
    refetchFlatTab();
  }, [refetchFlatTab]);

  // Rep change — update state and re-fetch for flat tabs
  const handleRepChange = useCallback((rep: string) => {
    setSelectedRep(rep);
    setTransitionFilter(null);
    transitionRef.current = null;
    if (!selectedState) {
      statesRef.current = rep && repStatesMap[rep] ? repStatesMap[rep] : undefined;
      refetchFlatTab();
    }
  }, [selectedState, repStatesMap, refetchFlatTab]);

  // State change — update state and re-fetch for flat tabs
  const handleStateChange = useCallback((state: string) => {
    setSelectedState(state);
    setTransitionFilter(null);
    transitionRef.current = null;
    statesRef.current = state ? [state] : (selectedRep && repStatesMap[selectedRep] ? repStatesMap[selectedRep] : undefined);
    refetchFlatTab();
  }, [selectedRep, repStatesMap, refetchFlatTab]);

  // Activity mode change — re-fetch with new status derivation
  const handleActivityModeChange = useCallback((mode: 'application' | 'approval' | 'booking') => {
    setActivityMode(mode);
    activityModeRef.current = mode;
    // Clear status + transition filters when changing mode
    setStatusFilter(null);
    statusRef.current = null;
    setTransitionFilter(null);
    transitionRef.current = null;
    refetchFlatTab();
  }, [refetchFlatTab]);

  // Helper to compute start & end dates from preset
  const computeDateRange = useCallback((preset: DatePreset, cStart?: string, cEnd?: string): { startDate?: string; endDate?: string } => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    switch (preset) {
      case 'this_month':
        return { startDate: formatDate(new Date(Date.UTC(year, month, 1))), endDate: formatDate(now) };
      case 'last_30':
        return { startDate: formatDate(new Date(now.getTime() - 30 * 86400000)), endDate: formatDate(now) };
      case 'last_60':
        return { startDate: formatDate(new Date(now.getTime() - 60 * 86400000)), endDate: formatDate(now) };
      case 'last_month':
        return { startDate: formatDate(new Date(Date.UTC(year, month - 1, 1))), endDate: formatDate(new Date(Date.UTC(year, month, 0))) };
      case 'ytd':
        return { startDate: formatDate(new Date(Date.UTC(year, 0, 1))), endDate: formatDate(now) };
      case 'last_year':
        return { startDate: formatDate(new Date(Date.UTC(year - 1, 0, 1))), endDate: formatDate(new Date(Date.UTC(year - 1, 11, 31))) };
      case 'all_time':
        return { startDate: '2025-01-01', endDate: formatDate(now) };
      case 'custom':
        return { startDate: cStart || undefined, endDate: cEnd || undefined };
      default:
        return { startDate: '2025-01-01' };
    }
  }, []);

  // Date range preset change
  const handleDatePresetChange = useCallback((preset: DatePreset) => {
    setDatePreset(preset);
    const range = computeDateRange(preset, customStartDate, customEndDate);
    startDateRef.current = range.startDate;
    endDateRef.current = range.endDate;
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    setGroupLocations({});
    refetchFlatTab();
  }, [computeDateRange, customStartDate, customEndDate, refetchFlatTab]);

  // Custom date range change
  const handleCustomDateChange = useCallback((start?: string, end?: string) => {
    setCustomStartDate(start || '');
    setCustomEndDate(end || '');
    if (datePreset === 'custom') {
      startDateRef.current = start || undefined;
      endDateRef.current = end || undefined;
      setStartDate(start || undefined);
      setEndDate(end || undefined);
      setGroupLocations({});
      refetchFlatTab();
    }
  }, [datePreset, refetchFlatTab]);

  // Transition filter change — re-fetch with specific from→to transition
  const handleTransitionFilterChange = useCallback((transition: string | null) => {
    setTransitionFilter(transition);
    transitionRef.current = transition;
    // Only clear status filter when APPLYING a transition (not when clearing one)
    if (transition) {
      setStatusFilter(null);
      statusRef.current = null;
    }
    refetchFlatTab();
  }, [refetchFlatTab]);

  // Trend selection change — re-fetch with new baseline comparison
  const handleTrendChange = useCallback((newTrend: string) => {
    setTrend(newTrend as any);
    trendRef.current = newTrend as any;
    setGroupLocations({});
    refetchFlatTab();
  }, [refetchFlatTab]);

  // Reset filters when switching tabs
  const handleTabChange = useCallback((tab: TabId) => {
    setStatusFilter(null);
    statusRef.current = null;
    setTransitionFilter(null);
    transitionRef.current = null;
    setActiveTab(tab);
    const scope = scopeForTab(tab);
    if (scope) {
      pageRef.current = 1;
      sortStateRef.current = { sorts: ['dealerName'], dirs: ['asc'] };
      fetchDealers(1, ['dealerName'], ['asc'], false, null, scope, statesRef.current);
    }
  }, [fetchDealers]);

  // Load more (infinite scroll)
  const handleLoadMore = useCallback(() => {
    if (smallDealersLoadingMore || !hasMore) return;
    const scope = scopeForTab(activeTab);
    if (!scope) return;
    const nextPage = pageRef.current + 1;
    fetchDealers(nextPage, sortStateRef.current.sorts, sortStateRef.current.dirs, true, statusRef.current, scope, statesRef.current);
  }, [smallDealersLoadingMore, hasMore, fetchDealers, activeTab]);

  // Sort change from DealerTable — re-fetch from page 1
  const handleDealerSortChange = useCallback(
    (sortKeys: string[], sortDirs: ('asc' | 'desc')[]) => {
      const scope = scopeForTab(activeTab);
      if (!scope) return;
      const serverKeys = sortKeys.map(k => SORT_KEY_MAP[k] || 'dealerName');
      sortStateRef.current = { sorts: serverKeys, dirs: sortDirs };
      pageRef.current = 1;
      fetchDealers(1, serverKeys, sortDirs, false, statusRef.current, scope, statesRef.current);
    },
    [fetchDealers, activeTab]
  );

  // Search change from DealerTable — server-side search, re-fetch from page 1
  const handleDealerSearch = useCallback(
    (query: string) => {
      const scope = scopeForTab(activeTab);
      if (!scope) return;
      searchRef.current = query;
      pageRef.current = 1;
      fetchDealers(1, sortStateRef.current.sorts, sortStateRef.current.dirs, false, statusRef.current, scope, statesRef.current);
    },
    [fetchDealers, activeTab]
  );

  // Active dealer list (no more client-side filtering needed)
  const filteredSmallDealers = activeTab === 'all' ? allDealers : smallDealers;

  // Load locations for a group when expanded
  const handleExpandGroup = useCallback(
    async (slug: string) => {
      if (groupLocations[slug]) return;
      try {
        const { locations } = await getGroupLocations(
          slug,
          startDateRef.current,
          endDateRef.current,
          trendRef.current
        );
        setGroupLocations((prev) => ({ ...prev, [slug]: locations }));
      } catch (err) {
        console.error(`Failed to load locations for ${slug}:`, err);
      }
    },
    [groupLocations]
  );

  // When status filter is active, pre-fetch locations for all visible groups
  const [prefetchingLocations, setPrefetchingLocations] = useState(false);
  useEffect(() => {
    if (!statusFilter) { setPrefetchingLocations(false); return; }
    const missing = filteredGroups.filter((g) => !groupLocations[g.slug]);
    if (missing.length === 0) { setPrefetchingLocations(false); return; }
    setPrefetchingLocations(true);

    // Throttle: fetch in batches of 5 to avoid overwhelming Vercel serverless
    let cancelled = false;
    (async () => {
      const BATCH_SIZE = 5;
      for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = missing.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (g) => {
            try {
              const { locations } = await getGroupLocations(
                g.slug,
                startDateRef.current,
                endDateRef.current,
                trendRef.current
              );
              return { slug: g.slug, locations };
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;
        setGroupLocations((prev) => {
          const updated = { ...prev };
          for (const r of results) {
            if (r) updated[r.slug] = r.locations;
          }
          return updated;
        });
      }
      setPrefetchingLocations(false);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, filteredGroups]);

  // Filter child locations by rep/state + status
  const filteredGroupLocations = useMemo(() => {
    const hasStateFilter = selectedRep || selectedState;
    if (!hasStateFilter && !statusFilter) return groupLocations;

    const targetStates: Set<string> = new Set();
    if (selectedState) {
      targetStates.add(selectedState);
    } else if (selectedRep && repStatesMap[selectedRep]) {
      repStatesMap[selectedRep].forEach((s) => targetStates.add(s));
    }

    // Derive status from the correct daysSince field based on activityMode
    const deriveLocStatus = (loc: DealerLocation): string => {
      const snap = loc.latestSnapshot;
      if (!snap) return 'long_inactive';
      if (activityMode === 'application') return snap.activityStatus;
      const days = activityMode === 'approval' ? snap.daysSinceLastApproval : snap.daysSinceLastBooking;
      if (days == null) return 'long_inactive';
      if (days <= 30) return 'active';
      if (days <= 60) return '30d_inactive';
      if (days <= 90) return '60d_inactive';
      return 'long_inactive';
    };

    const filtered: Record<string, DealerLocation[]> = {};
    for (const [slug, locs] of Object.entries(groupLocations)) {
      let result = locs;
      if (targetStates.size > 0) {
        result = result.filter((loc) => loc.statePrefix && targetStates.has(loc.statePrefix));
      }
      if (statusFilter) {
        result = result.filter((loc) => {
          if (!loc.latestSnapshot) return false;
          return deriveLocStatus(loc) === statusFilter;
        });
      }
      filtered[slug] = result;
    }
    return filtered;
  }, [groupLocations, selectedRep, selectedState, repStatesMap, statusFilter, activityMode]);

  const smallDealerCount = totalSmallDealers || (overview
    ? overview.totalDealers - groups.reduce((sum, g) => sum + g.dealerCount, 0)
    : undefined);

  // Rep selection from the scorecard drawer
  const handleScorecardRepSelect = useCallback((rep: string) => {
    handleRepChange(rep);
  }, [handleRepChange]);

  // Rep + State selection from scorecard state sub-rows
  const handleScorecardRepStateSelect = useCallback((rep: string, state: string) => {
    handleRepChange(rep);
    handleStateChange(state);
  }, [handleRepChange, handleStateChange]);

  return (
    <AppShell
      latestReportDate={overview?.latestReportDate}
      rollingWindow={rollingWindow}
      onRollingWindowChange={setRollingWindow}
      onSelectRep={handleScorecardRepSelect}
      onSelectRepState={handleScorecardRepStateSelect}
      activityMode={activityMode}
      onActivityModeChange={handleActivityModeChange}
      onOpenMoMAnalytics={() => setMomDrawerOpen(true)}
    >

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <TabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          groupCount={groups.length || undefined}
          dealerCount={smallDealerCount}
          allDealerCount={totalAllDealers || overview?.totalDealers}
        />
        {Object.keys(stateRepMap).length > 0 && (
          <FilterBar
            stateRepMap={stateRepMap}
            budgets={budgets}
            filteredGroups={stateFilteredGroups}
            mode={activeTab}
            dealerStatusBreakdown={dealerStatusBreakdown}
            selectedRep={selectedRep}
            selectedState={selectedState}
            statusFilter={statusFilter}
            activityMode={activityMode}
            datePreset={datePreset}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onRepChange={handleRepChange}
            onStateChange={handleStateChange}
            onStatusFilterChange={handleStatusFilterChange}
            onActivityModeChange={handleActivityModeChange}
            onDatePresetChange={handleDatePresetChange}
            onCustomDateChange={handleCustomDateChange}
            repHeatMap={repHeatMap}
            statusTransitions={statusTransitions}
            transitionFilter={transitionFilter}
            onTransitionFilterChange={handleTransitionFilterChange}
          />
        )}
      </div>

      {/* Executive Summary Banner (Replaces bracketed summary strip) */}
      <ExecutiveSummaryBanner
        startDate={startDate}
        endDate={endDate}
        trend={trend}
        state={selectedState}
        rep={selectedRep}
        status={statusFilter}
      />

      <DealerTable
        mode={activeTab}
        groups={filteredGroups}
        groupLocations={filteredGroupLocations}
        smallDealers={filteredSmallDealers}
        isLoading={activeTab === 'groups' ? groupsLoading : smallDealersLoading}
        isLoadingMore={smallDealersLoadingMore}
        hasMore={hasMore}
        statusFilter={statusFilter}
        isPrefetching={prefetchingLocations}
        activityMode={activityMode}
        stateRepMap={stateRepMap}
        datePreset={datePreset}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onExpandGroup={handleExpandGroup}
        onLoadMore={handleLoadMore}
        onDealerSortChange={handleDealerSortChange}
        onDealerSearch={handleDealerSearch}
        onSelectDealer={setSelectedDealerIdForDrawer}
        onDatePresetChange={handleDatePresetChange}
        onCustomDateChange={handleCustomDateChange}
        onTrendChange={handleTrendChange}
        comparisonLabel={comparisonLabel}
      />

      <DealerDrawer
        dealerId={selectedDealerIdForDrawer}
        onClose={() => setSelectedDealerIdForDrawer(null)}
      />

      {/* Bottom-Up Historical MoM Analytics Drawer */}
      <AnalyticsDrawer
        isOpen={momDrawerOpen}
        onClose={() => setMomDrawerOpen(false)}
        availableStates={Object.keys(stateRepMap)}
        availableGroups={groups.map((g) => ({ name: g.name, slug: g.slug }))}
      />
    </AppShell>
  );
}
