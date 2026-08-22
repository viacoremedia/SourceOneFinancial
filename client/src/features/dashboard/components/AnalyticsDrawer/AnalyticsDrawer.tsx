import { useEffect, useState, useMemo, useRef } from 'react';
import { useAnalyticsContext } from '../../../../core/contexts/AnalyticsContext';
import {
  getHistoricalMoM,
  getDealerApplicationsHistory,
  searchDealers,
  getRepCommunicationHistory,
  getUnderwriterScorecardApi
} from '../../../../core/services/api';
import type { RepMappings, RepCommunicationHistoryResponse } from '../../../../core/services/api';
import type {
  HistoricalMoMItem,
  HistoricalMoMResponse,
  MetricTrend,
  DealerApplicationHistoryResponse,
  ApplicationHistoryItem
} from '../../types';
import { ApplicationDetailDrawer } from '../ApplicationDetailDrawer/ApplicationDetailDrawer';
import { CommunicationDetailModal, type CommunicationDetailItem } from '../../../../components/CommunicationDetailModal/CommunicationDetailModal';
import styles from './AnalyticsDrawer.module.css';

interface AnalyticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  availableStates?: string[];
  availableGroups?: { name: string; slug: string }[];
  repMappings?: RepMappings | null;
  repStatesMap?: Record<string, string[]>;
  initialDealerId?: string | null;
  initialGroupSlug?: string | null;
  initialUnderwriter?: string | null;
  initialStartDate?: string | null;
  initialEndDate?: string | null;
  initialDatePreset?: string | null;
  initialTab?: 'mom' | 'applications' | 'communications';
  onSelectDealerId?: (dealerId: string | null) => void;
  onSelectGroupSlug?: (groupSlug: string | null) => void;
}

function formatCurrency(val: number): string {
  if (Math.abs(val) >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(val) >= 1_000) {
    return `$${(val / 1_000).toFixed(1)}k`;
  }
  return `$${val.toLocaleString()}`;
}

function renderBadge(trendObj?: MetricTrend) {
  if (!trendObj) return null;
  const { pct } = trendObj;
  if (pct == null || pct === 0) return null;
  const isUp = pct > 0;
  const trendClass = isUp ? styles.trendUp : styles.trendDown;
  const arrow = isUp ? '↑' : '↓';
  const sign = isUp ? '+' : '';
  return (
    <span className={`${styles.trendTag} ${trendClass}`}>
      {arrow} {sign}{pct}%
    </span>
  );
}

