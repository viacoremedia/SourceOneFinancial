/**
 * useRollingAvg — Fetches network-level rolling averages.
 * Accepts windowSize (7|30), optional targetStates, statusFilter, and activityMode.
 * Refetches when params change.
 */

import { useState, useEffect, useRef } from 'react';
import { getRollingAverages } from '../../../core/services/api';
import type { NetworkRollingAvgResponse, RollingWindow } from '../types';

interface UseRollingAvgResult {
  data: NetworkRollingAvgResponse | null;
  isLoading: boolean;
  error: string | null;
}

export function useRollingAvg(
  windowSize: RollingWindow,
  targetStates?: string[],
  statusFilter?: string[],
  activityMode?: string
): UseRollingAvgResult {
  const [data, setData] = useState<NetworkRollingAvgResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable ref for states to avoid refetch on array identity change
  const statesKey = targetStates ? targetStates.sort().join(',') : '';
  const statusKey = statusFilter ? statusFilter.sort().join(',') : '';
  const modeKey = activityMode || 'application';
  const prevKeyRef = useRef('');

  useEffect(() => {
    const key = `${windowSize}:${statesKey}:${statusKey}:${modeKey}`;
    // Skip if params haven't actually changed
    if (key === prevKeyRef.current && data) return;
    prevKeyRef.current = key;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getRollingAverages(windowSize, targetStates, statusFilter, activityMode)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to fetch rolling averages:', err);
          setError(err.message || 'Failed to load rolling averages');
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSize, statesKey, statusKey, modeKey]);

  return { data, isLoading, error };
}
