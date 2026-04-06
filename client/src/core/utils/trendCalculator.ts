/**
 * Trend calculation utilities.
 * Computes percentage changes and formats trend indicators.
 */

import type { TrendResult } from '../../features/dashboard/types';

/**
 * Compute the percentage change between a current and previous value.
 * Returns null if either value is null/undefined or previous is zero.
 */
export function computePercentChange(
  current: number | null | undefined,
  previous: number | null | undefined
): number | null {
  if (current == null || previous == null) return null;
  if (previous === 0) {
    // If current is also 0, flat. If current > 0, treat as 100% increase.
    if (current === 0) return 0;
    return current > 0 ? 100 : -100;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Format a percent change into a TrendResult with direction and label.
 */
export function formatTrend(percentChange: number | null): TrendResult {
  if (percentChange == null) {
    return { value: null, direction: null, label: '—' };
  }

  const rounded = Math.round(percentChange * 10) / 10;
  const absValue = Math.abs(rounded);

  if (rounded > 0.5) {
    return {
      value: rounded,
      direction: 'up',
      label: `↑ ${absValue}%`,
    };
  }

  if (rounded < -0.5) {
    return {
      value: rounded,
      direction: 'down',
      label: `↓ ${absValue}%`,
    };
  }

  return {
    value: rounded,
    direction: 'flat',
    label: `${absValue}%`,
  };
}

/**
 * Determine if a trend direction is "good" or "bad" for a specific metric.
 * For most metrics, "up" is good. But for "days since" metrics, "down" is good
 * (fewer days = more active).
 */
export function isTrendPositive(
  direction: 'up' | 'down' | 'flat' | null,
  invertedMetric = false
): boolean | null {
  if (direction == null || direction === 'flat') return null;
  if (invertedMetric) {
    return direction === 'down'; // Lower is better
  }
  return direction === 'up'; // Higher is better
}
