/**
 * RelationshipDemandView — Executive Dealer Relationship Demand (DRD) Engine UI (v6.2 Final)
 * 
 * 3 Dedicated Inner Tabs:
 *   1. Executive Allocation & Overdue Queue (Hero KPIs + Interactive Click-to-Filter Rep Matrix)
 *   2. Dealer Relationship Explorer (Searchable master table with plain-English metrics)
 *   3. Rep Misallocation Diagnostics (Identifies reps burning road trips on Comfort Stops)
 * 
 * Includes direct integration with DealerRelationshipDrawer (Zero Modals).
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
import { DealerRelationshipDrawer } from '../DealerRelationshipDrawer/DealerRelationshipDrawer';
import { useAuth } from '../../../auth/hooks/useAuth';
import {
  Users,
  Search,
  RotateCw,
  Briefcase,
  Layers,
  ArrowUpDown
} from 'lucide-react';

function formatDollar(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function RelationshipDemandView() {
  const { user } = useAuth();
  const isInsideRep = user?.role === 'inside_rep';
  const assignedRep = user?.assignedRep;

  // Navigation
  const [activeTab, setActiveTab] = useState<'allocation' | 'explorer' | 'diagnostics'>('allocation');

  // Drawer state
  const [drawerDealerId, setDrawerDealerId] = useState<string | null>(null);

  // Data states
  const [summary, setSummary] = useState<RelationshipDemandSummaryResponse | null>(null);
  const [repAllocations, setRepAllocations] = useState<RepAllocationDiagnosticResponse['repAllocations'] | null>(null);
  const [dealers, setDealers] = useState<DealerProfileItem[]>([]);
  const [totalDealers, setTotalDealers] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [recalculating, setRecalculating] = useState<boolean>(false);

  // Filter & Sort states
  const [selectedDemand, setSelectedDemand] = useState<string>('all');
  const [selectedUrgency, setSelectedUrgency] = useState<string>('all');
  const [selectedRep, setSelectedRep] = useState<string>(isInsideRep && assignedRep ? assignedRep : '');
  const [selectedState, setSelectedState] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<string>('urgency');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);

  // Rep mappings for filter dropdowns
  const [repMappings, setRepMappings] = useState<RepMappings | null>(null);

  useEffect(() => {
    if (isInsideRep && assignedRep) {
      setSelectedRep(assignedRep);
    }
  }, [isInsideRep, assignedRep]);

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
      await fetchSummaryAndAllocations();
      await fetchDealers();
    } catch (err) {
      console.error('Failed to recalculate profiles:', err);
    } finally {
      setRecalculating(false);
    }
  };

  // Clickable Matrix Filter Handler
  const handleMatrixFilter = (repName: string, urgencyFilter: string) => {
    setSelectedRep(repName);
    setSelectedUrgency(urgencyFilter);
    setSelectedDemand('high_tlc');
    setPage(1);
    setActiveTab('explorer');
  };

  const handleOpenDealer = (clientDealerId: string) => {
    setDrawerDealerId(clientDealerId);
  };

  const handleSortChange = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0' }}>
      {/* Top Header & Recompute Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
            Dealer Relationship Demand & Visit Allocation
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
            Multi-cycle temporal pattern engine segmenting 3,940 dealer rooftops into actionable sales routing tiers.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {summary?.lastCalculatedAt && (
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
              Calculated: {new Date(summary.lastCalculatedAt).toLocaleDateString()}
            </span>
          )}
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              color: '#38bdf8',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: recalculating ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <RotateCw size={14} className={recalculating ? styles.spinning : ''} />
            <span>{recalculating ? 'Recomputing...' : 'Recompute DRD'}</span>
          </button>
        </div>
      </div>

      {/* 3 Inner View Tabs */}
      <div className={styles.innerTabsBar}>
        <button
          onClick={() => setActiveTab('allocation')}
          className={`${styles.innerTabPill} ${activeTab === 'allocation' ? styles.innerTabPillActive : ''}`}
        >
          <Layers size={14} />
          <span>Executive Queue</span>
        </button>

        <button
          onClick={() => setActiveTab('explorer')}
          className={`${styles.innerTabPill} ${activeTab === 'explorer' ? styles.innerTabPillActive : ''}`}
        >
          <Search size={14} />
          <span>Dealer Explorer ({totalDealers.toLocaleString()})</span>
        </button>

        <button
          onClick={() => setActiveTab('diagnostics')}
          className={`${styles.innerTabPill} ${activeTab === 'diagnostics' ? styles.innerTabPillActive : ''}`}
        >
          <Briefcase size={14} />
          <span>Misallocation Diagnostics</span>
        </button>
      </div>

      {/* ── TAB 1: EXECUTIVE ALLOCATION & OVERDUE ACTION QUEUE ── */}
      {activeTab === 'allocation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* 4 Hero KPI Banners */}
          <div className={styles.heroKpiGrid}>
            {/* High TLC Card */}
            <div className={styles.heroKpiCard} style={{ background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.25)' }}>
              <div className={styles.heroKpiTopRow}>
                <span className={styles.heroKpiBadge} style={{ color: '#f87171' }}>
                  🔴 High TLC (Visit-Dependent)
                </span>
                <span className={styles.heroKpiPct} style={{ color: '#fca5a5' }}>
                  {summary?.segments.high_tlc.pct || 0}%
                </span>
              </div>
              <div className={styles.heroKpiCount}>
                {summary?.segments.high_tlc.count || 0} Rooftops
              </div>
              <div className={styles.heroKpiSub}>
                Funded Volume: <strong>{formatDollar(summary?.segments.high_tlc.bookedVolume || 0)}</strong>
              </div>
              <div className={styles.heroKpiAlert} style={{ color: '#ef4444' }}>
                🚨 {summary?.urgency.overdue || 0} Overdue • ⏳ {summary?.urgency.due_soon || 0} Due Soon
              </div>
            </div>

            {/* Self-Sufficient Card */}
            <div className={styles.heroKpiCard} style={{ background: 'rgba(16, 185, 129, 0.08)', borderColor: 'rgba(16, 185, 129, 0.25)' }}>
              <div className={styles.heroKpiTopRow}>
                <span className={styles.heroKpiBadge} style={{ color: '#34d399' }}>
                  🟢 Self-Sufficient (Organic)
                </span>
                <span className={styles.heroKpiPct} style={{ color: '#6ee7b7' }}>
                  {summary?.segments.self_sufficient.pct || 0}%
                </span>
              </div>
              <div className={styles.heroKpiCount}>
                {summary?.segments.self_sufficient.count || 0} Rooftops
              </div>
              <div className={styles.heroKpiSub}>
                Funded Volume: <strong>{formatDollar(summary?.segments.self_sufficient.bookedVolume || 0)}</strong>
              </div>
              <div className={styles.heroKpiAlert} style={{ color: '#34d399' }}>
                ✅ Portal flow — Deprioritize road trips
              </div>
            </div>

            {/* Comfort Stop Card */}
            <div className={styles.heroKpiCard} style={{ background: 'rgba(249, 115, 22, 0.08)', borderColor: 'rgba(249, 115, 22, 0.25)' }}>
              <div className={styles.heroKpiTopRow}>
                <span className={styles.heroKpiBadge} style={{ color: '#fb923c' }}>
                  🟠 Comfort Stop (Time Sink)
                </span>
                <span className={styles.heroKpiPct} style={{ color: '#fdba74' }}>
                  {summary?.segments.comfort_stop.pct || 0}%
                </span>
              </div>
              <div className={styles.heroKpiCount}>
                {summary?.segments.comfort_stop.count || 0} Rooftops
              </div>
              <div className={styles.heroKpiSub}>
                Wasted Visits: <strong>{summary?.segments.comfort_stop.totalVisits.toLocaleString() || 0} visits</strong>
              </div>
              <div className={styles.heroKpiAlert} style={{ color: '#fb923c' }}>
                ⚠️ $0 Booked Loans — Freeze visits
              </div>
            </div>

            {/* Discovery Queue Card */}
            <div className={styles.heroKpiCard} style={{ background: 'rgba(148, 163, 184, 0.08)', borderColor: 'rgba(148, 163, 184, 0.25)' }}>
              <div className={styles.heroKpiTopRow}>
                <span className={styles.heroKpiBadge} style={{ color: '#cbd5e1' }}>
                  ⚪ Discovery Queue (Low Data)
                </span>
                <span className={styles.heroKpiPct} style={{ color: '#94a3b8' }}>
                  {summary?.segments.insufficient_data.pct || 0}%
                </span>
              </div>
              <div className={styles.heroKpiCount}>
                {summary?.segments.insufficient_data.count.toLocaleString() || 0} Rooftops
              </div>
              <div className={styles.heroKpiSub}>
                Unexplored: <strong>&lt;2 visits / &lt;5 apps</strong>
              </div>
              <div className={styles.heroKpiAlert} style={{ color: '#94a3b8' }}>
                🔍 Schedule baseline check-in
              </div>
            </div>
          </div>

          {/* Interactive Sales Rep Allocation Matrix */}
          <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={16} color="#38bdf8" />
                  <span>Sales Rep Route Allocation Matrix</span>
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
                  Clicking any red overdue badge instantly filters the master dealer table to that representative's overdue High TLC accounts.
                </p>
              </div>
            </div>

            <div className={styles.matrixTableScroll}>
              <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '10px 12px' }}>Sales Representative</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>🔴 High TLC Overdue</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>⏳ High TLC Due Soon</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>✅ High TLC On Track</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>🟢 Autonomous</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>🟠 Comfort Stops</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total Booked Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {repAllocations && repAllocations.length > 0 ? (
                    repAllocations.map((r) => (
                      <tr
                        key={r.rep}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '12px', fontWeight: 600, color: '#ffffff' }}>
                          {r.rep}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {r.overdueCount > 0 ? (
                            <button
                              onClick={() => handleMatrixFilter(r.rep, 'overdue')}
                              style={{
                                background: 'rgba(239, 68, 68, 0.2)',
                                color: '#fca5a5',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                padding: '3px 10px',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              title={`View ${r.overdueCount} Overdue accounts for ${r.rep}`}
                            >
                              🚨 {r.overdueCount} Overdue
                            </button>
                          ) : (
                            <span style={{ color: '#64748b' }}>0</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {r.dueSoonCount > 0 ? (
                            <button
                              onClick={() => handleMatrixFilter(r.rep, 'due_soon')}
                              style={{
                                background: 'rgba(245, 158, 11, 0.18)',
                                color: '#fcd34d',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                padding: '3px 10px',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              ⏳ {r.dueSoonCount}
                            </button>
                          ) : (
                            <span style={{ color: '#64748b' }}>0</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{ color: '#34d399', fontWeight: 600 }}>{r.onTrackCount}</span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span style={{ color: '#cbd5e1' }}>{r.selfSuffCount}</span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {r.comfortStopCount > 0 ? (
                            <span style={{ color: '#fb923c', fontWeight: 600 }}>
                              {r.comfortStopCount} ({r.comfortStopVisits} visits)
                            </span>
                          ) : (
                            <span style={{ color: '#64748b' }}>0</span>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#ffffff' }}>
                          {formatDollar(r.totalBookedVolume)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
                        Loading rep allocation matrix...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: DEALER RELATIONSHIP EXPLORER ── */}
      {activeTab === 'explorer' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '12px 16px' }}>
            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '6px 12px', flex: '1', minWidth: '220px' }}>
              <Search size={14} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search dealer by name or ID (e.g. FL319)..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', fontSize: '0.82rem', width: '100%', outline: 'none' }}
              />
            </div>

            {/* Segment Filter */}
            <select
              value={selectedDemand}
              onChange={(e) => { setSelectedDemand(e.target.value); setPage(1); }}
              style={{ background: '#0f172a', color: '#cbd5e1', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem', outline: 'none' }}
            >
              <option value="all">All Relationship Segments</option>
              <option value="high_tlc">🔴 High TLC (Visit-Dependent)</option>
              <option value="self_sufficient">🟢 Self-Sufficient (Autonomous)</option>
              <option value="comfort_stop">🟠 Comfort Stop (Time Sink)</option>
              <option value="lapsed">⚠️ Lapsed / Churned</option>
              <option value="insufficient_data">⚪ Discovery Queue (Low Data)</option>
            </select>

            {/* Urgency Filter */}
            <select
              value={selectedUrgency}
              onChange={(e) => { setSelectedUrgency(e.target.value); setPage(1); }}
              style={{ background: '#0f172a', color: '#cbd5e1', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem', outline: 'none' }}
            >
              <option value="all">All Urgency Statuses</option>
              <option value="overdue">🚨 Overdue Visits</option>
              <option value="due_soon">⏳ Due Soon (Within 7d)</option>
              <option value="on_track">✅ On Track</option>
              <option value="self_sufficient">🟢 Autonomous</option>
              <option value="not_monitored">⚪ Not Monitored</option>
            </select>

            {/* Rep Filter */}
            <select
              value={selectedRep}
              onChange={(e) => { setSelectedRep(e.target.value); setPage(1); }}
              style={{ background: '#0f172a', color: '#cbd5e1', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem', outline: 'none' }}
            >
              <option value="">All Sales Reps</option>
              {repMappings?.allReps.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            {/* State Filter */}
            <select
              value={selectedState}
              onChange={(e) => { setSelectedState(e.target.value); setPage(1); }}
              style={{ background: '#0f172a', color: '#cbd5e1', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem', outline: 'none' }}
            >
              <option value="">All States</option>
              {repMappings?.allStates.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>

            {/* Clear Filters Button */}
            {(selectedDemand !== 'all' || selectedUrgency !== 'all' || selectedRep !== (isInsideRep && assignedRep ? assignedRep : '') || searchQuery !== '' || selectedState !== '') && (
              <button
                onClick={() => {
                  setSelectedDemand('all');
                  setSelectedUrgency('all');
                  setSelectedRep(isInsideRep && assignedRep ? assignedRep : '');
                  setSelectedState('');
                  setSearchQuery('');
                  setPage(1);
                }}
                style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer' }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Master Dealers Table */}
          <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(255, 255, 255, 0.02)', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 14px' }}>Dealer Location</th>
                    <th style={{ padding: '12px 14px' }}>Rep</th>
                    <th style={{ padding: '12px 14px' }}>Relationship Segment</th>
                    <th style={{ padding: '12px 14px' }}>Urgency Status</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSortChange('postVisitBookedLiftPct')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        Post-Visit Lift <ArrowUpDown size={12} />
                      </span>
                    </th>
                    <th style={{ padding: '12px 14px', textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSortChange('bookedVolume')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        Booked Volume <ArrowUpDown size={12} />
                      </span>
                    </th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Yield / Visit</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                        Loading dealer relationship profiles...
                      </td>
                    </tr>
                  ) : dealers.length > 0 ? (
                    dealers.map((d) => (
                      <tr
                        key={d._id}
                        onClick={() => handleOpenDealer(d.clientDealerId)}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#ffffff' }}>{d.dealerName}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{d.clientDealerId}</span>
                            {d.statePrefix && <span>• {d.statePrefix}</span>}
                          </div>
                        </td>

                        <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                          {d.assignedRep || 'Unassigned'}
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          {d.relationshipDemand === 'high_tlc' ? (
                            <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                              🔴 High TLC
                            </span>
                          ) : d.relationshipDemand === 'self_sufficient' ? (
                            <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                              🟢 Self-Sufficient
                            </span>
                          ) : d.relationshipDemand === 'comfort_stop' ? (
                            <span style={{ background: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', border: '1px solid rgba(249, 115, 22, 0.3)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                              🟠 Comfort Stop
                            </span>
                          ) : d.relationshipDemand === 'lapsed' ? (
                            <span style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                              ⚠️ Lapsed
                            </span>
                          ) : (
                            <span style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#cbd5e1', border: '1px solid rgba(148, 163, 184, 0.3)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                              ⚪ Discovery
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          {d.urgencyStatus === 'overdue' ? (
                            <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.78rem' }}>
                              🚨 Overdue ({d.daysSinceLastVisit || 0}d)
                            </span>
                          ) : d.urgencyStatus === 'due_soon' ? (
                            <span style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.78rem' }}>
                              ⏳ Due Soon ({d.daysSinceLastVisit || 0}d)
                            </span>
                          ) : d.urgencyStatus === 'on_track' ? (
                            <span style={{ color: '#10b981', fontSize: '0.78rem' }}>
                              ✅ On Track ({d.daysSinceLastVisit || 0}d)
                            </span>
                          ) : (
                            <span style={{ color: '#64748b', fontSize: '0.78rem' }}>
                              —
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: (d.postVisitBookedLiftPct || 0) >= 70 ? '#f87171' : '#34d399' }}>
                          {d.postVisitBookedLiftPct !== null ? `${d.postVisitBookedLiftPct}%` : '—'}
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#ffffff' }}>
                          {formatDollar(d.lifetimeStats?.totalBookedVolume || 0)}
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 400 }}>
                            {d.lifetimeStats?.totalBookings || 0} loans
                          </div>
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#cbd5e1' }}>
                          {formatDollar(d.lifetimeYieldPerVisit || 0)}
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDealer(d.clientDealerId);
                            }}
                            style={{
                              background: 'rgba(56, 189, 248, 0.15)',
                              border: '1px solid rgba(56, 189, 248, 0.35)',
                              color: '#38bdf8',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Inspect Drawer
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                        No dealers match the selected filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalDealers > 25 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '0.8rem', color: '#94a3b8' }}>
                <span>
                  Showing {dealers.length} of {totalDealers.toLocaleString()} dealers
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', color: page <= 1 ? '#475569' : '#ffffff', padding: '4px 12px', borderRadius: '6px', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                  >
                    Previous
                  </button>
                  <span style={{ padding: '4px 8px', color: '#ffffff', fontWeight: 600 }}>
                    Page {page} of {Math.ceil(totalDealers / 25)}
                  </span>
                  <button
                    disabled={page >= Math.ceil(totalDealers / 25)}
                    onClick={() => setPage(p => p + 1)}
                    style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', color: page >= Math.ceil(totalDealers / 25) ? '#475569' : '#ffffff', padding: '4px 12px', borderRadius: '6px', cursor: page >= Math.ceil(totalDealers / 25) ? 'not-allowed' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: REP MISALLOCATION DIAGNOSTICS ── */}
      {activeTab === 'diagnostics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Rep Road Trip Allocation Diagnostic (High TLC vs Wasteful Comfort Stops)
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '0' }}>
              Identifies sales representatives spending more than 25% of their in-person road trips on Comfort Stops or Autonomous accounts while High TLC dealers sit overdue.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {repAllocations && repAllocations.map((r) => (
                <div
                  key={r.rep}
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: r.misallocatedWarning ? '1px solid rgba(249, 115, 22, 0.35)' : '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#ffffff' }}>{r.rep}</span>
                      {r.misallocatedWarning && (
                        <span style={{ background: 'rgba(249, 115, 22, 0.18)', color: '#fb923c', border: '1px solid rgba(249, 115, 22, 0.35)', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700 }}>
                          ⚠️ Misallocation Alert
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                      Total Visits: <strong>{r.totalVisits}</strong> • Volume: <strong>{formatDollar(r.totalBookedVolume)}</strong>
                    </span>
                  </div>

                  {/* Allocation Bar */}
                  <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', background: 'rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ width: `${r.highTlcVisitPct}%`, background: '#ef4444' }} title={`High TLC: ${r.highTlcVisitPct}%`} />
                    <div style={{ width: `${r.selfSuffVisitPct}%`, background: '#10b981' }} title={`Autonomous: ${r.selfSuffVisitPct}%`} />
                    <div style={{ width: `${r.comfortStopVisitPct}%`, background: '#f97316' }} title={`Comfort Stop: ${r.comfortStopVisitPct}%`} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8' }}>
                    <span style={{ color: '#f87171' }}>🔴 High TLC: {r.highTlcVisitPct}% ({r.highTlcVisits} visits)</span>
                    <span style={{ color: '#34d399' }}>🟢 Autonomous: {r.selfSuffVisitPct}% ({r.selfSuffVisits} visits)</span>
                    <span style={{ color: '#fb923c' }}>🟠 Comfort Stops: {r.comfortStopVisitPct}% ({r.comfortStopVisits} visits)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Slide-Out Drawer Component (Zero Modals) ── */}
      <DealerRelationshipDrawer
        clientDealerId={drawerDealerId}
        isOpen={Boolean(drawerDealerId)}
        onClose={() => setDrawerDealerId(null)}
      />
    </div>
  );
}
