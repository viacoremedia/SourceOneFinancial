/**
 * RollingAvgStrip — Compact data ticker showing 5 core rolling averages
 * with period-over-period deltas and churn flow summary.
 *
 * Positioned between FilterBar stats row and DealerTable.
 */

import styles from './RollingAvgStrip.module.css';
import type { NetworkRollingAvgResponse, RollingWindow } from '../../types';

interface RollingAvgStripProps {
  data: NetworkRollingAvgResponse | null;
  isLoading: boolean;
  windowSize: RollingWindow;
  onWindowChange: (w: RollingWindow) => void;
  activeOnly: boolean;
  onActiveOnlyChange: (v: boolean) => void;
  /** Label showing which status filter is active from the FilterBar */
  statusFilterLabel?: string | null;
}

/** Metric card configuration */
const METRICS = [
  { key: 'avgDaysSinceApp', label: 'Avg App Days', short: 'App' },
  { key: 'avgDaysSinceApproval', label: 'Avg Approval', short: 'Appr' },
  { key: 'avgDaysSinceBooking', label: 'Avg Booking', short: 'Bkd' },
  { key: 'avgContactDays', label: 'Avg Contact', short: 'Contact' },
  { key: 'avgVisitResponse', label: 'Visit Response', short: 'Visit' },
] as const;

type MetricKey = (typeof METRICS)[number]['key'];

/**
 * Heatmap color for "days since" metrics.
 * Lower = better (green), higher = worse (red).
 */
function heatColor(value: number | null): string {
  if (value == null) return 'var(--text-muted)';
  if (value <= 15) return 'var(--color-emerald, #34d399)';
  if (value <= 25) return 'var(--color-amber, #fbbf24)';
  if (value <= 40) return 'var(--color-orange, #f97316)';
  return 'var(--color-red, #ef4444)';
}

/**
 * Format a delta with directional arrow and color.
 * For "days since" metrics, negative delta = improvement (green ↓).
 */
function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  // For days-since, negative = improving
  const improving = delta < 0;
  const cls = improving ? styles.deltaBadgeGood : styles.deltaBadgeBad;
  const arrow = improving ? '↓' : '↑';
  return (
    <span className={`${styles.deltaBadge} ${cls}`}>
      {arrow}{Math.abs(delta).toFixed(1)}
    </span>
  );
}

/**
 * Format a number for display.
 */
function fmt(v: number | null): string {
  if (v == null) return '—';
  return v.toFixed(1);
}

/**
 * Delta badge for churn flow metrics.
 * @param delta - Change vs previous window (positive = increased)
 * @param invert - If true, positive delta = bad (e.g. "lost" went up = worse)
 */
function ChurnDelta({ delta, invert }: { delta: number | null; invert: boolean }) {
  if (delta == null || delta === 0) return null;
  const isPositive = delta > 0;
  // For "gained" and "net": positive = good (green ↑)
  // For "lost": positive = bad (red ↑), negative = good (green ↓)
  const isGood = invert ? !isPositive : isPositive;
  const cls = isGood ? styles.deltaBadgeGood : styles.deltaBadgeBad;
  const arrow = isPositive ? '↑' : '↓';
  return (
    <span
      className={`${styles.deltaBadge} ${cls} ${styles.churnDeltaBadge}`}
      title={`${isPositive ? '+' : ''}${delta.toFixed(1)}/d vs previous ${invert ? '(lower is better)' : '(higher is better)'}`}
    >
      {arrow}{Math.abs(delta).toFixed(1)}
    </span>
  );
}

