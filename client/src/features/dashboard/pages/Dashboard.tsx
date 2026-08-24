/**
 * Dashboard — Main page component that composes all dashboard widgets.
 * StatsBar + FilterBar + TabBar + DealerTable with server-side sort + infinite scroll.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AppShell } from '../../../core/components/AppShell';
import { TabBar, type TabId } from '../components/TabBar';
import { FilterBar } from '../components/FilterBar';
import { DealerTable } from '../components/DealerTable';
import { ExecutiveSummaryBanner } from '../components/ExecutiveSummaryBanner/ExecutiveSummaryBanner';
import { AnalyticsDrawer } from '../components/AnalyticsDrawer/AnalyticsDrawer';
import { VisitImpactDrawer } from '../components/VisitImpactDrawer/VisitImpactDrawer';
import type { UnderwriterDateRange } from '../components/UnderwriterScorecard/UnderwriterScorecard';
import { useOverview, useDealerGroups } from '../hooks';
import { useRepScorecard } from '../hooks/useRepScorecard';
import { useDashboardStore } from '../stores/useDashboardStore';
import { AnalyticsProvider } from '../../../core/contexts/AnalyticsContext';
import { getGroupLocations, getSmallDealers, getStateRepMap, getBudgetByState, getRepMappings } from '../../../core/services/api';
import type { StateRepMap, StateBudget, DealerStatusBreakdown, RepMappings } from '../../../core/services/api';
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
  leadBooked: 'leadBooked',
  leadBookedDollars: 'leadBookedDollars',
  booked: 'booked',
  bookedDollars: 'bookedDollars',
  lookToBook: 'lookToBook',
  approvalToBook: 'approvalToBook',
  avgFico: 'avgFico',
};

function DashboardContent() {
  const { data: overview } = useOverview();

  // ── Centralized Store Subscription ──
  const {
    activeTab,
    selectedRep,
    selectedState,
    statusFilter,
    activityMode,
    datePreset,
    customStartDate,
    customEndDate,
    startDate,
    endDate,
    trend,
    transitionFilter,
    drdFilter,
    setDrdFilter,
    searchQuery,
    filterVersion,
    setTab,
    setRep,
    setState,
    setStatusFilter,
    setActivityMode,
    setDatePreset,
    setCustomDates,
    setTrend,
    setTransitionFilter,
    setSearchQuery,
    setLatestReportDate,
  } = useDashboardStore();

  const [groupLocations, setGroupLocations] = useState<
    Record<string, DealerLocation[]>
  >({});

  // ── Metadata filter options ──
  const [stateRepMap, setStateRepMap] = useState<StateRepMap>({});
  const [budgets, setBudgets] = useState<StateBudget[]>([]);
  const [repMappings, setRepMappings] = useState<RepMappings | null>(null);

  // ── Unified Drawer State ──
  const [rollingWindow, setRollingWindow] = useState<RollingWindow>(7);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDealerId, setDrawerDealerId] = useState<string | null>(null);
  const [drawerGroupSlug, setDrawerGroupSlug] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'drd' | 'mom' | 'applications' | 'communications'>('mom');
  const [visitImpactOpen, setVisitImpactOpen] = useState(false);

  const handleOpenDealerDrawer = useCallback((dealerId: string) => {
    setDrawerDealerId(dealerId);
    setDrawerGroupSlug(null);
    setDrawerTab('drd');
    setDrawerOpen(true);
  }, []);

  const handleOpenGroupDrawer = useCallback((groupSlug: string) => {
    setDrawerGroupSlug(groupSlug);
    setDrawerDealerId(null);
    setDrawerTab('mom');
    setDrawerOpen(true);
  }, []);

  const handleOpenTopMoMDrawer = useCallback(() => {
    setDrawerDealerId(null);
    setDrawerGroupSlug(null);
    setDrawerTab('mom');
    setDrawerOpen(true);
  }, []);

  // Sync overview latestReportDate into store
  useEffect(() => {
    if (overview?.latestReportDate) {
      setLatestReportDate(overview.latestReportDate);
    }
  }, [overview, setLatestReportDate]);

  // Fetch state-rep map + budgets + rep mappings on mount
  useEffect(() => {
    getStateRepMap().then(setStateRepMap).catch(console.error);
    getBudgetByState().then(setBudgets).catch(console.error);
    getRepMappings().then(setRepMappings).catch(console.error);
  }, []);

  // Build reverse map: rep → states[] from actual DealerLocation data
  const repStatesMap = useMemo(() => {
    if (repMappings?.repStates && Object.keys(repMappings.repStates).length > 0) {
      return repMappings.repStates;
    }
    const map: Record<string, string[]> = {};
    for (const [state, rep] of Object.entries(stateRepMap)) {
      if (!map[rep]) map[rep] = [];
      map[rep].push(state);
    }
    return map;
  }, [stateRepMap, repMappings]);

  // Compute target states from current filter
  const targetStates = useMemo(() => {
    if (selectedState) return [selectedState];
    if (selectedRep && repStatesMap[selectedRep]?.length > 0) return repStatesMap[selectedRep];
    return undefined;
  }, [selectedState, selectedRep, repStatesMap]);

  // Rep scorecard (always fetched for heat dots in FilterBar)
  const { data: scorecardData } = useRepScorecard(rollingWindow, true, undefined, activityMode);
  const repHeatMap = useMemo(() => {
    if (!scorecardData?.reps) return undefined;
    const map: Record<string, HeatClass> = {};
    for (const r of scorecardData.reps) {
      if (r.heatClass) map[r.rep] = r.heatClass;
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }, [scorecardData]);

  const [comparisonLabel, setComparisonLabel] = useState<string | undefined>(undefined);

  // Fetch groups — re-fetches automatically via useEffect when store values change
  const { groups, isLoading: groupsLoading } = useDealerGroups(
    targetStates,
    activityMode,
    startDate,
    endDate,
    trend,
    statusFilter,
    selectedRep,
    drdFilter
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
  const pageRef = useRef(1);
  const sortStateRef = useRef({ sorts: ['apps'], dirs: ['desc'] as ('asc' | 'desc')[] });
  const requestIdRef = useRef(0);

  const scopeForTab = (tab: TabId): 'ungrouped' | 'all' | undefined =>
    tab === 'all' ? 'all' : tab === 'dealers' ? 'ungrouped' : undefined;

  // Fetch a page of dealers (works for both 'dealers' and 'all' tabs)
  const fetchDealers = useCallback(
    async (
      page: number, sorts: string[], dirs: ('asc' | 'desc')[],
      append: boolean, status: string | null,
      scope: 'ungrouped' | 'all', states?: string[]
    ) => {
      const currentRequestId = ++requestIdRef.current;
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
          activityMode,
          search: searchQuery || undefined,
          transition: transitionFilter || undefined,
          startDate,
          endDate,
          trend,
          drd: drdFilter || undefined,
        });

        // Guard against out-of-order race responses
        if (currentRequestId === requestIdRef.current) {
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
        }
      } catch (err) {
        console.error('Failed to load dealers:', err);
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setSmallDealersLoading(false);
          setSmallDealersLoadingMore(false);
        }
      }
    },
    [selectedRep, activityMode, searchQuery, transitionFilter, startDate, endDate, trend, drdFilter]
  );

  // Invalidate loadedTabs cache on any filter version change
  const loadedTabs = useRef<Set<string>>(new Set());
  useEffect(() => {
    loadedTabs.current.clear();
  }, [filterVersion]);

  const explicitStates = useMemo(() => {
    if (selectedState) return [selectedState];
    return undefined;
  }, [selectedState]);

  // Load first page when a flat-dealer tab activates
  useEffect(() => {
    const scope = scopeForTab(activeTab);
    if (!scope) return;
    if (loadedTabs.current.has(activeTab) || smallDealersLoading) return;
    loadedTabs.current.add(activeTab);
    fetchDealers(1, sortStateRef.current.sorts, sortStateRef.current.dirs, false, statusFilter, scope, explicitStates);
  }, [activeTab, smallDealersLoading, fetchDealers, statusFilter, explicitStates]);

  // Fetch transition data for the groups tab
  useEffect(() => {
    if (activeTab !== 'groups') return;
    (async () => {
      try {
        const result = await getSmallDealers({
          page: 1, limit: 1, scope: 'all',
          states: explicitStates,
          activityMode,
          rep: selectedRep || undefined,
        });
        if (result.statusTransitions) {
          setStatusTransitions(result.statusTransitions);
        }
        if (result.statusBreakdown) {
          setDealerStatusBreakdown(result.statusBreakdown);
        }
      } catch { /* ignore */ }
    })();
  }, [activeTab, explicitStates, activityMode, selectedRep]);

  // Re-fetch flat tabs when target server params change
  const refetchFlatTab = useCallback(() => {
    const scope = scopeForTab(activeTab);
    if (!scope) return;
    pageRef.current = 1;
    fetchDealers(1, sortStateRef.current.sorts, sortStateRef.current.dirs, false, statusFilter, scope, explicitStates);
  }, [activeTab, fetchDealers, statusFilter, explicitStates]);

  // Re-fetch flat tabs whenever store filter version changes
  useEffect(() => {
    refetchFlatTab();
  }, [filterVersion, refetchFlatTab]);

  // Rep change handler with state cleanup
  const handleRepChange = useCallback((rep: string) => {
    setRep(rep);
    setTransitionFilter(null);
    if (selectedState && rep && repStatesMap[rep] && !repStatesMap[rep].includes(selectedState)) {
      setState('');
    }
  }, [setRep, selectedState, repStatesMap, setState, setTransitionFilter]);

  // State change handler
  const handleStateChange = useCallback((state: string) => {
    setState(state);
    setTransitionFilter(null);
  }, [setState, setTransitionFilter]);

  // Status filter change
  const handleStatusFilterChange = useCallback((newStatus: string | null) => {
    setStatusFilter(newStatus);
    setTransitionFilter(null);
  }, [setStatusFilter, setTransitionFilter]);

  // Activity mode change
  const handleActivityModeChange = useCallback((mode: 'application' | 'approval' | 'booking') => {
    setActivityMode(mode);
    setStatusFilter(null);
    setTransitionFilter(null);
  }, [setActivityMode, setStatusFilter, setTransitionFilter]);

  // Transition filter change
  const handleTransitionFilterChange = useCallback((transition: string | null) => {
    setTransitionFilter(transition);
    if (transition) {
      setStatusFilter(null);
    }
  }, [setTransitionFilter, setStatusFilter]);

  // Tab change handler
  const handleTabChange = useCallback((tab: TabId) => {
    setTab(tab);
    const scope = scopeForTab(tab);
    if (scope) {
      pageRef.current = 1;
      sortStateRef.current = { sorts: ['apps'], dirs: ['desc'] };
      fetchDealers(1, ['apps'], ['desc'], false, statusFilter, scope, explicitStates);
    }
  }, [setTab, fetchDealers, statusFilter, explicitStates]);

  // Load more (infinite scroll)
  const handleLoadMore = useCallback(() => {
    if (smallDealersLoadingMore || !hasMore) return;
    const scope = scopeForTab(activeTab);
    if (!scope) return;
    const nextPage = pageRef.current + 1;
    fetchDealers(nextPage, sortStateRef.current.sorts, sortStateRef.current.dirs, true, statusFilter, scope, explicitStates);
  }, [smallDealersLoadingMore, hasMore, fetchDealers, activeTab, statusFilter, explicitStates]);

  // Sort change from DealerTable
  const handleDealerSortChange = useCallback(
    (sortKeys: string[], sortDirs: ('asc' | 'desc')[]) => {
      const scope = scopeForTab(activeTab);
      if (!scope) return;
      const serverKeys = sortKeys.map(k => SORT_KEY_MAP[k] || 'dealerName');
      sortStateRef.current = { sorts: serverKeys, dirs: sortDirs };
      pageRef.current = 1;
      fetchDealers(1, serverKeys, sortDirs, false, statusFilter, scope, explicitStates);
    },
    [fetchDealers, activeTab, statusFilter, explicitStates]
  );

  // Group locations fetching on expand
  const handleExpandGroup = useCallback(
    async (slug: string) => {
      if (groupLocations[slug]) return;
      try {
        const { locations } = await getGroupLocations(slug, startDate, endDate, trend);
        setGroupLocations((prev) => ({ ...prev, [slug]: locations }));
      } catch (err) {
        console.error(`Failed to load locations for ${slug}:`, err);
      }
    },
    [groupLocations, startDate, endDate, trend]
  );

  // Search handler
  const handleDealerSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
    },
    [setSearchQuery]
  );

  const smallDealerCount = useMemo(() => {
    if (!statusFilter) return totalSmallDealers || undefined;
    if (!dealerStatusBreakdown) return undefined;
    switch (statusFilter) {
      case 'active': return dealerStatusBreakdown.active;
      case '30d_inactive': return dealerStatusBreakdown.inactive30;
      case '60d_inactive': return dealerStatusBreakdown.inactive60;
      case 'long_inactive': return dealerStatusBreakdown.longInactive;
      default: return totalSmallDealers || undefined;
    }
  }, [statusFilter, totalSmallDealers, dealerStatusBreakdown]);

  const filteredSmallDealers = useMemo(() => {
    if (!statusFilter) return smallDealers;
    return smallDealers.filter((loc) => loc.latestSnapshot?.activityStatus === statusFilter);
  }, [smallDealers, statusFilter]);

  const filteredAllDealers = useMemo(() => {
    if (!statusFilter) return allDealers;
    return allDealers.filter((loc) => loc.latestSnapshot?.activityStatus === statusFilter);
  }, [allDealers, statusFilter]);

  const handleRepStateChange = useCallback((rep: string, state: string) => {
    setRep(rep);
    setState(state);
    setTransitionFilter(null);
  }, [setRep, setState, setTransitionFilter]);

  const [drawerUnderwriter, setDrawerUnderwriter] = useState<string | null>(null);
  const [drawerStartDate, setDrawerStartDate] = useState<string | null>(null);
  const [drawerEndDate, setDrawerEndDate] = useState<string | null>(null);
  const [drawerDatePreset, setDrawerDatePreset] = useState<string | null>(null);

  const handleSelectUnderwriter = useCallback((underwriterName: string, dateRange?: UnderwriterDateRange) => {
    setDrawerDealerId('all');
    setDrawerGroupSlug(null);
    setDrawerTab('applications');
    setDrawerUnderwriter(underwriterName);
    setDrawerStartDate(dateRange?.startDate || null);
    setDrawerEndDate(dateRange?.endDate || null);
    setDrawerDatePreset(dateRange?.preset || 'all');
    setDrawerOpen(true);
  }, []);

  // Selected dealer row from table (for sticky live stats & trends)
  const selectedDealerTableRow = useMemo(() => {
    if (!drawerDealerId || drawerDealerId === 'all') return null;
    let found = smallDealers.find(
      (d) => d._id === drawerDealerId || d.dealerId === drawerDealerId || d.clientDealerId === drawerDealerId
    );
    if (!found) {
      found = allDealers.find(
        (d) => d._id === drawerDealerId || d.dealerId === drawerDealerId || d.clientDealerId === drawerDealerId
      );
    }
    if (!found) {
      for (const locs of Object.values(groupLocations)) {
        found = locs.find(
          (d) => d._id === drawerDealerId || d.dealerId === drawerDealerId || d.clientDealerId === drawerDealerId
        );
        if (found) break;
      }
    }
    return found || null;
  }, [drawerDealerId, smallDealers, allDealers, groupLocations]);

  return (
    <AppShell
      rollingWindow={rollingWindow}
      onRollingWindowChange={setRollingWindow}
      onOpenMoMAnalytics={handleOpenTopMoMDrawer}
      onOpenVisitImpact={() => setVisitImpactOpen(true)}
      latestReportDate={overview?.latestReportDate}
      activityMode={activityMode}
      onActivityModeChange={handleActivityModeChange}
      onSelectRep={handleRepChange}
      onSelectRepState={handleRepStateChange}
      onSelectUnderwriter={handleSelectUnderwriter}
    >
      <div style={{ marginBottom: '16px' }}>
        <TabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          groupCount={groups.length || undefined}
          dealerCount={smallDealerCount}
          allDealerCount={totalAllDealers || overview?.totalDealers}
        />
        {(Object.keys(stateRepMap).length > 0 || repMappings) && (
          <FilterBar
            stateRepMap={stateRepMap}
            budgets={budgets}
            filteredGroups={stateFilteredGroups}
            mode={activeTab}
            dealerStatusBreakdown={dealerStatusBreakdown}
            selectedRep={selectedRep}
            selectedState={selectedState}
            statusFilter={statusFilter}
            drdFilter={drdFilter}
            activityMode={activityMode}
            onRepChange={handleRepChange}
            onStateChange={handleStateChange}
            onStatusFilterChange={handleStatusFilterChange}
            onDrdFilterChange={setDrdFilter}
            onActivityModeChange={handleActivityModeChange}
            repHeatMap={repHeatMap}
            statusTransitions={statusTransitions}
            transitionFilter={transitionFilter}
            onTransitionFilterChange={handleTransitionFilterChange}
            repStatesMap={repStatesMap}
          />
        )}
      </div>

      {/* Executive Summary Banner */}
      <ExecutiveSummaryBanner
        startDate={startDate}
        endDate={endDate}
        trend={trend}
        state={selectedState}
        rep={selectedRep}
        status={statusFilter}
        drd={drdFilter}
      />

      <DealerTable
        mode={activeTab}
        groups={filteredGroups}
        groupLocations={groupLocations}
        smallDealers={activeTab === 'all' ? filteredAllDealers : filteredSmallDealers}
        isLoading={activeTab === 'groups' ? groupsLoading : smallDealersLoading}
        isLoadingMore={smallDealersLoadingMore}
        hasMore={hasMore}
        statusFilter={statusFilter}
        activityMode={activityMode}
        stateRepMap={stateRepMap}
        datePreset={datePreset}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        maxReportDate={overview?.latestReportDate}
        onExpandGroup={handleExpandGroup}
        onLoadMore={handleLoadMore}
        onDealerSortChange={handleDealerSortChange}
        onDealerSearch={handleDealerSearch}
        onSelectDealer={handleOpenDealerDrawer}
        onSelectGroup={handleOpenGroupDrawer}
        onDatePresetChange={setDatePreset}
        onCustomDateChange={setCustomDates}
        onTrendChange={setTrend}
        comparisonLabel={comparisonLabel}
      />

      {/* Unified Tabbed Historical MoM & Application History Drawer */}
      <AnalyticsDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        availableStates={repMappings?.allStates || Object.keys(stateRepMap)}
        availableGroups={repMappings?.allGroups || groups.map((g) => ({ name: g.name, slug: g.slug }))}
        repMappings={repMappings}
        repStatesMap={repStatesMap}
        initialDealerId={drawerDealerId}
        initialGroupSlug={drawerGroupSlug}
        initialUnderwriter={drawerUnderwriter}
        initialStartDate={drawerStartDate}
        initialEndDate={drawerEndDate}
        initialDatePreset={drawerDatePreset}
        initialTab={drawerTab}
        tableRowData={selectedDealerTableRow}
        comparisonLabel={comparisonLabel}
        datePresetLabel={datePreset}
        dateRangeStr={startDate && endDate ? `${startDate} to ${endDate}` : undefined}
        allTableDealers={activeTab === 'all' ? allDealers : smallDealers}
        onSelectDealerId={setDrawerDealerId}
        onSelectGroupSlug={setDrawerGroupSlug}
      />

      {/* Sales Visit & Touchpoint Impact Diagnostic Drawer */}
      <VisitImpactDrawer
        open={visitImpactOpen}
        onClose={() => setVisitImpactOpen(false)}
      />
    </AppShell>
  );
}

export function Dashboard() {
  return (
    <AnalyticsProvider>
      <DashboardContent />
    </AnalyticsProvider>
  );
}
