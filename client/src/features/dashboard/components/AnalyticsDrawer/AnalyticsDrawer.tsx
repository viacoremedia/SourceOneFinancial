import { useEffect, useState, useMemo, useRef } from 'react';
import { useAnalyticsContext } from '../../../../core/contexts/AnalyticsContext';
import { getHistoricalMoM, getDealerApplicationsHistory, searchDealers, getRepCommunicationHistory } from '../../../../core/services/api';
import type { RepMappings, RepCommunicationHistoryResponse } from '../../../../core/services/api';
import type {
  HistoricalMoMItem,
  HistoricalMoMResponse,
  MetricTrend,
  DealerApplicationHistoryResponse,
  ApplicationHistoryItem
} from '../../types';
import { ApplicationDetailDrawer } from '../ApplicationDetailDrawer/ApplicationDetailDrawer';
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

export type SeriesKey = 'apps' | 'approvals' | 'booked' | 'bookedDollars' | 'lookToBook' | 'approvalToBook';

interface SeriesOption {
  key: SeriesKey;
  label: string;
  color: string;
  getValue: (item: HistoricalMoMItem) => number;
  format: (val: number) => string;
}

const SERIES_OPTIONS: SeriesOption[] = [
  { key: 'apps', label: 'Apps', color: '#3b82f6', getValue: (m) => m.stats.apps || 0, format: (v) => v.toLocaleString() },
  { key: 'approvals', label: 'Approvals', color: '#a855f7', getValue: (m) => m.stats.approvals || 0, format: (v) => v.toLocaleString() },
  { key: 'booked', label: 'Booked (#)', color: '#f59e0b', getValue: (m) => m.stats.booked || 0, format: (v) => v.toLocaleString() },
  { key: 'bookedDollars', label: 'Booked Vol ($)', color: '#4ade80', getValue: (m) => m.stats.bookedDollars || 0, format: (v) => formatCurrency(v) },
  { key: 'lookToBook', label: 'L-B %', color: '#38bdf8', getValue: (m) => m.stats.lookToBook || 0, format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: 'approvalToBook', label: 'A-B %', color: '#ec4899', getValue: (m) => m.stats.approvalToBook || 0, format: (v) => `${(v * 100).toFixed(1)}%` },
];

