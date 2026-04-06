/**
 * Dashboard — Main page component that composes all dashboard widgets.
 * StatsBar + FilterBar + TabBar + DealerTable with server-side sort + infinite scroll.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AppShell } from '../../../core/components/AppShell';
import { StatsBar } from '../components/StatsBar';
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
  const { groups, isLoading: groupsLoading } = useDealerGroups();

  const [activeTab, setActiveTab] = useState<TabId>('groups');
  const [groupLocations, setGroupLocations] = useState<
    Record<string, DealerLocation[]>
  >({});

  // ── Filter state ──
  const [stateRepMap, setStateRepMap] = useState<StateRepMap>({});
  const [budgets, setBudgets] = useState<StateBudget[]>([]);
  const [selectedRep, setSelectedRep] = useState('');
  const [selectedState, setSelectedState] = useState('');

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

  // Filter groups by rep/state
  const filteredGroups = useMemo(() => {
    if (!selectedRep && !selectedState) return groups;

    const targetStates: Set<string> = new Set();
    if (selectedState) {
      targetStates.add(selectedState);
    } else if (selectedRep && repStatesMap[selectedRep]) {
      repStatesMap[selectedRep].forEach((s) => targetStates.add(s));
    }

    if (targetStates.size === 0) return groups;

    return groups.filter((g) => {
      if (!g.states || g.states.length === 0) return false;
      return g.states.some((s) => targetStates.has(s));
    });
  }, [groups, selectedRep, selectedState, repStatesMap]);

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

    if (targetStates.size === 0) return smallDealers;

    return smallDealers.filter((d) => d.statePrefix && targetStates.has(d.statePrefix));
  }, [smallDealers, selectedRep, selectedState, repStatesMap]);

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

  // Filter child locations by rep/state (so expanded groups only show relevant locations)
  const filteredGroupLocations = useMemo(() => {
    if (!selectedRep && !selectedState) return groupLocations;

    const targetStates: Set<string> = new Set();
    if (selectedState) {
      targetStates.add(selectedState);
    } else if (selectedRep && repStatesMap[selectedRep]) {
      repStatesMap[selectedRep].forEach((s) => targetStates.add(s));
    }
    if (targetStates.size === 0) return groupLocations;

    const filtered: Record<string, DealerLocation[]> = {};
    for (const [slug, locs] of Object.entries(groupLocations)) {
      filtered[slug] = locs.filter((loc) => loc.statePrefix && targetStates.has(loc.statePrefix));
    }
    return filtered;
  }, [groupLocations, selectedRep, selectedState, repStatesMap]);

  const smallDealerCount = totalSmallDealers || (overview
    ? overview.totalDealers - groups.reduce((sum, g) => sum + g.dealerCount, 0)
    : undefined);

  return (
    <AppShell latestReportDate={overview?.latestReportDate}>
      <StatsBar data={overview} isLoading={overviewLoading} />

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
            selectedRep={selectedRep}
            selectedState={selectedState}
            onRepChange={setSelectedRep}
            onStateChange={setSelectedState}
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
        onExpandGroup={handleExpandGroup}
        onLoadMore={handleLoadMore}
        onDealerSortChange={handleDealerSortChange}
      />
    </AppShell>
  );
}
