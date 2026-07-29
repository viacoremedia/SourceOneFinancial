import { useState, useEffect, useCallback, useRef } from 'react';
import { getGroups, getGroupLocations } from '../../../core/services/api';
import type { DealerGroup, DealerLocation } from '../types';

export function useDealerGroups(
  states?: string[],
  activityMode?: string,
  startDate?: string,
  endDate?: string,
  trend?: string,
  status?: string | null,
  rep?: string
) {
  const [groups, setGroups] = useState<DealerGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // Immutable serialization for stable dependency tracking
  const statesKey = states && states.length > 0 ? [...states].sort().join(',') : '';
  const modeKey = activityMode || 'application';

  const fetch = useCallback(async () => {
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getGroups(
        states && states.length > 0 ? states : undefined,
        activityMode,
        startDate,
        endDate,
        trend,
        status,
        rep
      );
      // Discard stale out-of-order responses
      if (currentRequestId === requestIdRef.current) {
        setGroups(data);
        setIsLoading(false);
      }
    } catch (err) {
      if (currentRequestId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load dealer groups');
        setIsLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesKey, modeKey, startDate, endDate, trend, status, rep]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { groups, isLoading, error, refetch: fetch };
}

export function useGroupLocations(
  slug: string | null,
  startDate?: string,
  endDate?: string,
  trend?: string
) {
  const [locations, setLocations] = useState<DealerLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetch = useCallback(async () => {
    if (!slug) return;
    const currentRequestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const { locations: locs } = await getGroupLocations(slug, startDate, endDate, trend);
      if (currentRequestId === requestIdRef.current) {
        setLocations(locs);
        setIsLoading(false);
      }
    } catch (err) {
      if (currentRequestId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load locations');
        setIsLoading(false);
      }
    }
  }, [slug, startDate, endDate, trend]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { locations, isLoading, error, refetch: fetch };
}
