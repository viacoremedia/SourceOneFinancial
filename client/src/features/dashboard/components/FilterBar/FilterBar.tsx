/**
 * FilterBar — Rep and State filter dropdowns with budget + clickable stats.
 * Stats are ALWAYS visible. Clicking a stat filters the table.
 * Budget/rep summary only shows when a rep or state is selected.
 */

import { useMemo } from 'react';
import styles from './FilterBar.module.css';
import type { StateRepMap, StateBudget, DealerStatusBreakdown } from '../../../../core/services/api';
import type { DealerGroup, HeatClass } from '../../types';

interface FilterBarProps {
  stateRepMap: StateRepMap;
  budgets: StateBudget[];
  filteredGroups: DealerGroup[];
  mode?: 'groups' | 'dealers' | 'all';
  dealerStatusBreakdown?: DealerStatusBreakdown | null;
  selectedRep: string;
  selectedState: string;
  statusFilter: string | null;
  activityMode?: 'application' | 'approval' | 'booking';
  onRepChange: (rep: string) => void;
  onStateChange: (state: string) => void;
  onStatusFilterChange: (status: string | null) => void;
  onActivityModeChange?: (mode: 'application' | 'approval' | 'booking') => void;
  repHeatMap?: Record<string, HeatClass>;
  statusTransitions?: { from: string; to: string; count: number }[];
  transitionFilter?: string | null;
  onTransitionFilterChange?: (key: string | null) => void;
}

function formatDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function heatClassColor(hc: HeatClass): string {
  switch (hc) {
    case 'strong': return '#34d399';
    case 'average': return '#fbbf24';
    case 'overburdened': return '#f97316';
    case 'underperforming': return '#ef4444';
    default: return '#64748b';
  }
}

function heatDotSymbol(hc: HeatClass): string {
  switch (hc) {
    case 'strong': return '🟢';
    case 'average': return '🟡';
    case 'overburdened': return '🟠';
    case 'underperforming': return '🔴';
    default: return '⚪';
  }
}

const STATUS_LABEL_MAP: Record<string, string> = {
  active: 'Active',
  '30d_inactive': '30d',
  '60d_inactive': '60d',
  long_inactive: 'Long',
  never_active: 'Never',
};

const STATUS_COLOR_MAP: Record<string, string> = {
  active: '#34d399',
  '30d_inactive': '#fbbf24',
  '60d_inactive': '#f97316',
  long_inactive: '#ef4444',
  never_active: '#64748b',
};