export function RollingAvgStrip({
  data,
  isLoading,
  windowSize,
  onWindowChange,
  activeOnly,
  onActiveOnlyChange,
  statusFilterLabel,
}: RollingAvgStripProps) {
  // Skeleton loading
  if (isLoading) {
    return (
      <div className={styles.strip} id="rolling-avg-strip">
        <div className={styles.windowToggle}>
          <button className={styles.windowBtn} disabled>7d</button>
          <button className={styles.windowBtn} disabled>30d</button>
        </div>
        <div className={styles.metricsRow}>
          {METRICS.map((m) => (
            <div key={m.key} className={styles.metricCard}>
              <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
              <div className={`${styles.skeleton} ${styles.skeletonValue}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Insufficient data
  if (!data || data.insufficientData) {
    return (
      <div className={styles.strip} id="rolling-avg-strip">
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
        <div className={styles.emptyState}>
          Need ≥2 report dates for rolling averages
        </div>
      </div>
    );
  }

  const { current, deltas, statusFlows, statusFlowDeltas } = data;

  return (
    <div className={styles.strip} id="rolling-avg-strip">
      {/* Window toggle */}
      <div className={styles.windowToggle}>
        <button
          className={`${styles.windowBtn} ${windowSize === 7 ? styles.windowBtnActive : ''}`}
          onClick={() => onWindowChange(7)}
          id="rolling-window-7d"
        >7d</button>
        <button
          className={`${styles.windowBtn} ${windowSize === 30 ? styles.windowBtnActive : ''}`}
          onClick={() => onWindowChange(30)}
          id="rolling-window-30d"
        >30d</button>
      </div>

      {/* Status Filter Indicator */}
      {statusFilterLabel ? (
        <span className={`${styles.activeToggle} ${styles.activeToggleOn}`} title={`Filtering: ${statusFilterLabel}`}>
          ✓ {statusFilterLabel}
        </span>
      ) : (
        <button
          className={`${styles.activeToggle} ${activeOnly ? styles.activeToggleOn : ''}`}
          onClick={() => onActiveOnlyChange(!activeOnly)}
          title={activeOnly ? 'Showing active dealers only — click for all' : 'Click to show active dealers only'}
          id="rolling-active-only"
        >
          {activeOnly ? '✓ Active' : 'All'}
        </button>
      )}

      {/* 5 Metric Cards */}
      <div className={styles.metricsRow}>
        {METRICS.map((m) => {
          const value = current[m.key as MetricKey];
          const delta = deltas[m.key as MetricKey];
          return (
            <div key={m.key} className={styles.metricCard}>
              <span className={styles.metricLabel}>{m.label}</span>
              <span className={styles.metricValue} style={{ color: heatColor(value) }}>
                {fmt(value)}
              </span>
              <DeltaBadge delta={delta} />
            </div>
          );
        })}
      </div>

      {/* Churn Flow Summary — with label, tooltips, and deltas */}
      <div className={styles.churnSummary}>
        <span className={styles.churnLabel}>Daily Churn</span>
        <span
          className={styles.churnGained}
          title={`Gained: on avg ${statusFlows.avgGainedActive.toFixed(1)} dealers/day entered this status over the ${windowSize}-day window`}
        >
          +{statusFlows.avgGainedActive.toFixed(1)}/d
          <ChurnDelta delta={statusFlowDeltas?.avgGainedActive ?? null} invert={false} />
        </span>
        <span className={styles.churnDivider}>·</span>
        <span
          className={styles.churnLost}
          title={`Lost: on avg ${statusFlows.avgLostActive.toFixed(1)} dealers/day left this status over the ${windowSize}-day window`}
        >
          -{statusFlows.avgLostActive.toFixed(1)}/d
          <ChurnDelta delta={statusFlowDeltas?.avgLostActive ?? null} invert={true} />
        </span>
        <span className={styles.churnDivider}>·</span>
        <span
          className={statusFlows.netDelta >= 0 ? styles.churnGained : styles.churnLost}
          title={`Net: gained minus lost per day (${statusFlows.netDelta >= 0 ? 'growing' : 'shrinking'} by ${Math.abs(statusFlows.netDelta).toFixed(1)}/day)`}
        >
          Net {statusFlows.netDelta >= 0 ? '+' : ''}{statusFlows.netDelta.toFixed(1)}
          <ChurnDelta delta={statusFlowDeltas?.netDelta ?? null} invert={false} />
        </span>
      </div>
    </div>
  );
}