export function AnalyticsDrawer({
  isOpen,
  onClose,
  availableStates = [],
  availableGroups = [],
  repMappings = null,
  repStatesMap = {},
  initialDealerId = null,
  initialGroupSlug = null,
  initialTab = 'mom',
  onSelectDealerId,
  onSelectGroupSlug,
}: AnalyticsDrawerProps) {
  const { openDealer360 } = useAnalyticsContext();
  // Active Tab: 'mom' | 'applications' | 'communications'
  const [activeTab, setActiveTab] = useState<'mom' | 'applications' | 'communications'>(initialTab);

  // Selected Dealer Filter (ID or Mongo _id)
  const [selectedDealerId, setSelectedDealerId] = useState<string | null>(initialDealerId);
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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

  // Active series toggles for line chart
  const [activeSeriesKeys, setActiveSeriesKeys] = useState<SeriesKey[]>(['apps', 'bookedDollars']);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync initial props whenever drawer opens or props change
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSelectedDealerId(initialDealerId);
      if (!initialDealerId) {
        setSelectedDealerObj(null);
      }
      setSelectedGroup(initialGroupSlug || '');
      setAppHistoryPage(1);
      setAppHistoryData(null);
      setCommHistoryPage(1);
      setCommHistoryData(null);
    }
  }, [isOpen, initialDealerId, initialGroupSlug, initialTab]);

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
      selectedGroup || undefined
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
  }, [isOpen, selectedDealerId, selectedGroup, selectedState, selectedRep, appHistoryPage]);

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

  const toggleSeries = (key: SeriesKey) => {
    setActiveSeriesKeys((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

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

  if (!isOpen) return null;

  const months = data?.months || [];
  const displayedMonths = timeframeMode === 'ytd' ? months.filter((m) => m.year === 2026) : months;

  // Aggregate Totals across current items displayed in table/chart
  const totals = {
    apps: displayedMonths.reduce((acc, m) => acc + (m.stats?.apps || 0), 0),
    approvals: displayedMonths.reduce((acc, m) => acc + (m.stats?.approvals || 0), 0),
    booked: displayedMonths.reduce((acc, m) => acc + (m.stats?.booked || 0), 0),
    bookedDollars: displayedMonths.reduce((acc, m) => acc + (m.stats?.bookedDollars || 0), 0),
    lookToBook: displayedMonths.reduce((acc, m) => acc + (m.stats?.apps || 0), 0) > 0
      ? displayedMonths.reduce((acc, m) => acc + (m.stats?.booked || 0), 0) / displayedMonths.reduce((acc, m) => acc + (m.stats?.apps || 0), 0)
      : 0,
    approvalToBook: displayedMonths.reduce((acc, m) => acc + (m.stats?.approvals || 0), 0) > 0
      ? displayedMonths.reduce((acc, m) => acc + (m.stats?.booked || 0), 0) / displayedMonths.reduce((acc, m) => acc + (m.stats?.approvals || 0), 0)
      : 0,
    latestCohort: displayedMonths.length > 0 ? displayedMonths[displayedMonths.length - 1].cohorts : null,
  };

  // SVG Line Chart calculations
  const svgWidth = 800;
  const svgHeight = 180;
  const padding = 30;

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
  const isDealerSelected = Boolean(selectedDealerId);
  const isGroupSelected = Boolean(selectedGroup);
  const headerLocation = isDealerSelected ? (selectedDealerObj || appHistoryData?.location) : null;

  const headerTitle = isDealerSelected
    ? (headerLocation?.dealerName || selectedDealerObj?.dealerName || selectedDealerId)
    : isGroupSelected
    ? `Group: ${groupName}`
    : 'Month-over-Month Historical Analytics';

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
            <div className={styles.drawerContent}>
              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  Loading historical analytics...
                </div>
              ) : (
                <>
                  {/* Performance Line Chart */}
                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className={styles.chartTitle}>Historical Performance Trends</span>
                        {hoveredIndex !== null && displayedMonths[hoveredIndex] && (
                          <div className={styles.hoverMetricsBar}>
                            <strong style={{ color: '#38bdf8' }}>{displayedMonths[hoveredIndex].label}</strong>
                            <span>Apps: <strong>{displayedMonths[hoveredIndex].stats.apps}</strong></span>
                            <span>Appr: <strong>{displayedMonths[hoveredIndex].stats.approvals}</strong></span>
                            <span>Bkd: <strong>{displayedMonths[hoveredIndex].stats.booked}</strong></span>
                            <span>Vol: <strong>{formatCurrency(displayedMonths[hoveredIndex].stats.bookedDollars)}</strong></span>
                          </div>
                        )}
                      </div>

                      {/* Interactive Metric Series Toggles */}
                      <div className={styles.legend}>
                        {SERIES_OPTIONS.map((ser) => {
                          const isActive = activeSeriesKeys.includes(ser.key);
                          return (
                            <div
                              key={ser.key}
                              className={styles.legendItem}
                              onClick={() => toggleSeries(ser.key)}
                              style={{
                                cursor: 'pointer',
                                opacity: isActive ? 1 : 0.4,
                                transition: 'opacity 0.2s',
                              }}
                            >
                              <span className={styles.dot} style={{ background: ser.color }} />
                              <span style={{ fontWeight: isActive ? 600 : 400 }}>{ser.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* SVG Chart Area */}
                    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
                      <svg
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        style={{ width: '100%', height: '180px', display: 'block' }}
                      >
                        {/* Grid lines */}
                        <line x1={padding} y1={20} x2={svgWidth - padding} y2={20} stroke="rgba(255,255,255,0.05)" />
                        <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="rgba(255,255,255,0.05)" />
                        <line x1={padding} y1={svgHeight - 20} x2={svgWidth - padding} y2={svgHeight - 20} stroke="rgba(255,255,255,0.1)" />

                        {/* Render active series lines */}
                        {SERIES_OPTIONS.filter((ser) => activeSeriesKeys.includes(ser.key)).map((ser) => {
                          const values = displayedMonths.map((m) => ser.getValue(m));
                          const maxVal = Math.max(...values, 1);
                          const points = displayedMonths.map((m, idx) => {
                            const x = padding + (idx / Math.max(1, displayedMonths.length - 1)) * (svgWidth - 2 * padding);
                            const val = ser.getValue(m);
                            const y = (svgHeight - 20) - (val / maxVal) * (svgHeight - 40);
                            return `${x},${y}`;
                          }).join(' ');

                          return (
                            <polyline
                              key={ser.key}
                              fill="none"
                              stroke={ser.color}
                              strokeWidth="2.5"
                              points={points}
                            />
                          );
                        })}

                        {/* Hover Overlay Points */}
                        {displayedMonths.map((m, idx) => {
                          const x = padding + (idx / Math.max(1, displayedMonths.length - 1)) * (svgWidth - 2 * padding);
                          return (
                            <g key={m.key}>
                              <line
                                x1={x}
                                y1={10}
                                x2={x}
                                y2={svgHeight - 10}
                                stroke={hoveredIndex === idx ? 'rgba(56, 189, 248, 0.4)' : 'transparent'}
                                strokeWidth="2"
                                strokeDasharray="3,3"
                              />
                              <rect
                                x={x - 15}
                                y={0}
                                width={30}
                                height={svgHeight}
                                fill="transparent"
                                style={{ cursor: 'pointer' }}
                                onMouseEnter={() => setHoveredIndex(idx)}
                                onMouseLeave={() => setHoveredIndex(null)}
                              />
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  </div>

                  {/* Monthly Rollup Data Table */}
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Active Dealers</th>
                          <th>30d / 60d / 90d+ Inactive</th>
                          <th>Apps</th>
                          <th>Approvals</th>
                          <th>Booked</th>
                          <th>Booked $</th>
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
                              {m.stats.booked} {renderBadge(m.trends?.booked)}
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {formatCurrency(m.stats.bookedDollars)}{' '}
                              {renderBadge(m.trends?.bookedDollars)}
                            </td>
                            <td>{(m.stats.lookToBook * 100).toFixed(1)}% {renderBadge(m.trends?.lookToBook)}</td>
                            <td>{(m.stats.approvalToBook * 100).toFixed(1)}% {renderBadge(m.trends?.approvalToBook)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
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

                {/* Application Records Table */}
                <div className={styles.tableSection}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 className={styles.sectionTitle}>
                      Application Records ({appHistoryData?.pagination?.totalCount || 0})
                    </h3>
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
                        <tr key={item.id}>
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
                                onClick={() => openDealer360(item.clientDealerId || item.dealerName, item.dealerName)}
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
      </div>
    </div>
  );
}