export function FilterBar({
  stateRepMap,
  budgets,
  filteredGroups,
  mode = 'groups',
  dealerStatusBreakdown,
  selectedRep,
  selectedState,
  statusFilter,
  activityMode = 'application',
  onRepChange,
  onStateChange,
  onStatusFilterChange,
  onActivityModeChange,
  repHeatMap,
  statusTransitions = [],
  transitionFilter = null,
  onTransitionFilterChange,
}: FilterBarProps) {
  const reps = useMemo(() => {
    const repSet = new Set(Object.values(stateRepMap));
    return [...repSet].sort();
  }, [stateRepMap]);

  const states = useMemo(() => {
    const allStates = Object.keys(stateRepMap).sort();
    if (!selectedRep) return allStates;
    return allStates.filter((s) => stateRepMap[s] === selectedRep);
  }, [stateRepMap, selectedRep]);

  const budgetByState = useMemo(() => {
    const map: Record<string, StateBudget> = {};
    for (const b of budgets) map[b.state] = b;
    return map;
  }, [budgets]);

  // Stats from groups
  const groupStats = useMemo(() => {
    let totalLocations = 0;
    let activeCount = 0;
    let inactive30 = 0;
    let inactive60 = 0;
    let longInactive = 0;

    for (const g of filteredGroups) {
      if (g.summary) {
        totalLocations += g.summary.locationCount;
        activeCount += g.summary.activeCount;
        inactive30 += g.summary.inactive30Count;
        inactive60 += g.summary.inactive60Count;
        longInactive += g.summary.longInactiveCount;
      }
    }

    const activePercent = totalLocations > 0
      ? Math.round((activeCount / totalLocations) * 100)
      : 0;

    return {
      groups: filteredGroups.length,
      locations: totalLocations,
      activeCount,
      activePercent,
      inactive30,
      inactive60,
      longInactive,
    };
  }, [filteredGroups]);

  // Stats from independent dealers (server-provided for full accuracy)
  const dealerStats = useMemo(() => {
    if (!dealerStatusBreakdown) {
      return {
        groups: 0, locations: 0, activeCount: 0, activePercent: 0,
        inactive30: 0, inactive60: 0, longInactive: 0,
      };
    }
    const b = dealerStatusBreakdown;
    const activePercent = b.total > 0 ? Math.round((b.active / b.total) * 100) : 0;
    return {
      groups: 0,
      locations: b.total,
      activeCount: b.active,
      activePercent,
      inactive30: b.inactive30,
      inactive60: b.inactive60,
      longInactive: b.longInactive,
    };
  }, [dealerStatusBreakdown]);

  const stats = mode !== 'groups' ? dealerStats : groupStats;

  // Budget summary — only when rep/state selected
  const summary = useMemo(() => {
    if (selectedState) {
      const b = budgetByState[selectedState];
      if (!b) return null;
      return {
        type: 'state' as const,
        label: selectedState,
        rep: b.rep,
        states: [selectedState],
        annualBudget: b.annualTotal,
      };
    }
    if (selectedRep) {
      const repBudgets = budgets.filter((b) => b.rep === selectedRep);
      const repStates = repBudgets.map((b) => b.state).sort();
      const annualBudget = repBudgets.reduce((sum, b) => sum + b.annualTotal, 0);
      return {
        type: 'rep' as const,
        label: selectedRep,
        rep: selectedRep,
        states: repStates,
        annualBudget,
      };
    }
    return null;
  }, [selectedRep, selectedState, budgets, budgetByState]);

  const handleRepChange = (rep: string) => {
    onRepChange(rep);
    onStatusFilterChange(null);
    if (rep && selectedState && stateRepMap[selectedState] !== rep) {
      onStateChange('');
    }
  };

  const handleStateChange = (state: string) => {
    onStateChange(state);
    onStatusFilterChange(null);
  };

  const handleStatClick = (statKey: string) => {
    onStatusFilterChange(statusFilter === statKey ? null : statKey);
    // Clear transition filter when a status filter is clicked
    if (onTransitionFilterChange) onTransitionFilterChange(null);
  };

  const hasActiveFilters = selectedRep || selectedState;

  return (
    <div className={styles.filterWrapper}>
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>
            Rep
            {selectedRep && repHeatMap?.[selectedRep] && (
              <span
                className={styles.heatDotInline}
                style={{ background: heatClassColor(repHeatMap[selectedRep]) }}
                title={`Heat: ${repHeatMap[selectedRep]}`}
              />
            )}
          </label>
          <select
            className={`${styles.filterSelect} ${selectedRep ? styles.filterActive : ''}`}
            value={selectedRep}
            onChange={(e) => handleRepChange(e.target.value)}
            id="filter-rep"
          >
            <option value="">All Reps</option>
            {reps.map((r) => (
              <option key={r} value={r}>
                {repHeatMap?.[r] ? `${heatDotSymbol(repHeatMap[r])} ${r}` : r}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>State</label>
          <select
            className={`${styles.filterSelect} ${selectedState ? styles.filterActive : ''}`}
            value={selectedState}
            onChange={(e) => handleStateChange(e.target.value)}
            id="filter-state"
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            className={styles.clearBtn}
            onClick={() => { onRepChange(''); onStateChange(''); onStatusFilterChange(null); }}
            title="Clear all filters"
          >
            ✕
          </button>
        )}
      </div>

      {/* Budget summary — only when rep/state is selected */}
      {summary && (
        <div className={styles.summaryBanner}>
          <div className={styles.summaryRow}>
            <div className={styles.summaryMain}>
              {summary.type === 'rep' ? (
                <>
                  <span className={styles.summaryLabel}>{summary.rep}</span>
                  <span className={styles.summaryDivider}>·</span>
                  <span className={styles.summaryStates}>
                    {summary.states.map((s) => (
                      <button
                        key={s}
                        className={`${styles.stateChip} ${selectedState === s ? styles.stateChipActive : ''}`}
                        onClick={() => handleStateChange(s === selectedState ? '' : s)}
                      >
                        {s}
                      </button>
                    ))}
                  </span>
                </>
              ) : (
                <>
                  <span className={styles.summaryLabel}>{summary.label}</span>
                  <span className={styles.summaryDivider}>·</span>
                  <span className={styles.summaryRep}>Rep: {summary.rep}</span>
                </>
              )}
            </div>
            <div className={styles.summaryBudget}>
              <span className={styles.budgetAmount}>
                {formatDollar(summary.annualBudget)}
              </span>
              <span className={styles.budgetLabel}>annual budget</span>
            </div>
          </div>
        </div>
      )}

      {/* Stats row — ALWAYS visible, clickable buckets */}
      <div className={`${styles.statsRow} ${!summary ? styles.statsRowStandalone : ''}`}>
        {/* Status By dropdown — all tabs */}
        {onActivityModeChange && (
          <div className={styles.statusByGroup}>
            <label className={styles.statusByLabel}>Status by</label>
            <select
              className={styles.statusBySelect}
              value={activityMode}
              onChange={(e) => onActivityModeChange(e.target.value as 'application' | 'approval' | 'booking')}
              id="status-by-select"
            >
              <option value="application">Application</option>
              <option value="approval">Approval</option>
              <option value="booking">Booking</option>
            </select>
          </div>
        )}
        {mode === 'groups' && (
          <div className={styles.statItem}>
            <span className={styles.statValue}>{stats.groups}</span>
            <span className={styles.statLabel}>Groups</span>
          </div>
        )}
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats.locations}</span>
          <span className={styles.statLabel}>{mode !== 'groups' ? 'Dealers' : 'Locations'}</span>
        </div>
        <button
          className={`${styles.statItem} ${styles.statClickable} ${statusFilter === 'active' ? styles.statSelected : ''}`}
          onClick={() => handleStatClick('active')}
          title="Filter to groups with active locations"
        >
          <span className={`${styles.statValue} ${styles.statActive}`}>{stats.activeCount}</span>
          <span className={styles.statLabel}>Active ({stats.activePercent}%)</span>
        </button>
        <button
          className={`${styles.statItem} ${styles.statClickable} ${statusFilter === '30d_inactive' ? styles.statSelected : ''}`}
          onClick={() => handleStatClick('30d_inactive')}
          title="Filter to groups with 30d inactive"
        >
          <span className={styles.statValue}>{stats.inactive30}</span>
          <span className={styles.statLabel}>30d Inactive</span>
        </button>
        <button
          className={`${styles.statItem} ${styles.statClickable} ${statusFilter === '60d_inactive' ? styles.statSelected : ''}`}
          onClick={() => handleStatClick('60d_inactive')}
          title="Filter to groups with 60d inactive"
        >
          <span className={styles.statValue}>{stats.inactive60}</span>
          <span className={styles.statLabel}>60d Inactive</span>
        </button>
        <button
          className={`${styles.statItem} ${styles.statClickable} ${statusFilter === 'long_inactive' ? styles.statSelected : ''}`}
          onClick={() => handleStatClick('long_inactive')}
          title="Filter to groups with long inactive"
        >
          <span className={`${styles.statValue} ${styles.statDanger}`}>{stats.longInactive}</span>
          <span className={styles.statLabel}>Long Inactive</span>
        </button>
      </div>

      {/* Status Transition Pills — separate row below stats */}
      {statusTransitions.length > 0 && (
        <div className={styles.transitionRow}>
          <span className={styles.transitionLabel}>Transitions</span>
          {statusTransitions.map((t) => {
            const key = `${t.from}→${t.to}`;
            const isActive = transitionFilter === key;
            return (
              <button
                key={key}
                className={`${styles.transitionPill} ${isActive ? styles.transitionPillActive : ''}`}
                onClick={() => onTransitionFilterChange?.(isActive ? null : key)}
                title={`Show ${t.count} dealer(s) that moved from ${STATUS_LABEL_MAP[t.from] || t.from} to ${STATUS_LABEL_MAP[t.to] || t.to}`}
              >
                <span className={styles.transitionStatus} style={{ color: STATUS_COLOR_MAP[t.from] || '#94a3b8' }}>
                  {STATUS_LABEL_MAP[t.from] || t.from}
                </span>
                <span className={styles.transitionArrow}>→</span>
                <span className={styles.transitionStatus} style={{ color: STATUS_COLOR_MAP[t.to] || '#94a3b8' }}>
                  {STATUS_LABEL_MAP[t.to] || t.to}
                </span>
                <span className={styles.transitionCount}>{t.count}</span>
              </button>
            );
          })}
          {transitionFilter && (
            <button
              className={styles.transitionClear}
              onClick={() => onTransitionFilterChange?.(null)}
              title="Clear transition filter"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
