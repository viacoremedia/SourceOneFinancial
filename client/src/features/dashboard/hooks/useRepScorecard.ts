/**
 * useRepScorecard — Fetches per-rep rolling averages, dealer counts, and churn.
 * Only fetches when `enabled` is true (lazy loading — drawer must be open).
 * Accepts optional statusFilter and activityMode.
 */

import { useState, useEffect, useRef } from 'react';
import { getRepScorecard } from '../../../core/services/api';
import type { RepScorecardResponse, RollingWindow } from '../types';

interface UseRepScorecardResult {
  data: RepScorecardResponse | null;
  isLoading: boolean;
  error: string | null;
}

export function useRepScorecard(
  windowSize: RollingWindow,
  enabled: boolean,
  statusFilter?: string[],
  activityMode?: string
): UseRepScorecardResult {
  const [data, setData] = useState<RepScorecardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevKeyRef = useRef('');

  const statusKey = statusFilter ? statusFilter.sort().join(',') : '';
  const modeKey = activityMode || 'application';

  useEffect(() => {
    if (!enabled) return;

    const key = `${windowSize}:${statusKey}:${modeKey}`;
    if (key === prevKeyRef.current && data) return;
    prevKeyRef.current = key;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getRepScorecard(windowSize, statusFilter, activityMode)
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
  }, [windowSize, enabled, statusKey, modeKey]);

  return { data, isLoading, error };
}
