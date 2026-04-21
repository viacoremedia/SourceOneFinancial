/**
 * RepScorecard — Bottom drawer showing all reps in a sortable comparison table.
 * Displays rolling averages, dealer counts, churn flows, and Heat Index.
 * Clicking a rep row filters the main dashboard to that rep.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRepScorecard } from '../../hooks/useRepScorecard';
import styles from './RepScorecard.module.css';
import type { RepScorecardEntry, RollingWindow } from '../../types';

/** Human-readable labels for heat breakdown keys */
const HEAT_LABELS: Record<string, string> = {
  avgDaysSinceApp: 'App Days',
  avgDaysSinceApproval: 'Approval Days',
  avgDaysSinceBooking: 'Booking Days',
  avgContactDays: 'Contact Days',
  avgVisitResponse: 'Visit Response',
  activeRatio: 'Active Ratio',
  reactivationRate: 'Reactivation',
  churnNet: 'Churn Net',
};

const HEAT_WEIGHTS: Record<string, number> = {
  avgDaysSinceApp: 0.20,
  avgDaysSinceApproval: 0.10,
  avgDaysSinceBooking: 0.10,
  avgContactDays: 0.15,
  avgVisitResponse: 0.10,
  activeRatio: 0.20,
  reactivationRate: 0.10,
  churnNet: 0.05,
};

/** Column info descriptions for the legend */
const COLUMN_DESCRIPTIONS: Record<string, string> = {
  heatIndex: 'Composite 0–100 score: higher = better overall performance. Factors in contact frequency, application activity, active dealer ratio, and churn.',
  rep: 'Sales representative name. The number next to it (e.g. 1.2x) shows their dealer load relative to the network average.',
  totalDealers: 'Total dealer locations assigned to this rep.',
  activeCount: 'Dealers with an application in the last 30 days.',
  inactive30Count: 'Dealers whose last application was 31–60 days ago.',
  inactive60Count: 'Dealers whose last application was 61–90 days ago.',
  longInactiveCount: 'Dealers with no application in 90+ days.',
  reactivatedCount: 'Dealers that went from inactive → active within this rolling window.',
  avgApp: 'Average days since last application across all dealers.',
  avgApproval: 'Average days since last approval across all dealers.',
  avgBooking: 'Average days since last booking across all dealers.',
  avgContact: 'Average days since last communication with dealer.',
  avgVisit: 'Average days from a visit to the next application.',
  gained: 'Average dealers gained to "active" status per day in this window.',
  lost: 'Average dealers lost from "active" status per day in this window.',
  net: 'Net daily active dealer change (gained minus lost).',
};

/**
 * Portal-based tooltip that positions itself within the viewport.
 */
