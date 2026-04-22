/**
 * Dashboard — Main page component that composes all dashboard widgets.
 * StatsBar + FilterBar + TabBar + DealerTable with server-side sort + infinite scroll.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AppShell } from '../../../core/components/AppShell';
import { TabBar, type TabId } from '../components/TabBar';
import { FilterBar } from '../components/FilterBar';
import { DealerTable } from '../components/DealerTable';
import { RollingAvgStrip } from '../components/RollingAvgStrip';
import { useOverview, useDealerGroups } from '../hooks';
import { useRollingAvg } from '../hooks/useRollingAvg';
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
};

export function Dashboard() {
  const { data: overview } = useOverview();

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

  // ── Rolling Averages ──
  const [rollingWindow, setRollingWindow] = useState<RollingWindow>(7);
  const [activeOnly, setActiveOnly] = useState(false);

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
    if (selectedRep && repStatesMap[selectedRep]) return repStatesMap[selectedRep];
    return undefined;
  }, [selectedRep, selectedState, repStatesMap]);

  // Rolling averages — depends on targetStates + status filter
  // Priority: dashboard statusFilter chips → strip activeOnly toggle → all
  const STATUS_FILTER_MAP: Record<string, string[]> = {
    active: ['active'],
    inactive30: ['30d_inactive'],
    inactive60: ['60d_inactive'],
    longInactive: ['long_inactive'],
  };

  const rollingStatusFilter = useMemo(() => {
    // Dashboard stat chip takes priority
    if (statusFilter && STATUS_FILTER_MAP[statusFilter]) {
      return STATUS_FILTER_MAP[statusFilter];
    }
    // Strip toggle fallback
    if (activeOnly) return ['active'];
    return undefined;
  }, [statusFilter, activeOnly]);

  const { data: rollingAvgData, isLoading: rollingAvgLoading } = useRollingAvg(rollingWindow, targetStates, rollingStatusFilter, activityMode);

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

  // Fetch groups — re-fetches when targetStates changes (server recalculates summaries)
  const { groups, isLoading: groupsLoading } = useDealerGroups(targetStates, activityMode);

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
  const sortStateRef = useRef({ sorts: ['dealerName'], dirs: ['asc'] as ('asc' | 'desc')[] });
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
          activityMode: activityModeRef.current,
          search: searchRef.current || undefined,
          transition: transitionRef.current || undefined,
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
    []
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

  // Transition filter change — re-fetch with specific from→to transition
  const handleTransitionFilterChange = useCallback((transition: string | null) => {
    setTransitionFilter(transition);
    transitionRef.current = transition;
    // Clear status filter when applying a transition filter
    setStatusFilter(null);
    statusRef.current = null;
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
        const { locations } = await getGroupLocations(slug);
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
              const { locations } = await getGroupLocations(g.slug);
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
            onRepChange={handleRepChange}
            onStateChange={handleStateChange}
            onStatusFilterChange={handleStatusFilterChange}
            onActivityModeChange={handleActivityModeChange}
            repHeatMap={repHeatMap}
            statusTransitions={statusTransitions}
            transitionFilter={transitionFilter}
            onTransitionFilterChange={handleTransitionFilterChange}
          />
        )}
      </div>

      <RollingAvgStrip
        data={rollingAvgData}
        isLoading={rollingAvgLoading}
        windowSize={rollingWindow}
        onWindowChange={setRollingWindow}
        activeOnly={activeOnly}
        onActiveOnlyChange={setActiveOnly}
        statusFilterLabel={
          statusFilter === 'active' ? 'Active'
          : statusFilter === 'inactive30' ? '30d Inactive'
          : statusFilter === 'inactive60' ? '60d Inactive'
          : statusFilter === 'longInactive' ? 'Long Inactive'
          : null
        }
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
        onExpandGroup={handleExpandGroup}
        onLoadMore={handleLoadMore}
        onDealerSortChange={handleDealerSortChange}
        onDealerSearch={handleDealerSearch}
      />
    </AppShell>
  );
}
