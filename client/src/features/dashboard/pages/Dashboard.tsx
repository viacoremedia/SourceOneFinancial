/**
 * Dashboard — Main page component that composes all dashboard widgets.
 * StatsBar + FilterBar + TabBar + DealerTable with server-side sort + infinite scroll.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AppShell } from '../../../core/components/AppShell';
import { TabBar, type TabId } from '../components/TabBar';
import { FilterBar } from '../components/FilterBar';
import { DealerTable } from '../components/DealerTable';
import { useOverview, useDealerGroups } from '../hooks';
import { getGroupLocations, getSmallDealers, getStateRepMap, getBudgetByState } from '../../../core/services/api';
import type { StateRepMap, StateBudget } from '../../../core/services/api';
import type { DealerLocation } from '../types';

// Map frontend sort keys to server sort keys
const SORT_KEY_MAP: Record<string, string> = {
  name: 'dealerName',
  daysSinceLastApplication: 'daysSinceLastApplication',
  daysSinceLastApproval: 'daysSinceLastApproval',
  daysSinceLastBooking: 'daysSinceLastBooking',
  activityStatus: 'activityStatus',
};

export function Dashboard() {
  const { data: overview, isLoading: overviewLoading } = useOverview();

  const [activeTab, setActiveTab] = useState<TabId>('groups');
  const [groupLocations, setGroupLocations] = useState<
    Record<string, DealerLocation[]>
  >({});

  // ── Filter state ──
  const [stateRepMap, setStateRepMap] = useState<StateRepMap>({});
  const [budgets, setBudgets] = useState<StateBudget[]>([]);
  const [selectedRep, setSelectedRep] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

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

  // Fetch groups — re-fetches when targetStates changes (server recalculates summaries)
  const { groups, isLoading: groupsLoading } = useDealerGroups(targetStates);

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
        case 'reactivated': return g.summary.reactivatedCount > 0;
        default: return true;
      }
    });
  }, [stateFilteredGroups, statusFilter]);

  // ── Independent dealers state (paginated) ──
  const [smallDealers, setSmallDealers] = useState<DealerLocation[]>([]);
  const [smallDealersLoading, setSmallDealersLoading] = useState(false);
  const [smallDealersLoadingMore, setSmallDealersLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalSmallDealers, setTotalSmallDealers] = useState(0);
  const pageRef = useRef(1);
  const sortStateRef = useRef({ sort: 'dealerName', dir: 'asc' as 'asc' | 'desc' });

  // Fetch a page of small dealers
  const fetchSmallDealers = useCallback(
    async (page: number, sort: string, dir: 'asc' | 'desc', append: boolean) => {
      if (page === 1) {
        setSmallDealersLoading(true);
      } else {
        setSmallDealersLoadingMore(true);
      }
      try {
        const result = await getSmallDealers({ sort, dir, page, limit: 50 });
        if (append) {
          setSmallDealers((prev) => [...prev, ...result.dealers]);
        } else {
          setSmallDealers(result.dealers);
        }
        setHasMore(result.pagination.hasMore);
        setTotalSmallDealers(result.pagination.totalCount);
        pageRef.current = page;
      } catch (err) {
        console.error('Failed to load small dealers:', err);
      } finally {
        setSmallDealersLoading(false);
        setSmallDealersLoadingMore(false);
      }
    },
    []
  );

  // Load first page when tab activates
  useEffect(() => {
    if (activeTab === 'dealers' && smallDealers.length === 0 && !smallDealersLoading) {
      fetchSmallDealers(1, sortStateRef.current.sort, sortStateRef.current.dir, false);
    }
  }, [activeTab, smallDealers.length, smallDealersLoading, fetchSmallDealers]);

  // Load more (infinite scroll)
  const handleLoadMore = useCallback(() => {
    if (smallDealersLoadingMore || !hasMore) return;
    const nextPage = pageRef.current + 1;
    fetchSmallDealers(nextPage, sortStateRef.current.sort, sortStateRef.current.dir, true);
  }, [smallDealersLoadingMore, hasMore, fetchSmallDealers]);

  // Sort change from DealerTable — re-fetch from page 1
  const handleDealerSortChange = useCallback(
    (sortKey: string, sortDir: 'asc' | 'desc') => {
      const serverKey = SORT_KEY_MAP[sortKey] || 'dealerName';
      sortStateRef.current = { sort: serverKey, dir: sortDir };
      pageRef.current = 1;
      fetchSmallDealers(1, serverKey, sortDir, false);
    },
    [fetchSmallDealers]
  );

  // Filter small dealers by rep/state (client-side since already loaded)
  const filteredSmallDealers = useMemo(() => {
    if (!selectedRep && !selectedState) return smallDealers;

    const targetStates: Set<string> = new Set();
    if (selectedState) {
      targetStates.add(selectedState);
    } else if (selectedRep && repStatesMap[selectedRep]) {
      repStatesMap[selectedRep].forEach((s) => targetStates.add(s));
    }

    if (targetStates.size === 0 && !statusFilter) return smallDealers;

    let result = smallDealers;
    if (targetStates.size > 0) {
      result = result.filter((d) => d.statePrefix && targetStates.has(d.statePrefix));
    }
    if (statusFilter) {
      result = result.filter((d) => {
        if (!d.latestSnapshot) return false;
        if (statusFilter === 'reactivated') return d.latestSnapshot.reactivatedAfterVisit;
        return d.latestSnapshot.activityStatus === statusFilter;
      });
    }
    return result;
  }, [smallDealers, selectedRep, selectedState, repStatesMap, statusFilter]);

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

    const filtered: Record<string, DealerLocation[]> = {};
    for (const [slug, locs] of Object.entries(groupLocations)) {
      let result = locs;
      if (targetStates.size > 0) {
        result = result.filter((loc) => loc.statePrefix && targetStates.has(loc.statePrefix));
      }
      if (statusFilter) {
        result = result.filter((loc) => {
          if (!loc.latestSnapshot) return false;
          if (statusFilter === 'reactivated') return loc.latestSnapshot.reactivatedAfterVisit;
          return loc.latestSnapshot.activityStatus === statusFilter;
        });
      }
      filtered[slug] = result;
    }
    return filtered;
  }, [groupLocations, selectedRep, selectedState, repStatesMap, statusFilter]);

  const smallDealerCount = totalSmallDealers || (overview
    ? overview.totalDealers - groups.reduce((sum, g) => sum + g.dealerCount, 0)
    : undefined);

  return (
    <AppShell latestReportDate={overview?.latestReportDate}>

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
          onTabChange={setActiveTab}
          groupCount={groups.length || undefined}
          dealerCount={smallDealerCount}
        />
        {Object.keys(stateRepMap).length > 0 && (
          <FilterBar
            stateRepMap={stateRepMap}
            budgets={budgets}
            filteredGroups={stateFilteredGroups}
            selectedRep={selectedRep}
            selectedState={selectedState}
            statusFilter={statusFilter}
            onRepChange={setSelectedRep}
            onStateChange={setSelectedState}
            onStatusFilterChange={setStatusFilter}
          />
        )}
      </div>

      <DealerTable
        mode={activeTab}
        groups={filteredGroups}
        groupLocations={filteredGroupLocations}
        smallDealers={filteredSmallDealers}
        isLoading={activeTab === 'groups' ? groupsLoading : smallDealersLoading}
        isLoadingMore={smallDealersLoadingMore}
        hasMore={hasMore}
        statusFilter={statusFilter}
        onExpandGroup={handleExpandGroup}
        onLoadMore={handleLoadMore}
        onDealerSortChange={handleDealerSortChange}
      />
    </AppShell>
  );
}
