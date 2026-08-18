/**
 * FilterBar — Rep and State filter dropdowns with budget + clickable stats.
 * Stats are ALWAYS visible. Clicking a stat filters the table.
 * Budget/rep summary only shows when a rep or state is selected.
 */

import { useState, useMemo } from 'react';
import styles from './FilterBar.module.css';
import type { StateRepMap, StateBudget, DealerStatusBreakdown } from '../../../../core/services/api';
import type { DealerGroup, HeatClass } from '../../types';

export type DatePreset = 'this_month' | 'last_30' | 'last_60' | 'last_90' | 'last_month' | 'ytd' | 'last_year' | 'all_time' | 'custom';

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
  repStatesMap?: Record<string, string[]>;
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

function heatDotSymbol(_hc?: HeatClass): string {
  return '●';
}

const STATUS_LABEL_MAP: Record<string, string> = {
  active: 'Active',
  '30d_inactive': '30d',
  '60d_inactive': '60d',
  '90d_inactive': '90d',
  long_inactive: 'Long',
  never_active: 'Never',
};

const STATUS_COLOR_MAP: Record<string, string> = {
  active: '#34d399',
  '30d_inactive': '#fbbf24',
  '60d_inactive': '#f97316',
  '90d_inactive': '#ea580c',
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
  repStatesMap = {},
}: FilterBarProps) {
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedRep) count++;
    if (selectedState) count++;
    if (statusFilter) count++;
    if (activityMode && activityMode !== 'application') count++;
    if (transitionFilter) count++;
    return count;
  }, [selectedRep, selectedState, statusFilter, activityMode, transitionFilter]);

  const reps = useMemo(() => {
    const HIDDEN_REPS = [
      'bruce sweere', 'bsweere',
      'tony derouin', 'tderouin',
      'steve kimble', 'skimble',
      'n boly', 'nboly',
      'mandi schultz', 'mschultz', 'mschultz1',
    ];

    // Use repStatesMap keys (data-driven from DealerLocation) — include S1House
    const repKeys = Object.keys(repStatesMap);
    const rawList = repKeys.length > 0 ? [...new Set([...repKeys, 'S1House'])] : [...new Set([...Object.values(stateRepMap), 'S1House'])];

    return rawList
      .filter((r) => {
        if (!r) return false;
        const lower = r.trim().toLowerCase();
        return !HIDDEN_REPS.some((h) => lower.includes(h));
      })
      .sort();
  }, [repStatesMap, stateRepMap]);

  const states = useMemo(() => {
    // When a rep is selected, only show that rep's states
    if (selectedRep && repStatesMap[selectedRep]) {
      return [...repStatesMap[selectedRep]].sort();
    }
    // Fall back to all states from stateRepMap
    return Object.keys(stateRepMap).sort();
  }, [stateRepMap, selectedRep, repStatesMap]);

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
      inactive90: 0,
      longInactive,
    };
  }, [filteredGroups]);

  // Stats from independent dealers (server-provided for full accuracy)
  const dealerStats = useMemo(() => {
    if (!dealerStatusBreakdown) {
      return {
        groups: 0, locations: 0, activeCount: 0, activePercent: 0,
        inactive30: 0, inactive60: 0, inactive90: 0, longInactive: 0,
      };
    }
    const b = dealerStatusBreakdown;
    const activePercent = b.total > 0 ? Math.round((b.active / b.total) * 100) : 0;
    return {
      groups: 0,
      locations: b.total || 0,
      activeCount: b.active || 0,
      activePercent,
      inactive30: b.inactive30 ?? b.inactive30d ?? 0,
      inactive60: b.inactive60 ?? b.inactive60d ?? 0,
      inactive90: b.inactive90 ?? b.inactive90d ?? 0,
      longInactive: b.longInactive || 0,
    };
  }, [dealerStatusBreakdown]);

  const stats = mode !== 'groups' ? dealerStats : groupStats;

  // Filter summary — only when rep/state selected
  const summary = useMemo(() => {
    if (selectedRep) {
      const repBudgets = budgets.filter((b) => b.rep.toLowerCase() === selectedRep.toLowerCase());
      const annualBudget = repBudgets.reduce((sum, b) => sum + b.annualTotal, 0);
      // Get states from repStatesMap (data-driven) for the summary banner chips
      const repStates = repStatesMap[selectedRep] || [];
      return {
        type: 'rep' as const,
        label: selectedRep,
        rep: selectedRep,
        states: selectedState ? [selectedState] : repStates,
        annualBudget,
      };
    }
    if (selectedState) {
      const b = budgetByState[selectedState];
      return {
        type: 'state' as const,
        label: selectedState,
        rep: b?.rep || '',
        states: [selectedState],
        annualBudget: b?.annualTotal || 0,
      };
    }
    return null;
  }, [selectedRep, selectedState, budgets, budgetByState, repStatesMap]);

  const handleRepChange = (rep: string) => {
    onRepChange(rep);
    onStatusFilterChange(null);
  };

  const handleStateChange = (state: string) => {
    onStateChange(state);
    onStatusFilterChange(null);
  };

  const handleStatClick = (statKey: string | null) => {
    if (statKey === null) {
      onStatusFilterChange(null);
    } else {
      onStatusFilterChange(statusFilter === statKey ? null : statKey);
    }
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

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Portfolio</label>
          <select
            className={`${styles.filterSelect} ${selectedRep === 'S1House' ? styles.filterActive : ''}`}
            value={selectedRep === 'S1House' ? 'S1House' : ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'S1House') {
                handleRepChange('S1House');
              } else {
                if (selectedRep === 'S1House') handleRepChange('');
              }
            }}
            id="filter-portfolio"
          >
            <option value="">All Accounts</option>
            <option value="S1House">House (S1House)</option>
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
          className={`${styles.statItem} ${styles.statClickable} ${statusFilter === '90d_inactive' ? styles.statSelected : ''}`}
          onClick={() => handleStatClick('90d_inactive')}
          title="Filter to groups with 90d inactive"
        >
          <span className={styles.statValue}>{stats.inactive90 || 0}</span>
          <span className={styles.statLabel}>90d Inactive</span>
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

      {/* Mobile Filter Drawer Trigger Button Bar */}
      <div className={styles.mobileFilterTriggerRow}>
        <button
          className={styles.mobileFilterBtn}
          onClick={() => setMobileFilterOpen(true)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span>Filter Parameters & Date</span>
          </div>
          {activeFilterCount > 0 ? (
            <span className={styles.mobileActiveBadge}>{activeFilterCount} Active</span>
          ) : (
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Tap to customize ⚙️</span>
          )}
        </button>
      </div>

      {/* Mobile Filter Sheet (Bottom Drawer) */}
      {mobileFilterOpen && (
        <div className={styles.mobileFilterDrawerBackdrop} onClick={() => setMobileFilterOpen(false)}>
          <div className={styles.mobileFilterDrawer} onClick={(e) => e.stopPropagation()}>
            <div className="mobileDragHandleRow">
              <div className="mobileDragHandle" />
            </div>

            <div className={styles.mobileFilterBody}>
              {/* Rep & State Pickers */}
              <div className={styles.mobileFilterSection}>
                <span className={styles.mobileSectionTitle}>Rep & State Filters</span>
                <div className={styles.mobileSelectRow}>
                  <div className={styles.mobileSelectGroup}>
                    <select value={selectedRep} onChange={(e) => onRepChange(e.target.value)}>
                      <option value="">All Reps ({reps.length})</option>
                      {reps.map((rep) => (
                        <option key={rep} value={rep}>
                          {rep}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.mobileSelectGroup}>
                    <select value={selectedState} onChange={(e) => onStateChange(e.target.value)}>
                      <option value="">All States ({states.length})</option>
                      {states.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Activity Mode Segmented Control */}
              {onActivityModeChange && (
                <div className={styles.mobileFilterSection}>
                  <span className={styles.mobileSectionTitle}>Activity Mode</span>
                  <div className={styles.mobilePresetGrid}>
                    <button
                      className={`${styles.mobileChip} ${activityMode === 'application' ? styles.mobileChipActive : ''}`}
                      onClick={() => onActivityModeChange('application')}
                    >
                      Applications
                    </button>
                    <button
                      className={`${styles.mobileChip} ${activityMode === 'approval' ? styles.mobileChipActive : ''}`}
                      onClick={() => onActivityModeChange('approval')}
                    >
                      Approvals
                    </button>
                    <button
                      className={`${styles.mobileChip} ${activityMode === 'booking' ? styles.mobileChipActive : ''}`}
                      onClick={() => onActivityModeChange('booking')}
                    >
                      Bookings
                    </button>
                  </div>
                </div>
              )}

              {/* Status Filter */}
              <div className={styles.mobileFilterSection}>
                <span className={styles.mobileSectionTitle}>Status Filter</span>
                <div className={styles.mobilePresetGrid}>
                  {[
                    { key: null, label: 'All Locations' },
                    { key: 'active', label: `Active (${stats.activeCount})` },
                    { key: '30d_inactive', label: `30d Inactive (${stats.inactive30})` },
                    { key: '60d_inactive', label: `60d Inactive (${stats.inactive60})` },
                    { key: 'long_inactive', label: `Long Inactive (${stats.longInactive})` },
                  ].map((s) => (
                    <button
                      key={s.key || 'all'}
                      className={`${styles.mobileChip} ${statusFilter === s.key ? styles.mobileChipActive : ''}`}
                      onClick={() => handleStatClick(s.key)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile Filter Footer */}
            <div className={styles.mobileFilterFooter}>
              <button
                className={styles.mobileResetBtn}
                onClick={() => {
                  onRepChange('');
                  onStateChange('');
                  onStatusFilterChange(null);
                  if (onTransitionFilterChange) onTransitionFilterChange(null);
                }}
              >
                Reset All
              </button>
              <button
                className={styles.mobileApplyBtn}
                onClick={() => setMobileFilterOpen(false)}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
