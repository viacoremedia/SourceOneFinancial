/**
 * FilterBar — Rep and State filter dropdowns with budget summary.
 * 
 * When a rep is selected: shows their states + total budget.
 * When a state is selected: shows the rep + state budget.
 */

import { useMemo } from 'react';
import styles from './FilterBar.module.css';
import type { StateRepMap, StateBudget } from '../../../../core/services/api';

interface FilterBarProps {
  stateRepMap: StateRepMap;
  budgets: StateBudget[];
  selectedRep: string;
  selectedState: string;
  onRepChange: (rep: string) => void;
  onStateChange: (state: string) => void;
}

function formatDollar(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export function FilterBar({
  stateRepMap,
  budgets,
  selectedRep,
  selectedState,
  onRepChange,
  onStateChange,
}: FilterBarProps) {
  // Derive unique reps from the map
  const reps = useMemo(() => {
    const repSet = new Set(Object.values(stateRepMap));
    return [...repSet].sort();
  }, [stateRepMap]);

  // Derive states — filtered by selected rep
  const states = useMemo(() => {
    const allStates = Object.keys(stateRepMap).sort();
    if (!selectedRep) return allStates;
    return allStates.filter((s) => stateRepMap[s] === selectedRep);
  }, [stateRepMap, selectedRep]);

  // Build budget lookup
  const budgetByState = useMemo(() => {
    const map: Record<string, StateBudget> = {};
    for (const b of budgets) map[b.state] = b;
    return map;
  }, [budgets]);

  // Summary data
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
        growthTarget: b.growthTarget,
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
        growthTarget: null,
      };
    }
    return null;
  }, [selectedRep, selectedState, budgets, budgetByState]);

  const handleRepChange = (rep: string) => {
    onRepChange(rep);
    if (rep && selectedState && stateRepMap[selectedState] !== rep) {
      onStateChange('');
    }
  };

  const hasActiveFilters = selectedRep || selectedState;

  return (
    <div className={styles.filterWrapper}>
      <div className={styles.filterBar}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Rep</label>
          <select
            className={`${styles.filterSelect} ${selectedRep ? styles.filterActive : ''}`}
            value={selectedRep}
            onChange={(e) => handleRepChange(e.target.value)}
            id="filter-rep"
          >
            <option value="">All Reps</option>
            {reps.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>State</label>
          <select
            className={`${styles.filterSelect} ${selectedState ? styles.filterActive : ''}`}
            value={selectedState}
            onChange={(e) => onStateChange(e.target.value)}
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
            onClick={() => { onRepChange(''); onStateChange(''); }}
            title="Clear all filters"
          >
            ✕
          </button>
        )}
      </div>

      {/* Summary Banner */}
      {summary && (
        <div className={styles.summaryBanner}>
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
                      onClick={() => onStateChange(s === selectedState ? '' : s)}
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
            {summary.growthTarget != null && (
              <span className={`${styles.growthBadge} ${summary.growthTarget >= 0 ? styles.growthPositive : styles.growthNegative}`}>
                {summary.growthTarget >= 0 ? '+' : ''}{(summary.growthTarget * 100).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
