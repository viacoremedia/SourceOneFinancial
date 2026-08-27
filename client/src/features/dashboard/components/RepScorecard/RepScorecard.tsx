/**
 * RepScorecard — Bottom drawer showing all reps in a sortable comparison table.
 * Displays rolling averages, dealer counts, churn flows, and Heat Index.
 * Clicking a rep row filters the main dashboard to that rep.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRepScorecard } from '../../hooks/useRepScorecard';
import styles from './RepScorecard.module.css';
import type { RepScorecardEntry, RollingWindow, FinPeriod } from '../../types';
import { resolveRepDisplayName } from '../../../../core/utils/repNames';

/** Human-readable labels for heat breakdown keys */
const HEAT_LABELS: Record<string, string> = {
  avgDaysSinceApp: 'App Days',
  activeRatio: 'Active Ratio',
  avgContactDays: 'Contact Days',
  avgDaysSinceApproval: 'Approval Days',
  avgDaysSinceBooking: 'Booking Days',
  reactivationRate: 'Reactivation',
  churnNet: 'Churn Net',
  lookToBookPct: 'Look-to-Book %',
  approvalToBookPct: 'Approval-to-Book %',
  appsPerActiveDealer: 'Apps / Active Dealer',
};

const DEFAULT_HEAT_WEIGHTS: Record<string, number> = {
  avgDaysSinceApp: 0.15,
  activeRatio: 0.15,
  avgContactDays: 0.15,
  avgDaysSinceApproval: 0.10,
  avgDaysSinceBooking: 0.10,
  reactivationRate: 0.10,
  churnNet: 0.05,
  lookToBookPct: 0.075,
  approvalToBookPct: 0.075,
  appsPerActiveDealer: 0.05,
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

  avgApp: 'Average days since last application across all dealers.',
  avgApproval: 'Average days since last approval across all dealers.',
  avgBooking: 'Average days since last booking across all dealers.',
  avgContact: 'Average days since last communication with dealer.',
  avgVisit: 'Average days from a visit to the next application.',
  gained: 'Average dealers gained to "active" status per day in this window.',
  lost: 'Average dealers lost from "active" status per day in this window.',
  net: 'Net daily active dealer change (gained minus lost).',

  // Financial
  totalApps: 'Total applications submitted in the selected financial period.',
  approvedCount: 'Total approvals (Approved + Conditional + Auto) in the selected financial period.',
  bookedVolume: 'Total dollar amount financed on booked deals for the selected financial period.',
  bookedCount: 'Number of booked deals in the selected financial period.',
  avgDealSize: 'Average amount financed per booked deal.',
  lookToBookPct: 'Look-to-Book rate — booked deals as a percentage of all applications submitted.',
  approvalToBookPct: 'Approval-to-Book rate — booked deals as a percentage of approved deals.',
  avgReserveAmt: 'Average dealer reserve amount (margin) per booked deal.',
  avgTimeToBookDays: 'Average time from application to booking in days.',
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
                <td>{Math.round(((data as any).weight ?? DEFAULT_HEAT_WEIGHTS[key] ?? 0) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>,
    document.body
  );
}

/** Sales Manager Custom Weight Configurator Modal */
function WeightConfiguratorModal({
  currentWeights,
  onApply,
  onReset,
  onClose,
}: {
  currentWeights: Record<string, number>;
  onApply: (newWeights: Record<string, number>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [weights, setWeights] = useState<Record<string, number>>(() => ({
    ...DEFAULT_HEAT_WEIGHTS,
    ...currentWeights,
  }));

  const totalSumPct = useMemo(() => {
    return Math.round(Object.values(weights).reduce((a, b) => a + b, 0) * 1000) / 10;
  }, [weights]);

  const isValid = Math.abs(totalSumPct - 100) < 0.2;

  const handleChange = (key: string, valPct: number) => {
    const clampedPct = Math.max(0, Math.min(35, valPct));
    setWeights((prev) => ({ ...prev, [key]: clampedPct / 100 }));
  };

  return (
    <div className={styles.configModalOverlay}>
      <div className={styles.configModal}>
        <div className={styles.configHeader}>
          <h3>⚙ Sales Manager Weight Configurator</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <p className={styles.configSubtext}>
          Customize Heat Index factor weights for territory management. Weights must sum to 100%. Bayesian volume floors (≥ 8 apps for L2B %, ≥ 5 approvals for A2B %) remain enforced to guarantee cohort fairness.
        </p>

        <div className={styles.configGrid}>
          {Object.keys(DEFAULT_HEAT_WEIGHTS).map((key) => {
            const currentPct = Math.round((weights[key] || 0) * 1000) / 10;
            return (
              <div key={key} className={styles.configRow}>
                <label className={styles.configLabel}>
                  {HEAT_LABELS[key] || key}
                </label>
                <div className={styles.configControls}>
                  <input
                    type="range"
                    min="0"
                    max="35"
                    step="0.5"
                    value={currentPct}
                    onChange={(e) => handleChange(key, parseFloat(e.target.value))}
                    className={styles.configSlider}
                  />
                  <input
                    type="number"
                    min="0"
                    max="35"
                    step="0.5"
                    value={currentPct}
                    onChange={(e) => handleChange(key, parseFloat(e.target.value) || 0)}
                    className={styles.configNumberInput}
                  />
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>%</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.configFooter}>
          <div className={styles.sumContainer}>
            Total Weight: <strong style={{ color: isValid ? '#34d399' : '#ef4444' }}>{totalSumPct}%</strong>
            {!isValid && <span className={styles.sumError}> (Must sum to 100%)</span>}
          </div>
          <div className={styles.configBtnGroup}>
            <button
              type="button"
              className={styles.resetBtn}
              onClick={() => {
                setWeights(DEFAULT_HEAT_WEIGHTS);
                onReset();
                onClose();
              }}
            >
              Reset Defaults
            </button>
            <button
              type="button"
              className={styles.applyBtn}
              disabled={!isValid}
              onClick={() => {
                onApply(weights);
                onClose();
              }}
            >
              Apply Custom Weights
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Column legend/info panel */
function InfoPanel({
  activeWeights,
  isCustom,
  onResetWeights,
  onClose,
}: {
  activeWeights: Record<string, number>;
  isCustom: boolean;
  onResetWeights: () => void;
  onClose: () => void;
}) {
  return (
    <div className={styles.infoPanel}>
      <div className={styles.infoPanelHeader}>
        <span className={styles.infoPanelTitle}>📖 Column Guide & Scoring Methodology</span>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>
      <div className={styles.infoPanelBody}>
        {isCustom && (
          <div style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#fbbf24', fontSize: '13px', fontWeight: 600 }}>
              ⚡ Custom Manager Weights Active — Column Guide displays currently applied weights.
            </span>
            <button className={styles.resetBtn} onClick={onResetWeights}>Reset to Company Defaults</button>
          </div>
        )}
        <div className={styles.infoSection}>
          <h4>Heat Index (HI) — 10-Factor Balanced Scoring Model</h4>
          <p>Composite score 0–100. Each rep is scored across 10 operational, recovery, and efficiency factors. Scores are min/max normalized relative to the current cohort, then combined using these weights:</p>
          <table className={styles.tooltipTable} style={{ marginBottom: 12 }}>
            <thead>
              <tr><th>Factor</th><th>Applied Weight</th><th>Default</th><th>Why Included & Volume Floors</th></tr>
            </thead>
            <tbody>
              <tr><td>Avg App Days</td><td>{Math.round((activeWeights.avgDaysSinceApp || 0) * 100)}%</td><td>15%</td><td>Primary engagement recency signal (lower = better)</td></tr>
              <tr><td>Active Ratio</td><td>{Math.round((activeWeights.activeRatio || 0) * 100)}%</td><td>15%</td><td>Territory health — % of assigned dealers active in 30d</td></tr>
              <tr><td>Contact Days</td><td>{Math.round((activeWeights.activeRatio || 0) * 100)}%</td><td>15%</td><td>Communication recency (lower = better)</td></tr>
              <tr><td>Approval Days</td><td>{Math.round((activeWeights.avgDaysSinceApproval || 0) * 100)}%</td><td>10%</td><td>Pipeline conversion recency (lower = better)</td></tr>
              <tr><td>Booking Days</td><td>{Math.round((activeWeights.avgDaysSinceBooking || 0) * 100)}%</td><td>10%</td><td>Deal closure recency (lower = better)</td></tr>
              <tr><td>Reactivation</td><td>{Math.round((activeWeights.reactivationRate || 0) * 100)}%</td><td>10%</td><td>Recovery of dormant accounts (higher = better)</td></tr>
              <tr><td>Net Churn</td><td>{Math.round((activeWeights.churnNet || 0) * 100)}%</td><td>5%</td><td>Net active dealer velocity (gained minus lost)</td></tr>
              <tr><td>Look-to-Book %</td><td>{Math.round((activeWeights.lookToBookPct || 0) * 100)}%</td><td>7.5%</td><td>Conversion efficiency. <strong>Bayesian Volume Floor:</strong> Require ≥ 8 apps in period (blended with cohort mean if {'<'}8)</td></tr>
              <tr><td>Approval-to-Book %</td><td>{Math.round((activeWeights.approvalToBookPct || 0) * 100)}%</td><td>7.5%</td><td>Closing efficiency. <strong>Bayesian Volume Floor:</strong> Require ≥ 5 approvals in period (blended with cohort mean if {'<'}5)</td></tr>
              <tr><td>Apps / Active Dealer</td><td>{Math.round((activeWeights.appsPerActiveDealer || 0) * 100)}%</td><td>5%</td><td>Submission density per active dealer. Soft capped at ≥ 3 active dealers</td></tr>
            </tbody>
          </table>
          <p style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
            * Note: Raw dollar volume ($) is explicitly excluded from Heat Index scoring to ensure territory size fairness — reps working smaller territories are evaluated on conversion efficiency and activity intensity rather than account dollar size.
          </p>
          <div className={styles.infoLegend}>
            <span><span className={styles.legendDot} style={{ background: '#34d399' }} /> <strong>Strong (≥70)</strong> — Top performer across engagement and conversion</span>
            <span><span className={styles.legendDot} style={{ background: '#fbbf24' }} /> <strong>Average</strong> — Middle of the pack, balanced performance</span>
            <span><span className={styles.legendDot} style={{ background: '#f97316' }} /> <strong>⚡ Overburdened</strong> — HI {'<'} 50 BUT capacity {'>'} 1.3x avg. Heavy dealer load, given benefit of doubt</span>
            <span><span className={styles.legendDot} style={{ background: '#ef4444' }} /> <strong>⚠ Underperforming</strong> — HI {'<'} 40 AND capacity ≤ 1.0x avg. Light load but behind on engagement</span>
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
  onActivityModeChange?: (mode: 'application' | 'approval' | 'booking') => void;
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
    format: (v) => resolveRepDisplayName(v != null ? String(v) : ''),
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
    key: 'inactive90Count', label: '90d Inactive', short: '90d',
    align: 'center',
    getValue: (r) => r.inactive90Count || 0,
    formatFull: (r) => r.totalDealers > 0
      ? `${r.inactive90Count || 0} (${Math.round(((r.inactive90Count || 0) / r.totalDealers) * 100)}%)`
      : String(r.inactive90Count || 0),
    staticColor: '#ea580c',
    filterKey: '90d',
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

  // ── Financial Metrics ──
  {
    key: 'totalApps', label: 'Applications', short: 'Apps',
    align: 'center',
    getValue: (r) => r.financials?.totalApps ?? null,
    format: (v) => v != null && v > 0 ? v.toLocaleString() : '—',
  },
  {
    key: 'approvedCount', label: 'Approvals', short: 'Appr',
    align: 'center',
    getValue: (r) => r.financials?.approvedCount ?? null,
    format: (v) => v != null && v > 0 ? v.toLocaleString() : '—',
  },
  {
    key: 'leadBookedCount', label: 'App Booked Deals', short: 'App Bkd #',
    align: 'center',
    getValue: (r) => r.financials?.leadBookedCount ?? r.financials?.bookedCount ?? null,
    format: (v) => v != null && v > 0 ? String(v) : '—',
    reverseHeat: true,
  },
  {
    key: 'leadBookedVolume', label: 'App Booked Volume', short: 'App Vol $',
    align: 'right',
    getValue: (r) => r.financials?.leadBookedVolume ?? null,
    format: (v) => {
      if (v == null || v === 0) return '—';
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
      if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
      return `$${v}`;
    },
    reverseHeat: true,
  },
  {
    key: 'bookedCount', label: 'Funded Booked Deals', short: 'Funded Bkd #',
    align: 'center',
    getValue: (r) => r.financials?.closeBookedCount ?? r.financials?.bookedCount ?? null,
    format: (v) => v != null && v > 0 ? String(v) : '—',
    reverseHeat: true,
  },
  {
    key: 'bookedVolume', label: 'Funded Booked Volume', short: 'Funded Vol $',
    align: 'right',
    getValue: (r) => r.financials?.closeBookedVolume ?? r.financials?.bookedVolume ?? null,
    format: (v) => {
      if (v == null || v === 0) return '—';
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
      if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
      return `$${v}`;
    },
    reverseHeat: true,
  },
  {
    key: 'avgDealSize', label: 'Avg Deal Size', short: 'Avg $',
    align: 'right',
    getValue: (r) => r.financials?.avgDealSize ?? null,
    format: (v) => v != null ? `$${Math.round(v).toLocaleString()}` : '—',
  },
  {
    key: 'avgFico', label: 'Average FICO', short: 'FICO',
    align: 'center',
    getValue: (r) => r.financials?.avgFico ?? null,
    format: (v) => v != null ? String(v) : '—',
    reverseHeat: true,
  },
  {
    key: 'lookToBookPct', label: 'Look to Book', short: 'L2B %',
    align: 'center',
    getValue: (r) => r.financials?.lookToBookPct ?? null,
    format: (v) => v != null ? `${v.toFixed(1)}%` : '—',
    reverseHeat: true,
  },
  {
    key: 'approvalToBookPct', label: 'Approval to Book', short: 'A2B %',
    align: 'center',
    getValue: (r) => r.financials?.approvalToBookPct ?? null,
    format: (v) => v != null ? `${v.toFixed(1)}%` : '—',
    reverseHeat: true,
  },
  {
    key: 'avgReserveAmt', label: 'Avg Reserve', short: 'Rsv $',
    align: 'right',
    getValue: (r) => r.financials?.avgReserveAmt ?? null,
    format: (v) => v != null ? `$${Math.round(v).toLocaleString()}` : '—',
    reverseHeat: true,
  },
  {
    key: 'avgTimeToBookDays', label: 'Avg Time to Book', short: 'TTB',
    align: 'center',
    getValue: (r) => r.financials?.avgTimeToBookDays ?? null,
    format: (v) => v != null ? `${v.toFixed(0)}d` : '—',
    heatmap: true,
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
 * Heatmap for "higher = better" metrics (e.g. gained, net).
 * Positive = green, negative = severity-based red/orange/amber.
 */
function reverseHeatColor(value: number | null): string {
  if (value == null) return '';
  if (value > 0) return 'var(--color-emerald, #34d399)';
  if (value === 0) return '';
  // Negative — severity scale
  if (value >= -0.3) return 'var(--color-amber, #fbbf24)';
  if (value >= -0.8) return 'var(--color-orange, #f97316)';
  return 'var(--color-red, #ef4444)';
}

/**
 * Color for loss-per-day metrics (higher loss = worse).
 * Any loss is bad; 0 = neutral, escalates amber → orange → red.
 */
function lossHeatColor(value: number | null): string {
  if (value == null || value === 0) return '';
  if (value <= 0.3) return 'var(--color-amber, #fbbf24)';
  if (value <= 0.8) return 'var(--color-orange, #f97316)';
  return 'var(--color-red, #ef4444)';
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
  onActivityModeChange,
}: RepScorecardProps) {
  const [drawerStatusFilter, setDrawerStatusFilter] = useState<string | null>(null);
  const [localActivityMode, setLocalActivityMode] = useState<'application' | 'approval' | 'booking'>('application');
  const currentActivityMode = (activityMode as 'application' | 'approval' | 'booking') || localActivityMode;

  // Map UI filter to API activityStatus values
  const statusFilterValues = drawerStatusFilter
    ? { active: ['active'], '30d': ['30d_inactive'], '60d': ['60d_inactive'], long: ['long_inactive'] }[drawerStatusFilter] || undefined
    : undefined;

  const [finPeriod, setFinPeriod] = useState<FinPeriod>('mtd');
  const { data, isLoading } = useRepScorecard(windowSize, open, statusFilterValues, currentActivityMode, finPeriod);
  const [sortKey, setSortKey] = useState('rep');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showInfo, setShowInfo] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [customWeights, setCustomWeights] = useState<Record<string, number> | null>(() => {
    try {
      const stored = localStorage.getItem('source_one_custom_weights');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const activeWeights = useMemo(() => {
    return customWeights ? { ...DEFAULT_HEAT_WEIGHTS, ...customWeights } : DEFAULT_HEAT_WEIGHTS;
  }, [customWeights]);

  const handleApplyCustomWeights = useCallback((newWeights: Record<string, number>) => {
    setCustomWeights(newWeights);
    try {
      localStorage.setItem('source_one_custom_weights', JSON.stringify(newWeights));
    } catch {
      // ignore
    }
  }, []);

  const handleResetCustomWeights = useCallback(() => {
    setCustomWeights(null);
    try {
      localStorage.removeItem('source_one_custom_weights');
    } catch {
      // ignore
    }
  }, []);

  const repsWithCustomWeights = useMemo(() => {
    if (!data?.reps) return [];
    if (!customWeights) return data.reps;

    const w = activeWeights;

    return data.reps.map((rep) => {
      const breakdown = rep._heatBreakdown;
      if (!breakdown) return rep;

      let totalScore = 0;
      let totalWeight = 0;
      const newBreakdown: Record<string, any> = {};

      for (const key of Object.keys(w)) {
        const weight = w[key] || 0;
        const item = breakdown[key];
        if (!item || item.raw == null || item.normalized == null) {
          newBreakdown[key] = { ...(item || {}), weight };
          continue;
        }
        const weighted = item.normalized * weight * 100;
        totalScore += weighted;
        totalWeight += weight;
        newBreakdown[key] = {
          ...item,
          weighted: Math.round(weighted * 100) / 100,
          weight,
        };
      }

      const heatIndex = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) / 100 : 50;
      const clampedIndex = Math.max(0, Math.min(100, Math.round(heatIndex)));

      let heatClass = rep.heatClass;
      let capacityFlag = rep.capacityFlag;
      if (clampedIndex >= 70) {
        heatClass = 'strong';
        capacityFlag = null;
      } else if (rep.capacityRatio != null && rep.capacityRatio > 1.3 && clampedIndex < 50) {
        heatClass = 'overburdened';
        capacityFlag = 'overburdened';
      } else if (rep.capacityRatio != null && rep.capacityRatio <= 1.0 && clampedIndex < 40) {
        heatClass = 'underperforming';
        capacityFlag = 'underperforming';
      } else {
        heatClass = 'average';
        capacityFlag = null;
      }

      return {
        ...rep,
        heatIndex: clampedIndex,
        heatClass,
        capacityFlag,
        _heatBreakdown: newBreakdown,
      };
    });
  }, [data, customWeights, activeWeights]);

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

  const [houseFilter, setHouseFilter] = useState<'all' | 'reps_only' | 'house_only'>('all');

  const filteredReps = useMemo(() => {
    if (!repsWithCustomWeights.length) return [];
    return repsWithCustomWeights.filter((r) => {
      const isHouse = /^s1house$/i.test(r.rep || '') || /house/i.test(r.rep || '');
      if (houseFilter === 'reps_only') return !isHouse;
      if (houseFilter === 'house_only') return isHouse;
      return true;
    });
  }, [repsWithCustomWeights, houseFilter]);

  const sortedReps = useMemo(() => {
    if (!filteredReps.length) return [];
    const col = COLUMNS.find((c) => c.key === sortKey);
    return [...filteredReps].sort((a, b) => {
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
  }, [filteredReps, sortKey, sortDir]);

  const handleRepClick = useCallback((rep: string) => {
    onSelectRep?.(resolveRepDisplayName(rep));
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
        <div className="mobileDragHandleRow">
          <div className="mobileDragHandle" />
        </div>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={styles.title}>Rep Scorecard</h2>
            {customWeights && (
              <div className={styles.customBadge} title="Using custom Sales Manager weights">
                ⚡ Custom Weights Active
                <button
                  className={styles.customBadgeReset}
                  onClick={handleResetCustomWeights}
                  title="Reset to Company Defaults"
                >
                  ✕
                </button>
              </div>
            )}
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
            <div className={styles.statusByToggle}>
              <label className={styles.statusByLabel}>Status by</label>
              <select
                className={styles.statusBySelect}
                value={currentActivityMode}
                onChange={(e) => {
                  const mode = e.target.value as 'application' | 'approval' | 'booking';
                  setLocalActivityMode(mode);
                  if (onActivityModeChange) onActivityModeChange(mode);
                }}
                id="scorecard-activity-mode"
              >
                <option value="application">Application</option>
                <option value="approval">Approval</option>
                <option value="booking">Booking</option>
              </select>
            </div>
            <div className={styles.statusByToggle}>
              <label className={styles.statusByLabel}>Financial Period</label>
              <select
                className={styles.statusBySelect}
                value={finPeriod}
                onChange={(e) => setFinPeriod(e.target.value as FinPeriod)}
                id="scorecard-fin-period"
              >
                <option value="mtd">MTD</option>
                <option value="30d">Last 30d</option>
                <option value="90d">Last 90d</option>
                <option value="ytd">YTD</option>
                <option value="all">All-Time</option>
              </select>
            </div>
            <div className={styles.statusByToggle}>
              <label className={styles.statusByLabel}>Portfolio</label>
              <select
                className={styles.statusBySelect}
                value={houseFilter}
                onChange={(e) => setHouseFilter(e.target.value as 'all' | 'reps_only' | 'house_only')}
                id="scorecard-portfolio-filter"
              >
                <option value="all">All Accounts</option>
                <option value="reps_only">Rep-Managed Only</option>
                <option value="house_only">House (S1House)</option>
              </select>
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
              className={styles.resetBtn}
              onClick={() => setShowConfig(true)}
              title="Customize Heat Index weights"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px' }}
            >
              ⚙ Configurator
            </button>
            <button
              className={`${styles.infoBtn} ${showInfo ? styles.infoBtnActive : ''}`}
              onClick={() => setShowInfo(!showInfo)}
              title="What do these columns mean?"
              aria-label="Column guide"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </button>
            <button className={styles.closeBtn} onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        {/* Info Panel (toggled) */}
        {showInfo && (
          <InfoPanel
            activeWeights={activeWeights}
            isCustom={!!customWeights}
            onResetWeights={handleResetCustomWeights}
            onClose={() => setShowInfo(false)}
          />
        )}

        {/* Sales Manager Weight Configurator Modal */}
        {showConfig && (
          <WeightConfiguratorModal
            currentWeights={activeWeights}
            onApply={handleApplyCustomWeights}
            onReset={handleResetCustomWeights}
            onClose={() => setShowConfig(false)}
          />
        )}

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
                      } else if (col.key === 'lost' && typeof raw === 'number') {
                        color = lossHeatColor(raw);
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
                            } else if (col.key === 'inactive90Count') {
                              val = st.totalDealers > 0
                                ? `${st.inactive90Count || 0} (${Math.round(((st.inactive90Count || 0) / st.totalDealers) * 100)}%)`
                                : String(st.inactive90Count || 0);
                              cellColor = '#ea580c';
                            } else if (col.key === 'longInactiveCount') {
                              val = st.totalDealers > 0
                                ? `${st.longInactiveCount} (${Math.round((st.longInactiveCount / st.totalDealers) * 100)}%)`
                                : String(st.longInactiveCount);
                              cellColor = 'var(--color-red, #ef4444)';
                            } else if (col.key === 'reactivatedCount') {
                              val = '—'; // column removed but guard kept for safety
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
                              if (typeof v === 'number') cellColor = lossHeatColor(v);
                            } else if (col.key === 'net' && st.statusFlows) {
                              const v = st.statusFlows.netDelta;
                              val = v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}` : '—';
                              if (typeof v === 'number') cellColor = reverseHeatColor(v);
                            // ── Financial columns for state sub-rows ──
                            } else if (col.key === 'totalApps' && st.financials) {
                              val = st.financials.totalApps > 0 ? st.financials.totalApps.toLocaleString() : '—';
                            } else if (col.key === 'approvedCount' && st.financials) {
                              val = st.financials.approvedCount > 0 ? st.financials.approvedCount.toLocaleString() : '—';
                            } else if (col.key === 'bookedVolume' && st.financials) {
                              const v = st.financials.bookedVolume;
                              if (v == null || v === 0) val = '—';
                              else if (v >= 1_000_000) val = `$${(v / 1_000_000).toFixed(1)}M`;
                              else if (v >= 1_000) val = `$${(v / 1_000).toFixed(0)}K`;
                              else val = `$${v}`;
                            } else if (col.key === 'bookedCount' && st.financials) {
                              val = st.financials.bookedCount > 0 ? String(st.financials.bookedCount) : '—';
                            } else if (col.key === 'avgDealSize' && st.financials) {
                              val = st.financials.avgDealSize != null ? `$${Math.round(st.financials.avgDealSize).toLocaleString()}` : '—';
                            } else if (col.key === 'lookToBookPct' && st.financials) {
                              val = st.financials.lookToBookPct != null ? `${st.financials.lookToBookPct.toFixed(1)}%` : '—';
                            } else if (col.key === 'approvalToBookPct' && st.financials) {
                              val = st.financials.approvalToBookPct != null ? `${st.financials.approvalToBookPct.toFixed(1)}%` : '—';
                            } else if (col.key === 'avgReserveAmt' && st.financials) {
                              val = st.financials.avgReserveAmt != null ? `$${Math.round(st.financials.avgReserveAmt).toLocaleString()}` : '—';
                            } else if (col.key === 'avgTimeToBookDays' && st.financials) {
                              const v = st.financials.avgTimeToBookDays;
                              val = v != null ? `${v.toFixed(0)}d` : '—';
                              if (typeof v === 'number') cellColor = daysHeatColor(v);
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
