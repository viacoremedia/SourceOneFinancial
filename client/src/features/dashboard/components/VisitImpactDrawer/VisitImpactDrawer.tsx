/**
 * VisitImpactDrawer — Diagnostic drawer for Sales Managers.
 * Analyzes in-person visit lift, account allocation, and provides interactive, paginated
 * communication history for any selected sales representative.
 */

import { useState, useEffect, useCallback } from 'react';
import styles from './VisitImpactDrawer.module.css';
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

export function VisitImpactDrawer({ open, onClose }: VisitImpactDrawerProps) {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [impactData, setImpactData] = useState<VisitImpactResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Selected Rep for detailed communication history view
  const [selectedRep, setSelectedRep] = useState<string | null>(null);

  // Selected Communication Item for Full Detail Modal
  const [selectedCommItem, setSelectedCommItem] = useState<CommItem | null>(null);

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

    getVisitImpact(windowDays)
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
  }, [open, windowDays]);

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

  const handleSelectRep = (repName: string) => {
    setSelectedRep(repName);
    setHistoryPage(1);
    setHistoryState('');
    setHistoryGroup('');
    setHistoryType('all');
    setHistorySearch('');
    setSelectedCommItem(null);
  };

  const handleBackToLift = () => {
    setSelectedRep(null);
    setHistoryData(null);
    setSelectedCommItem(null);
  };

  if (!open) return null;

  const formatDollar = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
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
                <h2 className={styles.title}>📍 Sales Visit & Touchpoint Impact Engine</h2>
                {impactData?.dateRangeLabel && (
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
                    title="Date range of communication data and applications capped through latest report date"
                  >
                    📅 Data Range: {impactData.dateRangeLabel}
                  </span>
                )}
                <div className={styles.windowToggle}>
                  {[14, 30, 60].map((w) => (
                    <button
                      key={w}
                      className={`${styles.windowBtn} ${windowDays === w ? styles.windowBtnActive : ''}`}
                      onClick={() => setWindowDays(w)}
                    >
                      {w}d Window {w === 30 ? '(Default)' : ''}
                    </button>
                  ))}
                </div>
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
                            {new Date(item.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
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
          ) : (
            /* ── Default Rep Visit Lift Table View ── */
            loading ? (
              <div style={{ color: '#94a3b8', padding: '40px 0', textAlign: 'center' }}>
                Analyzing touchpoints and volume lift…
              </div>
            ) : !impactData ? (
              <div style={{ color: '#94a3b8', padding: '40px 0', textAlign: 'center' }}>
                No communication impact data available.
              </div>
            ) : (
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>
                  📊 Rep Visit Lift Performance ({windowDays}-Day Window)
                  <span style={{ fontSize: '12px', fontWeight: 400, color: '#94a3b8', marginLeft: '8px' }}>
                    (Click any Sales Representative name to view full communication logs)
                  </span>
                </h3>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Sales Representative</th>
                      <th>Touchpoints</th>
                      <th>Visits</th>
                      <th>{windowDays}d Pre-Visit Vol</th>
                      <th>{windowDays}d Post-Visit Vol</th>
                      <th>Associated Net $ Lift</th>
                      <th>Net App Lift</th>
                      <th>Avg $ Lift / Visit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impactData.reps.map((r) => (
                      <tr key={r.rep}>
                        <td>
                          <button
                            className={styles.repLinkButton}
                            onClick={() => handleSelectRep(r.rep)}
                            title={`Click to view all communication history logs for ${r.rep}`}
                          >
                            {r.rep}
                          </button>
                        </td>
                        <td>{r.totalTouchpoints}</td>
                        <td>{r.visitCount}</td>
                        <td>{formatDollar(r.preVisitVolume)}</td>
                        <td>{formatDollar(r.postVisitVolume)}</td>
                        <td className={r.associatedNetLiftDollars >= 0 ? styles.liftPositive : styles.liftNegative}>
                          {r.hasEnoughData
                            ? `${r.associatedNetLiftDollars >= 0 ? '+' : ''}${formatDollar(r.associatedNetLiftDollars)}`
                            : 'Insufficient data'}
                        </td>
                        <td className={r.associatedNetLiftApps >= 0 ? styles.liftPositive : styles.liftNegative}>
                          {r.hasEnoughData
                            ? `${r.associatedNetLiftApps >= 0 ? '+' : ''}${r.associatedNetLiftApps}`
                            : 'Insufficient data'}
                        </td>
                        <td style={{ fontWeight: 600, color: '#38bdf8' }}>
                          {r.hasEnoughData ? formatDollar(r.avgLiftPerVisit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
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
