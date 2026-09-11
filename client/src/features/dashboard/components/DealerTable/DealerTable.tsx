/**
 * DealerTable — Main data table for the dealer dashboard.
 * 
 * Features:
 * - Group rows (expandable) with summary stats (best/worst, active ratio)
 * - Multi-column sorting (double-click to add secondary sort columns)
 * - Independent child location sorting (Shift+Click)
 * - Heatmap coloring for days-since metrics
 * - Flat dealer list for "Independent Dealers" tab
 * - Search, trend dropdown, skeleton loading
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import styles from './DealerTable.module.css';
import { TABLE_COLUMNS } from './columns';
import { StatusBadge } from './StatusBadge';
import { BadgerQuickModal } from '../BadgerQuickModal/BadgerQuickModal';
import { QuickActionPopover, type QuickActionDealer } from '../QuickActionPopover/QuickActionPopover';
import { undoDealerQuickAction, undoBatchDealerAction, type UniversalTag } from '../../../../core/services/api';
import { FloatingBatchBar } from './FloatingBatchBar';
import { RotateCcw, X, CheckSquare, Lock, Building2, MapPin, Flag, Calendar, BarChart2 } from 'lucide-react';
import { getDaysSinceHeatmap, getCommDaysHeatmap } from '../../../../core/utils/heatmap';
import type { StateRepMap } from '../../../../core/services/api';
import type {
  DealerGroup,
  DealerLocation,
  DealerStats,
  MetricTrend,
  TrendPeriod,
  ActivityStatus,
  BestWorst,
  TableColumn,
  SortColumn,
  SortDir,
} from '../../types';

import { resolveRepDisplayName } from '../../../../core/utils/repNames';
import { CustomDatePicker } from '../CustomDatePicker/CustomDatePicker';

const INACTIVE_OR_EXCLUDED_REPS = new Set([
  'bruce sweere', 'bsweere',
  'tony derouin', 'tderouin',
  'steve kimble', 'skimble',
  'n boly', 'nboly',
  'mandi schultz', 'mschultz', 'mschultz1', 'mandi',
  'wendy'
]);

function getRepDisplayForDealer(
  dealerRepresentative?: string | null,
  repName?: string | null,
  statePrefix?: string | null,
  stateRepMap?: StateRepMap
): string {
  const raw = (dealerRepresentative || repName || '').trim();
  if (raw) {
    const resolved = resolveRepDisplayName(raw);
    const lower = resolved.trim().toLowerCase();
    if (resolved && resolved !== 'Unassigned' && !INACTIVE_OR_EXCLUDED_REPS.has(lower)) {
      return resolved.split(' ').pop() || resolved;
    }
  }
  if (statePrefix && stateRepMap && stateRepMap[statePrefix]) {
    const stateRep = stateRepMap[statePrefix];
    const lowerStateRep = stateRep.trim().toLowerCase();
    if (!INACTIVE_OR_EXCLUDED_REPS.has(lowerStateRep)) {
      return stateRep.split(' ').pop() || stateRep;
    }
  }
  return '—';
}

// ── Stacked Stat Cell ──

function formatStatValue(val: number | undefined | null, type: 'count' | 'dollar' | 'percent'): string {
  if (val == null || val === 0) return '—';
  if (type === 'dollar') return `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (type === 'percent') return `${(val * 100).toFixed(1)}%`;
  return val.toLocaleString();
}

function renderStackedStatCell(
  val: number | undefined | null,
  trend: MetricTrend | undefined,
  type: 'count' | 'dollar' | 'percent',
  isAllTime: boolean = false
) {
  const currentFormatted = formatStatValue(val, type);

  // If viewing All-Time or trend is disabled, render current value only
  if (isAllTime || !trend) {
    if (val == null || val === 0) return <span className={styles.emptyValue}>—</span>;
    return (
      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
        {currentFormatted}
      </span>
    );
  }

  const baselineFormatted = formatStatValue(trend.baseline, type);
  const hasBaselineData = typeof trend.baseline === 'number' && trend.baseline > 0;
  const currentVal = val || 0;
  const baseVal = trend.baseline || 0;
  const totalVolume = currentVal + baseVal;

  if (val == null || val === 0) {
    if (hasBaselineData && baselineFormatted !== '—') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: '1.3', padding: '2px 0' }}>
          <span className={styles.emptyValue}>—</span>
          <span style={{ fontSize: '11px', marginTop: '2px', fontFamily: 'var(--font-mono, monospace)', display: 'flex', gap: '4px', alignItems: 'center' }}>
            <span style={{
              color: '#f87171',
              fontWeight: 700,
              background: 'rgba(248, 113, 113, 0.18)',
              padding: '1px 4px',
              borderRadius: '4px'
            }}>
              -100%
            </span>
            <span style={{ color: '#94a3b8', fontWeight: 500 }}>({baselineFormatted})</span>
          </span>
        </div>
      );
    }
    return <span className={styles.emptyValue}>—</span>;
  }

  // Volume guard: if baseline is 0 and current > 0 -> render "New"
  if (baseVal === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: '1.3', padding: '2px 0' }}>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {currentFormatted}
        </span>
        <span style={{ fontSize: '11px', marginTop: '2px', fontFamily: 'var(--font-mono, monospace)', display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{
            color: '#34d399',
            fontWeight: 700,
            background: 'rgba(52, 211, 153, 0.18)',
            padding: '1px 4px',
            borderRadius: '4px'
          }}>
            New
          </span>
        </span>
      </div>
    );
  }

  // Volume guard: if total volume < 5, render baseline subtext without noisy percentage
  if (totalVolume < 5 && type === 'count') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: '1.3', padding: '2px 0' }}>
        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {currentFormatted}
        </span>
        <span style={{ fontSize: '11px', marginTop: '2px', fontFamily: 'var(--font-mono, monospace)', color: '#94a3b8', fontWeight: 500 }}>
          ({baselineFormatted})
        </span>
      </div>
    );
  }

  const isUp = trend.diff > 0;
  const isDown = trend.diff < 0;
  const pctSign = trend.pct > 0 ? '+' : '';
  const pctText = `${pctSign}${trend.pct}%`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: '1.3', padding: '2px 0' }}>
      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
        {currentFormatted}
      </span>
      {baselineFormatted !== '—' && (
        <span style={{ fontSize: '11px', marginTop: '2px', fontFamily: 'var(--font-mono, monospace)', display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{
            color: isUp ? '#34d399' : isDown ? '#f87171' : '#94a3b8',
            fontWeight: 700,
            background: isUp ? 'rgba(52, 211, 153, 0.18)' : isDown ? 'rgba(248, 113, 113, 0.18)' : 'rgba(148, 163, 184, 0.15)',
            padding: '1px 4px',
            borderRadius: '4px'
          }}>
            {pctText}
          </span>
          <span style={{ color: '#94a3b8', fontWeight: 500 }}>({baselineFormatted})</span>
        </span>
      )}
    </div>
  );
}

import type { DatePreset } from '../FilterBar';

interface DealerTableProps {
  mode: 'groups' | 'dealers' | 'all';
  groups: DealerGroup[];
  groupLocations: Record<string, DealerLocation[]>;
  smallDealers: DealerLocation[];
  isLoading: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  statusFilter?: string | null;
  isPrefetching?: boolean;
  activityMode?: 'application' | 'approval' | 'booking';
  stateRepMap?: StateRepMap;
  datePreset?: DatePreset;
  customStartDate?: string;
  customEndDate?: string;
  maxReportDate?: string;
  onExpandGroup: (slug: string) => void;
  onLoadMore?: () => void;
  dealerSort?: SortColumn[];
  onDealerSortChange?: (sortStack: SortColumn[]) => void;
  onDealerSearch?: (query: string) => void;
  onSelectDealer?: (dealerId: string) => void;
  onSelectGroup?: (groupSlug: string) => void;
  onDatePresetChange?: (preset: DatePreset) => void;
  onCustomDateChange?: (start?: string, end?: string) => void;
  onTrendChange?: (trend: TrendPeriod) => void;
  comparisonLabel?: string;
  availableTags?: UniversalTag[];
  onTagsUpdated?: () => void;
  totalCount?: number;
  currentFilters?: Record<string, any>;
}

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  title,
  ariaLabel,
  onClick
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  onClick?: (e: React.MouseEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = Boolean(indeterminate);
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange || (() => {})}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        accentColor: '#38bdf8',
        width: '15px',
        height: '15px',
        borderRadius: '3px'
      }}
    />
  );
}

// ── DRD Segment Badge Helper ──

function renderDrdBadge(drd?: DealerLocation['drd']) {
  if (!drd || !drd.segment) return null;
  const isOverridden = drd.isOverridden;
  switch (drd.segment) {
    case 'high_tlc':
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#f87171',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            padding: '1px 6px',
            borderRadius: '4px',
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap'
          }}
          title={isOverridden ? `Overridden to High TLC: ${drd.reason || ''}` : 'High TLC (Touch-Sensitive Account)'}
        >
          {isOverridden && <Lock size={10} />}TLC
        </span>
      );
    case 'self_sufficient':
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#34d399',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            padding: '1px 6px',
            borderRadius: '4px',
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap'
          }}
          title={isOverridden ? `Overridden to Autonomous: ${drd.reason || ''}` : 'Autonomous (Self-Sufficient Flow)'}
        >
          {isOverridden && <Lock size={10} />}Auto
        </span>
      );
    case 'comfort_stop':
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            background: 'rgba(249, 115, 22, 0.15)',
            color: '#fb923c',
            border: '1px solid rgba(249, 115, 22, 0.35)',
            padding: '1px 6px',
            borderRadius: '4px',
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap'
          }}
          title={isOverridden ? `Overridden to Comfort Stop: ${drd.reason || ''}` : 'Comfort Stop (Low Touch-Sensitivity)'}
        >
          {isOverridden && <Lock size={10} />}Comfort
        </span>
      );
    case 'insufficient_data':
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            background: 'rgba(148, 163, 184, 0.15)',
            color: '#cbd5e1',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            padding: '1px 6px',
            borderRadius: '4px',
            fontSize: '0.68rem',
            fontWeight: 600,
            whiteSpace: 'nowrap'
          }}
          title={isOverridden ? `Overridden to Discovery: ${drd.reason || ''}` : 'Discovery Queue (<2 Visits)'}
        >
          {isOverridden && <Lock size={10} />}Discovery
        </span>
      );
    case 'lapsed':
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            background: 'rgba(234, 179, 8, 0.15)',
            color: '#facc15',
            border: '1px solid rgba(234, 179, 8, 0.35)',
            padding: '1px 6px',
            borderRadius: '4px',
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap'
          }}
          title={isOverridden ? `Overridden to Lapsed: ${drd.reason || ''}` : 'Lapsed / Churned (180+ Days Inactive)'}
        >
          {isOverridden && <Lock size={10} />}Lapsed
        </span>
      );
    default:
      return null;
  }
}

// ── Classification & Status Badges Helper ──

function renderStatusRedFlag(dealer: {
  systemStatus?: 'active' | 'closed' | 'bought_out' | 'no_longer_in_service';
  systemStatusReason?: string | null;
}) {
  const isDead = dealer.systemStatus && dealer.systemStatus !== 'active';
  if (!isDead) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        background: dealer.systemStatus === 'closed' ? 'rgba(239, 68, 68, 0.2)' : dealer.systemStatus === 'bought_out' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(234, 179, 8, 0.2)',
        color: dealer.systemStatus === 'closed' ? '#f87171' : dealer.systemStatus === 'bought_out' ? '#fbbf24' : '#facc15',
        border: `1px solid ${dealer.systemStatus === 'closed' ? 'rgba(239, 68, 68, 0.4)' : dealer.systemStatus === 'bought_out' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
        padding: '1px 6px',
        borderRadius: '4px',
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap'
      }}
      title={dealer.systemStatusReason || dealer.systemStatus}
    >
      {dealer.systemStatus === 'closed' ? 'Closed' : dealer.systemStatus === 'bought_out' ? 'Bought Out' : 'Out of Service'}
    </span>
  );
}

function renderMetaBadges(dealer: {
  businessType?: 'franchise' | 'non-franchise' | 'broker' | null;
  tags?: string[];
}) {
  return (
    <>
      {dealer.businessType && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            background: 'rgba(148, 163, 184, 0.12)',
            color: '#cbd5e1',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            padding: '1px 5px',
            borderRadius: '3px',
            fontSize: '0.65rem',
            fontWeight: 600,
            whiteSpace: 'nowrap'
          }}
        >
          {dealer.businessType === 'franchise' ? 'Franchise' : dealer.businessType === 'non-franchise' ? 'Independent' : 'Broker'}
        </span>
      )}

      {dealer.tags && dealer.tags.length > 0 && (
        <div style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
          {dealer.tags.slice(0, 2).map((t, idx) => (
            <span
              key={idx}
              style={{
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                color: '#38bdf8',
                fontSize: '0.62rem',
                padding: '0 4px',
                borderRadius: '3px',
                fontWeight: 500
              }}
            >
              #{t}
            </span>
          ))}
          {dealer.tags.length > 2 && (
            <span
              style={{ fontSize: '0.62rem', color: '#94a3b8' }}
              title={dealer.tags.slice(2).join(', ')}
            >
              +{dealer.tags.length - 2}
            </span>
          )}
        </div>
      )}
    </>
  );
}

// ── DRD Visit Metrics Cell Renderers ──

function renderLastVisitCell(drd?: DealerLocation['drd']) {
  if (!drd || (!drd.lastVisitDate && (drd.daysSinceLastVisit == null || drd.totalVisits === 0))) {
    return <span style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>Never</span>;
  }
  const days = drd.daysSinceLastVisit != null ? drd.daysSinceLastVisit : daysSinceDate(drd.lastVisitDate);
  const daysStr = days != null ? `${days}d` : null;

  let dateFormatted = '—';
  if (drd.lastVisitDate) {
    const d = new Date(drd.lastVisitDate);
    if (!isNaN(d.getTime())) {
      dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    }
  }

  const fullDateTooltip = drd.lastVisitDate
    ? `Last visit on ${new Date(drd.lastVisitDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}${days != null ? ` (${days} days ago)` : ''}`
    : days != null ? `${days} days ago` : 'Never';

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: '1.2', padding: '1px 0' }}
      title={fullDateTooltip}
    >
      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)' }}>
        {dateFormatted !== '—' ? dateFormatted : (daysStr ? `${daysStr} ago` : 'Never')}
      </span>
      {daysStr && dateFormatted !== '—' && (
        <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--font-mono, monospace)' }}>
          ({daysStr})
        </span>
      )}
    </div>
  );
}

function renderPostVisitLiftCell(lift?: number | null) {
  if (lift == null) return <span className={styles.emptyValue}>—</span>;
  const isPositive = lift > 0;
  const isZero = lift === 0;
  const sign = isPositive ? '+' : '';
  const text = `${sign}${lift}%`;

  let textColor = '#34d399';
  if (lift >= 50) {
    textColor = '#34d399'; // Bright emerald green
  } else if (lift > 0) {
    textColor = '#38bdf8'; // Bright sky blue
  } else if (isZero) {
    textColor = '#94a3b8'; // Slate
  } else {
    textColor = '#f87171'; // Soft red
  }

  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: '13px',
        fontWeight: 700,
        fontFamily: 'var(--font-mono, monospace)',
        color: textColor,
        whiteSpace: 'nowrap',
        letterSpacing: '-0.02em',
      }}
      title={`Post-visit booked volume lift: ${text}`}
    >
      {text}
    </span>
  );
}

function renderYieldPerVisitCell(yieldVal?: number | null) {
  if (yieldVal == null || yieldVal <= 0) return <span className={styles.emptyValue}>—</span>;
  
  let formatted = '';
  if (yieldVal >= 1000000) {
    formatted = `$${(yieldVal / 1000000).toFixed(1)}M`;
  } else if (yieldVal >= 1000) {
    formatted = `$${Math.round(yieldVal / 1000)}K`;
  } else {
    formatted = `$${Math.round(yieldVal).toLocaleString()}`;
  }

  return (
    <span
      style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}
      title={`$${Math.round(yieldVal).toLocaleString()} lifetime booked volume per visit`}
    >
      {formatted}
    </span>
  );
}

function renderGroupLastVisit(locations: DealerLocation[]) {
  const visitedLocs = locations.filter(l => l.drd?.lastVisitDate || l.drd?.daysSinceLastVisit != null);
  if (visitedLocs.length === 0) {
    return <span style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>Never</span>;
  }
  let bestLoc = visitedLocs[0];
  let bestTime = bestLoc.drd?.lastVisitDate ? new Date(bestLoc.drd.lastVisitDate).getTime() : 0;
  for (const loc of visitedLocs) {
    const t = loc.drd?.lastVisitDate ? new Date(loc.drd.lastVisitDate).getTime() : 0;
    if (t > bestTime) {
      bestTime = t;
      bestLoc = loc;
    } else if (t === bestTime && (loc.drd?.daysSinceLastVisit ?? 99999) < (bestLoc.drd?.daysSinceLastVisit ?? 99999)) {
      bestLoc = loc;
    }
  }
  return renderLastVisitCell(bestLoc.drd);
}

function renderGroupLift(locations: DealerLocation[]) {
  const lifts = locations.map(l => l.drd?.postVisitLiftPct).filter((x): x is number => x != null);
  if (lifts.length === 0) return <span className={styles.emptyValue}>—</span>;
  const avg = Math.round(lifts.reduce((a, b) => a + b, 0) / lifts.length);
  return renderPostVisitLiftCell(avg);
}

function renderGroupYield(locations: DealerLocation[]) {
  let totalVol = 0;
  let totalVis = 0;
  for (const l of locations) {
    totalVol += l.stats?.bookedDollars || 0;
    totalVis += l.drd?.totalVisits || 0;
  }
  if (totalVis === 0) return <span className={styles.emptyValue}>—</span>;
  return renderYieldPerVisitCell(Math.round(totalVol / totalVis));
}

// ── Sort Helpers ──

/** Compute calendar days since a date string, relative to UTC date */
function daysSinceDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.max(0, Math.round((nowUtc - dUtc) / (1000 * 60 * 60 * 24)));
}