function HeatTooltipPortal({
  rep,
  anchorRect,
  onClose,
}: {
  rep: RepScorecardEntry;
  anchorRect: DOMRect;
  onClose: () => void;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!tooltipRef.current) return;
    const tt = tooltipRef.current;
    const ttRect = tt.getBoundingClientRect();
    const pad = 8;

    // Position above the anchor, centered
    let top = anchorRect.top - ttRect.height - pad;
    let left = anchorRect.left + anchorRect.width / 2 - ttRect.width / 2;

    // Clamp to viewport
    if (top < pad) top = anchorRect.bottom + pad; // flip below
    if (left < pad) left = pad;
    if (left + ttRect.width > window.innerWidth - pad) {
      left = window.innerWidth - ttRect.width - pad;
    }
    if (top + ttRect.height > window.innerHeight - pad) {
      top = window.innerHeight - ttRect.height - pad;
    }

    setPos({ top, left });
  }, [anchorRect]);

  const breakdown = rep._heatBreakdown;

  return createPortal(
    <div
      ref={tooltipRef}
      className={styles.heatTooltipPortal}
      style={{ top: pos.top, left: pos.left }}
      onMouseLeave={onClose}
    >
      <div className={styles.tooltipTitle}>
        Heat Index: <strong>{rep.heatIndex ?? '—'}</strong>/100
        {rep.capacityFlag && (
          <span className={styles.tooltipFlag}>
            {rep.capacityFlag === 'overburdened' ? ' ⚡ Overburdened' : ' ⚠ Underperforming'}
          </span>
        )}
      </div>
      <div className={styles.tooltipCapacity}>
        Territory Load: {rep.capacityRatio?.toFixed(2) ?? '—'}x network avg
        {rep.heatClass && (
          <span className={styles.tooltipClass}>
            {' · '}{rep.heatClass.charAt(0).toUpperCase() + rep.heatClass.slice(1)}
          </span>
        )}
      </div>
      {breakdown && (
        <table className={styles.tooltipTable}>
          <thead>
            <tr>
              <th>Factor</th>
              <th>Value</th>
              <th>Score</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(breakdown).map(([key, data]) => (
              <tr key={key}>
                <td>{HEAT_LABELS[key] || key}</td>
                <td>{data.raw != null ? data.raw.toFixed(1) : '—'}</td>
                <td style={{ color: data.normalized != null && data.normalized >= 0.6 ? '#34d399' : data.normalized != null && data.normalized < 0.3 ? '#ef4444' : undefined }}>
                  {data.normalized != null ? `${Math.round(data.normalized * 100)}` : '—'}
                </td>
                <td>{Math.round((HEAT_WEIGHTS[key] || 0) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>,
    document.body
  );
}

/** Column legend/info panel */
function InfoPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.infoPanel}>
      <div className={styles.infoPanelHeader}>
        <span className={styles.infoPanelTitle}>📖 Column Guide</span>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
      <div className={styles.infoPanelBody}>
        <div className={styles.infoSection}>
          <h4>Heat Index (HI) — How It Works</h4>
          <p>Composite score 0–100. Each rep is scored across 8 factors, normalized relative to the best and worst rep, then combined using these weights:</p>
          <table className={styles.tooltipTable} style={{ marginBottom: 8 }}>
            <thead>
              <tr><th>Factor</th><th>Weight</th><th>Why</th><th>Good</th><th>Bad</th></tr>
            </thead>
            <tbody>
              <tr><td>Avg App Days</td><td>20%</td><td>Primary engagement signal — how recently dealers submitted apps</td><td>{'<'}15 days</td><td>40+ days</td></tr>
              <tr><td>Active Ratio</td><td>20%</td><td>Territory health — what % of dealers are actively engaged</td><td>{'>'} 50%</td><td>{'<'} 25%</td></tr>
              <tr><td>Contact Days</td><td>15%</td><td>Communication frequency — are they reaching out regularly</td><td>{'<'}20 days</td><td>40+ days</td></tr>
              <tr><td>Approval Days</td><td>10%</td><td>Pipeline conversion — approvals follow applications</td><td>{'<'}20 days</td><td>60+ days</td></tr>
              <tr><td>Booking Days</td><td>10%</td><td>Revenue signal — bookings indicate closed business</td><td>{'<'}25 days</td><td>60+ days</td></tr>
              <tr><td>Visit Response</td><td>10%</td><td>In-person effectiveness — how quickly visits lead to apps</td><td>{'<'}15 days</td><td>30+ days</td></tr>
              <tr><td>Reactivation</td><td>10%</td><td>Recovery ability — bringing dormant dealers back to active</td><td>{'>'} 5%</td><td>0%</td></tr>
              <tr><td>Churn Net</td><td>5%</td><td>Net retention — are they gaining or losing active dealers</td><td>Positive</td><td>Negative</td></tr>
            </tbody>
          </table>
          <p>"Days since" factors are <strong>inverted</strong> — lower days = higher score. Each factor is min/max normalized across all reps, so scores are always relative to the current cohort.</p>
          <div className={styles.infoLegend}>
            <span><span className={styles.legendDot} style={{ background: '#34d399' }} /> <strong>Strong (≥70)</strong> — Consistently top performer across most factors</span>
            <span><span className={styles.legendDot} style={{ background: '#fbbf24' }} /> <strong>Average</strong> — Middle of the pack, some factors strong, others weak</span>
            <span><span className={styles.legendDot} style={{ background: '#f97316' }} /> <strong>⚡ Overburdened</strong> — HI {'<'} 50 BUT capacity {'>'} 1.3x avg. Has too many dealers, understandably behind</span>
            <span><span className={styles.legendDot} style={{ background: '#ef4444' }} /> <strong>⚠ Underperforming</strong> — HI {'<'} 40 AND capacity ≤ 1.0x avg. Light load but still behind — performance issue</span>
          </div>
        </div>
        <div className={styles.infoSection}>
          <h4>Capacity Ratio (shown as 1.2x)</h4>
          <p>How many dealers this rep has versus the network average. {'>'} 1.3x suggests overburdened territory. This is factored into the classification — a low HI with high capacity gets the benefit of the doubt ("overburdened" vs "underperforming").</p>
        </div>
        <div className={styles.infoGrid}>
          {Object.entries(COLUMN_DESCRIPTIONS).filter(([k]) => k !== 'heatIndex' && k !== 'rep').map(([key, desc]) => {
            const col = COLUMNS.find(c => c.key === key);
            return (
              <div key={key} className={styles.infoItem}>
                <strong>{col?.short || key}</strong>
                <span>{desc}</span>
              </div>
            );
          })}
        </div>
        <div className={styles.infoSection}>
          <h4>Color Coding</h4>
          <p>For "days since" columns: <span style={{ color: '#34d399' }}>green</span> = recent (good), <span style={{ color: '#fbbf24' }}>amber</span> = moderate, <span style={{ color: '#ef4444' }}>red</span> = stale (needs attention).</p>
          <p>For churn (Net, +/d, -/d): <span style={{ color: '#34d399' }}>green</span> = positive trend, <span style={{ color: '#ef4444' }}>red</span> = negative.</p>
          <p>Status columns: <span style={{ color: '#34d399' }}>Active</span> = green, <span style={{ color: '#fbbf24' }}>30d</span> = yellow, <span style={{ color: '#f97316' }}>60d</span> = orange, <span style={{ color: '#ef4444' }}>Long</span> = red.</p>
        </div>
        <div className={styles.infoSection}>
          <h4>Status Filters & Rankings</h4>
          <p>Rankings and Heat Index scores <strong>change when you switch status filters</strong> — this is by design. Each filter asks a different analytical question:</p>
          <div className={styles.infoLegend}>
            <span><strong>All</strong> — "Who manages their entire territory best, including keeping inactive dealers engaged?"</span>
            <span><strong>Active</strong> — "Among active dealers only, who's performing best day-to-day?"</span>
            <span><strong>30d / 60d</strong> — "Who's doing the best job re-engaging recently lapsed dealers?"</span>
            <span><strong>Long</strong> — "Who's making progress with long-dormant accounts?"</span>
          </div>
          <p>The Heat Index uses relative scoring (each rep vs. best & worst), so a rep who looks strong on "All" may rank differently on "Active" if other reps outperform them within that specific segment. The +/d and -/d columns also update to show transitions into and out of the selected status.</p>
        </div>
      </div>
    </div>
  );
}

interface RepScorecardProps {
  open: boolean;
  onClose: () => void;
  windowSize: RollingWindow;
  onWindowChange: (w: RollingWindow) => void;
  onSelectRep?: (rep: string) => void;
  onSelectRepState?: (rep: string, state: string) => void;
  activityMode?: string;
}

/** Column definition for the scorecard table */
interface ScorecardColumn {
  key: string;
  label: string;
  short: string;
  align: 'left' | 'center' | 'right';
  getValue: (rep: RepScorecardEntry) => number | string | null;
  format?: (v: number | null) => string;
  /** Full-entry formatter — used when the column needs multiple fields (e.g. count + percentage) */
  formatFull?: (rep: RepScorecardEntry) => string;
  heatmap?: boolean;   // Lower = better for days-since
  reverseHeat?: boolean; // Higher = better (for counts/ratios)
  /** Static color for the column values */
  staticColor?: string;
  /** Maps this column to a drawer status filter key for highlighting */
  filterKey?: string | null;
}

const COLUMNS: ScorecardColumn[] = [
  {
    key: 'heatIndex', label: 'Heat Index', short: 'HI',
    align: 'center',
    getValue: (r) => r.heatIndex,
    format: (v) => v != null ? `${Math.round(v)}` : '—',
    reverseHeat: true,
  },
  {
    key: 'rep', label: 'Rep', short: 'Rep',
    align: 'left',
    getValue: (r) => r.rep,
  },
  {
    key: 'totalDealers', label: 'Dealers', short: 'Dlrs',
    align: 'center',
    getValue: (r) => r.totalDealers,
    format: (v) => v != null ? String(v) : '—',
  },
  {
    key: 'activeCount', label: 'Active', short: 'Act',
    align: 'center',
    getValue: (r) => r.activeCount,
    formatFull: (r) => r.totalDealers > 0
      ? `${r.activeCount} (${Math.round((r.activeCount / r.totalDealers) * 100)}%)`
      : String(r.activeCount),
    reverseHeat: true,
    staticColor: 'var(--color-emerald, #34d399)',
    filterKey: 'active',
  },
  {
    key: 'inactive30Count', label: '30d Inactive', short: '30d',
    align: 'center',
    getValue: (r) => r.inactive30Count,
    formatFull: (r) => r.totalDealers > 0
      ? `${r.inactive30Count} (${Math.round((r.inactive30Count / r.totalDealers) * 100)}%)`
      : String(r.inactive30Count),
    staticColor: 'var(--color-amber, #fbbf24)',
    filterKey: '30d',
  },
  {
    key: 'inactive60Count', label: '60d Inactive', short: '60d',
    align: 'center',
    getValue: (r) => r.inactive60Count,
    formatFull: (r) => r.totalDealers > 0
      ? `${r.inactive60Count} (${Math.round((r.inactive60Count / r.totalDealers) * 100)}%)`
      : String(r.inactive60Count),
    staticColor: 'var(--color-orange, #f97316)',
    filterKey: '60d',
  },
  {
    key: 'longInactiveCount', label: 'Long Inactive', short: 'Lng',
    align: 'center',
    getValue: (r) => r.longInactiveCount,
    formatFull: (r) => r.totalDealers > 0
      ? `${r.longInactiveCount} (${Math.round((r.longInactiveCount / r.totalDealers) * 100)}%)`
      : String(r.longInactiveCount),
    staticColor: 'var(--color-red, #ef4444)',
    filterKey: 'long',
  },
  {
    key: 'reactivatedCount', label: 'Reactivated', short: 'React',
    align: 'center',
    getValue: (r) => r.reactivatedCount,
    format: (v) => v != null ? String(v) : '—',
    reverseHeat: true,
  },
  {
    key: 'avgApp', label: 'Avg App Days', short: 'App',
    align: 'center',
    getValue: (r) => r.rollingAvg.avgDaysSinceApp,
    format: (v) => v != null ? v.toFixed(1) : '—',
    heatmap: true,
  },
  {
    key: 'avgApproval', label: 'Avg Approval Days', short: 'Appr',
    align: 'center',
    getValue: (r) => r.rollingAvg.avgDaysSinceApproval,
    format: (v) => v != null ? v.toFixed(1) : '—',
    heatmap: true,
  },
  {
    key: 'avgBooking', label: 'Avg Booking Days', short: 'Bkd',
    align: 'center',
    getValue: (r) => r.rollingAvg.avgDaysSinceBooking,
    format: (v) => v != null ? v.toFixed(1) : '—',
    heatmap: true,
  },
  {
    key: 'avgContact', label: 'Avg Contact Days', short: 'Cntct',
    align: 'center',
    getValue: (r) => r.rollingAvg.avgContactDays,
    format: (v) => v != null ? v.toFixed(1) : '—',
    heatmap: true,
  },
  {
    key: 'avgVisit', label: 'Visit Response', short: 'Visit',
    align: 'center',
    getValue: (r) => r.rollingAvg.avgVisitResponse,
    format: (v) => v != null ? v.toFixed(1) : '—',
    heatmap: true,
  },
  {
    key: 'gained', label: 'Gained/day', short: '+/d',
    align: 'center',
    getValue: (r) => r.statusFlows.avgGainedActive,
    format: (v) => v != null ? `+${v.toFixed(1)}` : '—',
    reverseHeat: true,
  },
  {
    key: 'lost', label: 'Lost/day', short: '-/d',
    align: 'center',
    getValue: (r) => r.statusFlows.avgLostActive,
    format: (v) => v != null ? `-${v.toFixed(1)}` : '—',
    heatmap: true,
  },
  {
    key: 'net', label: 'Net/day', short: 'Net',
    align: 'center',
    getValue: (r) => r.statusFlows.netDelta,
    format: (v) => {
      if (v == null) return '—';
      return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;
    },
    reverseHeat: true,
  },
];

/**
 * Heatmap color for "days since" metrics (lower = better).
 */
function daysHeatColor(value: number | null): string {
  if (value == null) return '';
  if (value <= 15) return 'var(--color-emerald, #34d399)';
  if (value <= 25) return 'var(--color-amber, #fbbf24)';
  if (value <= 40) return 'var(--color-orange, #f97316)';
  return 'var(--color-red, #ef4444)';
}

/**
 * Heatmap for "higher = better" metrics.
 */
function reverseHeatColor(value: number | null): string {
  if (value == null) return '';
  if (value > 0) return 'var(--color-emerald, #34d399)';
  return '';
}

/**
 * Heat Index dot color.
 */
function heatDotColor(heatClass: string | null): string {
  switch (heatClass) {
    case 'strong': return 'var(--color-emerald, #34d399)';
    case 'average': return 'var(--color-amber, #fbbf24)';
    case 'overburdened': return 'var(--color-orange, #f97316)';
    case 'underperforming': return 'var(--color-red, #ef4444)';
    default: return 'var(--text-muted, #64748b)';
  }
}

export function RepScorecard({
  open,
  onClose,
  windowSize,
  onWindowChange,
  onSelectRep,
  onSelectRepState,
  activityMode,
}: RepScorecardProps) {
  const [drawerStatusFilter, setDrawerStatusFilter] = useState<string | null>(null);

  // Map UI filter to API activityStatus values
  const statusFilterValues = drawerStatusFilter
    ? { active: ['active'], '30d': ['30d_inactive'], '60d': ['60d_inactive'], long: ['long_inactive'] }[drawerStatusFilter] || undefined
    : undefined;

  const { data, isLoading } = useRepScorecard(windowSize, open, statusFilterValues, activityMode);
  const [sortKey, setSortKey] = useState('rep');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showInfo, setShowInfo] = useState(false);
  const [expandedRep, setExpandedRep] = useState<string | null>(null);
  const [tooltipRep, setTooltipRep] = useState<RepScorecardEntry | null>(null);
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null);

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rep' ? 'asc' : 'desc');
    }
  }, [sortKey]);

  const sortedReps = useMemo(() => {
    if (!data?.reps) return [];
    const col = COLUMNS.find((c) => c.key === sortKey);
    return [...data.reps].sort((a, b) => {
      const aVal = col ? col.getValue(a) : a.rep;
      const bVal = col ? col.getValue(b) : b.rep;
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const diff = (aVal as number) - (bVal as number);
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [data, sortKey, sortDir]);

  const handleRepClick = useCallback((rep: string) => {
    onSelectRep?.(rep);
    onClose();
  }, [onSelectRep, onClose]);

  const handleStateClick = useCallback((rep: string, state: string) => {
    onSelectRepState?.(rep, state);
    onClose();
  }, [onSelectRepState, onClose]);

  const handleHeatHover = useCallback((rep: RepScorecardEntry, e: React.MouseEvent) => {
    const cell = (e.currentTarget as HTMLElement);
    setTooltipRep(rep);
    setTooltipRect(cell.getBoundingClientRect());
  }, []);

  const handleHeatLeave = useCallback(() => {
    setTooltipRep(null);
    setTooltipRect(null);
  }, []);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Drawer */}
      <div className={styles.drawer} id="rep-scorecard-drawer">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={styles.title}>Rep Scorecard</h2>
            <div className={styles.windowToggle}>
              <button
                className={`${styles.windowBtn} ${windowSize === 7 ? styles.windowBtnActive : ''}`}
                onClick={() => onWindowChange(7)}
              >7d</button>
              <button
                className={`${styles.windowBtn} ${windowSize === 30 ? styles.windowBtnActive : ''}`}
                onClick={() => onWindowChange(30)}
              >30d</button>
            </div>
            <div className={styles.statusToggle}>
              {[
                { key: null, label: 'All' },
                { key: 'active', label: 'Active' },
                { key: '30d', label: '30d' },
                { key: '60d', label: '60d' },
                { key: 'long', label: 'Long' },
              ].map((f) => (
                <button
                  key={f.key ?? 'all'}
                  className={`${styles.statusBtn} ${drawerStatusFilter === f.key ? styles.statusBtnActive : ''}`}
                  onClick={() => setDrawerStatusFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {data && (
              <span className={styles.headerMeta}>
                {data.reps.length} reps · {data.reportDateRange.count} report dates
                {drawerStatusFilter && ` · ${drawerStatusFilter} only`}
              </span>
            )}
          </div>
          <div className={styles.headerRight}>
            <button
              className={`${styles.infoBtn} ${showInfo ? styles.infoBtnActive : ''}`}
              onClick={() => setShowInfo(!showInfo)}
              title="What do these columns mean?"
            >ℹ️</button>
            <button className={styles.closeBtn} onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* Info Panel (toggled) */}
        {showInfo && <InfoPanel onClose={() => setShowInfo(false)} />}

        {/* Table */}
        <div className={styles.tableWrapper}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <span>Loading rep data…</span>
            </div>
          ) : !data || data.insufficientData ? (
            <div className={styles.emptyState}>
              {data?.insufficientData
                ? 'Need ≥2 report dates for scorecard data'
                : 'No rep data available'}
            </div>
          ) : sortedReps.length === 0 ? (
            <div className={styles.emptyState}>No reps found</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`${styles.th} ${sortKey === col.key ? styles.thSorted : ''} ${drawerStatusFilter != null && col.filterKey === drawerStatusFilter ? styles.highlightedCol : ''}`}
                      style={{ textAlign: col.align }}
                      onClick={() => handleSort(col.key)}
                      title={COLUMN_DESCRIPTIONS[col.key] || `Sort by ${col.label}`}
                    >
                      <span className={styles.thLabel}>{col.short}</span>
                      {sortKey === col.key && (
                        <span className={styles.sortArrow}>
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedReps.map((rep) => {
                  const isExpanded = expandedRep === rep.rep;
                  return (
                    <React.Fragment key={rep.rep}>
                      <tr
                        className={styles.row}
                      >
                    {COLUMNS.map((col) => {
                      const raw = col.getValue(rep);
                      const formatted = col.formatFull
                        ? col.formatFull(rep)
                        : col.format
                          ? col.format(raw as number | null)
                          : String(raw ?? '—');

                      let color = '';
                      if (col.key === 'heatIndex') {
                        color = heatDotColor(rep.heatClass);
                      } else if (col.staticColor) {
                        color = col.staticColor;
                      } else if (col.heatmap && typeof raw === 'number') {
                        color = daysHeatColor(raw);
                      } else if (col.reverseHeat && typeof raw === 'number') {
                        color = reverseHeatColor(raw);
                      }

                      // Highlight column matching the active status filter
                      const isHighlighted = drawerStatusFilter != null && col.filterKey === drawerStatusFilter;

                      return (
                        <td
                          key={col.key}
                          className={`${styles.td} ${col.key === 'heatIndex' ? styles.heatCell : ''} ${isHighlighted ? styles.highlightedCol : ''}`}
                          style={{ textAlign: col.align, color: color || undefined }}
                          onMouseEnter={col.key === 'heatIndex' ? (e) => handleHeatHover(rep, e) : undefined}
                          onMouseLeave={col.key === 'heatIndex' ? handleHeatLeave : undefined}
                        >
                          {col.key === 'heatIndex' && (
                            <>
                              <span
                                className={styles.heatDot}
                                style={{ background: heatDotColor(rep.heatClass) }}
                              />
                              {formatted}
                              {rep.capacityFlag && (
                                <span className={`${styles.capacityBadge} ${
                                  rep.capacityFlag === 'overburdened'
                                    ? styles.capacityOverburdened
                                    : styles.capacityUnderperforming
                                }`}>
                                  {rep.capacityFlag === 'overburdened' ? '⚡' : '⚠'}
                                </span>
                              )}
                            </>
                          )}
                          {col.key === 'rep' && (
                            <>
                              <span
                                className={styles.expandToggle}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedRep(isExpanded ? null : rep.rep);
                                }}
                                title={isExpanded ? 'Collapse states' : 'Expand by state'}
                              >
                                {isExpanded ? '▼' : '▶'}
                              </span>
                              <span
                                className={styles.repNameLink}
                                onClick={() => handleRepClick(rep.rep)}
                                title={`Filter by ${rep.rep}`}
                              >
                                {formatted}
                              </span>
                              {rep.capacityRatio != null && (
                                <span className={styles.capacityRatio}>
                                  {rep.capacityRatio.toFixed(1)}x
                                </span>
                              )}
                            </>
                          )}
                          {col.key !== 'heatIndex' && col.key !== 'rep' && formatted}
                        </td>
                      );
                    })}
                      </tr>
                      {/* State sub-rows when expanded */}
                      {isExpanded && rep.stateBreakdown && rep.stateBreakdown.map((st) => (
                        <tr key={`${rep.rep}-${st.state}`} className={`${styles.row} ${styles.stateSubRow}`}>
                          {COLUMNS.map((col) => {
                            // Map state data to column values
                            let val = '';
                            let cellColor = '';
                            const isHighlighted = drawerStatusFilter != null && col.filterKey === drawerStatusFilter;

                            if (col.key === 'heatIndex') {
                              val = ''; // no heat index per state
                            } else if (col.key === 'rep') {
                              val = `↳ ${st.state}`;
                            } else if (col.key === 'totalDealers') {
                              val = String(st.totalDealers);
                            } else if (col.key === 'activeCount') {
                              val = st.totalDealers > 0
                                ? `${st.activeCount} (${Math.round((st.activeCount / st.totalDealers) * 100)}%)`
                                : String(st.activeCount);
                              cellColor = 'var(--color-emerald, #34d399)';
                            } else if (col.key === 'inactive30Count') {
                              val = st.totalDealers > 0
                                ? `${st.inactive30Count} (${Math.round((st.inactive30Count / st.totalDealers) * 100)}%)`
                                : String(st.inactive30Count);
                              cellColor = 'var(--color-amber, #fbbf24)';
                            } else if (col.key === 'inactive60Count') {
                              val = st.totalDealers > 0
                                ? `${st.inactive60Count} (${Math.round((st.inactive60Count / st.totalDealers) * 100)}%)`
                                : String(st.inactive60Count);
                              cellColor = 'var(--color-orange, #f97316)';
                            } else if (col.key === 'longInactiveCount') {
                              val = st.totalDealers > 0
                                ? `${st.longInactiveCount} (${Math.round((st.longInactiveCount / st.totalDealers) * 100)}%)`
                                : String(st.longInactiveCount);
                              cellColor = 'var(--color-red, #ef4444)';
                            } else if (col.key === 'reactivatedCount') {
                              val = String(st.reactivatedCount);
                            } else if (col.key === 'avgApp' && st.rollingAvg) {
                              const v = st.rollingAvg.avgDaysSinceApp;
                              val = v != null ? v.toFixed(1) : '—';
                              if (typeof v === 'number') cellColor = daysHeatColor(v);
                            } else if (col.key === 'avgApproval' && st.rollingAvg) {
                              const v = st.rollingAvg.avgDaysSinceApproval;
                              val = v != null ? v.toFixed(1) : '—';
                              if (typeof v === 'number') cellColor = daysHeatColor(v);
                            } else if (col.key === 'avgBooking' && st.rollingAvg) {
                              const v = st.rollingAvg.avgDaysSinceBooking;
                              val = v != null ? v.toFixed(1) : '—';
                              if (typeof v === 'number') cellColor = daysHeatColor(v);
                            } else if (col.key === 'avgContact' && st.rollingAvg) {
                              const v = st.rollingAvg.avgContactDays;
                              val = v != null ? v.toFixed(1) : '—';
                              if (typeof v === 'number') cellColor = daysHeatColor(v);
                            } else if (col.key === 'avgVisit' && st.rollingAvg) {
                              const v = st.rollingAvg.avgVisitResponse;
                              val = v != null ? v.toFixed(1) : '—';
                              if (typeof v === 'number') cellColor = daysHeatColor(v);
                            } else if (col.key === 'gained' && st.statusFlows) {
                              const v = st.statusFlows.avgGainedActive;
                              val = v != null ? `+${v.toFixed(1)}` : '—';
                              if (typeof v === 'number' && v > 0) cellColor = 'var(--color-emerald, #34d399)';
                            } else if (col.key === 'lost' && st.statusFlows) {
                              const v = st.statusFlows.avgLostActive;
                              val = v != null ? `-${v.toFixed(1)}` : '—';
                              if (typeof v === 'number' && v > 0) cellColor = 'var(--color-red, #ef4444)';
                            } else if (col.key === 'net' && st.statusFlows) {
                              const v = st.statusFlows.netDelta;
                              val = v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}` : '—';
                              if (typeof v === 'number') cellColor = v >= 0 ? 'var(--color-emerald, #34d399)' : 'var(--color-red, #ef4444)';
                            } else {
                              val = '—';
                            }

                            return (
                              <td
                                key={col.key}
                                className={`${styles.td} ${isHighlighted ? styles.highlightedCol : ''}`}
                                style={{ textAlign: col.align, color: cellColor || undefined }}
                              >
                                {col.key === 'rep' ? (
                                  <span
                                    className={styles.stateNameLink}
                                    onClick={() => handleStateClick(rep.rep, st.state)}
                                    title={`Filter by ${rep.rep} → ${st.state}`}
                                  >
                                    {val}
                                  </span>
                                ) : val}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Portal-based tooltip */}
      {tooltipRep && tooltipRect && (
        <HeatTooltipPortal
          rep={tooltipRep}
          anchorRect={tooltipRect}
          onClose={handleHeatLeave}
        />
      )}
    </>
  );
}
