/**
 * useInfiniteScroll — Detects when user scrolls near the bottom of a container.
 * Calls `onLoadMore` when threshold is reached and `hasMore` is true.
 */

import { useEffect, useRef, useCallback } from 'react';

interface UseInfiniteScrollOptions {
  /** Whether more data is available to load */
  hasMore: boolean;
  /** Whether a load is currently in progress */
  isLoading: boolean;
  /** Callback to load more data */
  onLoadMore: () => void;
  /** Pixels from bottom to trigger load (default: 200) */
  threshold?: number;
}

export function useInfiniteScroll({
  hasMore,
  isLoading,
  onLoadMore,
  threshold = 200,
}: UseInfiniteScrollOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // Prevent duplicate calls during the same scroll frame
  loadingRef.current = isLoading;

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || !hasMore || loadingRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < threshold) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore, threshold]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return containerRef;
}