function getGroupSortValue(group: DealerGroup, key: string, statusFilter?: string | null): number | string {
  const s = group.summary;
  switch (key) {
    case 'name':
      return group.name || '';
    case 'daysSinceLastApplication':
      return s?.daysSinceApp?.best ?? 99999;
    case 'daysSinceLastApproval':
      return s?.daysSinceApproval?.best ?? 99999;
    case 'daysSinceLastBooking':
      return s?.daysSinceBooking?.best ?? 99999;
    case 'lastVisit': {
      const dateStr = group.drd?.latestVisitDate ?? s?.drd?.latestVisitDate;
      if (dateStr) {
        const t = new Date(dateStr).getTime();
        if (!isNaN(t)) {
          return (Date.now() - t) / 86400000;
        }
      }
      return group.drd?.minDaysSinceLastVisit ?? s?.drd?.minDaysSinceLastVisit ?? 99999;
    }
    case 'postVisitLift':
      return group.drd?.avgLift ?? s?.drd?.avgLift ?? -99999;
    case 'yieldPerVisit':
      return group.drd?.yieldPerVisit ?? s?.drd?.yieldPerVisit ?? -99999;
    case 'activityStatus': {
      if (!s || s.locationCount === 0) return -1;
      return s.activeCount / s.locationCount;
    }
    case 'locationCount': {
      if (!s) return 0;
      if (!statusFilter) return s.locationCount;
      switch (statusFilter) {
        case 'active': return s.activeCount;
        case '30d_inactive': return s.inactive30Count;
        case '60d_inactive': return s.inactive60Count;
        case '90d_inactive': return s.inactive90Count ?? 0;
        case 'long_inactive': return s.longInactiveCount;
        case 'never_active': return s.neverActiveCount ?? 0;
        case 'reactivated': return s.reactivatedCount;
        default: return s.locationCount;
      }
    }
    case 'commDays':
      return daysSinceDate(s?.latestComm) ?? 99999;  // best = most recent
    case 'visitToApp':
      return s?.visitToApp?.best ?? 99999;
    case 'apps':
      return group.stats?.apps ?? -1;
    case 'approvals':
      return group.stats?.approvals ?? -1;
    case 'inHouse':
      return group.stats?.inHouse ?? -1;
    case 'leadBooked':
      return group.stats?.leadBooked ?? -1;
    case 'leadBookedDollars':
      return group.stats?.leadBookedDollars ?? -1;
    case 'booked':
      return group.stats?.booked ?? -1;
    case 'bookedDollars':
      return group.stats?.bookedDollars ?? -1;
    case 'lookToBook':
      return group.stats?.lookToBook ?? -1;
    case 'approvalToBook':
      return group.stats?.approvalToBook ?? -1;
    case 'avgFico':
      return group.stats?.avgFico ?? -1;
    default:
      return 0;
  }
}

function getLocationSortValue(loc: DealerLocation, key: string): number | string {
  const snap = loc.latestSnapshot;
  switch (key) {
    case 'name':
      return loc.dealerName || '';
    case 'daysSinceLastApplication':
      return snap?.daysSinceLastApplication ?? 99999;
    case 'daysSinceLastApproval':
      return snap?.daysSinceLastApproval ?? 99999;
    case 'daysSinceLastBooking':
      return snap?.daysSinceLastBooking ?? 99999;
    case 'lastVisit': {
      if (loc.drd?.lastVisitDate) {
        const t = new Date(loc.drd.lastVisitDate).getTime();
        if (!isNaN(t)) {
          return (Date.now() - t) / 86400000;
        }
      }
      if (loc.drd?.daysSinceLastVisit != null) {
        return loc.drd.daysSinceLastVisit;
      }
      return 99999;
    }
    case 'postVisitLift':
      return loc.drd?.postVisitLiftPct ?? -99999;
    case 'yieldPerVisit':
      return loc.drd?.yieldPerVisit ?? -99999;
    case 'activityStatus':
      return snap?.activityStatus || 'zzz';
    case 'commDays':
      return daysSinceDate(snap?.latestCommunicationDatetime as string | null) ?? 99999;
    case 'visitToApp':
      return snap?.daysFromVisitToNextApp ?? 99999;
    case 'apps':
      return loc.stats?.apps ?? -1;
    case 'approvals':
      return loc.stats?.approvals ?? -1;
    case 'inHouse':
      return loc.stats?.inHouse ?? -1;
    case 'leadBooked':
      return loc.stats?.leadBooked ?? -1;
    case 'leadBookedDollars':
      return loc.stats?.leadBookedDollars ?? -1;
    case 'booked':
      return loc.stats?.booked ?? -1;
    case 'bookedDollars':
      return loc.stats?.bookedDollars ?? -1;
    case 'lookToBook':
      return loc.stats?.lookToBook ?? -1;
    case 'approvalToBook':
      return loc.stats?.approvalToBook ?? -1;
    case 'avgFico':
      return loc.stats?.avgFico ?? -1;
    default:
      return 0;
  }
}

/** Multi-column sort comparator for groups */
function compareGroups(a: DealerGroup, b: DealerGroup, sortStack: SortColumn[], statusFilter?: string | null): number {
  for (const { key, dir } of sortStack) {
    let cmp = 0;
    const aVal = getGroupSortValue(a, key, statusFilter);
    const bVal = getGroupSortValue(b, key, statusFilter);
    if (typeof aVal === 'string' || typeof bVal === 'string') {
      cmp = String(aVal || '').localeCompare(String(bVal || ''));
    } else {
      const numA = Number.isFinite(aVal) ? (aVal as number) : 0;
      const numB = Number.isFinite(bVal) ? (bVal as number) : 0;
      cmp = numA - numB;
    }
    if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
  }
  return (a.name || '').localeCompare(b.name || '');
}