export function AnalyticsDrawer({
  isOpen,
  onClose,
  availableStates = [],
  availableGroups = [],
  repMappings = null,
  repStatesMap = {},
  initialDealerId = null,
  initialGroupSlug = null,
  initialUnderwriter = null,
  initialStartDate = null,
  initialEndDate = null,
  initialDatePreset = null,
  initialTab = 'mom',
  onSelectDealerId,
  onSelectGroupSlug,
}: AnalyticsDrawerProps) {
  const { openDealer360 } = useAnalyticsContext();
  // Active Tab: 'mom' | 'applications' | 'communications'
  const [activeTab, setActiveTab] = useState<'mom' | 'applications' | 'communications'>(initialTab);

  // Selected Dealer Filter (ID or Mongo _id)
  const [selectedDealerId, setSelectedDealerId] = useState<string | null>(initialDealerId);
  const [selectedUnderwriter, setSelectedUnderwriter] = useState<string>(initialUnderwriter || '');
  const [appStartDate, setAppStartDate] = useState<string>(initialStartDate || '');
  const [appEndDate, setAppEndDate] = useState<string>(initialEndDate || '');
  const [appDatePreset, setAppDatePreset] = useState<string>(initialDatePreset || 'all');
  const [underwriterList, setUnderwriterList] = useState<string[]>([]);
  const [selectedDealerObj, setSelectedDealerObj] = useState<{
    _id: string;
    dealerName: string;
    dealerId: string;
    clientDealerId: string;
    statePrefix: string;
  } | null>(null);

  // Search dropdown state for dealers
  const [dealerSearchOpen, setDealerSearchOpen] = useState(false);
  const [dealerSearchQuery, setDealerSearchQuery] = useState('');
  const [dealerSearchResults, setDealerSearchResults] = useState<Array<{
    _id: string;
    dealerName: string;
    dealerId: string;
    clientDealerId: string;
    statePrefix: string;
  }>>([]);

  // Historical MoM State
  const [data, setData] = useState<HistoricalMoMResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [trendMode, setTrendMode] = useState<'mom' | 'yoy'>('mom');
  const [timeframeMode, setTimeframeMode] = useState<'all' | 'ytd'>('all');
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedRep, setSelectedRep] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string>(initialGroupSlug || '');

  // Application History State
  const [appHistoryData, setAppHistoryData] = useState<DealerApplicationHistoryResponse | null>(null);
  const [appHistoryLoading, setAppHistoryLoading] = useState(false);
  const [appHistoryPage, setAppHistoryPage] = useState(1);

  // Communication History State
  const [commHistoryData, setCommHistoryData] = useState<RepCommunicationHistoryResponse | null>(null);
  const [commHistoryLoading, setCommHistoryLoading] = useState(false);
  const [commHistoryPage, setCommHistoryPage] = useState(1);
  const [commTypeFilter, setCommTypeFilter] = useState<'all' | 'visit' | 'call' | 'email'>('all');

  // Application Detail Drawer State
  const [selectedAppDetail, setSelectedAppDetail] = useState<ApplicationHistoryItem | null>(null);
  const [selectedCommDetail, setSelectedCommDetail] = useState<CommunicationDetailItem | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch underwriter list for filter dropdown
  useEffect(() => {
    if (isOpen) {
      getUnderwriterScorecardApi()
        .then((res) => {
          if (res?.underwriters) {
            const list = res.underwriters.map((u: any) => u.underwriter).filter(Boolean).sort();
            setUnderwriterList(list);
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  // Sync initial props whenever drawer opens or props change
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSelectedDealerId(initialDealerId);
      if (initialUnderwriter != null) {
        setSelectedUnderwriter(initialUnderwriter);
      }
      if (initialStartDate !== undefined) {
        setAppStartDate(initialStartDate || '');
      }
      if (initialEndDate !== undefined) {
        setAppEndDate(initialEndDate || '');
      }
      if (initialDatePreset) {
        setAppDatePreset(initialDatePreset);
      }
      if (!initialDealerId) {
        setSelectedDealerObj(null);
      }
      setSelectedGroup(initialGroupSlug || '');
      setAppHistoryPage(1);
      setAppHistoryData(null);
      setCommHistoryPage(1);
      setCommHistoryData(null);
    }
  }, [isOpen, initialDealerId, initialGroupSlug, initialUnderwriter, initialStartDate, initialEndDate, initialDatePreset, initialTab]);

  const handleAppDatePresetChange = (preset: string) => {
    setAppDatePreset(preset);
    setAppHistoryPage(1);
    const now = new Date();
    if (preset === 'all') {
      setAppStartDate('');
      setAppEndDate('');
    } else if (preset === 'mtd') {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      setAppStartDate(start.toISOString().split('T')[0]);
      setAppEndDate(now.toISOString().split('T')[0]);
    } else if (preset === '30d') {
      const start = new Date(now.getTime() - 30 * 86400 * 1000);
      setAppStartDate(start.toISOString().split('T')[0]);
      setAppEndDate(now.toISOString().split('T')[0]);
    } else if (preset === '90d') {
      const start = new Date(now.getTime() - 90 * 86400 * 1000);
      setAppStartDate(start.toISOString().split('T')[0]);
      setAppEndDate(now.toISOString().split('T')[0]);
    } else if (preset === 'ytd') {
      const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      setAppStartDate(start.toISOString().split('T')[0]);
      setAppEndDate(now.toISOString().split('T')[0]);
    }
  };

  // Click outside to close dealer search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDealerSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search dealers when query changes
  useEffect(() => {
    if (!dealerSearchOpen) return;
    let active = true;
    const timer = setTimeout(() => {
      searchDealers(dealerSearchQuery, 50).then((res) => {
        if (active && res?.dealers) {
          setDealerSearchResults(res.dealers);
        }
      }).catch(console.error);
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [dealerSearchQuery, dealerSearchOpen]);

  // Load Historical MoM data
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let active = true;
    setIsLoading(true);
    setData(null);
    getHistoricalMoM(
      trendMode,
      selectedState || undefined,
      selectedRep || undefined,
      selectedGroup || undefined,
      selectedDealerId || undefined
    )
      .then((res) => {
        if (active) {
          setData(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load historical MoM analytics:', err);
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, trendMode, selectedState, selectedRep, selectedGroup, selectedDealerId]);

  // Load Application History data when target, filters or page changes
  useEffect(() => {
    if (!isOpen) return;
    const targetId = selectedDealerId || selectedGroup || 'all';

    let active = true;
    setAppHistoryLoading(true);

    getDealerApplicationsHistory(
      targetId,
      appHistoryPage,
      15,
      selectedState || undefined,
      selectedRep || undefined,
      selectedGroup || undefined,
      selectedUnderwriter || undefined
    )
      .then((res) => {
        if (active) {
          setAppHistoryData(res);
          if (res.location && selectedDealerId) {
            setSelectedDealerObj(res.location);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load application history:', err);
      })
      .finally(() => {
        if (active) setAppHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, selectedDealerId, selectedGroup, selectedState, selectedRep, selectedUnderwriter, appHistoryPage]);

  // Load Communication History data when target, filters or page changes
  useEffect(() => {
    if (!isOpen || activeTab !== 'communications') return;

    let active = true;
    setCommHistoryLoading(true);

    getRepCommunicationHistory({
      dealerId: selectedDealerId || undefined,
      groupSlug: selectedGroup || undefined,
      state: selectedState || undefined,
      rep: selectedRep || undefined,
      type: commTypeFilter === 'all' ? undefined : commTypeFilter,
      page: commHistoryPage,
      limit: 15,
    })
      .then((res) => {
        if (active) setCommHistoryData(res);
      })
      .catch((err) => {
        console.error('Failed to load communication history:', err);
      })
      .finally(() => {
        if (active) setCommHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, activeTab, selectedDealerId, selectedGroup, selectedState, selectedRep, commTypeFilter, commHistoryPage]);

  // Rep list
  const repList = useMemo(() => {
    const budgetReps = Object.keys(repStatesMap);
    if (budgetReps.length > 0) return budgetReps.sort();
    if (repMappings?.allReps && repMappings.allReps.length > 0) return repMappings.allReps;
    return ['Bruce', 'George', 'Janet', 'Jeff', 'John', 'Pam/Ward', 'Steve', 'Mandi', 'Tony'];
  }, [repStatesMap, repMappings]);

  // Filtered states
  const filteredStates = useMemo(() => {
    if (selectedRep && repStatesMap[selectedRep]) {
      return [...repStatesMap[selectedRep]].sort();
    }
    return availableStates;
  }, [selectedRep, repStatesMap, availableStates]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (selectedRep && repMappings?.repGroups?.[selectedRep]) {
      return repMappings.repGroups[selectedRep];
    }
    return availableGroups;
  }, [selectedRep, repMappings, availableGroups]);

  // Derived Group Name
  const groupName = useMemo(() => {
    if (!selectedGroup) return null;
    const matched = availableGroups.find((g) => g.slug === selectedGroup);
    return matched ? matched.name : selectedGroup;
  }, [selectedGroup, availableGroups]);

  const handleSelectDealer = (dealer: { _id: string; dealerName: string; dealerId: string; clientDealerId: string; statePrefix: string } | null) => {
    if (!dealer) {
      setSelectedDealerId(null);
      setSelectedDealerObj(null);
      onSelectDealerId?.(null);
    } else {
      setSelectedDealerId(dealer.dealerId || dealer._id);
      setSelectedDealerObj(dealer);
      onSelectDealerId?.(dealer.dealerId || dealer._id);
    }
    setDealerSearchOpen(false);
    setAppHistoryPage(1);
  };

  const handleClearDealer = () => {
    setSelectedDealerId(null);
    setSelectedDealerObj(null);
    onSelectDealerId?.(null);
  };

  // Header Title & Location derivation
  const isDealerSelected = Boolean(selectedDealerId && selectedDealerId !== 'all');
  const isGroupSelected = Boolean(selectedGroup);
  const headerLocation = isDealerSelected ? (selectedDealerObj || appHistoryData?.location) : null;

  const headerTitle = isDealerSelected
    ? (headerLocation?.dealerName || selectedDealerObj?.dealerName || selectedDealerId)
    : isGroupSelected
    ? `Group: ${groupName}`
    : selectedUnderwriter
    ? `Underwriter Applications: ${selectedUnderwriter}`
    : 'Network Historical Analytics';

  if (!isOpen) return null;

  const months = data?.months || [];
  const displayedMonths = timeframeMode === 'ytd' ? months.filter((m) => m.year === 2026) : months;

  // Aggregate Totals across current items displayed in table/chart
  const totals = {
    apps: displayedMonths.reduce((acc, m) => acc + (m.stats?.apps || 0), 0),
    approvals: displayedMonths.reduce((acc, m) => acc + (m.stats?.approvals || 0), 0),
    leadBooked: displayedMonths.reduce((acc, m) => acc + (m.stats?.leadBooked || 0), 0),
    leadBookedDollars: displayedMonths.reduce((acc, m) => acc + (m.stats?.leadBookedDollars || 0), 0),
    booked: displayedMonths.reduce((acc, m) => acc + (m.stats?.closeBooked || m.stats?.booked || 0), 0),
    bookedDollars: displayedMonths.reduce((acc, m) => acc + (m.stats?.closeBookedDollars || m.stats?.bookedDollars || 0), 0),
    lookToBook: displayedMonths.reduce((acc, m) => acc + (m.stats?.apps || 0), 0) > 0
      ? displayedMonths.reduce((acc, m) => acc + (m.stats?.leadBooked || m.stats?.booked || 0), 0) / displayedMonths.reduce((acc, m) => acc + (m.stats?.apps || 0), 0)
      : 0,
    approvalToBook: displayedMonths.reduce((acc, m) => acc + (m.stats?.approvals || 0), 0) > 0
      ? displayedMonths.reduce((acc, m) => acc + (m.stats?.leadBooked || m.stats?.booked || 0), 0) / displayedMonths.reduce((acc, m) => acc + (m.stats?.approvals || 0), 0)
      : 0,
    latestCohort: displayedMonths.length > 0 ? displayedMonths[displayedMonths.length - 1].cohorts : null,
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className="mobileDragHandleRow">
          <div className="mobileDragHandle" />
        </div>

        {/* Drawer Header */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <div>
              <h2 className={styles.title}>{headerTitle}</h2>
              {isDealerSelected && headerLocation && (
                <div className={styles.metaRow}>
                  {headerLocation.dealerId && <span className={styles.badge}>ID: {headerLocation.dealerId}</span>}
                  {headerLocation.statePrefix && <span className={styles.badge}>{headerLocation.statePrefix}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Header Tab Buttons */}
          <div className={styles.drawerTabs}>
            <button
              className={`${styles.tabBtn} ${activeTab === 'mom' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('mom')}
            >
              📈 Historical MoM
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'applications' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('applications')}
            >
              📋 Application History
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'communications' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('communications')}
            >
              📍 Communication History
            </button>
          </div>

          <button className={styles.closeBtn} onClick={onClose} aria-label="Close drawer">
            ✕
          </button>
        </div>

        {/* TAB 1: HISTORICAL MOM */}
        {activeTab === 'mom' && (
          <>
            {/* Filter Controls Header */}
            <div className={styles.filterControls}>
              {/* Timeframe Scope Toggle */}
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Timeframe:</span>
                <div className={styles.trendToggle}>
                  <button
                    className={`${styles.toggleBtn} ${timeframeMode === 'all' ? styles.toggleActive : ''}`}
                    onClick={() => setTimeframeMode('all')}
                  >
                    All Months (2025-Present)
                  </button>
                  <button
                    className={`${styles.toggleBtn} ${timeframeMode === 'ytd' ? styles.toggleActive : ''}`}
                    onClick={() => setTimeframeMode('ytd')}
                  >
                    YTD Only (2026)
                  </button>
                </div>
              </div>

              {/* Trend Mode Toggle */}
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Trend Mode:</span>
                <div className={styles.trendToggle}>
                  <button
                    className={`${styles.toggleBtn} ${trendMode === 'mom' ? styles.toggleActive : ''}`}
                    onClick={() => setTrendMode('mom')}
                  >
                    Period-over-Period (MoM)
                  </button>
                  <button
                    className={`${styles.toggleBtn} ${trendMode === 'yoy' ? styles.toggleActive : ''}`}
                    onClick={() => setTrendMode('yoy')}
                  >
                    vs Last Year (YoY)
                  </button>
                </div>
              </div>

              {/* State Filter */}
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>State:</span>
                <select
                  className={styles.selectInput}
                  value={selectedState || ''}
                  onChange={(e) => setSelectedState(e.target.value)}
                >
                  <option value="">All States</option>
                  {filteredStates.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sales Rep Filter */}
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Sales Rep:</span>
                <select
                  className={styles.selectInput}
                  value={selectedRep || ''}
                  onChange={(e) => setSelectedRep(e.target.value)}
                >
                  <option value="">All Reps</option>
                  {repList.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dealer Group Filter */}
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Dealer Group:</span>
                <select
                  className={styles.selectInput}
                  value={selectedGroup || ''}
                  onChange={(e) => {
                    setSelectedGroup(e.target.value);
                    onSelectGroupSlug?.(e.target.value || null);
                  }}
                >
                  <option value="">All Groups</option>
                  {filteredGroups.map((g) => (
                    <option key={g.slug} value={g.slug}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* NEW: Searchable Dealer Selector Filter */}
              <div className={styles.filterGroup} ref={dropdownRef}>
                <span className={styles.filterLabel}>Dealer:</span>
                <button
                  className={styles.dealerSelectBtn}
                  onClick={() => {
                    setDealerSearchOpen(!dealerSearchOpen);
                    if (!dealerSearchOpen) {
                      searchDealers('', 50).then((res) => {
                        if (res?.dealers) setDealerSearchResults(res.dealers);
                      }).catch(console.error);
                    }
                  }}
                >
                  <span>{selectedDealerId ? (selectedDealerObj?.dealerName || selectedDealerId) : 'All Dealers (Search...)'}</span>
                  {selectedDealerId ? (
                    <span
                      className={styles.clearDealerBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearDealer();
                      }}
                      title="Clear dealer selection"
                    >
                      ✕
                    </span>
                  ) : (
                    <span style={{ fontSize: '10px', marginLeft: '4px' }}>▼</span>
                  )}
                </button>

                {/* Dealer Search Menu Popup */}
                {dealerSearchOpen && (
                  <div className={styles.searchMenu}>
                    <div className={styles.searchHeader}>
                      <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search 3k+ dealers by name or ID..."
                        value={dealerSearchQuery || ''}
                        onChange={(e) => setDealerSearchQuery(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className={styles.searchList}>
                      <div
                        className={`${styles.searchOption} ${!selectedDealerId ? styles.searchOptionSelected : ''}`}
                        onClick={() => handleSelectDealer(null)}
                      >
                        <span>All Dealers</span>
                      </div>
                      {dealerSearchResults.map((dlr) => (
                        <div
                          key={dlr._id}
                          className={`${styles.searchOption} ${selectedDealerId === dlr.dealerId || selectedDealerId === dlr._id ? styles.searchOptionSelected : ''}`}
                          onClick={() => handleSelectDealer(dlr)}
                        >
                          <div>
                            <div>{dlr.dealerName}</div>
                            <span className={styles.optionMeta}>ID: {dlr.dealerId || dlr.clientDealerId}</span>
                          </div>
                          {dlr.statePrefix && <span className={styles.badge}>{dlr.statePrefix}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Body (Chart + Rollup Table) */}
            {/* Drawer Body (Table) */}
            <div className={styles.drawerContent}>
              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  Loading historical analytics...
                </div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Active Dealers</th>
                        <th>30d / 60d / 90d+ Inactive</th>
                        <th>Apps</th>
                        <th>Approvals</th>
                        <th>App BKD</th>
                        <th>App $</th>
                        <th>Funded BKD</th>
                        <th>Funded $</th>
                        <th>L-B %</th>
                        <th>A-B %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Summary Totals Row */}
                      <tr className={styles.totalsRow}>
                        <td style={{ color: '#60a5fa', fontWeight: 800 }}>
                          TOTAL / OVERALL ({timeframeMode === 'ytd' ? 'YTD 2026' : '2025–Present'})
                        </td>
                        <td>
                          {totals.latestCohort ? (
                            <>
                              <strong>{totals.latestCohort.active}</strong>{' '}
                              <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                ({totals.latestCohort.activePct}% of {totals.latestCohort.total})
                              </span>
                            </>
                          ) : '—'}
                        </td>
                        <td style={{ color: '#94a3b8' }}>
                          {totals.latestCohort ? `${totals.latestCohort.inactive30} / ${totals.latestCohort.inactive60} / ${totals.latestCohort.longInactive}` : '—'}
                        </td>
                        <td style={{ color: '#60a5fa', fontWeight: 800 }}>{totals.apps.toLocaleString()}</td>
                        <td style={{ color: '#60a5fa', fontWeight: 800 }}>{totals.approvals.toLocaleString()}</td>
                        <td style={{ color: '#38bdf8', fontWeight: 800 }}>{totals.leadBooked.toLocaleString()}</td>
                        <td style={{ color: '#38bdf8', fontWeight: 800 }}>{formatCurrency(totals.leadBookedDollars)}</td>
                        <td style={{ color: '#4ade80', fontWeight: 800 }}>{totals.booked.toLocaleString()}</td>
                        <td style={{ color: '#4ade80', fontWeight: 800 }}>{formatCurrency(totals.bookedDollars)}</td>
                        <td style={{ color: '#f8fafc', fontWeight: 800 }}>{(totals.lookToBook * 100).toFixed(1)}%</td>
                        <td style={{ color: '#f8fafc', fontWeight: 800 }}>{(totals.approvalToBook * 100).toFixed(1)}%</td>
                      </tr>

                      {/* Monthly Rows (Most Recent First) */}
                      {[...displayedMonths].reverse().map((m: HistoricalMoMItem) => (
                        <tr key={m.key}>
                          <td style={{ fontWeight: 700, color: '#60a5fa' }}>{m.label}</td>
                          <td>
                            <strong>{m.cohorts.active}</strong>{' '}
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                              ({m.cohorts.activePct}% of {m.cohorts.total})
                            </span>
                          </td>
                          <td style={{ color: '#94a3b8' }}>
                            {m.cohorts.inactive30} / {m.cohorts.inactive60} / {m.cohorts.longInactive}
                          </td>
                          <td>
                            {m.stats.apps} {renderBadge(m.trends?.apps)}
                          </td>
                          <td>
                            {m.stats.approvals} {renderBadge(m.trends?.approvals)}
                          </td>
                          <td>
                            {m.stats.leadBooked ?? m.stats.booked} {renderBadge(m.trends?.leadBooked || m.trends?.booked)}
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {formatCurrency(m.stats.leadBookedDollars ?? m.stats.bookedDollars)}{' '}
                            {renderBadge(m.trends?.leadBookedDollars || m.trends?.bookedDollars)}
                          </td>
                          <td>
                            {m.stats.closeBooked ?? m.stats.booked} {renderBadge(m.trends?.closeBooked || m.trends?.booked)}
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {formatCurrency(m.stats.closeBookedDollars ?? m.stats.bookedDollars)}{' '}
                            {renderBadge(m.trends?.closeBookedDollars || m.trends?.bookedDollars)}
                          </td>
                          <td>{(m.stats.lookToBook * 100).toFixed(1)}% {renderBadge(m.trends?.lookToBook)}</td>
                          <td>{(m.stats.approvalToBook * 100).toFixed(1)}% {renderBadge(m.trends?.approvalToBook)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: APPLICATION HISTORY */}
        {activeTab === 'applications' && (
          <div className={styles.drawerContent}>
            {appHistoryLoading && appHistoryPage === 1 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Loading application history records...
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryCard}>
                    <span className={styles.cardScope}>All-Time</span>
                    <div className={styles.cardMain}>
                      <span className={styles.cardValue}>{appHistoryData?.summary?.allTime.apps.toLocaleString() || '0'}</span>
                      <span className={styles.cardSub}>Apps</span>
                    </div>
                    <div className={styles.cardDetails}>
                      <span>Appr: {appHistoryData?.summary?.allTime.approvals.toLocaleString() || '0'}</span>
                      <span>Bkd: {appHistoryData?.summary?.allTime.booked.toLocaleString() || '0'}</span>
                      <span>Dollars: ${(appHistoryData?.summary?.allTime.bookedDollars || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className={styles.summaryCard}>
                    <span className={styles.cardScope}>YTD</span>
                    <div className={styles.cardMain}>
                      <span className={styles.cardValue}>{appHistoryData?.summary?.ytd.apps.toLocaleString() || '0'}</span>
                      <span className={styles.cardSub}>Apps</span>
                    </div>
                    <div className={styles.cardDetails}>
                      <span>Appr: {appHistoryData?.summary?.ytd.approvals.toLocaleString() || '0'}</span>
                      <span>Bkd: {appHistoryData?.summary?.ytd.booked.toLocaleString() || '0'}</span>
                      <span>Dollars: ${(appHistoryData?.summary?.ytd.bookedDollars || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className={styles.summaryCard}>
                    <span className={styles.cardScope}>MTD</span>
                    <div className={styles.cardMain}>
                      <span className={styles.cardValue}>{appHistoryData?.summary?.mtd.apps.toLocaleString() || '0'}</span>
                      <span className={styles.cardSub}>Apps</span>
                    </div>
                    <div className={styles.cardDetails}>
                      <span>Appr: {appHistoryData?.summary?.mtd.approvals.toLocaleString() || '0'}</span>
                      <span>Bkd: {appHistoryData?.summary?.mtd.booked.toLocaleString() || '0'}</span>
                      <span>Dollars: ${(appHistoryData?.summary?.mtd.bookedDollars || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Application Records Table & Sub-filters */}
                <div className={styles.tableSection}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                    <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
                      Application Records ({appHistoryData?.pagination?.totalCount || 0})
                    </h3>

                    {/* Filter Controls: Underwriter + Date Range */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      {/* Underwriter Dropdown */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Underwriter:</span>
                        <select
                          value={selectedUnderwriter || ''}
                          onChange={(e) => {
                            setSelectedUnderwriter(e.target.value);
                            setAppHistoryPage(1);
                          }}
                          style={{
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#f8fafc',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <option value="">All Underwriters</option>
                          {underwriterList.map((uw) => (
                            <option key={uw} value={uw}>
                              {uw}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Date Range Presets */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Period:</span>
                        <div style={{ display: 'flex', gap: '2px', background: 'rgba(255, 255, 255, 0.05)', padding: '2px', borderRadius: '6px' }}>
                          {[
                            { key: 'all', label: 'All' },
                            { key: 'mtd', label: 'MTD' },
                            { key: '30d', label: '30d' },
                            { key: '90d', label: '90d' },
                            { key: 'ytd', label: 'YTD' },
                            { key: 'custom', label: 'Custom' },
                          ].map((p) => (
                            <button
                              key={p.key}
                              onClick={() => handleAppDatePresetChange(p.key)}
                              style={{
                                background: appDatePreset === p.key ? '#0284c7' : 'transparent',
                                color: appDatePreset === p.key ? '#ffffff' : '#94a3b8',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '3px 8px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Date Inputs */}
                      {appDatePreset === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="date"
                            value={appStartDate || ''}
                            onChange={(e) => {
                              setAppStartDate(e.target.value);
                              setAppHistoryPage(1);
                            }}
                            style={{
                              background: '#1e293b',
                              border: '1px solid #334155',
                              color: '#f8fafc',
                              padding: '3px 6px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                            }}
                          />
                          <span style={{ color: '#64748b', fontSize: '0.72rem' }}>–</span>
                          <input
                            type="date"
                            value={appEndDate || ''}
                            onChange={(e) => {
                              setAppEndDate(e.target.value);
                              setAppHistoryPage(1);
                            }}
                            style={{
                              background: '#1e293b',
                              border: '1px solid #334155',
                              color: '#f8fafc',
                              padding: '3px 6px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {appHistoryData?.applications.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      No application records found.
                    </div>
                  ) : (
                    <div className={styles.tableWrapper} style={{ maxHeight: '360px' }}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Application ID</th>
                            {!isDealerSelected && <th>Dealer</th>}
                            <th>Underwriter</th>
                            <th>Status</th>
                            <th>Date</th>
                            <th>Days Ago</th>
                            <th>Financed Amount</th>
                            <th>Lender</th>
                            <th>FICO</th>
                          </tr>
                        </thead>
                        <tbody>
                          {appHistoryData?.applications.map((app: ApplicationHistoryItem) => (
                            <tr
                              key={app._id}
                              className={styles.clickableRow}
                              onClick={() => setSelectedAppDetail(app)}
                              title="Click to view full application details"
                            >
                              <td className={styles.appIdCell}>{app.applicationId}</td>
                              {!isDealerSelected && (
                                <td>
                                  <div
                                    style={{ fontWeight: 600, color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDealer360(app.clientDealerId || app.dealerName || '', app.dealerName);
                                    }}
                                    title={`Click to open 360° Inspection Card for ${app.dealerName}`}
                                  >
                                    {app.dealerName || '—'}
                                  </div>
                                  {app.dealerState && (
                                    <span className={styles.badge} style={{ fontSize: '0.65rem', marginTop: '2px', display: 'inline-block' }}>
                                      {app.dealerState}
                                    </span>
                                  )}
                                </td>
                              )}
                              <td style={{ fontWeight: 600, color: app.underwriter ? '#60a5fa' : '#64748b' }}>
                                {app.underwriter || '—'}
                              </td>
                              <td>
                                <span
                                  className={`${styles.statusTag} ${
                                    app.status === 'Booked'
                                      ? styles.statusBooked
                                      : app.status === 'Approved' || app.status === 'Auto Approval' || app.status === 'Conditional Approval'
                                      ? styles.statusApproved
                                      : styles.statusDefault
                                  }`}
                                >
                                  {app.status || 'Pending'}
                                </span>
                              </td>
                              <td>{app.applicationDate ? new Date(app.applicationDate).toLocaleDateString() : '—'}</td>
                              <td className={styles.daysAgoCell}>
                                {app.daysAgo != null ? `${app.daysAgo}d ago` : '—'}
                              </td>
                              <td className={styles.amountCell}>
                                {app.amountFinanced != null ? `$${app.amountFinanced.toLocaleString()}` : '—'}
                              </td>
                              <td>{app.lender || '—'}</td>
                              <td className={styles.ficoCell}>{app.primaryFicoAuto8 || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Pagination Controls */}
                  {appHistoryData?.pagination && appHistoryData.pagination.totalPages > 1 && (
                    <div className={styles.paginationRow}>
                      <button
                        className={styles.pageBtn}
                        disabled={appHistoryPage <= 1 || appHistoryLoading}
                        onClick={() => setAppHistoryPage((p) => Math.max(1, p - 1))}
                      >
                        ← Previous
                      </button>
                      <span className={styles.pageInfo}>
                        Page {appHistoryData.pagination.page} of {appHistoryData.pagination.totalPages}
                      </span>
                      <button
                        className={styles.pageBtn}
                        disabled={!appHistoryData.pagination.hasMore || appHistoryLoading}
                        onClick={() => setAppHistoryPage((p) => p + 1)}
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: COMMUNICATION HISTORY */}
        {activeTab === 'communications' && (
          <div className={styles.drawerContent}>
            {/* Header & Sub-filters */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
                  Communication & Visit Logs ({commHistoryData?.pagination?.totalCount || 0})
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[
                  { key: 'all', label: 'All Touchpoints' },
                  { key: 'visit', label: '📍 In-Person Visits' },
                  { key: 'call', label: '📞 Phone Calls' },
                  { key: 'email', label: '✉️ Emails / Other' },
                ].map((tf) => (
                  <button
                    key={tf.key}
                    onClick={() => { setCommTypeFilter(tf.key as any); setCommHistoryPage(1); }}
                    style={{
                      background: commTypeFilter === tf.key ? '#2563eb' : '#1e293b',
                      color: commTypeFilter === tf.key ? '#ffffff' : '#94a3b8',
                      border: '1px solid #334155',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {commHistoryLoading && commHistoryPage === 1 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Loading communication history records...
              </div>
            ) : commHistoryData?.items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                No communication records found for the selected filters.
              </div>
            ) : (
              <>
                <div className={styles.tableWrapper} style={{ maxHeight: '420px' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Date & Recency</th>
                        <th>Rep Name</th>
                        <th>Type</th>
                        {!isDealerSelected && <th>Dealer / Location</th>}
                        <th>State</th>
                        <th>Outcome / Result</th>
                        <th>Notes / Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commHistoryData?.items.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() =>
                            setSelectedCommDetail({
                              ...item,
                              feedback: item.notes || item.feedback,
                            })
                          }
                          style={{ cursor: 'pointer' }}
                          title="Click to view full touchpoint notes and discussion"
                        >
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                              {item.date ? new Date(item.date).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                            </div>
                            {item.daysAgo != null && (
                              <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600 }}>
                                ⏱️ {item.daysAgo === 0 ? 'Today' : `${item.daysAgo}d ago`}
                              </span>
                            )}
                          </td>
                          <td style={{ fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap' }}>{item.repName || '—'}</td>
                          <td>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: item.type?.toLowerCase().includes('visit') || item.type?.toLowerCase().includes('meeting')
                                ? 'rgba(56, 189, 248, 0.2)'
                                : item.type?.toLowerCase().includes('call')
                                ? 'rgba(168, 85, 247, 0.2)'
                                : 'rgba(148, 163, 184, 0.2)',
                              color: item.type?.toLowerCase().includes('visit') || item.type?.toLowerCase().includes('meeting')
                                ? '#38bdf8'
                                : item.type?.toLowerCase().includes('call')
                                ? '#c084fc'
                                : '#cbd5e1',
                              border: '1px solid rgba(255,255,255,0.1)',
                            }}>
                              {item.type || 'Touchpoint'}
                            </span>
                          </td>
                          {!isDealerSelected && (
                            <td>
                              <div
                                style={{ fontWeight: 600, color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDealer360(item.clientDealerId || item.dealerName, item.dealerName);
                                }}
                                title={`Click to view 360° inspection for ${item.dealerName}`}
                              >
                                {item.dealerName || '—'}
                              </div>
                              {item.groupName && (
                                <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>
                                  {item.groupName}
                                </span>
                              )}
                            </td>
                          )}
                          <td>{item.state || '—'}</td>
                          <td style={{ fontSize: '12px', fontWeight: 600, color: '#34d399', maxWidth: '180px' }}>
                            {item.result || '—'}
                          </td>
                          <td style={{ fontSize: '12px', color: '#cbd5e1', maxWidth: '300px' }}>
                            {item.notes && item.notes !== item.result ? item.notes : (item.feedback || '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {commHistoryData?.pagination && commHistoryData.pagination.totalPages > 1 && (
                  <div className={styles.paginationRow}>
                    <button
                      className={styles.pageBtn}
                      disabled={commHistoryPage <= 1 || commHistoryLoading}
                      onClick={() => setCommHistoryPage((p) => Math.max(1, p - 1))}
                    >
                      ← Previous
                    </button>
                    <span className={styles.pageInfo}>
                      Page {commHistoryData.pagination.page} of {commHistoryData.pagination.totalPages}
                    </span>
                    <button
                      className={styles.pageBtn}
                      disabled={!commHistoryData.pagination.hasMore || commHistoryLoading}
                      onClick={() => setCommHistoryPage((p) => p + 1)}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Application Detail Modal/Drawer */}
        <ApplicationDetailDrawer
          app={selectedAppDetail}
          onClose={() => setSelectedAppDetail(null)}
        />

        {/* Communication Detail Modal */}
        <CommunicationDetailModal
          comm={selectedCommDetail}
          onClose={() => setSelectedCommDetail(null)}
        />
      </div>
    </div>
  );
}
