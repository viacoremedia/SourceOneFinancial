import { useState, useEffect, useCallback } from 'react';
import { getGroups, getGroupLocations } from '../../../core/services/api';
import type { DealerGroup, DealerLocation } from '../types';

export function useDealerGroups() {
  const [groups, setGroups] = useState<DealerGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getGroups();
      setGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dealer groups');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { groups, isLoading, error, refetch: fetch };
}

export function useGroupLocations(slug: string | null) {
  const [locations, setLocations] = useState<DealerLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!slug) return;
    setIsLoading(true);
    setError(null);
    try {
      const { locations: locs } = await getGroupLocations(slug);
      setLocations(locs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locations');
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { locations, isLoading, error, refetch: fetch };
}
