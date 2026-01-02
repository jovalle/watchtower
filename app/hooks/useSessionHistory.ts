import { useState, useCallback, useRef } from "react";
import type { PlexMediaItem } from "~/lib/plex/types";

interface UseSessionHistoryOptions {
  /** Number of history items to fetch per page. Default: 10, max: 50 */
  pageSize?: number;
}

interface SessionHistoryState {
  /** Array of recently viewed items (accumulated from all pages) */
  history: PlexMediaItem[];
  /** Loading state for initial fetch */
  isLoading: boolean;
  /** Loading state for loading more items */
  isLoadingMore: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether history has been fetched at least once */
  hasFetched: boolean;
  /** Whether there are more items to load */
  hasMore: boolean;
  /** Initial fetch/refresh function (resets and loads first page) */
  refresh: () => void;
  /** Load more items (appends to existing) */
  loadMore: () => void;
}

/**
 * Hook for fetching Plex session history (recently watched items).
 *
 * Features:
 * - Lazy loading: Initial fetch triggered via refresh()
 * - Infinite scroll: Load more via loadMore()
 * - No polling (history is static, user can refresh manually)
 */
export function useSessionHistory(
  options: UseSessionHistoryOptions = {}
): SessionHistoryState {
  const { pageSize = 10 } = options;

  const [history, setHistory] = useState<PlexMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Track current offset for pagination
  const offsetRef = useRef(0);
  // Track if component is mounted
  const isMounted = useRef(true);

  const fetchHistory = useCallback(async (offset: number, append: boolean) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(
        `/api/plex/sessions/history?limit=${pageSize}&offset=${offset}`
      );

      if (!isMounted.current) return;

      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.status}`);
      }

      const data = await response.json();
      const items: PlexMediaItem[] = data.history || [];

      if (append) {
        setHistory(prev => [...prev, ...items]);
      } else {
        setHistory(items);
      }

      setHasMore(data.hasMore ?? items.length === pageSize);
      offsetRef.current = offset + items.length;
      setHasFetched(true);
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to fetch history");
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [pageSize]);

  // Refresh: Reset and load first page
  const refresh = useCallback(() => {
    offsetRef.current = 0;
    setHasMore(true);
    fetchHistory(0, false);
  }, [fetchHistory]);

  // Load more: Append next page
  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      fetchHistory(offsetRef.current, true);
    }
  }, [fetchHistory, isLoadingMore, hasMore]);

  return {
    history,
    isLoading,
    isLoadingMore,
    error,
    hasFetched,
    hasMore,
    refresh,
    loadMore,
  };
}
