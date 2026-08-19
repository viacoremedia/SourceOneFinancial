/**
 * RelationshipDemandView — Executive Dealer Relationship Demand (DRD) Engine UI
 * 
 * Displays lifetime behavioral categorization (High TLC, Self-Sufficient, Unresponsive, Insufficient)
 * with sales urgency routing, rep time allocation diagnostics, and dealer drilldowns.
 */

import { useState, useEffect, useCallback } from 'react';
import styles from './VisitImpactDrawer.module.css';
import {
  getRelationshipDemandSummary,
  getRelationshipDemandDealers,
  getRepAllocationDiagnostics,
  triggerRecalculateDemandProfiles,
  getRepMappings
} from '../../../../core/services/api';
import type {
  RelationshipDemandSummaryResponse,
  DealerProfileItem,
  RepAllocationDiagnosticResponse,
  RepMappings
} from '../../../../core/services/api';

interface RelationshipDemandViewProps {
  onOpenDealer360: (dealerId: string) => void;
}

export function RelationshipDemandView({ onOpenDealer360 }: RelationshipDemandViewProps) {
  const [summary, setSummary] = useState<RelationshipDemandSummaryResponse | null>(null);
  const [repAllocations, setRepAllocations] = useState<RepAllocationDiagnosticResponse['repAllocations'] | null>(null);
  const [dealers, setDealers] = useState<DealerProfileItem[]>([]);
  const [totalDealers, setTotalDealers] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [recalculating, setRecalculating] = useState<boolean>(false);

  // Filters
  const [selectedDemand, setSelectedDemand] = useState<string>('all');
  const [selectedUrgency, setSelectedUrgency] = useState<string>('all');
  const [selectedRep, setSelectedRep] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [sortField] = useState<string>('urgency');
  const [sortOrder] = useState<'asc' | 'desc'>('desc');

  // Rep mappings for filters
  const [repMappings, setRepMappings] = useState<RepMappings | null>(null);

  useEffect(() => {
    getRepMappings().then(setRepMappings).catch(console.error);
  }, []);

  const fetchSummaryAndAllocations = useCallback(async () => {
    try {
      const [sumRes, allocRes] = await Promise.all([
        getRelationshipDemandSummary({ rep: selectedRep, state: selectedState }),
        getRepAllocationDiagnostics()
      ]);
      setSummary(sumRes);
      setRepAllocations(allocRes.repAllocations);
    } catch (err) {
      console.error('Failed to load DRD summary:', err);
    }
  }, [selectedRep, selectedState]);

  const fetchDealers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRelationshipDemandDealers({
        demand: selectedDemand,
        urgency: selectedUrgency,
        rep: selectedRep,
        state: selectedState,
        search: searchQuery,
        sort: sortField,
        order: sortOrder,
        page,
        limit: 25
      });
      setDealers(res.dealers);
      setTotalDealers(res.total);
    } catch (err) {
      console.error('Failed to load DRD dealers:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDemand, selectedUrgency, selectedRep, selectedState, searchQuery, sortField, sortOrder, page]);

  useEffect(() => {
    fetchSummaryAndAllocations();
  }, [fetchSummaryAndAllocations]);

  useEffect(() => {
    fetchDealers();
  }, [fetchDealers]);

  const handleRecalculate = async () => {
    if (recalculating) return;
    setRecalculating(true);
    try {
      await triggerRecalculateDemandProfiles();
      await Promise.all([fetchSummaryAndAllocations(), fetchDealers()]);
    } catch (err) {
      console.error('Recalculation error:', err);
    } finally {
      setRecalculating(false);
    }
  };

  const formatDollar = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };

  const renderDemandBadge = (demand: string) => {
    switch (demand) {
      case 'high_tlc':
        return <span className={styles.badgeOverdue} style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>🔴 High TLC</span>;
      case 'self_sufficient':
        return <span className={styles.badgeOnTrack} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>🟢 Self-Sufficient</span>;
      case 'unresponsive':
        return <span className={styles.badgeDueSoon} style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#f97316' }}>🟠 Unresponsive</span>;
      default:
        return <span className={styles.badgeNotMonitored}>⚪ Insufficient Data</span>;
    }
  };

  const renderUrgencyBadge = (urgency: string, cadence?: number | null, daysSince?: number | null) => {
    switch (urgency) {
      case 'overdue':
        return (
          <span className={styles.badgeOverdue} title={`Overdue for in-person visit (Cadence: ${cadence || 30}d, Last Visit: ${daysSince != null ? `${daysSince}d ago` : 'Never'})`}>
            🚨 Overdue ({daysSince != null ? `${daysSince}d` : 'Never'})
          </span>
        );
      case 'due_soon':
        return (
          <span className={styles.badgeDueSoon} title={`Visit due within 7 days (Cadence: ${cadence || 30}d, Last Visit: ${daysSince}d ago)`}>
            ⏳ Due Soon ({daysSince}d)
          </span>
        );
      case 'on_track':
        return (
          <span className={styles.badgeOnTrack} title={`Visited recently (${daysSince}d ago)`}>
            ✅ On Track ({daysSince}d)
          </span>
        );
      case 'self_sufficient':
        return <span className={styles.badgeSelfSuff}>🟢 Autonomous</span>;
      default:
        return <span className={styles.badgeNotMonitored}>—</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── 1. Summary KPI Grid ── */}
      {summary && (
        <div className={styles.drdSummaryGrid}>
          {/* Card 1: High TLC */}
          <div
            className={`${styles.drdCard} ${styles.drdCardHighTlc}`}
            style={{ cursor: 'pointer', border: selectedDemand === 'high_tlc' ? '2px solid #ef4444' : undefined }}
            onClick={() => { setSelectedDemand(selectedDemand === 'high_tlc' ? 'all' : 'high_tlc'); setPage(1); }}
          >
            <div className={styles.drdCardHeader}>
              <span className={styles.drdCardTitle}>🔴 High TLC (Visit-Dependent)</span>
              {summary.urgency.overdue > 0 && (
                <span className={styles.warningBadge} title={`${summary.urgency.overdue} High TLC dealers currently overdue for a visit`}>
                  🚨 {summary.urgency.overdue} Overdue
                </span>
              )}
            </div>
            <div className={styles.drdCardCount}>
              {summary.segments.high_tlc.count.toLocaleString()}
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8', marginLeft: '6px' }}>
                ({summary.segments.high_tlc.pct}%)
              </span>
            </div>
            <div className={styles.drdCardSub}>
              {formatDollar(summary.segments.high_tlc.bookedVolume)} Booked • {summary.segments.high_tlc.totalVisits.toLocaleString()} Visits
              <br />
              <strong style={{ color: '#ef4444' }}>Priority Field Route:</strong> Strictly enforce 30–45d cadence
            </div>
          </div>

          {/* Card 2: Self-Sufficient */}
          <div
            className={`${styles.drdCard} ${styles.drdCardSelfSuff}`}
            style={{ cursor: 'pointer', border: selectedDemand === 'self_sufficient' ? '2px solid #10b981' : undefined }}
            onClick={() => { setSelectedDemand(selectedDemand === 'self_sufficient' ? 'all' : 'self_sufficient'); setPage(1); }}
          >
            <div className={styles.drdCardHeader}>
              <span className={styles.drdCardTitle}>🟢 Self-Sufficient (Organic)</span>
            </div>
            <div className={styles.drdCardCount}>
              {summary.segments.self_sufficient.count.toLocaleString()}
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8', marginLeft: '6px' }}>
                ({summary.segments.self_sufficient.pct}%)
              </span>
            </div>
            <div className={styles.drdCardSub}>
              {formatDollar(summary.segments.self_sufficient.bookedVolume)} Booked • {summary.segments.self_sufficient.totalBookings.toLocaleString()} Bookings
              <br />
              <strong style={{ color: '#10b981' }}>Digital Check-In:</strong> Reduce field visits; maintain quarterly
            </div>
          </div>

          {/* Card 3: Unresponsive / Time Sink */}
          <div
            className={`${styles.drdCard} ${styles.drdCardUnresponsive}`}
            style={{ cursor: 'pointer', border: selectedDemand === 'unresponsive' ? '2px solid #f97316' : undefined }}
            onClick={() => { setSelectedDemand(selectedDemand === 'unresponsive' ? 'all' : 'unresponsive'); setPage(1); }}
          >
            <div className={styles.drdCardHeader}>
              <span className={styles.drdCardTitle}>🟠 Unresponsive (Comfort Stop)</span>
            </div>
            <div className={styles.drdCardCount}>
              {summary.segments.unresponsive.count.toLocaleString()}
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8', marginLeft: '6px' }}>
                ({summary.segments.unresponsive.pct}%)
              </span>
            </div>
            <div className={styles.drdCardSub}>
              {summary.segments.unresponsive.totalVisits.toLocaleString()} Wasted Visits • $0 Booked
              <br />
              <strong style={{ color: '#f97316' }}>Audit & Freeze:</strong> Stop field reps from comfort stops
            </div>
          </div>

          {/* Card 4: Insufficient Data */}
          <div
            className={`${styles.drdCard} ${styles.drdCardInsufficient}`}
            style={{ cursor: 'pointer', border: selectedDemand === 'insufficient_data' ? '2px solid #94a3b8' : undefined }}
            onClick={() => { setSelectedDemand(selectedDemand === 'insufficient_data' ? 'all' : 'insufficient_data'); setPage(1); }}
          >
            <div className={styles.drdCardHeader}>
              <span className={styles.drdCardTitle}>⚪ Insufficient History</span>
            </div>
            <div className={styles.drdCardCount}>
              {summary.segments.insufficient_data.count.toLocaleString()}
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8', marginLeft: '6px' }}>
                ({summary.segments.insufficient_data.pct}%)
              </span>
            </div>
            <div className={styles.drdCardSub}>
              {formatDollar(summary.segments.insufficient_data.bookedVolume)} Booked
              <br />
              <strong style={{ color: '#94a3b8' }}>Discovery Queue:</strong> Needs exploratory baseline visit
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Overdue High TLC Priority Alert Bar ── */}
      {summary && summary.urgency.overdue > 0 && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.15) 0%, rgba(15, 23, 42, 0.6) 100%)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: '10px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>🚨</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#f87171' }}>
                Joseph's Action Queue: {summary.urgency.overdue} High TLC Accounts Overdue for In-Person Visit
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                These dealers strictly produce when visited and are currently dormant or past their recommended visit cadence.
              </div>
            </div>
          </div>
          <button
            className={styles.windowBtn}
            style={{
              background: selectedUrgency === 'overdue' ? '#ef4444' : 'rgba(239, 68, 68, 0.2)',
              color: '#ffffff',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              padding: '6px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 700
            }}
            onClick={() => {
              setSelectedUrgency(selectedUrgency === 'overdue' ? 'all' : 'overdue');
              setSelectedDemand('high_tlc');
              setPage(1);
            }}
          >
            {selectedUrgency === 'overdue' ? '✓ Showing Overdue' : 'View Overdue Queue →'}
          </button>
        </div>
      )}

      {/* ── 3. Rep Visit Allocation Diagnostic Matrix ── */}
      {repAllocations && repAllocations.length > 0 && (
        <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                📊 Sales Rep Visit Allocation Matrix
              </h3>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Diagnostics showing how field reps allocate their in-person visits across High TLC vs Autonomous vs Unresponsive dealers
              </span>
            </div>
            <button className={styles.recalcBtn} onClick={handleRecalculate} disabled={recalculating}>
              {recalculating ? 'Recalculating...' : '🔄 Refresh Classifications'}
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className={styles.repTable} style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Sales Rep</th>
                  <th style={{ textAlign: 'center' }}>Total Dealers</th>
                  <th style={{ textAlign: 'center' }}>Total Visits</th>
                  <th style={{ textAlign: 'center' }}>🔴 High TLC Visits</th>
                  <th style={{ textAlign: 'center' }}>🟢 Autonomous Visits</th>
                  <th style={{ textAlign: 'center' }}>🟠 Unresponsive Visits</th>
                  <th style={{ textAlign: 'center' }}>🚨 Overdue TLC</th>
                  <th style={{ textAlign: 'right' }}>Total Booked Volume</th>
                </tr>
              </thead>
              <tbody>
                {repAllocations.map((r) => (
                  <tr
                    key={r.rep}
                    style={{ cursor: 'pointer', background: selectedRep === r.rep ? 'rgba(56, 189, 248, 0.1)' : undefined }}
                    onClick={() => { setSelectedRep(selectedRep === r.rep ? '' : r.rep); setPage(1); }}
                    title={`Click to filter dealer list to ${r.rep}`}
                  >
                    <td style={{ fontWeight: 600, color: '#f8fafc' }}>
                      {r.rep} {r.misallocatedWarning && <span className={styles.warningBadge} style={{ marginLeft: '6px' }}>⚠️ Misallocated</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>{r.totalDealers}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.totalVisits}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>{r.highTlcVisits}</span>
                      <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '4px' }}>({r.highTlcVisitPct}%)</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>{r.selfSuffVisits}</span>
                      <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '4px' }}>({r.selfSuffVisitPct}%)</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: r.unresponsiveVisitPct > 20 ? '#f97316' : '#94a3b8', fontWeight: 600 }}>{r.unresponsiveVisits}</span>
                      <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '4px' }}>({r.unresponsiveVisitPct}%)</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {r.overdueCount > 0 ? (
                        <span className={styles.badgeOverdue} style={{ padding: '1px 6px', fontSize: '10px' }}>
                          {r.overdueCount} Overdue
                        </span>
                      ) : (
                        <span style={{ color: '#64748b' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
                      {formatDollar(r.totalBookedVolume)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 4. Filter & Search Bar for Dealer Explorer ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Quick Segment Filter */}
          <select
            className={styles.filterSelect}
            value={selectedDemand}
            onChange={(e) => { setSelectedDemand(e.target.value); setPage(1); }}
            style={{ background: '#0f172a', borderColor: '#38bdf8', color: '#38bdf8', fontWeight: 600 }}
          >
            <option value="all">🎯 All Relationship Tiers</option>
            <option value="high_tlc">🔴 High TLC (Visit-Dependent)</option>
            <option value="self_sufficient">🟢 Self-Sufficient (Organic)</option>
            <option value="unresponsive">🟠 Unresponsive (Comfort Stop)</option>
            <option value="insufficient_data">⚪ Insufficient Data</option>
          </select>

          {/* Urgency Filter */}
          <select
            className={styles.filterSelect}
            value={selectedUrgency}
            onChange={(e) => { setSelectedUrgency(e.target.value); setPage(1); }}
          >
            <option value="all">⚡ All Urgency Statuses</option>
            <option value="overdue">🚨 Overdue Visits Only</option>
            <option value="due_soon">⏳ Due Soon (Within 7d)</option>
            <option value="on_track">✅ On Track</option>
            <option value="self_sufficient">🟢 Autonomous</option>
          </select>

          {/* Rep Select */}
          <select
            className={styles.filterSelect}
            value={selectedRep}
            onChange={(e) => { setSelectedRep(e.target.value); setPage(1); }}
          >
            <option value="">All Sales Reps</option>
            {(repMappings?.allReps || []).map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          {/* State Select */}
          <select
            className={styles.filterSelect}
            value={selectedState}
            onChange={(e) => { setSelectedState(e.target.value); setPage(1); }}
          >
            <option value="">All States</option>
            {(repMappings?.allStates || []).map((st) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        {/* Search Input */}
        <input
          type="text"
          placeholder="🔍 Search dealer or ID..."
          className={styles.subTableSearch}
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          style={{ width: '240px' }}
        />
      </div>

      {/* ── 5. Dealer Relationship Demand Master Table ── */}
      <div style={{ background: '#090d16', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: '#1e293b', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
            📋 Dealer Relationship Profiles ({totalDealers.toLocaleString()} matching)
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            Page {page} of {Math.max(1, Math.ceil(totalDealers / 25))}
          </span>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: '420px' }}>
          <table className={styles.repTable} style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Dealer ID / Name</th>
                <th style={{ textAlign: 'center' }}>State</th>
                <th style={{ textAlign: 'left' }}>Assigned Rep</th>
                <th style={{ textAlign: 'center' }}>Relationship Demand</th>
                <th style={{ textAlign: 'center' }}>Visit Urgency</th>
                <th style={{ textAlign: 'center' }}>Elasticity ($E_v$)</th>
                <th style={{ textAlign: 'center' }}>Half-Life</th>
                <th style={{ textAlign: 'center' }}>Visits</th>
                <th style={{ textAlign: 'center' }}>Apps</th>
                <th style={{ textAlign: 'center' }}>Booked</th>
                <th style={{ textAlign: 'right' }}>Booked Volume</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                    Loading relationship profiles...
                  </td>
                </tr>
              ) : dealers.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                    No dealers match the selected filters.
                  </td>
                </tr>
              ) : (
                dealers.map((d) => (
                  <tr key={d._id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '13px' }}>{d.dealerName}</span>
                        <span style={{ fontSize: '11px', color: '#38bdf8', fontFamily: 'var(--font-mono, monospace)' }}>{d.clientDealerId}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>{d.statePrefix || '—'}</td>
                    <td style={{ color: '#cbd5e1' }}>{d.assignedRep || 'Unassigned'}</td>
                    <td style={{ textAlign: 'center' }}>{renderDemandBadge(d.relationshipDemand)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {renderUrgencyBadge(d.urgencyStatus, d.recommendedCadenceDays, d.daysSinceLastVisit)}
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>
                      {d.visitElasticity != null ? (
                        <span style={{ color: d.visitElasticity >= 2.0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                          {d.visitElasticity}x
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'center', color: '#94a3b8' }}>
                      {d.productionHalfLifeDays ? `~${d.productionHalfLifeDays}d` : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{d.lifetimeStats.totalVisits}</td>
                    <td style={{ textAlign: 'center' }}>{d.lifetimeStats.totalApplications}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#34d399' }}>{d.lifetimeStats.totalBookings}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>
                      {formatDollar(d.lifetimeStats.totalBookedVolume)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className={styles.viewTimelineBtn}
                        style={{ padding: '3px 8px', fontSize: '11px', borderRadius: '4px' }}
                        onClick={() => onOpenDealer360(d.clientDealerId)}
                        title="Open 360° Cause & Effect Inspection"
                      >
                        Inspect 360° →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalDealers > 25 && (
          <div style={{ padding: '10px 16px', background: '#1e293b', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              className={styles.windowBtn}
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              style={{ opacity: page <= 1 ? 0.4 : 1 }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Page {page} of {Math.ceil(totalDealers / 25)}
            </span>
            <button
              className={styles.windowBtn}
              disabled={page >= Math.ceil(totalDealers / 25)}
              onClick={() => setPage(page + 1)}
              style={{ opacity: page >= Math.ceil(totalDealers / 25) ? 0.4 : 1 }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
