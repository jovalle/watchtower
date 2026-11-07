/**
 * MovieSelector — Modal for searching and adding movies from the Plex catalog.
 *
 * Tabs: Recent | Top Rated | Catalog (alphabetical)
 * Persistent search bar at the bottom for filtering/searching across tabs.
 * All tabs support infinite scroll.
 */

import { usePageScrollLock } from "~/hooks/usePageScrollLock";
import { useState, useEffect, useRef, useCallback } from "react";
import { buttonStyles } from "~/components/ui";
import { useFetcher } from "@remix-run/react";

interface SearchResult {
  ratingKey: string;
  title: string;
  year?: number;
  posterUrl: string;
  summary?: string;
}

interface MovieSelectorProps {
  showingId: string;
  currentPicks: number;
  maxPicks: number;
  /** ratingKeys already in the showing (to disable "Add" on duplicates) */
  existingKeys: Set<string>;
  onClose: () => void;
  onMovieAdded: () => void;
}

type Tab = "recent" | "top" | "catalog";

const PAGE_SIZE = 30;

export function MovieSelector({
  showingId,
  currentPicks,
  maxPicks,
  existingKeys,
  onClose,
  onMovieAdded,
}: MovieSelectorProps) {
  const [tab, setTab] = useState<Tab>("recent");
  const [query, setQuery] = useState("");
  const searchFetcher = useFetcher<{ results?: SearchResult[]; error?: string }>();
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const [hideAdded, setHideAdded] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const addingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    closeButtonRef.current?.focus();
    return () => dialog?.close();
  }, []);

  // Infinite scroll state
  const [allResults, setAllResults] = useState<SearchResult[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchCount = useRef(0);

  // Track which tab+query the fetcher data belongs to
  const currentFetchKey = useRef("");

  usePageScrollLock(true);

  // Compute effective picks
  const newLocalAdds = [...justAdded].filter(
    (k) => !existingKeys.has(k)
  ).length;
  const effectivePicks = currentPicks + newLocalAdds;
  const atLimit = effectivePicks >= maxPicks;

  // Build the URL for a given tab/query/offset
  const buildUrl = useCallback((t: Tab, q: string, off: number) => {
    if (q.length >= 2) {
      return `/api/vote/search?q=${encodeURIComponent(
        q
      )}&offset=${off}&limit=${PAGE_SIZE}`;
    }
    if (t === "recent")
      return `/api/vote/search?list=recent&offset=${off}&limit=${PAGE_SIZE}`;
    if (t === "top")
      return `/api/vote/search?list=top&offset=${off}&limit=${PAGE_SIZE}`;
    return `/api/vote/search?list=catalog&offset=${off}&limit=${PAGE_SIZE}`;
  }, []);

  // Reset and fetch first page when tab or query changes
  useEffect(() => {
    const key = `${tab}:${query}`;
    currentFetchKey.current = key;
    setAllResults([]);
    setHasMore(query.length !== 1);
    setLoadingMore(false);

    if (query.length >= 2 || query.length === 0) {
      fetchCount.current++;
      searchFetcher.load(buildUrl(tab, query, 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Debounced search when query changes
  useEffect(() => {
    if (query.length === 1) {
      setAllResults([]);
      setHasMore(false);
      setLoadingMore(false);
    } else if (query.length >= 2) {
      const timer = setTimeout(() => {
        const key = `${tab}:${query}`;
        currentFetchKey.current = key;
        setAllResults([]);
        setHasMore(true);
        setLoadingMore(false);
        fetchCount.current++;
        searchFetcher.load(buildUrl(tab, query, 0));
      }, 300);
      return () => clearTimeout(timer);
    } else if (query.length === 0) {
      // Cleared search — refetch current tab
      const key = `${tab}:`;
      currentFetchKey.current = key;
      setAllResults([]);
      setHasMore(true);
      setLoadingMore(false);
      fetchCount.current++;
      searchFetcher.load(buildUrl(tab, "", 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Process fetcher results — use fetchCount to detect new responses
  const lastProcessedCount = useRef(0);
  useEffect(() => {
    if (searchFetcher.state !== "idle" || !searchFetcher.data || query.length === 1 || currentFetchKey.current !== `${tab}:${query}`) return;
    // Only process if this is a new response
    if (lastProcessedCount.current === fetchCount.current && !loadingMore)
      return;
    lastProcessedCount.current = fetchCount.current;

    const newResults = searchFetcher.data.results ?? [];

    if (loadingMore) {
      // Appending to existing results
      setAllResults((prev) => {
        const existingSet = new Set(prev.map((r) => r.ratingKey));
        const unique = newResults.filter((r) => !existingSet.has(r.ratingKey));
        return [...prev, ...unique];
      });
    } else {
      // Fresh load (tab change or search)
      setAllResults(newResults);
    }
    setHasMore(newResults.length >= PAGE_SIZE);
    setLoadingMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFetcher.data, searchFetcher.state]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          query.length !== 1 &&
          currentFetchKey.current === `${tab}:${query}` &&
          hasMore &&
          !loadingMore &&
          searchFetcher.state === "idle"
        ) {
          const nextOffset = allResults.length;
          setLoadingMore(true);
          fetchCount.current++;
          searchFetcher.load(buildUrl(tab, query, nextOffset));
        }
      },
      { root: scrollRef.current, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasMore,
    loadingMore,
    allResults.length,
    tab,
    query,
    searchFetcher.state,
  ]);

  const isLoading =
    query.length !== 1 && searchFetcher.state === "loading" && allResults.length === 0;

  const handleAdd = async (movie: SearchResult) => {
    if (atLimit || addingRef.current || existingKeys.has(movie.ratingKey) || justAdded.has(movie.ratingKey)) return;
    addingRef.current = true;
    setAdding(movie.ratingKey);
    setError(null);
    try {
      const response = await fetch("/api/vote/movies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showingId,
          ratingKey: movie.ratingKey,
          title: movie.title,
          year: movie.year,
          posterUrl: movie.posterUrl,
          summary: movie.summary,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not add this movie. Try again.");
      setJustAdded((prev) => new Set(prev).add(movie.ratingKey));
      onMovieAdded();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add this movie. Try again.");
    } finally {
      addingRef.current = false;
      setAdding(null);
    }
  };

  const displayResults = hideAdded
    ? allResults.filter(
        (m) => !existingKeys.has(m.ratingKey) && !justAdded.has(m.ratingKey)
      )
    : allResults;

  const tabs: { key: Tab; label: string }[] = [
    { key: "recent", label: "Recent" },
    { key: "top", label: "Top Rated" },
    { key: "catalog", label: "Catalog" },
  ];

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-0 hidden h-dvh max-h-none w-screen max-w-none items-end justify-center border-0 bg-black/80 p-0 text-foreground-primary open:flex sm:items-start sm:pt-[8vh] [@media(max-height:480px)]:!pt-0"
      onCancel={onClose}
      aria-label="Add Movie"
    >
      <button type="button" tabIndex={-1} aria-label="Dismiss Add Movie" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        className="relative w-full sm:max-w-2xl h-[85dvh] sm:h-auto sm:max-h-[80dvh] overflow-hidden rounded-t-xl sm:rounded-xl border border-white/10 bg-background-primary shadow-2xl flex flex-col animate-slideUp [@media(max-height:480px)]:!h-dvh [@media(max-height:480px)]:!max-h-dvh"
      >
        {/* Header */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 [@media(max-height:480px)]:py-1">
          <div>
            <h2 className="text-lg font-semibold text-foreground-primary">
              Add Movie
            </h2>
            <p className="text-xs text-foreground-muted">
              Your picks: {effectivePicks}
              {maxPicks < Infinity ? `/${maxPicks}` : ""}
              {atLimit && " — Remove or watch a movie to free a slot"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex min-h-11 items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideAdded}
                onChange={(e) => setHideAdded(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-white/30 bg-white/5 text-accent-primary focus:ring-accent-primary focus:ring-offset-0"
              />
              <span className="text-xs text-foreground-muted">Hide Added</span>
            </label>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Close Add Movie"
              className={buttonStyles({ variant: "ghost", size: "sm" })}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-white/10">
          {tabs.map((t) => (
            <button
              key={t.key}
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`min-h-11 flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? "text-accent-primary border-b-2 border-accent-primary"
                  : "text-foreground-muted hover:text-foreground-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Results grid with infinite scroll */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-5 [@media(max-height:480px)]:py-2">
          {(error || searchFetcher.data?.error) && <p role="alert" className="mb-4 text-sm text-red-300">{error || searchFetcher.data?.error}</p>}
          {isLoading ? (
            <div role="status" aria-label="Loading Movies" className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
            </div>
          ) : displayResults.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {displayResults.map((movie: SearchResult) => {
                const alreadyAdded =
                  existingKeys.has(movie.ratingKey) ||
                  justAdded.has(movie.ratingKey);
                return (
                  <div key={movie.ratingKey} className="group relative">
                    <div className="aspect-[2/3] overflow-hidden rounded-md bg-white/5">
                      {movie.posterUrl ? (
                        <img
                          src={movie.posterUrl}
                          alt={movie.title}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-foreground-muted p-2 text-center">
                          {movie.title}
                        </div>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs font-medium text-foreground-primary truncate">
                      {movie.title}
                    </p>
                    {movie.year && (
                      <p className="text-xs text-foreground-muted">
                        {movie.year}
                      </p>
                    )}
                    <button
                      onClick={() => handleAdd(movie)}
                      disabled={atLimit || alreadyAdded || adding !== null}
                      className={buttonStyles({ size: "sm", variant: alreadyAdded || atLimit ? "ghost" : "primary", className: "mt-1 w-full !px-1" })}
                    >
                      {adding === movie.ratingKey ? "Adding..." : alreadyAdded ? "Added" : atLimit ? "Limit" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-foreground-muted">
              {query.length >= 1 && query.length < 2
                ? "Type at least 2 characters to search"
                : "No Movies Found"}
            </p>
          )}
          {/* Infinite scroll sentinel */}
          {hasMore && displayResults.length > 0 && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingMore && (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
              )}
            </div>
          )}
        </div>

        {/* Persistent search bar at bottom */}
        <div className="shrink-0 border-t border-white/10 px-5 py-3 [@media(max-height:480px)]:py-1">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              aria-label="Search Movies"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movies..."
              className="w-full rounded-lg border border-white/20 bg-white/5 pl-9 pr-14 py-3 text-sm text-foreground-primary placeholder:text-foreground-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear Search"
                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-foreground-secondary hover:text-foreground-primary"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