/** Multi-column sort comparator for locations */
function compareLocations(a: DealerLocation, b: DealerLocation, sortStack: SortColumn[]): number {
  for (const { key, dir } of sortStack) {
    let cmp = 0;
    const aVal = getLocationSortValue(a, key);
    const bVal = getLocationSortValue(b, key);
    if (typeof aVal === 'string' || typeof bVal === 'string') {
      cmp = String(aVal || '').localeCompare(String(bVal || ''));
    } else {
      const numA = Number.isFinite(aVal) ? (aVal as number) : 0;
      const numB = Number.isFinite(bVal) ? (bVal as number) : 0;
      cmp = numA - numB;
    }
    if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
  }
  return (a.dealerName || '').localeCompare(b.dealerName || '');
}

function multiSortLocations(locations: DealerLocation[], sortStack: SortColumn[]): DealerLocation[] {
  if (sortStack.length === 0) return locations;
  const sorted = [...locations];
  sorted.sort((a, b) => compareLocations(a, b, sortStack));
  return sorted;
}

// ── Component ──

export function DealerTable({
  mode,
  groups,
  groupLocations,
  smallDealers,
  isLoading,
  isLoadingMore,
  hasMore,
  statusFilter,
  isPrefetching,
  onExpandGroup,
  onLoadMore,
  dealerSort: dealerSortProp,
  onDealerSortChange,
  onDealerSearch,
  onSelectDealer,
  onSelectGroup,
  datePreset = 'this_month',
  customStartDate = '',
  customEndDate = '',
  maxReportDate,
  onDatePresetChange,
  onCustomDateChange,
  onTrendChange,
  comparisonLabel,
  activityMode = 'application',
  stateRepMap = {},
  availableTags = [],
  onTagsUpdated,
  totalCount = 0,
  currentFilters = {},
}: DealerTableProps) {
  const [searchInput, setSearchInput] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('mom');
  const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(new Set());
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(new Set());
  const [badgerModalDealer, setBadgerModalDealer] = useState<{ dealerId: string; dealerName: string } | null>(null);
  const [quickActionDealer, setQuickActionDealer] = useState<QuickActionDealer | null>(null);
  const [undoToast, setUndoToast] = useState<{ message: string; logId?: string; dealerId?: string; batchId?: string } | null>(null);
  const [isUndoing, setIsUndoing] = useState<boolean>(false);
  const [dealerOverrides, setDealerOverrides] = useState<Record<string, Partial<DealerLocation>>>({});
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedDealerIds, setSelectedDealerIds] = useState<Set<string>>(new Set());
  const [selectAllAcrossPages, setSelectAllAcrossPages] = useState<boolean>(false);
  const lastSelectedIdxRef = useRef<number | null>(null);

  const toggleParentExpanded = useCallback((dealerKey: string) => {
    setExpandedParentIds((prev) => {
      const next = new Set(prev);
      if (next.has(dealerKey)) {
        next.delete(dealerKey);
      } else {
        next.add(dealerKey);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!undoToast) return;
    const timer = setTimeout(() => setUndoToast(null), 8000);
    return () => clearTimeout(timer);
  }, [undoToast]);

  const handleQuickActionSave = useCallback((updatedDealer: any, logId?: string) => {
    const key = updatedDealer.clientDealerId || updatedDealer.dealerId || updatedDealer._id;
    setDealerOverrides((prev) => ({
      ...prev,
      [key]: {
        systemStatus: updatedDealer.systemStatus,
        systemStatusReason: updatedDealer.systemStatusReason,
        businessType: updatedDealer.businessType,
        tags: updatedDealer.tags,
        industry: updatedDealer.industry,
        isManuallyClassified: updatedDealer.isManuallyClassified,
        isFundingParent: updatedDealer.isFundingParent,
        fundingParent: updatedDealer.fundingParent,
        fundingChildren: updatedDealer.fundingChildren,
        fundingChildrenDetails: updatedDealer.fundingChildrenDetails
      }
    }));
    if (logId) {
      setUndoToast({
        message: `Updated ${updatedDealer.dealerName}`,
        logId,
        dealerId: key
      });
    }
    onTagsUpdated?.();
  }, [onTagsUpdated]);

  const handleBatchSuccess = useCallback((updatedDealers: any[], batchId: string, actionLabel: string) => {
    setDealerOverrides((prev) => {
      const next = { ...prev };
      for (const d of updatedDealers) {
        const key = d.clientDealerId || d.dealerId || d._id;
        next[key] = {
          systemStatus: d.systemStatus,
          systemStatusReason: d.systemStatusReason,
          businessType: d.businessType,
          tags: d.tags,
          industry: d.industry,
          isManuallyClassified: d.isManuallyClassified
        };
      }
      return next;
    });

    setUndoToast({
      message: `${actionLabel} on ${updatedDealers.length} dealers`,
      batchId
    });

    setSelectedDealerIds(new Set());
    setSelectAllAcrossPages(false);
    setIsSelectMode(false);
    onTagsUpdated?.();
  }, [onTagsUpdated]);

  const handleUndo = useCallback(async (toast: { logId?: string; dealerId?: string; batchId?: string }) => {
    setIsUndoing(true);
    try {
      if (toast.batchId) {
        const res = await undoBatchDealerAction(toast.batchId);
        if (res.revertedDealers && res.revertedDealers.length > 0) {
          setDealerOverrides((prev) => {
            const next = { ...prev };
            for (const d of res.revertedDealers) {
              const key = d.clientDealerId || d.dealerId || d._id;
              next[key] = {
                systemStatus: d.systemStatus,
                systemStatusReason: d.systemStatusReason,
                businessType: d.businessType,
                tags: d.tags,
                industry: d.industry,
                isManuallyClassified: d.isManuallyClassified
              };
            }
            return next;
          });
        }
        onTagsUpdated?.();
      } else if (toast.logId && toast.dealerId) {
        const res = await undoDealerQuickAction(toast.logId);
        if (res.revertedDealer) {
          setDealerOverrides((prev) => ({
            ...prev,
            [toast.dealerId!]: {
              systemStatus: res.revertedDealer.systemStatus,
              systemStatusReason: res.revertedDealer.systemStatusReason,
              businessType: res.revertedDealer.businessType,
              tags: res.revertedDealer.tags,
              industry: res.revertedDealer.industry,
              isManuallyClassified: res.revertedDealer.isManuallyClassified
            }
          }));
        }
        onTagsUpdated?.();
      }
      setUndoToast(null);
    } catch (err: any) {
      console.error('Failed to undo action:', err);
    } finally {
      setIsUndoing(false);
    }
  }, [onTagsUpdated]);

  // Physical button / Enter key search execution
  const executeSearch = useCallback((val?: string) => {
    const q = val !== undefined ? val : searchInput;
    const trimmed = q.trim();
    setCommittedQuery(trimmed);
    onDealerSearch?.(trimmed);
  }, [searchInput, onDealerSearch]);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setCommittedQuery('');
    onDealerSearch?.('');
  }, [onDealerSearch]);

  // Multi-column sort stacks (groups tab)
  const [groupSortStack, setGroupSortStack] = useState<SortColumn[]>([{ key: 'locationCount', dir: 'desc' }]);
  const [childSortStack, setChildSortStack] = useState<SortColumn[]>([{ key: 'name', dir: 'asc' }]);
  const [sortTarget, setSortTarget] = useState<'groups' | 'locations'>('groups');
  // Internal sort fallback when dealerSort prop is not passed
  const [internalDealerSort, setInternalDealerSort] = useState<SortColumn[]>([{ key: 'apps', dir: 'desc' }]);
  const activeDealerSort = dealerSortProp || internalDealerSort;

  // Reset search and expanded groups when tab mode changes
  useEffect(() => {
    setSearchInput('');
    setCommittedQuery('');
    setInternalDealerSort([{ key: 'apps', dir: 'desc' }]);
    setExpandedSlugs(new Set());
    setSelectedDealerIds(new Set());
    setSelectAllAcrossPages(false);
    setIsSelectMode(false);
    lastSelectedIdxRef.current = null;
  }, [mode]);

  // Toggle expand
  const toggleGroup = useCallback(
    (slug: string) => {
      setExpandedSlugs((prev) => {
        const next = new Set(prev);
        if (next.has(slug)) {
          next.delete(slug);
        } else {
          next.add(slug);
          if (!groupLocations[slug]) {
            onExpandGroup(slug);
          }
        }
        return next;
      });
    },
    [groupLocations, onExpandGroup]
  );

  const STAT_KEYS = new Set([
    'apps', 'approvals', 'inHouse', 'leadBooked', 'leadBookedDollars', 
    'booked', 'bookedDollars', 'lookToBook', 'approvalToBook', 'avgFico',
    'postVisitLift', 'yieldPerVisit'
  ]);

  const updateStack = (stack: SortColumn[], key: string, isMulti: boolean): SortColumn[] => {
    const defaultDir: SortDir = STAT_KEYS.has(key) ? 'desc' : 'asc';
    const idx = stack.findIndex((s) => s.key === key);

    if (!isMulti) {
      if (stack.length === 1 && idx === 0) {
        return [{ key, dir: stack[0].dir === 'asc' ? 'desc' : 'asc' }];
      }
      return [{ key, dir: defaultDir }];
    }

    if (idx !== -1) {
      const updated = [...stack];
      updated[idx] = { ...updated[idx], dir: updated[idx].dir === 'asc' ? 'desc' : 'asc' };
      return updated;
    }
    return [...stack, { key, dir: defaultDir }];
  };

  const handleColumnClick = useCallback(
    (key: string, isMulti: boolean) => {
      if (mode !== 'groups') {
        const next = updateStack(activeDealerSort, key, isMulti);
        setInternalDealerSort(next);
        onDealerSortChange?.(next);
      } else {
        if (sortTarget === 'locations') {
          setChildSortStack((prev) => updateStack(prev, key, isMulti));
        } else {
          setGroupSortStack((prev) => updateStack(prev, key, isMulti));
        }
      }
    },
    [mode, onDealerSortChange, sortTarget, activeDealerSort]
  );

  const removeFromSort = useCallback(
    (key: string) => {
      if (mode !== 'groups') {
        const next = activeDealerSort.filter(s => s.key !== key);
        if (next.length === 0) return;
        setInternalDealerSort(next);
        onDealerSortChange?.(next);
      } else if (sortTarget === 'locations') {
        setChildSortStack((prev) => {
          const next = prev.filter(s => s.key !== key);
          return next.length === 0 ? prev : next;
        });
      } else {
        setGroupSortStack((prev) => {
          const next = prev.filter(s => s.key !== key);
          return next.length === 0 ? prev : next;
        });
      }
    },
    [mode, onDealerSortChange, sortTarget, activeDealerSort]
  );

  // Filter groups
  const filteredGroups = useMemo(() => {
    const q = (committedQuery || searchInput).trim();
    if (!q) return groups;
    const lower = q.toLowerCase();
    return groups.filter((g) => g.name.toLowerCase().includes(lower));
  }, [groups, committedQuery, searchInput]);

  // Sort groups (multi-column)
  const sortedGroups = useMemo(() => {
    const sorted = [...filteredGroups];
    sorted.sort((a, b) => compareGroups(a, b, groupSortStack, statusFilter));
    return sorted;
  }, [filteredGroups, groupSortStack, statusFilter]);

  // Instant client-side filtering and sorting on loaded items while server search/sort resolves
  const sortedDealers = useMemo(() => {
    let result = smallDealers.map((d) => {
      const key = d.clientDealerId || d.dealerId || d._id;
      return dealerOverrides[key] ? { ...d, ...dealerOverrides[key] } : d;
    });
    const q = (committedQuery || searchInput).trim();
    if (q) {
      const lower = q.toLowerCase();
      result = result.filter((d) => {
        const name = (d.dealerName || '').toLowerCase();
        const code = (d.dealerId || d.clientDealerId || '').toLowerCase();
        const state = (d.statePrefix || '').toLowerCase();
        const rep = (d.dealerRepresentative || '').toLowerCase();
        if (name.includes(lower) || code.includes(lower) || state.includes(lower) || rep.includes(lower)) {
          return true;
        }
        if (d.matchedViaChild) {
          const mName = (d.matchedViaChild.dealerName || '').toLowerCase();
          const mCode = (d.matchedViaChild.dealerId || '').toLowerCase();
          if (mName.includes(lower) || mCode.includes(lower)) return true;
        }
        if (Array.isArray(d.fundingChildrenDetails) && d.fundingChildrenDetails.length > 0) {
          return d.fundingChildrenDetails.some((c: any) => {
            const cName = (c.dealerName || '').toLowerCase();
            const cCode = (c.clientDealerId || c.dealerId || '').toLowerCase();
            const cState = (c.statePrefix || c.dealerState || '').toLowerCase();
            const cRep = (c.dealerRepresentative || '').toLowerCase();
            return cName.includes(lower) || cCode.includes(lower) || cState.includes(lower) || cRep.includes(lower);
          });
        }
        return false;
      });
    }
    if (activeDealerSort && activeDealerSort.length > 0) {
      const sorted = [...result];
      sorted.sort((a, b) => compareLocations(a, b, activeDealerSort));
      return sorted;
    }
    return result;
  }, [smallDealers, committedQuery, searchInput, activeDealerSort, dealerOverrides]);

  // Keys of all selectable dealers in the current table view
  const allSelectableKeys = useMemo(() => {
    if (mode === 'groups') {
      const keys: string[] = [];
      for (const g of sortedGroups) {
        const locs = groupLocations[g.slug] || [];
        for (const l of locs) {
          keys.push(l.clientDealerId || l.dealerId || l._id);
        }
      }
      return keys;
    }
    return sortedDealers.map((d) => d.clientDealerId || d.dealerId || d._id);
  }, [mode, sortedGroups, groupLocations, sortedDealers]);

  const isAllSelected = allSelectableKeys.length > 0 && allSelectableKeys.every((k) => selectedDealerIds.has(k));
  const isSomeSelected = allSelectableKeys.some((k) => selectedDealerIds.has(k));

  const handleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedDealerIds((prev) => {
        const next = new Set(prev);
        for (const k of allSelectableKeys) next.delete(k);
        return next;
      });
    } else {
      setSelectedDealerIds((prev) => {
        const next = new Set(prev);
        for (const k of allSelectableKeys) next.add(k);
        return next;
      });
    }
  }, [isAllSelected, allSelectableKeys]);

  const handleToggleSelectDealer = useCallback((id: string, idx?: number, shiftKey?: boolean) => {
    setSelectedDealerIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIdxRef.current !== null && idx !== undefined && lastSelectedIdxRef.current !== idx) {
        const start = Math.min(lastSelectedIdxRef.current, idx);
        const end = Math.max(lastSelectedIdxRef.current, idx);
        for (let i = start; i <= end; i++) {
          const d = sortedDealers[i];
          if (d) {
            const key = d.clientDealerId || d.dealerId || d._id;
            next.add(key);
          }
        }
      } else {
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        if (idx !== undefined) {
          lastSelectedIdxRef.current = idx;
        }
      }
      return next;
    });
  }, [sortedDealers]);

  const handleToggleSelectGroup = useCallback((ids: string[]) => {
    setSelectedDealerIds((prev) => {
      const next = new Set(prev);
      const allIn = ids.length > 0 && ids.every((id) => next.has(id));
      if (allIn) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  }, []);

  // Which sort to display in the headers
  const displayStack: SortColumn[] = mode !== 'groups'
    ? activeDealerSort
    : sortTarget === 'locations' ? childSortStack : groupSortStack;

  // Filter columns based on mode (hide groupOnly columns in dealer mode, hide dealerOnly in groups mode)
  const visibleColumns = useMemo(() => {
    return mode === 'groups'
      ? TABLE_COLUMNS.filter((c) => !c.dealerOnly && c.hasData !== false)
      : TABLE_COLUMNS.filter((c) => !c.groupOnly && c.hasData !== false);
  }, [mode]);

  // ── Render Helpers ──

  const renderHeatmapCell = (value: number | null | undefined) => {
    if (value == null) return <span className={styles.emptyValue}>—</span>;
    const colors = getDaysSinceHeatmap(value);
    if (!colors) return <>{value}</>;
    return (
      <span
        className={styles.heatmapCell}
        style={{ background: colors.background, color: colors.text }}
      >
        {value}
      </span>
    );
  };

  const renderCommCell = (dateStr: string | null | undefined) => {
    const days = daysSinceDate(dateStr as string | null);
    if (days == null) return <span className={styles.emptyValue}>—</span>;
    const colors = getCommDaysHeatmap(days);
    if (!colors) return <>{days}<span className={styles.unitSuffix}>d</span></>;
    return (
      <span className={styles.heatmapCell} style={{ background: colors.background, color: colors.text }}>
        {days}<span className={styles.unitSuffix}>d</span>
      </span>
    );
  };

  const renderVisitCell = (value: number | null | undefined) => {
    if (value == null) return <span className={styles.emptyValue}>—</span>;
    const colors = getDaysSinceHeatmap(value);
    if (!colors) return <>{value}<span className={styles.unitSuffix}>d</span></>;
    return (
      <span className={styles.heatmapCell} style={{ background: colors.background, color: colors.text }}>
        {value}<span className={styles.unitSuffix}>d</span>
      </span>
    );
  };

  // Derive status from the appropriate daysSince field based on activityMode
  const deriveStatus = (snap: DealerLocation['latestSnapshot']): ActivityStatus => {
    if (!snap) return 'never_active';
    if (activityMode === 'application') return snap.activityStatus || 'never_active';
    const days = activityMode === 'approval' ? snap.daysSinceLastApproval : snap.daysSinceLastBooking;
    if (days == null) return 'never_active';
    if (days <= 30) return 'active';
    if (days <= 60) return '30d_inactive';
    if (days <= 90) return '60d_inactive';
    if (days <= 120) return '90d_inactive';
    return 'long_inactive';
  };

  const renderChildCells = (snap: DealerLocation['latestSnapshot'], stats?: DealerStats, drd?: DealerLocation['drd']) => {
    const trends = stats?.trends;
    const isAllTime = datePreset === 'all_time';
    return (
      <>
        <td>{renderHeatmapCell(snap?.daysSinceLastApplication)}</td>
        <td>{renderHeatmapCell(snap?.daysSinceLastApproval)}</td>
        <td>{renderHeatmapCell(snap?.daysSinceLastBooking)}</td>
        {visibleColumns.some(c => c.key === 'lastVisit') && (
          <td style={{ textAlign: 'right' }}>{renderLastVisitCell(drd)}</td>
        )}
        {visibleColumns.some(c => c.key === 'postVisitLift') && (
          <td style={{ textAlign: 'right' }}>{renderPostVisitLiftCell(drd?.postVisitLiftPct)}</td>
        )}
        {visibleColumns.some(c => c.key === 'yieldPerVisit') && (
          <td style={{ textAlign: 'right' }}>{renderYieldPerVisitCell(drd?.yieldPerVisit)}</td>
        )}
        {visibleColumns.some(c => c.key === 'commDays') && (
          <td>{renderCommCell(snap?.latestCommunicationDatetime as string | null)}</td>
        )}
        {visibleColumns.some(c => c.key === 'visitToApp') && (
          <td>{renderVisitCell(snap?.daysFromVisitToNextApp)}</td>
        )}
        <td style={{ textAlign: 'right' }}>{renderStackedStatCell(stats?.apps, trends?.apps, 'count', isAllTime)}</td>
        <td style={{ textAlign: 'right' }}>{renderStackedStatCell(stats?.approvals, trends?.approvals, 'count', isAllTime)}</td>
        {visibleColumns.some(c => c.key === 'inHouse') && (
          <td style={{ textAlign: 'right' }}>{renderStackedStatCell(stats?.inHouse, trends?.inHouse, 'count', isAllTime)}</td>
        )}
        {visibleColumns.some(c => c.key === 'leadBooked') && (
          <td style={{ textAlign: 'right' }}>{renderStackedStatCell(stats?.leadBooked, trends?.leadBooked, 'count', isAllTime)}</td>
        )}
        {visibleColumns.some(c => c.key === 'leadBookedDollars') && (
          <td style={{ textAlign: 'right' }}>{renderStackedStatCell(stats?.leadBookedDollars, trends?.leadBookedDollars, 'dollar', isAllTime)}</td>
        )}
        <td style={{ textAlign: 'right' }}>{renderStackedStatCell(stats?.booked, trends?.booked, 'count', isAllTime)}</td>
        <td style={{ textAlign: 'right' }}>{renderStackedStatCell(stats?.bookedDollars, trends?.bookedDollars, 'dollar', isAllTime)}</td>
        <td style={{ textAlign: 'right' }}>{renderStackedStatCell(stats?.lookToBook, trends?.lookToBook, 'percent', isAllTime)}</td>
        <td style={{ textAlign: 'right' }}>{renderStackedStatCell(stats?.approvalToBook, trends?.approvalToBook, 'percent', isAllTime)}</td>
        <td style={{ textAlign: 'right' }}>
          {stats?.avgFico ? <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{stats.avgFico}</span> : '—'}
        </td>
      </>
    );
  };

  // ── Infinite scroll trigger ──
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLTableRowElement | null>(null);
  const observerTarget = useRef<HTMLDivElement | null>(null);

  const triggerLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      if (mode === 'groups') {
        // Groups infinite scroll
        if (hasMore && onLoadMore) {
          onLoadMore();
        }
      } else {
        // Flat dealers infinite scroll
        if (hasMore && onLoadMore) {
          onLoadMore();
        }
      }
    }
  }, [isLoadingMore, hasMore, mode, onLoadMore]);

  // Observer on bottom sentinel
  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          triggerLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '400px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [mode, hasMore, triggerLoadMore, sortedDealers.length]);

  // Scroll listeners as backup trigger
  useEffect(() => {
    const el = scrollRef.current;
    const handleContainerScroll = () => {
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - (scrollTop + clientHeight) < 600) {
        triggerLoadMore();
      }
    };

    const handleWindowScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset;
      const docHeight = document.documentElement.scrollHeight;
      const winHeight = window.innerHeight;
      if (docHeight - (scrollY + winHeight) < 600) {
        triggerLoadMore();
      }
    };

    el?.addEventListener('scroll', handleContainerScroll, { passive: true });
    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    return () => {
      el?.removeEventListener('scroll', handleContainerScroll);
      window.removeEventListener('scroll', handleWindowScroll);
    };
  }, [mode, hasMore, triggerLoadMore]);

  // ── Loading ──
  if (isLoading) {
    return (
      <div className={styles.tableWrapper} id="dealer-table">
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>⌕</span>
            <input className={styles.searchInput} placeholder="Search dealers..." disabled />
          </div>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.headerRow}>
                <th className={styles.selectHeaderCell} />
                {visibleColumns.map((col, idx) => (
                  <th key={col.key} className={`${styles.headerCell} ${idx === 0 ? styles.firstDataTh : ''}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(12)].map((_, i) => (
                <tr key={i} className={styles.skeletonRow}>
                  <td className={styles.selectCell}>
                    <div className={styles.skeletonCell} style={{ width: '16px', height: '16px', margin: '0 auto', borderRadius: '3px' }} />
                  </td>
                  <td className={styles.firstDataTd}><div className={`${styles.skeletonCell} ${styles.skeletonName}`} /></td>
                  {visibleColumns.slice(1).map((col) => (
                    <td key={col.key}><div className={`${styles.skeletonCell} ${styles.skeletonNum}`} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const isEmpty = mode === 'groups' ? sortedGroups.length === 0 : sortedDealers.length === 0;

  return (
    <div className={styles.tableWrapper} id="dealer-table">
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            className={styles.searchInput}
            placeholder={mode === 'groups' ? 'Search dealer groups...' : 'Search dealers...'}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                executeSearch();
              }
            }}
            id="dealer-search"
          />
          {searchInput && (
            <button className={styles.searchClear} onClick={handleClearSearch} aria-label="Clear search" title="Clear search">✕</button>
          )}
          <button
            type="button"
            className={styles.searchSubmitBtn}
            onClick={() => executeSearch()}
            title="Click to search (or press Enter)"
          >
            Search
          </button>
          <button
            type="button"
            className={isSelectMode ? styles.selectModeBtnActive : styles.selectModeBtn}
            onClick={() => {
              if (isSelectMode) {
                setIsSelectMode(false);
                setSelectedDealerIds(new Set());
                setSelectAllAcrossPages(false);
              } else {
                setIsSelectMode(true);
              }
            }}
            title={isSelectMode ? "Exit select mode" : "Enter select mode to bulk-tag or update dealers"}
          >
            {isSelectMode ? (
              <>
                <X size={13} />
                <span>Exit Selection {selectedDealerIds.size > 0 ? `(${selectAllAcrossPages ? totalCount : selectedDealerIds.size})` : ''}</span>
              </>
            ) : (
              <>
                <CheckSquare size={13} />
                <span>Select Mode</span>
              </>
            )}
          </button>
        </div>
        <div className={styles.toolbarRight}>
          {/* Sort target toggle — groups tab only */}
          {mode === 'groups' && (
            <div className={styles.sortToggle}>
              <span className={styles.sortToggleLabel}>Sort:</span>
              <button
                className={`${styles.sortToggleBtn} ${sortTarget === 'groups' ? styles.sortToggleActive : ''}`}
                onClick={() => setSortTarget('groups')}
              >
                Groups
              </button>
              <button
                className={`${styles.sortToggleBtn} ${sortTarget === 'locations' ? styles.sortToggleActive : ''}`}
                onClick={() => setSortTarget('locations')}
              >
                Locations
              </button>
            </div>
          )}

          {displayStack.length > 1 && (
            <button
              className={styles.sortClearBtn}
              onClick={() => {
                if (mode !== 'groups') {
                  const next = [activeDealerSort[0]];
                  setInternalDealerSort(next);
                  onDealerSortChange?.(next);
                } else if (sortTarget === 'locations') {
                  setChildSortStack([childSortStack[0]]);
                } else {
                  setGroupSortStack([groupSortStack[0]]);
                }
              }}
              title="Reset to primary sort only"
            >
              ✕ {displayStack.length}
            </button>
          )}
          {/* Data Freshness Badge */}
          {maxReportDate && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.78rem',
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                padding: '4px 9px',
                borderRadius: '6px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
              title="Latest report data date available in database"
            >
              <Calendar size={13} />
              <span>Data through {new Date(maxReportDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span>
            </span>
          )}

          {/* Date Range Selector right next to Trend */}
          {onDatePresetChange && (
            <div className={styles.trendSelect}>
              <span className={styles.trendLabel}>Date Range</span>
              <select
                className={styles.trendDropdown}
                value={datePreset}
                onChange={(e) => onDatePresetChange(e.target.value as DatePreset)}
                id="dealer-table-date-range-select"
              >
                <option value="this_month">This Month (MTD)</option>
                <option value="last_month">Last Month</option>
                <option value="last_30">Last 30 Days</option>
                <option value="last_60">Last 60 Days</option>
                <option value="last_90">Last 90 Days</option>
                <option value="ytd">YTD</option>
                <option value="last_year">Last Year</option>
                <option value="all_time">All-Time</option>
                <option value="custom">Custom Range</option>
              </select>
              {datePreset === 'custom' && onCustomDateChange && (
                <CustomDatePicker
                  startDate={customStartDate}
                  endDate={customEndDate}
                  maxDate={maxReportDate}
                  onApply={(start, end) => onCustomDateChange(start, end)}
                />
              )}
            </div>
          )}

          <div className={styles.trendSelect}>
            <span className={styles.trendLabel}>Trend</span>
            <select
              className={styles.trendDropdown}
              value={datePreset === 'all_time' ? 'none' : trendPeriod}
              disabled={datePreset === 'all_time'}
              onChange={(e) => {
                const val = e.target.value as TrendPeriod;
                setTrendPeriod(val);
                onTrendChange?.(val);
              }}
              id="trend-select"
            >
              {datePreset === 'all_time' ? (
                <option value="none">N/A (All-Time)</option>
              ) : datePreset === 'ytd' ? (
                <option value="yoy">vs Last Year</option>
              ) : datePreset === 'last_year' ? (
                <option value="yoy">vs Prior Year</option>
              ) : datePreset === 'this_month' ? (
                <>
                  <option value="mom">vs Last Month</option>
                  <option value="yoy">vs Last Year</option>
                </>
              ) : datePreset === 'last_month' ? (
                <>
                  <option value="prior">vs Prior Month</option>
                  <option value="yoy">vs Last Year</option>
                </>
              ) : datePreset === 'custom' ? (
                <>
                  <option value="prior">vs Prior Period</option>
                  <option value="yoy">vs Same Period Last Year</option>
                </>
              ) : (
                <>
                  <option value="prior">vs Prior Period</option>
                  <option value="yoy">vs Last Year</option>
                </>
              )}
            </select>
          </div>

          {comparisonLabel && datePreset !== 'all_time' && (
            <span
              style={{
                fontSize: '11px',
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.1)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                padding: '4px 9px',
                borderRadius: '6px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Exact date ranges compared for stats and trends"
            >
              <Calendar size={12} />
              <span>{comparisonLabel}</span>
            </span>
          )}
        </div>
      </div>

      {/* Full-Filter Select All Banner */}
      {isSelectMode && isAllSelected && totalCount > allSelectableKeys.length && (
        <div className={styles.selectAllBanner}>
          <span>All <strong>{allSelectableKeys.length}</strong> dealers on this page are selected.</span>
          {!selectAllAcrossPages ? (
            <button
              type="button"
              className={styles.selectAllMatchingBtn}
              onClick={() => setSelectAllAcrossPages(true)}
            >
              Select all <strong>{totalCount}</strong> dealers matching current filters
            </button>
          ) : (
            <span className={styles.allMatchingSelectedText}>
              <CheckSquare size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              All <strong>{totalCount}</strong> dealers matching current filters are selected.
              <button
                type="button"
                className={styles.clearAllMatchingBtn}
                onClick={() => setSelectAllAcrossPages(false)}
              >
                Clear full selection
              </button>
            </span>
          )}
        </div>
      )}

      {/* Mobile Card View (<768px) */}
      <div className={styles.mobileCardList}>
        {isEmpty ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No results found</div>
          </div>
        ) : mode === 'groups' ? (
          sortedGroups.map((g) => (
            <div
              key={g.slug}
              className={styles.mobileCard}
              onClick={() => toggleGroup(g.slug)}
            >
              <div className={styles.mobileCardHeader}>
                <div>
                  <h4 className={styles.mobileCardTitle}>{g.name}</h4>
                  <div className={styles.mobileCardSub}>
                    <span>{g.summary?.locationCount || 0} Locations</span>
                    {g.states && g.states.length > 0 && <span> · {g.states.join(', ')}</span>}
                  </div>
                </div>
                <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                  {g.summary?.activeCount || 0}/{g.summary?.locationCount || 0} Active
                </span>
              </div>
              <div className={styles.mobileCardMetrics}>
                <div className={styles.mobileMetricBox}>
                  <span className={styles.mobileMetricVal}>{g.stats?.apps?.toLocaleString() || 0}</span>
                  <span className={styles.mobileMetricLbl}>Apps</span>
                </div>
                <div className={styles.mobileMetricBox}>
                  <span className={styles.mobileMetricVal}>{g.stats?.approvals?.toLocaleString() || 0}</span>
                  <span className={styles.mobileMetricLbl}>Appr</span>
                </div>
                <div className={styles.mobileMetricBox}>
                  <span className={styles.mobileMetricVal}>{g.stats?.booked?.toLocaleString() || 0}</span>
                  <span className={styles.mobileMetricLbl}>Booked</span>
                </div>
                <div className={styles.mobileMetricBox}>
                  <span className={styles.mobileMetricVal}>${(g.stats?.bookedDollars || 0).toLocaleString()}</span>
                  <span className={styles.mobileMetricLbl}>Vol</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          sortedDealers.map((loc) => {
            const snap = loc.latestSnapshot;
            const stats = loc.stats;
            const repName = loc.statePrefix ? stateRepMap[loc.statePrefix] : undefined;
            return (
              <div
                key={loc._id}
                className={styles.mobileCard}
                onClick={() => onSelectDealer?.(loc.dealerId)}
              >
                <div className={styles.mobileCardHeader}>
                  <div>
                    <h4 className={styles.mobileCardTitle}>{loc.dealerName}</h4>
                    <div className={styles.mobileCardSub}>
                      <span>ID: {loc.dealerId}</span>
                      {loc.statePrefix && <span> · {loc.statePrefix}</span>}
                      {repName && <span> · Rep: {repName}</span>}
                    </div>
                  </div>
                  <StatusBadge status={deriveStatus(snap)} />
                </div>
                <div className={styles.mobileCardMetrics}>
                  <div className={styles.mobileMetricBox}>
                    <span className={styles.mobileMetricVal}>{stats?.apps?.toLocaleString() || 0}</span>
                    <span className={styles.mobileMetricLbl}>Apps</span>
                  </div>
                  <div className={styles.mobileMetricBox}>
                    <span className={styles.mobileMetricVal}>{stats?.approvals?.toLocaleString() || 0}</span>
                    <span className={styles.mobileMetricLbl}>Appr</span>
                  </div>
                  <div className={styles.mobileMetricBox}>
                    <span className={styles.mobileMetricVal}>{stats?.booked?.toLocaleString() || 0}</span>
                    <span className={styles.mobileMetricLbl}>Booked</span>
                  </div>
                  <div className={styles.mobileMetricBox}>
                    <span className={styles.mobileMetricVal}>${(stats?.bookedDollars || 0).toLocaleString()}</span>
                    <span className={styles.mobileMetricLbl}>Vol</span>
                  </div>
                </div>
                <div className={styles.mobileCardFooter}>
                  <span>Tap for details & app history →</span>
                  {snap?.daysSinceLastApplication != null && (
                    <span>Last App: {snap.daysSinceLastApplication}d ago</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Table */}
      <div className={styles.tableScroll} ref={scrollRef}>
        {isEmpty ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon} style={{ display: 'flex', justifyContent: 'center' }}>
              <BarChart2 size={36} color="var(--text-muted, #64748b)" />
            </div>
            <div className={styles.emptyTitle}>
              {(committedQuery || searchInput) ? 'No results found' : 'No data available'}
            </div>
            <p>
              {(committedQuery || searchInput)
                ? `No ${mode === 'groups' ? 'groups' : 'dealers'} match "${committedQuery || searchInput}"`
                : 'Data will appear once reports are processed.'}
            </p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {isSelectMode && (
                  <th className={styles.selectHeaderCell}>
                    <IndeterminateCheckbox
                      checked={isAllSelected}
                      indeterminate={isSomeSelected && !isAllSelected}
                      onChange={handleSelectAll}
                      disabled={allSelectableKeys.length === 0}
                      title={isAllSelected ? "Deselect all on page" : "Select all on page"}
                      ariaLabel="Select all"
                    />
                  </th>
                )}
                {visibleColumns.map((col, colIdx) => {
                  const stackIdx = displayStack.findIndex((s) => s.key === col.key);
                  const isSorted = stackIdx !== -1;
                  const sortItem = isSorted ? displayStack[stackIdx] : null;
                  const showNum = displayStack.length > 1 && isSorted;

                  return (
                    <th
                      key={col.key}
                      style={{ textAlign: col.align, width: col.width, minWidth: col.minWidth }}
                      className={`${(isSelectMode && colIdx === 0) ? styles.firstDataTh : ''} ${isSorted ? styles.thSorted : ''}`}
                      onClick={(e) => col.sortable && handleColumnClick(col.key, e.shiftKey || e.ctrlKey || e.metaKey)}
                      onDoubleClick={() => col.sortable && handleColumnClick(col.key, true)}
                      title={col.description ? `${col.description}${col.sortable ? ' · Click to sort (Shift-click for multi-sort)' : ''}` : (col.sortable ? 'Click to sort · Shift-click for multi-sort' : undefined)}
                    >
                      {col.label}
                      {isSorted && (
                        <span className={styles.sortIndicator}>
                          {showNum && <span className={styles.sortNumber}>{stackIdx + 1}</span>}
                          <span className={styles.sortArrow}>
                            {sortItem!.dir === 'asc' ? '▲' : '▼'}
                          </span>
                          {showNum && (
                            <span
                              className={styles.sortRemove}
                              onClick={(e) => { e.stopPropagation(); removeFromSort(col.key); }}
                              title="Remove this sort"
                            >
                              ✕
                            </span>
                          )}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {mode === 'groups'
                ? sortedGroups.map((group) => {
                    const isExpanded = expandedSlugs.has(group.slug);
                    const rawLocs = groupLocations[group.slug] || [];
                    const sortedLocs = isExpanded
                      ? multiSortLocations(rawLocs, childSortStack)
                      : rawLocs;
                    return (
                      <GroupRows
                        key={group._id}
                        group={group}
                        isExpanded={isExpanded}
                        locations={sortedLocs}
                        statusFilter={statusFilter}
                        isPrefetching={isPrefetching}
                        onToggle={() => toggleGroup(group.slug)}
                        renderChildCells={renderChildCells}
                        deriveStatusFn={deriveStatus}
                        visibleColumns={visibleColumns}
                        onSelectGroup={onSelectGroup}
                        onSelectDealer={onSelectDealer}
                        stateRepMap={stateRepMap}
                        onOpenBadger={setBadgerModalDealer}
                        onOpenQuickAction={setQuickActionDealer}
                        dealerOverrides={dealerOverrides}
                        isSelectMode={isSelectMode}
                        selectedDealerIds={selectedDealerIds}
                        onToggleSelectDealer={handleToggleSelectDealer}
                        onToggleSelectGroup={handleToggleSelectGroup}
                      />
                    );
                  })
                : sortedDealers.map((dealer, idx) => {
                    const repName = getRepDisplayForDealer(dealer.dealerRepresentative, dealer.repName, dealer.statePrefix, stateRepMap);
                    const hasRep = repName && repName !== '—';
                    const dealerKey = dealer.clientDealerId || dealer.dealerId || dealer._id;
                    const isSelected = selectedDealerIds.has(dealerKey);

                    const isParent = Boolean(dealerOverrides[dealerKey]?.isFundingParent ?? dealer.isFundingParent);
                    const childStores = dealerOverrides[dealerKey]?.fundingChildrenDetails || dealer.fundingChildrenDetails || [];
                    const childCount = childStores.length || (dealer.fundingChildren?.length || 0);
                    const qLower = (committedQuery || searchInput).trim().toLowerCase();
                    const matchesViaChild = Boolean(
                      dealer.matchedViaChild ||
                      (qLower && Array.isArray(childStores) && childStores.some((c: any) => {
                        const cName = (c.dealerName || '').toLowerCase();
                        const cCode = (c.clientDealerId || c.dealerId || '').toLowerCase();
                        return cName.includes(qLower) || cCode.includes(qLower);
                      }))
                    );
                    const isParentExpanded = expandedParentIds.has(dealerKey) || matchesViaChild;

                    return (
                      <React.Fragment key={dealer._id}>
                        <tr className={`${styles.dealerRow} ${(isSelectMode && isSelected) ? styles.rowSelected : ''}`}>
                          {isSelectMode && (
                            <td className={styles.selectCell} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const isShift = (e.nativeEvent as MouseEvent).shiftKey;
                                  handleToggleSelectDealer(dealerKey, idx, isShift);
                                }}
                                onClick={(e) => {
                                  if (e.shiftKey) {
                                    handleToggleSelectDealer(dealerKey, idx, true);
                                  }
                                }}
                                style={{
                                  cursor: 'pointer',
                                  accentColor: '#38bdf8',
                                  width: '15px',
                                  height: '15px',
                                  borderRadius: '3px'
                                }}
                                aria-label={`Select ${dealer.dealerName}`}
                              />
                            </td>
                          )}
                          <td
                            className={isSelectMode ? styles.firstDataTd : undefined}
                            style={{ cursor: 'pointer' }}
                            onClick={() => onSelectDealer?.(dealer._id)}
                            title="Click to view application history"
                          >
                            <div className={styles.dealerCellWrapper}>
                              {/* Row 1: Primary Identity & Core Status */}
                              <div className={styles.dealerTopLine}>
                                <span className={styles.dealerNameLink}>{dealer.dealerName}</span>
                                <StatusBadge status={deriveStatus(dealer.latestSnapshot)} />
                                {renderDrdBadge(dealer.drd)}
                                {renderStatusRedFlag(dealer)}

                                {isParent && (
                                  <button
                                    type="button"
                                    className={`${styles.centralFunderBadge} ${isParentExpanded ? styles.centralFunderBadgeExpanded : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleParentExpanded(dealerKey);
                                    }}
                                    title="Central Funder corporate account - click to toggle satellite stores"
                                  >
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      <Building2 size={11} />
                                      <span>Central Funder ({childCount} store{childCount === 1 ? '' : 's'})</span>
                                    </span>
                                    <span style={{ fontSize: '9px', marginLeft: '2px' }}>{isParentExpanded ? '▲' : '▼'}</span>
                                  </button>
                                )}
                              </div>

                              {/* Row 2: Secondary Metadata, Classification & Micro Actions */}
                              <div className={styles.dealerMetaLine}>
                                <span className={styles.dealerCodePill}>{dealerKey}</span>

                                {dealer.dealerCity && (
                                  <>
                                    <span className={styles.dealerMetaDivider}>•</span>
                                    <span>{dealer.dealerCity}, {dealer.statePrefix || dealer.dealerState}</span>
                                  </>
                                )}

                                {hasRep && (
                                  <>
                                    <span className={styles.dealerMetaDivider}>•</span>
                                    <span>Rep: <strong style={{ color: 'var(--text-primary)' }}>{repName}</strong></span>
                                  </>
                                )}

                                {renderMetaBadges(dealer)}

                                <div className={styles.actionBtnGroup}>
                                  <button
                                    type="button"
                                    className={styles.microActionBtn}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setBadgerModalDealer({
                                        dealerId: dealer.clientDealerId || dealer.dealerId || dealer._id,
                                        dealerName: dealer.dealerName
                                      });
                                    }}
                                    title="View Badger Maps activity, notepad, and log check-ins"
                                  >
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      <MapPin size={11} />
                                      <span>Badger</span>
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    className={`${styles.microActionBtn} ${dealer.systemStatus && dealer.systemStatus !== 'active' ? styles.microActionBtnWarn : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setQuickActionDealer({
                                        _id: dealer._id,
                                        dealerId: dealer.dealerId,
                                        clientDealerId: dealer.clientDealerId || undefined,
                                        dealerName: dealer.dealerName,
                                        systemStatus: dealerOverrides[dealerKey]?.systemStatus ?? dealer.systemStatus,
                                        systemStatusReason: dealerOverrides[dealerKey]?.systemStatusReason ?? dealer.systemStatusReason,
                                        businessType: dealerOverrides[dealerKey]?.businessType ?? dealer.businessType,
                                        tags: dealerOverrides[dealerKey]?.tags ?? dealer.tags,
                                        isFundingParent: isParent,
                                        fundingParent: dealerOverrides[dealerKey]?.fundingParent ?? dealer.fundingParent,
                                        fundingChildren: dealerOverrides[dealerKey]?.fundingChildren ?? dealer.fundingChildren,
                                        fundingChildrenDetails: childStores
                                      });
                                    }}
                                    title="Quick Action: Red flag dealership, change business type, add tags, or manage funding hierarchy"
                                  >
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      <Flag size={11} />
                                      <span>{dealer.systemStatus && dealer.systemStatus !== 'active' ? 'Flagged' : 'Actions'}</span>
                                    </span>
                                  </button>
                                </div>
                              </div>

                              {/* Row 3 (Optional): Satellite Search Matched Indicator */}
                              {dealer.matchedViaChild && (
                                <div
                                  className={styles.matchedViaChildNotice}
                                  title={`Search matched satellite rooftop: ${dealer.matchedViaChild.dealerName}`}
                                >
                                  <span>↳ Matched via satellite: <strong>{dealer.matchedViaChild.dealerName}</strong> ({dealer.matchedViaChild.dealerId})</span>
                                </div>
                              )}
                            </div>
                          </td>
                          {renderChildCells(dealer.latestSnapshot, dealer.stats, dealer.drd)}
                        </tr>

                        {/* Nested Satellite Store Rows when Central Funder is expanded */}
                        {isParent && isParentExpanded && childStores.map((child: any) => {
                          const childKey = child.clientDealerId || child.dealerId || child._id;
                          const childRep = getRepDisplayForDealer(child.dealerRepresentative, child.repName, child.statePrefix || child.dealerState, stateRepMap);
                          const childSelected = selectedDealerIds.has(childKey);

                          return (
                            <tr key={`sat-${child._id}`} className={`${styles.childRow} ${isSelectMode && childSelected ? styles.rowSelected : ''}`}>
                              {isSelectMode && (
                                <td className={styles.selectCell} onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={childSelected}
                                    onChange={() => handleToggleSelectDealer(childKey, -1, false)}
                                    style={{
                                      cursor: 'pointer',
                                      accentColor: '#38bdf8',
                                      width: '15px',
                                      height: '15px',
                                      borderRadius: '3px'
                                    }}
                                    aria-label={`Select ${child.dealerName}`}
                                  />
                                </td>
                              )}
                              <td
                                className={isSelectMode ? styles.firstDataTd : undefined}
                                style={{ paddingLeft: '28px', cursor: 'pointer' }}
                                onClick={() => onSelectDealer?.(child._id)}
                                title="Click to view application history"
                              >
                                <div className={styles.dealerCellWrapper}>
                                  {/* Row 1: Satellite store name & status */}
                                  <div className={styles.dealerTopLine}>
                                    <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>└─</span>
                                    <span className={styles.dealerNameLink} style={{ color: 'var(--text-primary)', fontSize: '12px' }}>
                                      {child.dealerName}
                                    </span>
                                    <span className={styles.satelliteBadge}>
                                      Satellite
                                    </span>
                                    <StatusBadge status={deriveStatus(child.latestSnapshot)} />
                                    {renderDrdBadge(child.drd)}
                                    {renderStatusRedFlag(child)}
                                  </div>

                                  {/* Row 2: Secondary metadata & actions */}
                                  <div className={styles.dealerMetaLine} style={{ paddingLeft: '14px' }}>
                                    <span className={styles.dealerCodePill}>{childKey}</span>
                                    {child.dealerCity && (
                                      <>
                                        <span className={styles.dealerMetaDivider}>•</span>
                                        <span>{child.dealerCity}, {child.statePrefix || child.dealerState}</span>
                                      </>
                                    )}
                                    {childRep && childRep !== '—' && (
                                      <>
                                        <span className={styles.dealerMetaDivider}>•</span>
                                        <span>Rep: <strong style={{ color: 'var(--text-primary)' }}>{childRep}</strong></span>
                                      </>
                                    )}
                                    {renderMetaBadges(child)}

                                    <div className={styles.actionBtnGroup}>
                                      <button
                                        type="button"
                                        className={styles.microActionBtn}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setBadgerModalDealer({
                                            dealerId: child.clientDealerId || child.dealerId || child._id,
                                            dealerName: child.dealerName
                                          });
                                        }}
                                        title="View Badger Maps activity, notepad, and log check-ins"
                                      >
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                          <MapPin size={11} />
                                          <span>Badger</span>
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.microActionBtn}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setQuickActionDealer({
                                            _id: child._id,
                                            dealerId: child.dealerId,
                                            clientDealerId: child.clientDealerId || undefined,
                                            dealerName: child.dealerName,
                                            systemStatus: child.systemStatus,
                                            systemStatusReason: child.systemStatusReason,
                                            businessType: child.businessType,
                                            tags: child.tags,
                                            isFundingParent: child.isFundingParent,
                                            fundingParent: dealer,
                                            fundingChildren: child.fundingChildren
                                          });
                                        }}
                                        title="Manage satellite store classification or funding link"
                                      >
                                        Manage
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              {renderChildCells(child.latestSnapshot, child.stats, child.drd)}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
              {/* Intersection observer sentinel */}
              {mode !== 'groups' && hasMore && (
                <tr ref={sentinelRef} style={{ height: '1px', opacity: 0 }}>
                  <td colSpan={visibleColumns.length + (isSelectMode ? 1 : 0)} style={{ padding: 0, border: 'none', height: '1px' }} />
                </tr>
              )}

              {/* Loading more indicator */}
              {isLoadingMore && (
                <tr className={styles.loadingMoreRow}>
                  <td colSpan={visibleColumns.length + (isSelectMode ? 1 : 0)}>
                    <div className={styles.loadingMore}>
                      <span className={styles.loadingSpinner} />
                      Loading more dealers...
                    </div>
                  </td>
                </tr>
              )}

              {/* Manual load more button fallback if user reaches bottom */}
              {mode !== 'groups' && hasMore && !isLoadingMore && (
                <tr className={styles.loadingMoreRow}>
                  <td colSpan={visibleColumns.length + (isSelectMode ? 1 : 0)} style={{ textAlign: 'center', padding: '12px' }}>
                    <button
                      type="button"
                      onClick={() => triggerLoadMore()}
                      style={{
                        background: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        color: '#38bdf8',
                        padding: '6px 18px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      ↓ Scroll or Click to Load More Dealers
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {badgerModalDealer && (
        <BadgerQuickModal
          dealerId={badgerModalDealer.dealerId}
          dealerName={badgerModalDealer.dealerName}
          onClose={() => setBadgerModalDealer(null)}
        />
      )}
      {quickActionDealer && (
        <QuickActionPopover
          dealer={quickActionDealer}
          onClose={() => setQuickActionDealer(null)}
          onSaveSuccess={handleQuickActionSave}
        />
      )}
      {isSelectMode && (selectedDealerIds.size > 0 || selectAllAcrossPages) && (
        <FloatingBatchBar
          selectedIds={Array.from(selectedDealerIds)}
          totalSelectedCount={totalCount}
          selectAllAcrossPages={selectAllAcrossPages}
          filterQuery={currentFilters}
          availableTags={availableTags || []}
          onClearSelection={() => {
            setSelectedDealerIds(new Set());
            setSelectAllAcrossPages(false);
          }}
          onBatchSuccess={handleBatchSuccess}
        />
      )}
      {undoToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 99999,
          background: '#0f172a',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.2)',
          borderRadius: '10px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          color: '#f8fafc',
          animation: 'slideUp 0.2s ease-out'
        }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>{undoToast.message}</span>
          <button
            type="button"
            onClick={() => handleUndo(undoToast)}
            disabled={isUndoing}
            style={{
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <RotateCcw size={12} className={isUndoing ? styles.spin : ''} />
            <span>{isUndoing ? 'Reverting...' : 'Undo'}</span>
          </button>
          <button
            type="button"
            onClick={() => setUndoToast(null)}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}




// ── Best / Worst Cell ──

function BestWorstCell({ data, forceSingle, useCommHeatmap, unit }: { data: BestWorst | undefined | null; forceSingle?: boolean; useCommHeatmap?: boolean; unit?: string }) {
  if (!data || (data.best == null && data.worst == null)) {
    return <span className={styles.emptyValue}>—</span>;
  }
  const heatmapFn = useCommHeatmap ? getCommDaysHeatmap : getDaysSinceHeatmap;
  const suffix = unit ? <span className={styles.unitSuffix}>{unit}</span> : null;
  // Single location — just show one value
  if (forceSingle || data.best === data.worst || data.worst == null) {
    const colors = heatmapFn(data.best);
    return (
      <span className={styles.bestWorstCell}>
        <span className={styles.bestValue} style={colors ? { color: colors.text } : undefined}>
          {data.best ?? '—'}{suffix}
        </span>
      </span>
    );
  }
  const bestColors = heatmapFn(data.best);
  const worstColors = heatmapFn(data.worst);
  return (
    <span className={styles.bestWorstCell}>
      <span className={styles.bestValue} style={bestColors ? { color: bestColors.text } : undefined}>
        {data.best ?? '—'}{suffix}
      </span>
      <span className={styles.bestWorstSep}>/</span>
      <span className={styles.worstValue} style={worstColors ? { color: worstColors.text } : undefined}>
        {data.worst ?? '—'}{suffix}
      </span>
    </span>
  );
}

// ── Active Count Badge ──

function ActiveCountBadge({
  summary,
  overrideActive,
  overrideTotal,
}: {
  summary: DealerGroup['summary'];
  overrideActive?: number;
  overrideTotal?: number;
}) {
  if (!summary && overrideActive == null) return <span className={styles.emptyValue}>—</span>;
  const activeCount = overrideActive ?? summary?.activeCount ?? 0;
  const locationCount = overrideTotal ?? summary?.locationCount ?? 0;
  const ratio = locationCount > 0 ? activeCount / locationCount : 0;
  let colorClass = styles.statusActive;
  if (ratio < 0.5) colorClass = styles.statusLong;
  else if (ratio < 0.75) colorClass = styles.status30d;
  return (
    <span className={`${styles.statusBadge} ${colorClass}`}>
      {activeCount}/{locationCount}
    </span>
  );
}

// ── Skeleton Cell ──

function SkeletonCell() {
  return <span className={styles.skeleton} />;
}

// ── Group Rows ──

interface GroupRowsProps {
  group: DealerGroup;
  isExpanded: boolean;
  locations: DealerLocation[];
  statusFilter?: string | null;
  isPrefetching?: boolean;
  onToggle: () => void;
  renderChildCells: (snap: DealerLocation['latestSnapshot'], stats?: DealerStats, drd?: DealerLocation['drd']) => React.JSX.Element;
  deriveStatusFn?: (snap: DealerLocation['latestSnapshot']) => ActivityStatus;
  visibleColumns: TableColumn[];
  onSelectGroup?: (groupSlug: string) => void;
  onSelectDealer?: (dealerId: string) => void;
  stateRepMap?: StateRepMap;
  onOpenBadger?: (info: { dealerId: string; dealerName: string }) => void;
  onOpenQuickAction?: (dealer: QuickActionDealer) => void;
  dealerOverrides?: Record<string, Partial<DealerLocation>>;
  isSelectMode?: boolean;
  selectedDealerIds?: Set<string>;
  onToggleSelectDealer?: (id: string, idx?: number, shiftKey?: boolean) => void;
  onToggleSelectGroup?: (ids: string[]) => void;
}


function computeBestWorstFromLocations(
  locations: DealerLocation[],
  field: 'daysSinceLastApplication' | 'daysSinceLastApproval' | 'daysSinceLastBooking' | 'daysFromVisitToNextApp'
): BestWorst | null {
  let best: number | null = null;
  let worst: number | null = null;
  for (const loc of locations) {
    const val = loc.latestSnapshot?.[field];
    if (val == null) continue;
    if (best === null || val < best) best = val;
    if (worst === null || val > worst) worst = val;
  }
  if (best === null && worst === null) return null;
  return { best, worst };
}

/** Compute best/worst days-since-contact from filtered locations */
function computeCommDaysBestWorst(locations: DealerLocation[]): BestWorst | null {
  let best: number | null = null;
  let worst: number | null = null;
  for (const loc of locations) {
    const d = daysSinceDate(loc.latestSnapshot?.latestCommunicationDatetime as string | null);
    if (d == null) continue;
    if (best === null || d < best) best = d;
    if (worst === null || d > worst) worst = d;
  }
  if (best === null && worst === null) return null;
  return { best, worst };
}

function GroupRows({
  group,
  isExpanded,
  locations,
  statusFilter,
  isPrefetching,
  onToggle,
  renderChildCells,
  deriveStatusFn,
  visibleColumns,
  onSelectGroup,
  onSelectDealer,
  stateRepMap,
  onOpenBadger,
  onOpenQuickAction,
  dealerOverrides,
  isSelectMode,
  selectedDealerIds,
  onToggleSelectDealer,
  onToggleSelectGroup
}: GroupRowsProps) {
  const s = group.summary;

  const effectiveLocations = useMemo(() => {
    if (!dealerOverrides || Object.keys(dealerOverrides).length === 0) return locations;
    return locations.map((loc) => {
      const key = loc.clientDealerId || loc.dealerId || loc._id;
      return dealerOverrides[key] ? { ...loc, ...dealerOverrides[key] } : loc;
    });
  }, [locations, dealerOverrides]);

  const groupChildKeys = useMemo(() => {
    return effectiveLocations.map((loc) => loc.clientDealerId || loc.dealerId || loc._id);
  }, [effectiveLocations]);

  const isGroupAllSelected = Boolean(isSelectMode && groupChildKeys.length > 0 && groupChildKeys.every((id) => selectedDealerIds?.has(id)));
  const isGroupSomeSelected = Boolean(isSelectMode && !isGroupAllSelected && groupChildKeys.some((id) => selectedDealerIds?.has(id)));

  // Aggregate stats across child locations
  const groupStats = locations.reduce<DealerStats>(
    (acc, loc) => {
      if (loc.stats) {
        acc.apps += loc.stats.apps || 0;
        acc.approvals += loc.stats.approvals || 0;
        acc.inHouse += loc.stats.inHouse || 0;
        acc.leadBooked = (acc.leadBooked || 0) + (loc.stats.leadBooked || 0);
        acc.leadBookedDollars = (acc.leadBookedDollars || 0) + (loc.stats.leadBookedDollars || 0);
        acc.booked += loc.stats.booked || 0;
        acc.bookedDollars += loc.stats.bookedDollars || 0;
      }
      return acc;
    },
    { apps: 0, approvals: 0, inHouse: 0, leadBooked: 0, leadBookedDollars: 0, booked: 0, bookedDollars: 0, lookToBook: 0, approvalToBook: 0 }
  );

  const effLeadBooked = groupStats.leadBooked ?? 0;
  if (groupStats.apps > 0) groupStats.lookToBook = effLeadBooked / groupStats.apps;
  if (groupStats.approvals > 0) groupStats.approvalToBook = effLeadBooked / groupStats.approvals;

  // Compute the displayed location count
  let displayCount = s?.locationCount ?? group.dealerCount;
  if (statusFilter && s) {
    switch (statusFilter) {
      case 'active': displayCount = s.activeCount; break;
      case '30d_inactive': displayCount = s.inactive30Count; break;
      case '60d_inactive': displayCount = s.inactive60Count; break;
      case '90d_inactive': displayCount = s.inactive90Count ?? 0; break;
      case 'long_inactive': displayCount = s.longInactiveCount; break;
      case 'never_active': displayCount = s.neverActiveCount ?? 0; break;
      case 'reactivated': displayCount = s.reactivatedCount; break;
    }
  }

  // When status filter is active + locations loaded, recompute from filtered children
  const hasFilteredLocs = statusFilter && locations.length > 0;
  const showSkeleton = statusFilter && !hasFilteredLocs && isPrefetching;

  const daysSinceApp = hasFilteredLocs
    ? computeBestWorstFromLocations(locations, 'daysSinceLastApplication')
    : s?.daysSinceApp ?? null;
  const daysSinceApproval = hasFilteredLocs
    ? computeBestWorstFromLocations(locations, 'daysSinceLastApproval')
    : s?.daysSinceApproval ?? null;
  const daysSinceBooking = hasFilteredLocs
    ? computeBestWorstFromLocations(locations, 'daysSinceLastBooking')
    : s?.daysSinceBooking ?? null;
  const visitToApp = hasFilteredLocs
    ? computeBestWorstFromLocations(locations, 'daysFromVisitToNextApp')
    : s?.visitToApp ?? null;
  const commDays = hasFilteredLocs
    ? computeCommDaysBestWorst(locations)
    : (() => {
        const best = daysSinceDate(s?.latestComm);
        const worst = daysSinceDate(s?.oldestComm);
        if (best == null && worst == null) return null;
        return { best, worst } as BestWorst;
      })();

  // Compute filtered active count for status badge
  const displayedLocations = useMemo(() => {
    if (!statusFilter) return effectiveLocations;
    return effectiveLocations.filter((loc) => {
      const locStatus = deriveStatusFn ? deriveStatusFn(loc.latestSnapshot) : loc.latestSnapshot?.activityStatus;
      return locStatus === statusFilter;
    });
  }, [effectiveLocations, statusFilter, deriveStatusFn]);

  let filteredActive: number | undefined;
  let filteredTotal: number | undefined;
  if (hasFilteredLocs) {
    filteredTotal = locations.length;
    filteredActive = locations.filter((loc) => {
      const status = deriveStatusFn ? deriveStatusFn(loc.latestSnapshot) : loc.latestSnapshot?.activityStatus;
      return status === 'active';
    }).length;
  }

  const isSingle = displayCount === 1;

  return (
    <>
      <tr
        className={`${styles.groupRow} ${isExpanded ? styles.groupRowExpanded : ''}`}
        onClick={onToggle}
      >
        {isSelectMode && (
          <td className={styles.selectCell} onClick={(e) => e.stopPropagation()}>
            <IndeterminateCheckbox
              checked={isGroupAllSelected}
              indeterminate={isGroupSomeSelected}
              onChange={() => onToggleSelectGroup?.(groupChildKeys)}
              disabled={groupChildKeys.length === 0}
              title={isGroupAllSelected ? "Deselect group locations" : "Select all group locations"}
              ariaLabel={`Select all locations in ${group.name}`}
            />
          </td>
        )}
        <td className={isSelectMode ? styles.firstDataTd : undefined}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              className={`${styles.expandIcon} ${isExpanded ? styles.expandIconOpen : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
            >▶</span>
            <span
              style={{ cursor: 'pointer', color: '#38bdf8', fontWeight: 600, fontSize: '14px' }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectGroup?.(group.slug);
              }}
              title="Click to view Historical MoM & group application history"
            >
              {group.name}
            </span>
            <span className={styles.locationCount}>({displayCount})</span>
            {showSkeleton ? (
              <SkeletonCell />
            ) : (
              <ActiveCountBadge
                summary={s}
                overrideActive={filteredActive}
                overrideTotal={filteredTotal}
              />
            )}
          </div>
        </td>
        <td>{showSkeleton ? <SkeletonCell /> : <BestWorstCell data={daysSinceApp} forceSingle={isSingle} />}</td>
        <td>{showSkeleton ? <SkeletonCell /> : <BestWorstCell data={daysSinceApproval} forceSingle={isSingle} />}</td>
        <td>{showSkeleton ? <SkeletonCell /> : <BestWorstCell data={daysSinceBooking} forceSingle={isSingle} />}</td>
        {visibleColumns.some(c => c.key === 'lastVisit') && (
          <td style={{ textAlign: 'right' }}>
            {showSkeleton ? <SkeletonCell /> : (
              locations.length > 0
                ? renderGroupLastVisit(locations)
                : ((group.drd?.minDaysSinceLastVisit != null || s?.drd?.minDaysSinceLastVisit != null || group.drd?.latestVisitDate || s?.drd?.latestVisitDate)
                    ? renderLastVisitCell({
                        lastVisitDate: group.drd?.latestVisitDate ?? s?.drd?.latestVisitDate,
                        daysSinceLastVisit: group.drd?.minDaysSinceLastVisit ?? s?.drd?.minDaysSinceLastVisit,
                        totalVisits: group.drd?.totalVisits ?? s?.drd?.totalVisits,
                        segment: 'high_tlc'
                      })
                    : <span style={{ color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>Never</span>)
            )}
          </td>
        )}
        {visibleColumns.some(c => c.key === 'postVisitLift') && (
          <td style={{ textAlign: 'right' }}>
            {showSkeleton ? <SkeletonCell /> : (
              locations.length > 0
                ? renderGroupLift(locations)
                : renderPostVisitLiftCell(group.drd?.avgLift ?? s?.drd?.avgLift)
            )}
          </td>
        )}
        {visibleColumns.some(c => c.key === 'yieldPerVisit') && (
          <td style={{ textAlign: 'right' }}>
            {showSkeleton ? <SkeletonCell /> : (
              locations.length > 0
                ? renderGroupYield(locations)
                : renderYieldPerVisitCell(group.drd?.yieldPerVisit ?? s?.drd?.yieldPerVisit)
            )}
          </td>
        )}
        {visibleColumns.some(c => c.key === 'commDays') && (
          <td>{showSkeleton ? <SkeletonCell /> : <BestWorstCell data={commDays} forceSingle={isSingle} useCommHeatmap unit="d" />}</td>
        )}
        {visibleColumns.some(c => c.key === 'visitToApp') && (
          <td>{showSkeleton ? <SkeletonCell /> : <BestWorstCell data={visitToApp} forceSingle={isSingle} unit="d" />}</td>
        )}
        <td style={{ textAlign: 'right' }}>{showSkeleton ? <SkeletonCell /> : renderStackedStatCell(group.stats?.apps, group.stats?.trends?.apps, 'count')}</td>
        <td style={{ textAlign: 'right' }}>{showSkeleton ? <SkeletonCell /> : renderStackedStatCell(group.stats?.approvals, group.stats?.trends?.approvals, 'count')}</td>
        {visibleColumns.some(c => c.key === 'inHouse') && (
          <td style={{ textAlign: 'right' }}>{showSkeleton ? <SkeletonCell /> : renderStackedStatCell(group.stats?.inHouse, group.stats?.trends?.inHouse, 'count')}</td>
        )}
        {visibleColumns.some(c => c.key === 'leadBooked') && (
          <td style={{ textAlign: 'right' }}>{showSkeleton ? <SkeletonCell /> : renderStackedStatCell(group.stats?.leadBooked, group.stats?.trends?.leadBooked, 'count')}</td>
        )}
        {visibleColumns.some(c => c.key === 'leadBookedDollars') && (
          <td style={{ textAlign: 'right' }}>{showSkeleton ? <SkeletonCell /> : renderStackedStatCell(group.stats?.leadBookedDollars, group.stats?.trends?.leadBookedDollars, 'dollar')}</td>
        )}
        <td style={{ textAlign: 'right' }}>{showSkeleton ? <SkeletonCell /> : renderStackedStatCell(group.stats?.booked, group.stats?.trends?.booked, 'count')}</td>
        <td style={{ textAlign: 'right' }}>{showSkeleton ? <SkeletonCell /> : renderStackedStatCell(group.stats?.bookedDollars, group.stats?.trends?.bookedDollars, 'dollar')}</td>
        <td style={{ textAlign: 'right' }}>{showSkeleton ? <SkeletonCell /> : renderStackedStatCell(group.stats?.lookToBook, group.stats?.trends?.lookToBook, 'percent')}</td>
        <td style={{ textAlign: 'right' }}>{showSkeleton ? <SkeletonCell /> : renderStackedStatCell(group.stats?.approvalToBook, group.stats?.trends?.approvalToBook, 'percent')}</td>
        <td style={{ textAlign: 'right' }}>
          {showSkeleton ? <SkeletonCell /> : (group.stats?.avgFico ? <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{group.stats.avgFico}</span> : '—')}
        </td>
      </tr>
      {isExpanded && displayedLocations.map((loc, locIdx) => {
        const repDisplay = getRepDisplayForDealer(loc.dealerRepresentative, loc.repName, loc.statePrefix, stateRepMap);
        const hasRep = repDisplay && repDisplay !== '—';
        const locStatus = deriveStatusFn ? deriveStatusFn(loc.latestSnapshot) : loc.latestSnapshot?.activityStatus;
        const locKey = loc.clientDealerId || loc.dealerId || loc._id;
        const isLocSelected = Boolean(isSelectMode && selectedDealerIds?.has(locKey));
        return (
          <tr key={loc._id} className={`${styles.childRow} ${(isSelectMode && isLocSelected) ? styles.rowSelected : ''}`}>
            {isSelectMode && (
              <td className={styles.selectCell} onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isLocSelected}
                  onChange={(e) => {
                    const isShift = (e.nativeEvent as MouseEvent).shiftKey;
                    onToggleSelectDealer?.(locKey, locIdx, isShift);
                  }}
                  style={{
                    cursor: 'pointer',
                    accentColor: '#38bdf8',
                    width: '15px',
                    height: '15px',
                    borderRadius: '3px'
                  }}
                  aria-label={`Select ${loc.dealerName}`}
                />
              </td>
            )}
            <td
              className={isSelectMode ? styles.firstDataTd : undefined}
              style={{ cursor: 'pointer', paddingLeft: '32px' }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectDealer?.(loc.dealerId || loc._id);
              }}
              title="Click to view Historical MoM & application history"
            >
              <div className={styles.dealerCellWrapper}>
                {/* Row 1: Primary Identity & Status */}
                <div className={styles.dealerTopLine}>
                  <span className={styles.dealerNameLink}>{loc.dealerName}</span>
                  <StatusBadge status={locStatus} />
                  {renderDrdBadge(loc.drd)}
                  {renderStatusRedFlag(loc)}
                </div>

                {/* Row 2: Secondary Metadata & Actions */}
                <div className={styles.dealerMetaLine}>
                  <span className={styles.dealerCodePill}>{locKey}</span>
                  {loc.dealerCity && (
                    <>
                      <span className={styles.dealerMetaDivider}>•</span>
                      <span>{loc.dealerCity}, {loc.statePrefix || loc.dealerState}</span>
                    </>
                  )}
                  {hasRep && (
                    <>
                      <span className={styles.dealerMetaDivider}>•</span>
                      <span>Rep: <strong style={{ color: 'var(--text-primary)' }}>{repDisplay}</strong></span>
                    </>
                  )}
                  {renderMetaBadges(loc)}

                  <div className={styles.actionBtnGroup}>
                    <button
                      type="button"
                      className={styles.microActionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenBadger?.({
                          dealerId: loc.clientDealerId || loc.dealerId || loc._id,
                          dealerName: loc.dealerName
                        });
                      }}
                      title="View Badger Maps activity, notepad, and log check-ins"
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <MapPin size={11} />
                        <span>Badger</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`${styles.microActionBtn} ${loc.systemStatus && loc.systemStatus !== 'active' ? styles.microActionBtnWarn : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenQuickAction?.({
                          _id: loc._id,
                          dealerId: loc.dealerId,
                          clientDealerId: loc.clientDealerId || undefined,
                          dealerName: loc.dealerName,
                          systemStatus: loc.systemStatus,
                          systemStatusReason: loc.systemStatusReason,
                          businessType: loc.businessType,
                          tags: loc.tags
                        });
                      }}
                      title="Quick Action: Red flag dealership, change business type, or add tags"
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <Flag size={11} />
                        <span>{loc.systemStatus && loc.systemStatus !== 'active' ? 'Flagged' : 'Actions'}</span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </td>
            {renderChildCells(loc.latestSnapshot, loc.stats, loc.drd)}
          </tr>
        );
      })}
    </>
  );
}



