/**
 * useRepScorecard — Fetches per-rep rolling averages, dealer counts, churn, and financials.
 * Only fetches when `enabled` is true (lazy loading — drawer must be open).
 * Accepts optional statusFilter, activityMode, and finPeriod.
 */

import { useState, useEffect, useRef } from 'react';
import { getRepScorecard } from '../../../core/services/api';
import type { RepScorecardResponse, RollingWindow, FinPeriod } from '../types';

interface UseRepScorecardResult {
  data: RepScorecardResponse | null;
  isLoading: boolean;
  error: string | null;
}

export function useRepScorecard(
  windowSize: RollingWindow,
  enabled: boolean,
  statusFilter?: string[],
  activityMode?: string,
  finPeriod?: FinPeriod
): UseRepScorecardResult {
  const [data, setData] = useState<RepScorecardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevKeyRef = useRef('');

  const statusKey = statusFilter && statusFilter.length > 0 ? [...statusFilter].sort().join(',') : '';
  const modeKey = activityMode || 'application';
  const finKey = finPeriod || 'mtd';

  useEffect(() => {
    if (!enabled) return;

    const key = `${windowSize}:${statusKey}:${modeKey}:${finKey}`;
    if (key === prevKeyRef.current && data) return;
    prevKeyRef.current = key;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getRepScorecard(windowSize, statusFilter, activityMode, finPeriod)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to fetch rep scorecard:', err);
          setError(err.message || 'Failed to load rep scorecard');
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSize, enabled, statusKey, modeKey, finKey]);

  return { data, isLoading, error };
}
