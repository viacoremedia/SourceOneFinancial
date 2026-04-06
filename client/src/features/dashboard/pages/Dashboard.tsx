/**
 * Dashboard — Main page component that composes all dashboard widgets.
 * This is the single-page view: StatsBar + TabBar + DealerTable.
 */

import { useState, useCallback, useEffect } from 'react';
import { AppShell } from '../../../core/components/AppShell';
import { StatsBar } from '../components/StatsBar';
import { TabBar, type TabId } from '../components/TabBar';
import { DealerTable } from '../components/DealerTable';
import { useOverview, useDealerGroups } from '../hooks';
import { getGroupLocations, getSmallDealers } from '../../../core/services/api';
import type { DealerLocation } from '../types';

export function Dashboard() {
  const { data: overview, isLoading: overviewLoading } = useOverview();
  const { groups, isLoading: groupsLoading } = useDealerGroups();

  const [activeTab, setActiveTab] = useState<TabId>('groups');
  const [groupLocations, setGroupLocations] = useState<
    Record<string, DealerLocation[]>
  >({});
  const [smallDealers, setSmallDealers] = useState<DealerLocation[]>([]);
  const [smallDealersLoading, setSmallDealersLoading] = useState(false);
  const [smallDealersFetched, setSmallDealersFetched] = useState(false);

  // Load small dealers when "All Dealers" tab is first activated
  useEffect(() => {
    if (activeTab === 'dealers' && !smallDealersFetched) {
      setSmallDealersLoading(true);
      getSmallDealers()
        .then((dealers) => {
          setSmallDealers(dealers);
          setSmallDealersFetched(true);
        })
        .catch((err) => {
          console.error('Failed to load small dealers:', err);
        })
        .finally(() => {
          setSmallDealersLoading(false);
        });
    }
  }, [activeTab, smallDealersFetched]);

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

  // Count small dealers
  const smallDealerCount = overview
    ? overview.totalDealers -
      groups.reduce((sum, g) => sum + g.dealerCount, 0)
    : undefined;

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
      </div>

      <DealerTable
        mode={activeTab}
        groups={groups}
        groupLocations={groupLocations}
        smallDealers={smallDealers}
        isLoading={
          activeTab === 'groups' ? groupsLoading : smallDealersLoading
        }
        onExpandGroup={handleExpandGroup}
      />
    </AppShell>
  );
}
