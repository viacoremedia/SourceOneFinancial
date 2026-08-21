/**
 * VisitImpactDrawer — Diagnostic drawer for Sales Managers.
 * Analyzes in-person visit lift, account allocation, and provides interactive, paginated
 * communication history for any selected sales representative.
 */

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useAnalyticsContext } from '../../../../core/contexts/AnalyticsContext';
import { useAuth } from '../../../auth/hooks/useAuth';
import styles from './VisitImpactDrawer.module.css';
import { RelationshipDemandView } from './RelationshipDemandView';
import {
  getVisitImpact,
  getRepCommunicationHistory,
  getRepMappings,
} from '../../../../core/services/api';
import type {
  VisitImpactResponse,
  RepCommunicationHistoryResponse,
  RepMappings,
} from '../../../../core/services/api';

interface VisitImpactDrawerProps {
  open: boolean;
  onClose: () => void;
}

type CommItem = RepCommunicationHistoryResponse['items'][number];
type SortField =
  | 'rep'
  | 'visits'
  | 'inactiveDealersVisited'
  | 'reactivatedCount'
  | 'reactivationRate'
  | 'avgDaysToReactivation'
  | 'growthVisitPct'
  | 'reactivatedVolume';
type SortOrder = 'asc' | 'desc';

type SubSortField =
  | 'dealerName'
  | 'state'
  | 'firstContactDate'
  | 'groupName'
  | 'outcome'
  | 'statusAtVisit'
  | 'daysToReactivation'
  | 'reactivatedVolume'
  | 'visitCount';

