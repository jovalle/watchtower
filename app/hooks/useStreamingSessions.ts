import { useState, useEffect, useCallback, useRef } from "react";
import type { PlexActiveSession } from "~/lib/plex/types";

interface UseStreamingSessionsOptions {
  /** Polling interval in milliseconds. Default: 5000 (5 seconds) */
  pollInterval?: number;
  /** Whether polling is enabled. Default: true */
  enabled?: boolean;
}

interface StreamingSessionsState {
  /** Array of active sessions */
  sessions: PlexActiveSession[];
  /** Loading state for initial fetch */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Last successful update timestamp */
  lastUpdated: Date | null;
  /** Manual refresh function */
  refresh: () => void;
}

/**
 * Hook for fetching and polling active Plex streaming sessions.
 *
 * Features:
 * - Automatic polling at configurable interval
 * - Pauses polling when tab is not visible
 * - Manual refresh capability
 * - Loading and error state management
 */
export function useStreamingSessions(
  options: UseStreamingSessionsOptions = {}
): StreamingSessionsState {
  const { pollInterval = 5000, enabled = true } = options;

  const [sessions, setSessions] = useState<PlexActiveSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Track if component is mounted to prevent state updates after unmount
  const isMounted = useRef(true);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/plex/sessions");

      if (!isMounted.current) return;

      if (!response.ok) {
        throw new Error(`Failed to fetch sessions: ${response.status}`);
      }

      const data = await response.json();
      setSessions(data.sessions || []);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (!isMounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Manual refresh function
  const refresh = useCallback(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Initial fetch and polling setup
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    isMounted.current = true;

    // Initial fetch
    fetchSessions();

    // Set up polling with visibility check
    let intervalId: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = setInterval(() => {
        // Only poll if tab is visible
        if (document.visibilityState === "visible") {
          fetchSessions();
        }
      }, pollInterval);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Immediately fetch when tab becomes visible
        fetchSessions();
        startPolling();
      } else {
        stopPolling();
      }
    };

    // Start polling if tab is visible
    if (document.visibilityState === "visible") {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted.current = false;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, pollInterval, fetchSessions]);

  return {
    sessions,
    isLoading,
    error,
    lastUpdated,
    refresh,
  };
}
