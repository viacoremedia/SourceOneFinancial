/**
 * Scorecard Reports Hooks
 * 
 * Clean React hooks for fetching paginated scorecard reports, tracking async generation,
 * polling in-flight jobs, and managing report archives without external query libraries.
 * 
 * @module features/dashboard/hooks/useScorecardReports
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getScorecardReports,
  getScorecardReport,
  generateScorecardReport,
  deleteScorecardReport,
  type GenerateScorecardReportPayload,
  type ScorecardReportsListResponse,
  type ScorecardReportItem,
} from '../../../core/services/api';

/**
 * Hook to fetch paginated report history with automatic polling for in-flight jobs
 */
export function useScorecardReportsList(page: number = 1, limit: number = 10, enabled: boolean = true) {
  const [data, setData] = useState<ScorecardReportsListResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReports = useCallback(async (isPolling: boolean = false) => {
    if (!enabled) return;
    if (!isPolling) setIsLoading(true);
    setError(null);

    try {
      const res = await getScorecardReports(page, limit);
      setData(res);
      setIsLoading(false);

      // Check if any report is still generating — if so, schedule poll in 2s
      const hasGenerating = res.reports?.some((r: ScorecardReportItem) => r.status === 'generating');
      if (hasGenerating) {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => {
          fetchReports(true);
        }, 2000);
      }
    } catch (err: any) {
      console.error('Failed to fetch scorecard reports:', err);
      setError(err?.message || 'Failed to fetch reports');
      setIsLoading(false);
    }
  }, [page, limit, enabled]);

  useEffect(() => {
    fetchReports(false);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [fetchReports]);

  return {
    data,
    isLoading,
    error,
    refetch: () => fetchReports(false),
  };
}

/**
 * Hook to fetch a single report and poll until generation is ready
 */
export function useScorecardReportDetail(reportId: string | null) {
  const [data, setData] = useState<{ success: boolean; report: ScorecardReportItem } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDetail = useCallback(async (isPolling: boolean = false) => {
    if (!reportId) {
      setData(null);
      return;
    }
    if (!isPolling) setIsLoading(true);
    setError(null);

    try {
      const res = await getScorecardReport(reportId);
      setData(res);
      setIsLoading(false);

      if (res.report?.status === 'generating') {
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        pollTimerRef.current = setTimeout(() => {
          fetchDetail(true);
        }, 1500);
      }
    } catch (err: any) {
      console.error('Failed to fetch scorecard report detail:', err);
      setError(err?.message || 'Failed to fetch report detail');
      setIsLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    fetchDetail(false);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [fetchDetail]);

  return {
    data,
    isLoading,
    error,
    refetch: () => fetchDetail(false),
  };
}

/**
 * Hook to generate a new batch of PDF reports
 */
export function useGenerateScorecardReport() {
  const [isPending, setIsPending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (payload: GenerateScorecardReportPayload) => {
    setIsPending(true);
    setError(null);
    try {
      const res = await generateScorecardReport(payload);
      setIsPending(false);
      return res;
    } catch (err: any) {
      setIsPending(false);
      setError(err?.message || 'Failed to generate report');
      throw err;
    }
  }, []);

  return {
    mutateAsync,
    isPending,
    error,
  };
}

/**
 * Hook to delete a report and purge associated PDF files
 */
export function useDeleteScorecardReport() {
  const [isPending, setIsPending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const mutateAsync = useCallback(async (reportId: string) => {
    setIsPending(true);
    setError(null);
    try {
      const res = await deleteScorecardReport(reportId);
      setIsPending(false);
      return res;
    } catch (err: any) {
      setIsPending(false);
      setError(err?.message || 'Failed to delete report');
      throw err;
    }
  }, []);

  return {
    mutateAsync,
    isPending,
    error,
  };
}