export function VisitImpactDrawer({ open, onClose }: VisitImpactDrawerProps) {
  const { openDealer360 } = useAnalyticsContext();
  const { user } = useAuth();

  // Whitelist check: only joshua@viacoremedia.com can see the DRD feature
  const isJoshua = (user?.email?.toLowerCase().trim() === 'joshua@viacoremedia.com') || (typeof window !== 'undefined' && localStorage.getItem('ENABLE_TLC') === 'true');

  const [mainTab, setMainTab] = useState<'demand' | 'reactivation'>('reactivation');

  useEffect(() => {
    if (isJoshua) {
      setMainTab('demand');
    } else {
      setMainTab('reactivation');
    }
  }, [isJoshua]);

  const [windowDays, setWindowDays] = useState<number>(30);
  const [touchpointMode, setTouchpointMode] = useState<'visits' | 'all'>('visits');
  const [timeframe, setTimeframe] = useState<'ytd' | '30d' | '60d'>('ytd');
  const [impactData, setImpactData] = useState<VisitImpactResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Sorting state for Rep Performance table
  const [sortField, setSortField] = useState<SortField>('reactivatedCount');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Sub-table sorting & search states for Per-Dealer breakdown
  const [subSortField, setSubSortField] = useState<SubSortField>('outcome');
  const [subSortOrder, setSubSortOrder] = useState<SortOrder>('desc');
  const [dealerSearchMap, setDealerSearchMap] = useState<Record<string, string>>({});
  const [outcomeFilterMap, setOutcomeFilterMap] = useState<Record<string, string>>({});

  // Selected Rep for detailed communication history view
  const [selectedRep, setSelectedRep] = useState<string | null>(null);

  // Selected Communication Item for Full Detail Modal
  const [selectedCommItem, setSelectedCommItem] = useState<CommItem | null>(null);

  // Accordion Expand State for Rep Dealer Breakdown Sub-table
  const [expandedReps, setExpandedReps] = useState<Record<string, boolean>>({});

  const toggleExpandRep = (repName: string) => {
    setExpandedReps((prev) => ({ ...prev, [repName]: !prev[repName] }));
  };

  // History filters & pagination
  const [repMappings, setRepMappings] = useState<RepMappings | null>(null);
  const [historyState, setHistoryState] = useState<string>('');
  const [historyGroup, setHistoryGroup] = useState<string>('');
  const [historyType, setHistoryType] = useState<string>('all');
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyData, setHistoryData] = useState<RepCommunicationHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  // Fetch metadata on mount
  useEffect(() => {
    getRepMappings().then(setRepMappings).catch(console.error);
  }, []);

  // Fetch Rep Lift Performance table data
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    getVisitImpact(windowDays, touchpointMode, undefined, timeframe)
      .then((imp) => {
        if (!cancelled) {
          setImpactData(imp);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load visit impact data:', err);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [open, windowDays, touchpointMode, timeframe]);

  // Fetch Paginated Rep Communication History when a rep is selected or filters/page change
  const fetchHistory = useCallback(async () => {
    if (!selectedRep) return;
    setHistoryLoading(true);
    try {
      const data = await getRepCommunicationHistory({
        rep: selectedRep,
        state: historyState || undefined,
        groupSlug: historyGroup || undefined,
        type: historyType !== 'all' ? historyType : undefined,
        search: historySearch || undefined,
        page: historyPage,
        limit: 20,
      });
      setHistoryData(data);
    } catch (err) {
      console.error('Failed to load rep communication history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedRep, historyState, historyGroup, historyType, historySearch, historyPage]);

  useEffect(() => {
    if (selectedRep) {
      fetchHistory();
    }
  }, [selectedRep, fetchHistory]);

  const handleSelectRep = (repName: string, initialSearch?: string, initialType?: string) => {
    setSelectedRep(repName);
    setHistoryPage(1);
    setHistoryState('');
    setHistoryGroup('');
    setHistoryType(initialType || 'all');
    setHistorySearch(initialSearch || '');
    setSelectedCommItem(null);
  };

  const handleBackToLift = () => {
    setSelectedRep(null);
    setHistoryData(null);
    setSelectedCommItem(null);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc'); // Default to descending when changing sort column
    }
  };

  const sortedReps = useMemo(() => {
    if (!impactData?.reps) return [];
    return [...impactData.reps].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB as string).toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [impactData, sortField, sortOrder]);

  if (!open) return null;

  const formatDollar = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n}`;
  };

  const renderTypeBadge = (typeStr: string) => {
    const t = typeStr.toLowerCase();
    if (t.includes('visit') || t.includes('meeting')) {
      return <span className={styles.badgeVisit}>📍 {typeStr}</span>;
    }
    if (t.includes('call') || t.includes('phone')) {
      return <span className={styles.badgeCall}>📞 {typeStr}</span>;
    }
    if (t.includes('email')) {
      return <span className={styles.badgeEmail}>✉️ {typeStr}</span>;
    }
    return <span className={styles.badgeOther}>{typeStr}</span>;
  };

  const renderSortHeader = (label: string, field: SortField) => {
    const isCurrent = sortField === field;
    return (
      <th
        onClick={() => handleSort(field)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        title={`Click to sort by ${label}`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>{label}</span>
          <span style={{ fontSize: '10px', color: isCurrent ? '#38bdf8' : '#64748b' }}>
            {isCurrent ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </div>
      </th>
    );
  };

  const handleSubSort = (field: SubSortField) => {
    if (subSortField === field) {
      setSubSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSubSortField(field);
      setSubSortOrder('desc');
    }
  };

  const renderSubSortHeader = (label: string, field: SubSortField) => {
    const isCurrent = subSortField === field;
    return (
      <th
        onClick={() => handleSubSort(field)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        title={`Click to sort dealers by ${label}`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>{label}</span>
          <span style={{ fontSize: '10px', color: isCurrent ? '#38bdf8' : '#64748b' }}>
            {isCurrent ? (subSortOrder === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </div>
      </th>
    );
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.drawer} id="visit-impact-drawer">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {selectedRep ? (
              <div className={styles.historyHeader}>
                <button className={styles.backBtn} onClick={handleBackToLift}>
                  ← Back to Rep Lift Performance
                </button>
                <h2 className={styles.title}>📋 Communication History — {selectedRep}</h2>
              </div>
            ) : (
              <>
                {isJoshua ? (
                  <div className={styles.topNavTabs}>
                    <button
                      className={`${styles.topNavBtn} ${mainTab === 'demand' ? styles.topNavBtnActive : ''}`}
                      onClick={() => setMainTab('demand')}
                    >
                      🎯 Relationship Demand & Allocation (TLC)
                    </button>
                    <button
                      className={`${styles.topNavBtn} ${mainTab === 'reactivation' ? styles.topNavBtnActive : ''}`}
                      onClick={() => setMainTab('reactivation')}
                    >
                      ⚡ Visit Reactivation Diagnostic
                    </button>
                  </div>
                ) : (
                  <h2 className={styles.title}>⚡ Visit Reactivation Diagnostic</h2>
                )}

                {mainTab === 'reactivation' && impactData?.dateRangeLabel && (
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#38bdf8',
                      background: 'rgba(56, 189, 248, 0.1)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      whiteSpace: 'nowrap',
                    }}
                    title="Analysis period for visit data"
                  >
                    📅 {impactData.dateRangeLabel}
                  </span>
                )}
                {mainTab === 'reactivation' && (
                  <div className={styles.windowToggle}>
                    {/* Visit Timeframe Selector */}
                    <select
                      value={timeframe}
                      onChange={(e) => setTimeframe(e.target.value as any)}
                      className={styles.filterSelect}
                      style={{ background: '#0f172a', borderColor: '#38bdf8', color: '#38bdf8', fontWeight: 600, padding: '4px 8px', borderRadius: '6px' }}
                      title="Select timeframe of visits to analyze"
                    >
                      <option value="ytd">📅 YTD 2026</option>
                      <option value="30d">📅 Last 30 Days Visits</option>
                      <option value="60d">📅 Last 60 Days Visits</option>
                    </select>

                    {[14, 30, 60].map((w) => (
                      <button
                        key={w}
                        className={`${styles.windowBtn} ${windowDays === w ? styles.windowBtnActive : ''}`}
                        onClick={() => setWindowDays(w)}
                        title={`Attribute app to visit if submitted within ${w} days post-visit`}
                      >
                        ⚡ {w}d Conversion Window {w === 30 ? '(Default)' : ''}
                      </button>
                    ))}
                    <button
                      className={`${styles.windowBtn} ${touchpointMode === 'all' ? styles.windowBtnActive : ''}`}
                      onClick={() => setTouchpointMode(touchpointMode === 'visits' ? 'all' : 'visits')}
                      style={{ marginLeft: '8px' }}
                    >
                      {touchpointMode === 'visits' ? '📍 Visits Only' : '📞 All Touchpoints'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Close">✕</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {selectedRep ? (
            /* ── Rep Communication History View ── */
            <div className={styles.section}>
              {/* Filter Bar */}
              <div className={styles.filterBar}>
                {/* State Select */}
                <select
                  className={styles.filterSelect}
                  value={historyState}
                  onChange={(e) => { setHistoryState(e.target.value); setHistoryPage(1); }}
                >
                  <option value="">All States</option>
                  {(repMappings?.allStates || []).map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>

                {/* Group Select */}
                <select
                  className={styles.filterSelect}
                  value={historyGroup}
                  onChange={(e) => { setHistoryGroup(e.target.value); setHistoryPage(1); }}
                >
                  <option value="">All Dealer Groups</option>
                  {(repMappings?.allGroups || []).map((g) => (
                    <option key={g.slug} value={g.slug}>{g.name}</option>
                  ))}
                </select>

                {/* Comm Type Select */}
                <select
                  className={styles.filterSelect}
                  value={historyType}
                  onChange={(e) => { setHistoryType(e.target.value); setHistoryPage(1); }}
                >
                  <option value="all">All Touchpoint Types</option>
                  <option value="visit">In-Person Visits</option>
                  <option value="call">Phone Calls</option>
                  <option value="email">Emails</option>
                  <option value="meeting">Meetings</option>
                </select>

                {/* Search Input */}
                <input
                  className={styles.searchInput}
                  placeholder="Search dealer, notes, or results..."
                  value={historySearch}
                  onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
                />
              </div>

              {/* History Table */}
              {historyLoading ? (
                <div style={{ color: '#94a3b8', padding: '40px 0', textAlign: 'center' }}>
                  Loading communication logs for {selectedRep}…
                </div>
              ) : !historyData || historyData.items.length === 0 ? (
                <div style={{ color: '#94a3b8', padding: '40px 0', textAlign: 'center' }}>
                  No communication records found for {selectedRep} matching filters.
                </div>
              ) : (
                <>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Dealer Location</th>
                        <th>State</th>
                        <th>Dealer Group</th>
                        <th>Type</th>
                        <th>Result / Meeting Notes</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.items.map((item) => (
                        <tr
                          key={item.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedCommItem(item)}
                        >
                          <td style={{ whiteSpace: 'nowrap', color: '#94a3b8', fontSize: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span>{new Date(item.date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}</span>
                              <span style={{
                                fontSize: '10px',
                                color: '#64748b',
                                fontWeight: 600,
                              }}>
                                {(() => {
                                  const d = Math.floor((Date.now() - new Date(item.date).getTime()) / 86400000);
                                  if (d === 0) return 'Today';
                                  if (d === 1) return '1 day ago';
                                  return `${d} days ago`;
                                })()}
                              </span>
                            </div>
                          </td>
                          <td style={{ fontWeight: 700, color: '#f8fafc' }}>{item.dealerName}</td>
                          <td>
                            <span style={{ fontWeight: 600, color: '#38bdf8' }}>{item.state || '—'}</span>
                          </td>
                          <td style={{ color: '#cbd5e1' }}>{item.groupName || 'Independent'}</td>
                          <td>{renderTypeBadge(item.type)}</td>
                          <td style={{ fontSize: '12px', color: '#94a3b8', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.result && <span style={{ color: '#e2e8f0', fontWeight: 600, marginRight: '6px' }}>{item.result} —</span>}
                            {item.feedback || '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className={styles.viewBtn}
                              onClick={(e) => { e.stopPropagation(); setSelectedCommItem(item); }}
                              title="View full communication details and notes"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination Control Bar */}
                  <div className={styles.paginationBar}>
                    <span className={styles.pageInfo}>
                      Showing {((historyData.pagination.page - 1) * historyData.pagination.limit) + 1}–
                      {Math.min(historyData.pagination.page * historyData.pagination.limit, historyData.pagination.totalCount)} of {historyData.pagination.totalCount} entries
                    </span>
                    <div className={styles.pageControls}>
                      <button
                        className={styles.pageBtn}
                        disabled={historyData.pagination.page <= 1}
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      >
                        ← Previous
                      </button>
                      <span className={styles.pageInfo}>
                        Page {historyData.pagination.page} of {historyData.pagination.totalPages}
                      </span>
                      <button
                        className={styles.pageBtn}
                        disabled={!historyData.pagination.hasMore}
                        onClick={() => setHistoryPage((p) => p + 1)}
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : mainTab === 'demand' ? (
            /* ── Relationship Demand & Allocation (TLC) View ── */
            <RelationshipDemandView />
          ) : (
            /* ── Rep Reactivation Performance View ── */
            loading ? (
              <div style={{ color: '#94a3b8', padding: '40px 0', textAlign: 'center' }}>
                Analyzing visit reactivation data…
              </div>
            ) : !impactData ? (
              <div style={{ color: '#94a3b8', padding: '40px 0', textAlign: 'center' }}>
                No communication impact data available.
              </div>
            ) : (
              <div className={styles.section}>
                {/* KPI Summary Cards Banner */}
                <div className={styles.kpiGrid}>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Total In-Person Visits</span>
                    <span className={styles.kpiValue}>{impactData.overall.totalVisits.toLocaleString()}</span>
                    <span className={styles.kpiSubtext}>
                      {touchpointMode === 'all' ? `${impactData.overall.totalCalls} Calls included` : 'In-person visits only'}
                    </span>
                  </div>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Network Reactivation Rate</span>
                    <span className={styles.kpiValue} style={{ color: '#34d399' }}>
                      {impactData.overall.reactivationRate != null
                        ? `${(impactData.overall.reactivationRate * 100).toFixed(1)}%`
                        : '—'}
                    </span>
                    <span className={styles.kpiSubtext}>
                      {impactData.overall.reactivatedCount} of {impactData.overall.inactiveDealersVisited} inactive dealers reactivated
                    </span>
                  </div>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Avg Days to Reactivation</span>
                    <span className={styles.kpiValue}>
                      {impactData.overall.avgDaysToReactivation != null
                        ? `${Math.round(impactData.overall.avgDaysToReactivation)} days`
                        : '—'}
                    </span>
                    <span className={styles.kpiSubtext}>
                      Time from visit to first application
                    </span>
                  </div>
                  <div className={styles.kpiCard}>
                    <span className={styles.kpiLabel}>Reactivated Volume</span>
                    <span className={styles.kpiValue} style={{ color: '#34d399' }}>
                      +{formatDollar(impactData.overall.reactivatedVolume)}
                    </span>
                    <span className={styles.kpiSubtext}>
                      Booked $ from dealers reactivated following visits
                    </span>
                  </div>
                </div>

                {/* Methodology Note */}
                <div
                  style={{
                    background: 'rgba(2, 132, 199, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    marginTop: '12px',
                    fontSize: '12px',
                    color: '#94a3b8',
                    lineHeight: '1.4',
                  }}
                >
                  💡 <strong style={{ color: '#38bdf8' }}>Methodology:</strong> A dealer is marked <strong>"Inactive"</strong> if zero applications were submitted in the 60 days prior to a visit. <strong>"Reactivated"</strong> = dealer submitted a new application within <strong>{windowDays} days post-visit</strong>. <strong>Visit Date</strong> in the table shows the exact date when the reactivation visit occurred. Select a <strong>Visit Timeframe</strong> above (e.g. Last 30 Days) to focus on recent visits.
                </div>

                <h3 className={styles.sectionTitle} style={{ marginTop: '12px' }}>
                  📊 Rep Reactivation Performance ({windowDays}-Day Window)
                  <span style={{ fontSize: '12px', fontWeight: 400, color: '#94a3b8', marginLeft: '8px' }}>
                    (Click any column header to sort · Click any Rep name for logs)
                  </span>
                </h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {renderSortHeader('Sales Representative', 'rep')}
                      {renderSortHeader('Visits', 'visits')}
                      {renderSortHeader('Inactive Visited', 'inactiveDealersVisited')}
                      {renderSortHeader('Reactivated', 'reactivatedCount')}
                      {renderSortHeader('React. Rate', 'reactivationRate')}
                      {renderSortHeader('Avg Days', 'avgDaysToReactivation')}
                      {renderSortHeader('Growth Mix', 'growthVisitPct')}
                      {renderSortHeader('Reactivated Vol', 'reactivatedVolume')}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedReps.map((r) => {
                      const isExpanded = !!expandedReps[r.rep];
                      return (
                        <Fragment key={r.rep}>
                          <tr key={r.rep}>
                            <td>
                              <button
                                className={styles.expandBtn}
                                onClick={() => toggleExpandRep(r.rep)}
                                title={isExpanded ? `Collapse dealer breakdown for ${r.rep}` : `Expand to view visited dealers for ${r.rep}`}
                              >
                                {isExpanded ? '▼' : '▶'}
                              </button>
                              <button
                                className={styles.repLinkButton}
                                onClick={() => handleSelectRep(r.rep)}
                                title={`Click to view communication history for ${r.rep}`}
                              >
                                {r.rep}
                              </button>
                              {['Genevieve Coulombe', 'Ericka Dominguez', 'Dan Zilberchtein'].some(n => r.rep.includes(n)) && (
                                <span style={{ fontSize: '10px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', whiteSpace: 'nowrap' }}>
                                  Inside Sales
                                </span>
                              )}
                              {['Tony DeRouin', 'Bruce Sweere', 'Steve Kimble', 'N Boly'].some(n => r.rep.includes(n)) && (
                                <span style={{ fontSize: '10px', background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.3)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', whiteSpace: 'nowrap' }}>
                                  Former Rep
                                </span>
                              )}
                              {['Mandi Schultz'].some(n => r.rep.includes(n)) && (
                                <span style={{ fontSize: '10px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px', whiteSpace: 'nowrap' }}>
                                  Dealer Services
                                </span>
                              )}
                            </td>
                            <td
                              className={styles.interactiveCell}
                              onClick={() => handleSelectRep(r.rep, undefined, touchpointMode === 'visits' ? 'visit' : 'all')}
                              title={`Click to audit all ${r.visits} communication logs for ${r.rep}`}
                            >
                              <span style={{ color: '#38bdf8', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 600 }}>
                                {r.visits}
                              </span>
                            </td>
                            <td
                              className={styles.interactiveCell}
                              onClick={() => {
                                setExpandedReps((prev) => ({ ...prev, [r.rep]: true }));
                                setOutcomeFilterMap((prev) => ({ ...prev, [r.rep]: 'inactive' }));
                              }}
                              title={`Click to filter dealer list to inactive dealers visited by ${r.rep}`}
                            >
                              <span style={{ color: '#f8fafc', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 600 }}>
                                {r.inactiveDealersVisited}
                              </span>
                            </td>
                            <td
                              className={styles.interactiveCell}
                              onClick={() => {
                                setExpandedReps((prev) => ({ ...prev, [r.rep]: true }));
                                setOutcomeFilterMap((prev) => ({ ...prev, [r.rep]: 'reactivated' }));
                              }}
                              title={`Click to view ${r.reactivatedCount} reactivated dealers for ${r.rep}`}
                              style={{ fontWeight: 700, color: r.reactivatedCount > 0 ? '#34d399' : '#94a3b8' }}
                            >
                              <span style={{ textDecoration: r.reactivatedCount > 0 ? 'underline' : 'none', textUnderlineOffset: '3px' }}>
                                {r.reactivatedCount}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {r.hasEnoughData && r.reactivationRate != null
                                ? <span style={{ color: r.reactivationRate >= 0.2 ? '#34d399' : r.reactivationRate >= 0.1 ? '#fbbf24' : '#f87171' }}>
                                    {(r.reactivationRate * 100).toFixed(0)}%
                                  </span>
                                : <span style={{ color: '#64748b' }}>Insufficient data</span>}
                            </td>
                            <td style={{ color: '#38bdf8' }}>
                              {r.avgDaysToReactivation != null ? `${r.avgDaysToReactivation}d` : '—'}
                            </td>
                            <td>
                              {r.growthVisitPct != null
                                ? <span style={{ color: r.growthVisitPct >= 0.3 ? '#34d399' : '#fbbf24' }}>
                                    {(r.growthVisitPct * 100).toFixed(0)}% growth
                                  </span>
                                : '—'}
                            </td>
                            <td
                              className={styles.interactiveCell}
                              onClick={() => {
                                setExpandedReps((prev) => ({ ...prev, [r.rep]: true }));
                                setSubSortField('reactivatedVolume');
                                setSubSortOrder('desc');
                              }}
                              title={`Click to sort dealers by reactivated volume for ${r.rep}`}
                              style={{ fontWeight: 600, color: r.reactivatedVolume > 0 ? '#34d399' : '#94a3b8' }}
                            >
                              <span style={{ textDecoration: r.reactivatedVolume > 0 ? 'underline' : 'none', textUnderlineOffset: '3px' }}>
                                {r.reactivatedVolume > 0 ? `+${formatDollar(r.reactivatedVolume)}` : '$0'}
                              </span>
                            </td>
                          </tr>

                          {/* Sub-table: Per-Dealer Breakdown */}
                          {isExpanded && (
                            <tr key={`${r.rep}-dealers`}>
                              <td colSpan={8} style={{ padding: 0 }}>
                                <div className={styles.subTableContainer}>
                                  <div className={styles.subTableHeaderRow}>
                                    <div>
                                      <div className={styles.subTableTitle}>
                                        🏢 Dealers Contacted by {r.rep} ({r.dealers?.length || 0})
                                        {r.matrix && (
                                          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '12px' }}>
                                            Matrix: 🎯 {r.matrix.targeted} targeted · ⚠️ {r.matrix.neglected} neglected · ✅ {r.matrix.maintained} maintained · 🟢 {r.matrix.selfSufficient} self-sufficient
                                          </span>
                                        )}
                                      </div>
                                      {/* Quick Outcome Filter Pills */}
                                      <div className={styles.outcomeFilterBar}>
                                        {[
                                          { key: 'all', label: `All (${r.dealers?.length || 0})` },
                                          { key: 'reactivated', label: `🟢 Reactivated (${r.dealers?.filter((d) => d.outcome === 'reactivated').length || 0})` },
                                          { key: 'no_response', label: `🔴 No Response (${r.dealers?.filter((d) => d.outcome === 'no_response').length || 0})` },
                                          { key: 'maintenance', label: `🟡 Maintenance (${r.dealers?.filter((d) => d.outcome === 'maintenance').length || 0})` },
                                        ].map((f) => (
                                          <button
                                            key={f.key}
                                            className={`${styles.outcomeFilterBtn} ${(outcomeFilterMap[r.rep] || 'all') === f.key ? styles.outcomeFilterBtnActive : ''}`}
                                            onClick={() => setOutcomeFilterMap((prev) => ({ ...prev, [r.rep]: f.key }))}
                                          >
                                            {f.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <input
                                      className={styles.subTableSearch}
                                      placeholder="Filter dealer name, ID, or state..."
                                      value={dealerSearchMap[r.rep] || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setDealerSearchMap((prev) => ({ ...prev, [r.rep]: val }));
                                      }}
                                    />
                                  </div>

                                  {(() => {
                                    const search = (dealerSearchMap[r.rep] || '').toLowerCase().trim();
                                    const outcomeFilter = outcomeFilterMap[r.rep] || 'all';

                                    const filteredDealers = (r.dealers || [])
                                      .filter((d) => {
                                        if (outcomeFilter === 'reactivated' && d.outcome !== 'reactivated') return false;
                                        if (outcomeFilter === 'no_response' && d.outcome !== 'no_response') return false;
                                        if (outcomeFilter === 'maintenance' && d.outcome !== 'maintenance') return false;
                                        if (outcomeFilter === 'inactive' && d.statusAtVisit === 'active') return false;
                                        if (!search) return true;
                                        return (
                                          d.dealerName.toLowerCase().includes(search) ||
                                          (d.clientDealerId && d.clientDealerId.toLowerCase().includes(search)) ||
                                          (d.state && d.state.toLowerCase().includes(search)) ||
                                          (d.groupName && d.groupName.toLowerCase().includes(search))
                                        );
                                      })
                                      .sort((a, b) => {
                                        let valA: any = a[subSortField] ?? '';
                                        let valB: any = b[subSortField] ?? '';
                                        if (typeof valA === 'string') {
                                          valA = valA.toLowerCase();
                                          valB = (valB as string).toLowerCase();
                                        }
                                        if (valA < valB) return subSortOrder === 'asc' ? -1 : 1;
                                        if (valA > valB) return subSortOrder === 'asc' ? 1 : -1;
                                        return 0;
                                      });

                                    if (filteredDealers.length === 0) {
                                      return (
                                        <div style={{ color: '#94a3b8', fontSize: '12px', padding: '12px 0' }}>
                                          {search || outcomeFilter !== 'all'
                                            ? `No dealers matching active filter "${outcomeFilter}" / "${search}".`
                                            : 'No dealers recorded.'}
                                        </div>
                                      );
                                    }

                                    return (
                                      <div className={styles.subTableWrapper}>
                                        <table className={styles.subTable}>
                                          <thead>
                                            <tr>
                                              {renderSubSortHeader('Dealer Location', 'dealerName')}
                                              {renderSubSortHeader('State', 'state')}
                                              {renderSubSortHeader('Visit Date', 'firstContactDate')}
                                              {renderSubSortHeader('Status at Visit', 'statusAtVisit')}
                                              {renderSubSortHeader('Outcome', 'outcome')}
                                              {renderSubSortHeader('Days to React.', 'daysToReactivation')}
                                              {renderSubSortHeader('Reactivated Vol', 'reactivatedVolume')}
                                              {renderSubSortHeader('Visits', 'visitCount')}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {filteredDealers.map((d) => {
                                              const outcomeBadge = d.outcome === 'reactivated'
                                                ? { label: '🟢 Reactivated', color: '#34d399' }
                                                : d.outcome === 'no_response'
                                                  ? { label: '🔴 No Response', color: '#f87171' }
                                                  : { label: '🟡 Maintenance', color: '#fbbf24' };

                                              const statusLabel = d.statusAtVisit === 'active' ? 'Active'
                                                : d.statusAtVisit === 'never_active' ? 'Never Active'
                                                : d.statusAtVisit.replace('_', ' ');

                                              const formattedVisitDate = d.firstContactDate
                                                ? new Date(d.firstContactDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                                : '—';

                                              return (
                                                <tr key={d.clientDealerId}>
                                                  <td
                                                    className={styles.interactiveCell}
                                                    onClick={() => openDealer360(d.clientDealerId || d.dealerName, d.dealerName, 'timeline', d.firstContactDate)}
                                                    title={`Click to open 360° Cause & Effect Timeline for ${d.dealerName} (Anchored to ${d.firstContactDate})`}
                                                  >
                                                    <span className={styles.dealerNameLink}>
                                                      {d.dealerName}
                                                    </span>
                                                    <span style={{ fontSize: '10px', color: '#38bdf8', display: 'block' }}>
                                                      ID: {d.clientDealerId}
                                                    </span>
                                                  </td>
                                                  <td>{d.state || '—'}</td>
                                                  <td style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                    {formattedVisitDate}
                                                  </td>
                                                  <td style={{ fontSize: '12px', color: d.statusAtVisit === 'active' ? '#34d399' : '#f87171' }}>
                                                    {statusLabel}
                                                  </td>
                                                  <td>
                                                    <span style={{
                                                      fontWeight: 700,
                                                      fontSize: '12px',
                                                      color: outcomeBadge.color,
                                                    }}>
                                                      {outcomeBadge.label}
                                                    </span>
                                                  </td>
                                                  <td style={{ color: '#38bdf8' }}>
                                                    {d.daysToReactivation != null ? `${d.daysToReactivation}d` : '—'}
                                                  </td>
                                                  <td style={{ fontWeight: 600, color: d.reactivatedVolume > 0 ? '#34d399' : '#94a3b8' }}>
                                                    {d.reactivatedVolume > 0 ? `+${formatDollar(d.reactivatedVolume)}` : '$0'}
                                                  </td>
                                                  <td>{d.visitCount}</td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot style={{ borderTop: '2px solid rgba(255, 255, 255, 0.15)', background: '#090d16', fontWeight: 700 }}>
                    <tr>
                      <td style={{ color: '#38bdf8' }}>Network Total</td>
                      <td>{impactData.overall.totalVisits}</td>
                      <td>{impactData.overall.inactiveDealersVisited}</td>
                      <td style={{ color: '#34d399' }}>{impactData.overall.reactivatedCount}</td>
                      <td style={{ color: '#34d399' }}>
                        {impactData.overall.reactivationRate != null
                          ? `${(impactData.overall.reactivationRate * 100).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td style={{ color: '#38bdf8' }}>
                        {impactData.overall.avgDaysToReactivation != null
                          ? `${Math.round(impactData.overall.avgDaysToReactivation)}d`
                          : '—'}
                      </td>
                      <td>
                        {impactData.overall.growthVisitPct != null
                          ? `${(impactData.overall.growthVisitPct * 100).toFixed(0)}%`
                          : '—'}
                      </td>
                      <td style={{ color: '#34d399' }}>
                        +{formatDollar(impactData.overall.reactivatedVolume)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      {/* Full Communication Item Detail Modal */}
      {selectedCommItem && (
        <div className={styles.detailOverlay} onClick={() => setSelectedCommItem(null)}>
          <div className={styles.detailModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.detailHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 className={styles.detailTitle}>
                  Communication Record #{selectedCommItem.sourceCommunicationId}
                </h3>
                {renderTypeBadge(selectedCommItem.type)}
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setSelectedCommItem(null)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className={styles.detailBody}>
              {/* Detail Grid */}
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Sales Representative</span>
                  <span className={styles.detailValue}>
                    {selectedCommItem.repName}
                    {selectedCommItem.userEmail && (
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400, display: 'block' }}>
                        {selectedCommItem.userEmail}
                      </span>
                    )}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Dealer Location</span>
                  <span className={styles.detailValue}>
                    {selectedCommItem.dealerName}
                    {selectedCommItem.clientDealerId && (
                      <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600, display: 'block' }}>
                        ID: {selectedCommItem.clientDealerId}
                      </span>
                    )}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Date & Time</span>
                  <span className={styles.detailValue}>
                    {new Date(selectedCommItem.date).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>State & Group</span>
                  <span className={styles.detailValue}>
                    {selectedCommItem.state || 'N/A'} · {selectedCommItem.groupName || 'Independent'}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Source System</span>
                  <span className={styles.detailValue}>
                    {selectedCommItem.sourceSystem || 'OMNI CRM'}
                  </span>
                </div>

                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Relationship Status</span>
                  <span className={styles.detailValue} style={{ color: selectedCommItem.isActiveRelationship ? '#34d399' : '#94a3b8' }}>
                    {selectedCommItem.isActiveRelationship ? 'Active Relationship' : selectedCommItem.isProspect ? 'Prospect' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Communication Result Box */}
              <div className={styles.detailItemFull}>
                <span className={styles.detailLabel}>Communication Result / Status</span>
                <div className={styles.detailBox}>
                  {selectedCommItem.result || 'No specific result status logged.'}
                </div>
              </div>

              {/* Meeting Notes / Feedback Box */}
              <div className={styles.detailItemFull}>
                <span className={styles.detailLabel}>Full Meeting Notes & Feedback</span>
                <div className={styles.detailBox} style={{ minHeight: '80px' }}>
                  {selectedCommItem.feedback || 'No additional feedback notes recorded.'}
                </div>
              </div>

              {/* Footer Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
                <button
                  className={styles.backBtn}
                  onClick={() => setSelectedCommItem(null)}
                >
                  Close Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
