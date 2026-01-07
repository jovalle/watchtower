/**
 * Watchlist page - Shows user's watchlist from multiple sources.
 * GET /app/watchlist
 *
 * Supports Plex, Trakt, and IMDB watchlists with client-side filtering and sorting.
 * Uses stale-while-revalidate caching for fast loading.
 */

import { useState, useCallback, useMemo, useRef, useEffect, Suspense } from 'react';
import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/node';
import { json, defer } from '@remix-run/node';
import { useLoaderData, useFetcher, useNavigate, Await } from '@remix-run/react';
import {
  ListVideo,
  SortAsc,
  RefreshCw,
  Loader2,
  Film,
  Tv,
} from 'lucide-react';
import { Container } from '~/components/layout';
import { PosterCard } from '~/components/media/PosterCard';
import { Typography, FilterDropdown } from '~/components/ui';
import type { FilterOption } from '~/components/ui';
import { requireServerToken, requirePlexToken } from '~/lib/auth/session.server';
import { requireUser } from '~/lib/auth/user.server';
import { PlexClient } from '~/lib/plex/client.server';
import { createTraktClient, isTraktAvailable } from '~/lib/trakt/client.server';
import { createTMDBClient } from '~/lib/tmdb/client.server';
import { getUnifiedWatchlist } from '~/lib/watchlist/service.server';
import { getWatchlistCache, setWatchlistCache } from '~/lib/watchlist/cache.server';
import { getUserSettings } from '~/lib/settings/storage.server';
import { env } from '~/lib/env.server';
import { PLEX_DISCOVER_URL } from '~/lib/plex/constants';
import type { WatchlistSource, WatchlistCounts, UnifiedWatchlistItem } from '~/lib/watchlist/types';

export const meta: MetaFunction = () => {
  return [
    { title: 'Watchlist | Watchtower' },
    { name: 'description', content: 'Your saved movies and shows from all sources' },
  ];
};

/** Data that may be deferred (loaded in background on first visit) */
interface WatchlistData {
  items: UnifiedWatchlistItem[];
  counts: WatchlistCounts;
  isStale: boolean;
  cachedAt: number;
}

/** Combined loader data - watchlistData may be a promise on first visit */
type LoaderData = {
  token: string;
  traktEnabled: boolean;
  imdbEnabled: boolean;
  watchlistData: WatchlistData;
};

type SortOption =
  | 'addedAt:desc'
  | 'addedAt:asc'
  | 'title:asc'
  | 'title:desc'
  | 'score:desc'
  | 'score:asc'
  | 'year:desc'
  | 'year:asc';
type SourceFilterValue = 'all' | WatchlistSource;
type TypeFilterValue = 'all' | 'movie' | 'show';
type AvailabilityFilterValue = 'all' | 'available' | 'unavailable';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'addedAt:desc', label: 'Date Added' },
  { value: 'title:asc', label: 'Alphabetical' },
  { value: 'score:desc', label: 'Audience Score' },
  { value: 'year:desc', label: 'Release Date' },
];

/**
 * Build image URL for Plex items with proper sizing for crisp display.
 * For relative paths, uses Plex Discover API directly.
 * For absolute URLs (including HTTP with IP addresses), uses the local proxy
 * to avoid mixed content issues when serving over HTTPS.
 */
function buildPlexImageUrl(thumb: string | undefined, token: string): string {
  if (!thumb) return '';
  // Standard poster dimensions (400x600 for 2:3 aspect ratio)
  const width = 400;
  const height = 600;
  // Relative paths starting with / go to Plex Discover API
  if (thumb.startsWith('/')) {
    return `${PLEX_DISCOVER_URL}${thumb}?X-Plex-Token=${token}&width=${width}&height=${height}`;
  }
  // Absolute URLs (http:// or https://) should be proxied to avoid mixed content
  if (thumb.startsWith('http://') || thumb.startsWith('https://')) {
    const separator = thumb.includes('?') ? '&' : '?';
    const pathWithDims = `${thumb}${separator}width=${width}&height=${height}`;
    return `/api/plex/image?path=${encodeURIComponent(pathWithDims)}`;
  }
  // Fallback for any other format
  return thumb;
}

/**
 * Get earliest addedAt timestamp from an item.
 */
function getEarliestAddedAt(item: UnifiedWatchlistItem): number {
  const timestamps = [item.addedAt.plex, item.addedAt.trakt, item.addedAt.imdb].filter(
    (t): t is number => t !== undefined,
  );
  return timestamps.length > 0 ? Math.min(...timestamps) : 0;
}

export async function loader({ request }: LoaderFunctionArgs) {
  // Get both tokens:
  // - serverToken: for accessing the local Plex server (library browsing)
  // - plexToken: for plex.tv cloud services (Discover API, watchlist)
  const serverToken = await requireServerToken(request);
  const plexToken = await requirePlexToken(request);
  const user = await requireUser(request);
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('refresh') === 'true';

  // Fetch per-user settings for Trakt/IMDB sources
  const userSettings = await getUserSettings(user.id);
  const traktUsername = userSettings?.traktUsername || null;
  const imdbWatchlistIds = userSettings?.imdbWatchlistIds || [];

  console.log(`[Watchlist] User ${user.id} settings: trakt=${traktUsername}, imdb=${imdbWatchlistIds.join(',') || 'none'}, forceRefresh=${forceRefresh}`);
  console.log(`[Watchlist] Token types - serverToken: ${serverToken?.substring(0, 8)}..., plexToken: ${plexToken?.substring(0, 8)}...`);

  // OPTIMIZATION: Check cache FIRST before expensive library lookups
  // If we have cached data, return it immediately for fast initial load
  // User can manually refresh to get updated availability status
  const cached = !forceRefresh ? await getWatchlistCache(plexToken) : null;

  // Trakt is enabled if client ID is configured AND user has set a username
  const traktEnabled = isTraktAvailable() && !!traktUsername;
  // IMDB is enabled if user has configured watchlist IDs
  const imdbEnabled = imdbWatchlistIds.length > 0;

  if (cached) {
    // Fast path: return cached data immediately without library lookup
    // Availability info may be stale but that's acceptable for fast initial load
    const items = [...cached.items].sort((a, b) => {
      const aTime = getEarliestAddedAt(a) || cached.cachedAt;
      const bTime = getEarliestAddedAt(b) || cached.cachedAt;
      return bTime - aTime;
    });

    return json({
      token: plexToken,
      traktEnabled,
      imdbEnabled,
      watchlistData: {
        items,
        counts: cached.counts,
        isStale: cached.isStale,
        cachedAt: cached.cachedAt,
      },
    } satisfies LoaderData);
  }

  // Slow path: No cache, need to fetch everything fresh
  // Use defer() to return immediately and load data in background
  const fetchWatchlistData = async (): Promise<WatchlistData> => {
    // Use serverToken for local library access
    const client = new PlexClient({
      serverUrl: env.PLEX_SERVER_URL,
      token: serverToken,
      clientId: env.PLEX_CLIENT_ID,
    });

    // Use plexToken for Discover API (watchlist) - this is the user's plex.tv token
    const discoverClient = new PlexClient({
      serverUrl: env.PLEX_SERVER_URL,
      token: plexToken,
      clientId: env.PLEX_CLIENT_ID,
    });

    // Normalize title for matching (lowercase, remove special chars)
    const normalizeTitle = (title: string) =>
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Build maps of local library items for quick lookup
    // Include watched status to determine if items can be removed from watchlist
    interface LocalItemData {
      ratingKey: string;
      thumb?: string;
      isWatched: boolean;
      type: 'movie' | 'show';
      audienceRating?: number; // Fallback rating from local Plex library
    }
    const localItemsByGuid = new Map<string, LocalItemData>();
    const localItemsByTitleYear = new Map<string, LocalItemData>();

    const librariesResult = await client.getLibraries();
    if (librariesResult.success) {
      for (const library of librariesResult.data) {
        if (library.type === 'movie' || library.type === 'show') {
          const itemsResult = await client.getLibraryItems(library.key, { limit: 1000 });
          if (itemsResult.success) {
            for (const item of itemsResult.data) {
              // Determine watched status:
              // - Movies: viewCount > 0 means watched
              // - Shows: viewedLeafCount >= leafCount means fully watched
              const isMovieWatched = library.type === 'movie' && (item.viewCount ?? 0) > 0;
              const isShowWatched =
                library.type === 'show' &&
                (item.leafCount ?? 0) > 0 &&
                (item.viewedLeafCount ?? 0) >= (item.leafCount ?? 0);

              const itemData: LocalItemData = {
                ratingKey: item.ratingKey,
                thumb: item.thumb,
                isWatched: isMovieWatched || isShowWatched,
                type: library.type as 'movie' | 'show',
                audienceRating: item.audienceRating,
              };
              localItemsByGuid.set(item.guid, itemData);
              if (item.title && item.year) {
                const titleYearKey = `${normalizeTitle(item.title)}:${item.year}`;
                localItemsByTitleYear.set(titleYearKey, itemData);
              }
            }
          }
        }
      }
    }

    // Fetch fresh data from all sources
    const traktClient = createTraktClient();
    const tmdbClient = createTMDBClient();

    // Use discoverClient (with plexToken) for Discover API, client (with serverToken) for local library
    const result = await getUnifiedWatchlist(
      discoverClient, // Client with plexToken for plex.tv Discover API
      plexToken,
      traktClient,
      tmdbClient,
      'all',
      (thumb, t) => {
        // Local library items use the image proxy
        if (thumb?.startsWith('/library/')) {
          return `/api/plex/image?path=${encodeURIComponent(thumb)}&width=400&height=600`;
        }
        // Remote Plex Discover items use the public API directly
        return buildPlexImageUrl(thumb, t);
      },
      localItemsByGuid,
      localItemsByTitleYear,
      { traktUsername, imdbWatchlistIds },
    );
    const rawItems = result.items;
    const counts = result.counts;
    const cachedAt = Math.floor(Date.now() / 1000);

    // Cache the result (user-specific, keyed by plexToken)
    await setWatchlistCache(plexToken, rawItems, counts);

    // Sort by addedAt descending by default
    const items = [...rawItems].sort((a, b) => {
      const aTime = getEarliestAddedAt(a) || cachedAt;
      const bTime = getEarliestAddedAt(b) || cachedAt;
      return bTime - aTime;
    });

    return {
      items,
      counts,
      isStale: false, // Fresh data is never stale
      cachedAt,
    };
  };

  // Return deferred response - page loads immediately, data streams in
  return defer({
    token: plexToken,
    traktEnabled,
    imdbEnabled,
    watchlistData: fetchWatchlistData(),
  });
}

/** Loading skeleton for watchlist */
function WatchlistSkeleton() {
  return (
    <Container className="py-6">
      {/* Header skeleton */}
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded bg-background-elevated" />
        <div className="h-6 w-48 animate-pulse rounded bg-background-elevated" />
      </div>

      {/* Filter bar skeleton */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="h-8 w-24 animate-pulse rounded bg-background-elevated" />
        <div className="h-8 w-24 animate-pulse rounded bg-background-elevated" />
        <div className="h-8 w-24 animate-pulse rounded bg-background-elevated" />
        <div className="h-8 w-32 animate-pulse rounded bg-background-elevated" />
      </div>

      {/* Loading message */}
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-accent-primary" />
        <Typography variant="subtitle" className="mb-2">
          Loading your watchlist...
        </Typography>
        <Typography variant="body" className="text-foreground-secondary">
          Fetching from Plex, Trakt, and IMDB
        </Typography>
      </div>
    </Container>
  );
}

/** Main watchlist content - receives resolved data */
function WatchlistContent({
  watchlistData,
  token: _token,
  traktEnabled,
  imdbEnabled,
}: {
  watchlistData: WatchlistData;
  token: string;
  traktEnabled: boolean;
  imdbEnabled: boolean;
}) {
  const fetcher = useFetcher<LoaderData>();
  const navigate = useNavigate();

  const { items, counts: _counts, isStale, cachedAt } = watchlistData;

  // Track refresh state from fetcher
  const isRefreshing = fetcher.state === 'loading';

  // Use fetcher data if available AND has items, otherwise use props
  // This prevents visual emptying if refresh returns empty results temporarily
  const effectiveItems = useMemo(() => {
    // While refreshing, always show current data (don't flash empty)
    if (isRefreshing) {
      return items;
    }
    // After refresh completes, prefer fetcher data if it has items
    const fetcherData = fetcher.data?.watchlistData;
    if (fetcherData && 'items' in fetcherData && fetcherData.items?.length) {
      return fetcherData.items;
    }
    // Fall back to props data
    return items;
  }, [fetcher.data, items, isRefreshing]);

  const effectiveIsStale = useMemo(() => {
    const fetcherData = fetcher.data?.watchlistData;
    if (fetcherData && 'isStale' in fetcherData) {
      return fetcherData.isStale;
    }
    return isStale;
  }, [fetcher.data, isStale]);

  const effectiveCachedAt = useMemo(() => {
    const fetcherData = fetcher.data?.watchlistData;
    if (fetcherData && 'cachedAt' in fetcherData) {
      return fetcherData.cachedAt;
    }
    return cachedAt;
  }, [fetcher.data, cachedAt]);

  // Client-side filters and sorting state (arrays for multi-select)
  const [sourceFilters, setSourceFilters] = useState<SourceFilterValue[]>(['all']);
  const [typeFilters, setTypeFilters] = useState<TypeFilterValue[]>(['all']);
  const [availabilityFilters, setAvailabilityFilters] = useState<AvailabilityFilterValue[]>(['all']);
  const [sortOption, setSortOption] = useState<SortOption>('addedAt:desc');

  // Progressive loading - show limited items initially for faster render
  const INITIAL_DISPLAY_COUNT = 24; // 4-6 rows depending on screen size
  const LOAD_MORE_COUNT = 24;
  const [displayedCount, setDisplayedCount] = useState(INITIAL_DISPLAY_COUNT);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Reset displayed count when filters change
  useEffect(() => {
    setDisplayedCount(INITIAL_DISPLAY_COUNT);
  }, [sourceFilters, typeFilters, availabilityFilters, sortOption]);

  // Infinite scroll - load more when sentinel is visible
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayedCount((prev) => prev + LOAD_MORE_COUNT);
        }
      },
      { rootMargin: '200px' } // Start loading before user reaches the bottom
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Handle manual refresh - use fetcher to load in background without navigation
  const handleRefresh = useCallback(() => {
    fetcher.load('/app/watchlist?refresh=true');
  }, [fetcher]);

  // Get addedAt with cachedAt as fallback
  const getItemAddedAt = useCallback(
    (item: UnifiedWatchlistItem): number => {
      const earliest = getEarliestAddedAt(item);
      return earliest || effectiveCachedAt;
    },
    [effectiveCachedAt],
  );

  // Client-side filtering and sorting
  const filteredAndSortedItems = useMemo(() => {
    let result = [...effectiveItems];

    // Filter by source (if not "all")
    if (!sourceFilters.includes('all')) {
      result = result.filter((item) =>
        sourceFilters.some((source) => item.sources.includes(source as WatchlistSource)),
      );
    }

    // Filter by type (if not "all")
    if (!typeFilters.includes('all')) {
      result = result.filter((item) => typeFilters.includes(item.type as TypeFilterValue));
    }

    // Filter by availability (if not "all")
    if (!availabilityFilters.includes('all')) {
      result = result.filter((item) => {
        if (availabilityFilters.includes('available') && item.isLocal) return true;
        if (availabilityFilters.includes('unavailable') && !item.isLocal) return true;
        return false;
      });
    }

    // Sort
    const [sortField, sortDir] = sortOption.split(':') as [string, 'asc' | 'desc'];
    result.sort((a, b) => {
      if (sortField === 'title') {
        const cmp = a.title.localeCompare(b.title);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      if (sortField === 'score') {
        const aScore = a.rating ?? 0;
        const bScore = b.rating ?? 0;
        return sortDir === 'asc' ? aScore - bScore : bScore - aScore;
      }
      if (sortField === 'year') {
        const aYear = a.year ?? 0;
        const bYear = b.year ?? 0;
        return sortDir === 'asc' ? aYear - bYear : bYear - aYear;
      }
      // Default: sort by addedAt
      const aTime = getItemAddedAt(a);
      const bTime = getItemAddedAt(b);
      return sortDir === 'asc' ? aTime - bTime : bTime - aTime;
    });

    return result;
  }, [effectiveItems, sourceFilters, typeFilters, availabilityFilters, sortOption, getItemAddedAt]);

  // Calculate dynamic counts for all filter groups based on current filter state
  // Each count shows how many items would match if that option were selected (given other filters)
  const dynamicCounts = useMemo(() => {
    // Helper to apply filters except the one we're calculating counts for
    const applyFilters = (
      skipFilter: 'source' | 'type' | 'availability',
      overrideSource?: SourceFilterValue[],
      overrideType?: TypeFilterValue[],
      overrideAvailability?: AvailabilityFilterValue[],
    ) => {
      let result = [...effectiveItems];

      // Apply source filter
      const effectiveSources = skipFilter === 'source' ? (overrideSource ?? ['all']) : sourceFilters;
      if (!effectiveSources.includes('all')) {
        result = result.filter((item) =>
          effectiveSources.some((source) => item.sources.includes(source as WatchlistSource)),
        );
      }

      // Apply type filter
      const effectiveTypes = skipFilter === 'type' ? (overrideType ?? ['all']) : typeFilters;
      if (!effectiveTypes.includes('all')) {
        result = result.filter((item) => effectiveTypes.includes(item.type as TypeFilterValue));
      }

      // Apply availability filter
      const effectiveAvailability =
        skipFilter === 'availability' ? (overrideAvailability ?? ['all']) : availabilityFilters;
      if (!effectiveAvailability.includes('all')) {
        result = result.filter((item) => {
          if (effectiveAvailability.includes('available') && item.isLocal) return true;
          if (effectiveAvailability.includes('unavailable') && !item.isLocal) return true;
          return false;
        });
      }

      return result;
    };

    // Source filter counts (apply type and availability filters, vary source)
    const sourceBase = applyFilters('source', ['all']);
    const sourceCounts = {
      all: sourceBase.length,
      plex: applyFilters('source', ['plex']).length,
      trakt: applyFilters('source', ['trakt']).length,
      imdb: applyFilters('source', ['imdb']).length,
    };

    // Type filter counts (apply source and availability filters, vary type)
    const typeBase = applyFilters('type', undefined, ['all']);
    const typeCounts = {
      all: typeBase.length,
      movies: applyFilters('type', undefined, ['movie']).length,
      shows: applyFilters('type', undefined, ['show']).length,
    };

    // Availability filter counts (apply source and type filters, vary availability)
    const availabilityBase = applyFilters('availability', undefined, undefined, ['all']);
    const availabilityCounts = {
      all: availabilityBase.length,
      available: applyFilters('availability', undefined, undefined, ['available']).length,
      unavailable: applyFilters('availability', undefined, undefined, ['unavailable']).length,
    };

    return { source: sourceCounts, type: typeCounts, availability: availabilityCounts };
  }, [effectiveItems, sourceFilters, typeFilters, availabilityFilters]);

  const handlePlay = (item: UnifiedWatchlistItem) => {
    if (!item.isLocal || !item.localRatingKey) {
      return;
    }
    if (item.type === 'movie') {
      navigate(`/app/watch/${item.localRatingKey}`);
    } else {
      navigate(`/app/media/${item.type}/${item.localRatingKey}`);
    }
  };

  const handleClick = (item: UnifiedWatchlistItem) => {
    if (item.isLocal && item.localRatingKey) {
      navigate(`/app/media/${item.type}/${item.localRatingKey}`);
    } else if (item.tmdbId) {
      // Open TMDB page for items not in the local library
      const tmdbType = item.type === 'movie' ? 'movie' : 'tv';
      window.open(`https://www.themoviedb.org/${tmdbType}/${item.tmdbId}`, '_blank');
    } else if (item.imdbId) {
      // Fallback to IMDB
      window.open(`https://www.imdb.com/title/${item.imdbId}`, '_blank');
    }
  };

  // Show score badges when sorting by score
  const showScoreBadges = sortOption === 'score:desc';

  // Build filter options with dynamic counts
  const sourceOptions = useMemo((): FilterOption<SourceFilterValue>[] => {
    const options: FilterOption<SourceFilterValue>[] = [
      { value: 'all', label: 'All', count: dynamicCounts.source.all },
      {
        value: 'plex',
        label: 'Plex',
        count: dynamicCounts.source.plex,
        icon: <span className="font-semibold text-mango">P</span>,
      },
    ];
    if (traktEnabled) {
      options.push({
        value: 'trakt',
        label: 'Trakt',
        count: dynamicCounts.source.trakt,
        icon: <span className="font-semibold text-red-500">T</span>,
      });
    }
    if (imdbEnabled) {
      options.push({
        value: 'imdb',
        label: 'IMDb',
        count: dynamicCounts.source.imdb,
        icon: <span className="font-semibold text-yellow-400">I</span>,
      });
    }
    return options;
  }, [dynamicCounts.source, traktEnabled, imdbEnabled]);

  const typeOptions = useMemo(
    (): FilterOption<TypeFilterValue>[] => [
      { value: 'all', label: 'All', count: dynamicCounts.type.all },
      {
        value: 'movie',
        label: 'Movies',
        count: dynamicCounts.type.movies,
        icon: <Film className="h-3.5 w-3.5" />,
      },
      {
        value: 'show',
        label: 'Shows',
        count: dynamicCounts.type.shows,
        icon: <Tv className="h-3.5 w-3.5" />,
      },
    ],
    [dynamicCounts.type],
  );

  const availabilityOptions = useMemo(
    (): FilterOption<AvailabilityFilterValue>[] => [
      { value: 'all', label: 'All', count: dynamicCounts.availability.all },
      {
        value: 'available',
        label: 'In Library',
        count: dynamicCounts.availability.available,
        icon: <span className="h-2 w-2 rounded-full bg-green-500" />,
      },
      {
        value: 'unavailable',
        label: 'Not in Library',
        count: dynamicCounts.availability.unavailable,
        icon: <span className="h-2 w-2 rounded-full bg-red-500" />,
      },
    ],
    [dynamicCounts.availability],
  );

  // Check if any filters are active (not "all")
  const hasActiveFilters =
    !sourceFilters.includes('all') ||
    !typeFilters.includes('all') ||
    !availabilityFilters.includes('all');

  return (
    <Container size="wide" className="py-8">
      {/* Header with title and controls */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Typography variant="title" as="h1">
            Watchlist
          </Typography>
          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle bg-background-elevated text-foreground-secondary transition-colors hover:bg-background-hover hover:text-foreground-primary disabled:opacity-50"
            title={isRefreshing ? 'Refreshing...' : 'Refresh watchlist'}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Source filter dropdown */}
          <FilterDropdown
            label="Source"
            options={sourceOptions}
            selected={sourceFilters}
            onChange={setSourceFilters}
            allValue="all"
          />

          {/* Type filter dropdown */}
          <FilterDropdown
            label="Type"
            options={typeOptions}
            selected={typeFilters}
            onChange={setTypeFilters}
            allValue="all"
          />

          {/* Availability filter dropdown */}
          <FilterDropdown
            label="Availability"
            options={availabilityOptions}
            selected={availabilityFilters}
            onChange={setAvailabilityFilters}
            allValue="all"
          />

          {/* Sort dropdown */}
          {effectiveItems.length > 0 && (
            <div className="flex items-center gap-1.5">
              <SortAsc className="h-4 w-4 text-foreground-secondary" />
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="rounded-md border border-border-subtle bg-background-elevated px-3 py-1.5 text-sm text-foreground-primary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {filteredAndSortedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ListVideo className="mb-4 h-16 w-16 text-foreground-muted" />
          <Typography variant="subtitle" className="mb-2">
            {effectiveItems.length === 0 ? 'Your watchlist is empty' : 'No items match your filters'}
          </Typography>
          <Typography variant="body" className="max-w-md text-foreground-secondary">
            {effectiveItems.length === 0
              ? 'Click the + button on any movie or show to add it to your watchlist.'
              : 'Try adjusting your filters to see more items.'}
          </Typography>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <Typography variant="caption" className="text-foreground-muted">
              {filteredAndSortedItems.length}{' '}
              {filteredAndSortedItems.length === 1 ? 'item' : 'items'}
              {hasActiveFilters && ` (filtered from ${effectiveItems.length})`}
            </Typography>
            {effectiveIsStale && !isRefreshing && (
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1 rounded-full bg-mango/10 px-2 py-0.5 text-xs text-mango transition-colors hover:bg-mango/20"
              >
                <RefreshCw className="h-3 w-3" />
                Update available
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredAndSortedItems.slice(0, displayedCount).map((item) => (
              <PosterCard
                key={item.id}
                ratingKey={item.localRatingKey}
                title={item.title}
                posterUrl={item.thumb}
                year={item.year?.toString()}
                onClick={() => handleClick(item)}
                onPlay={() => handlePlay(item)}
                hideHoverPlay={!item.isLocal}
                watchlistSources={item.sources}
                addedAt={getItemAddedAt(item)}
                isAvailable={item.isLocal}
                score={item.rating}
                showScore={showScoreBadges}
              />
            ))}
          </div>

          {/* Infinite scroll sentinel - triggers loading more items */}
          {displayedCount < filteredAndSortedItems.length && (
            <div
              ref={loadMoreRef}
              className="mt-8 flex items-center justify-center py-4"
            >
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
              <span className="ml-3 text-sm text-foreground-muted">
                Loading more ({filteredAndSortedItems.length - displayedCount} remaining)
              </span>
            </div>
          )}
        </>
      )}

    </Container>
  );
}

/** Main page component - handles deferred data with Suspense */
export default function WatchlistPage() {
  const data = useLoaderData<typeof loader>();
  // Cast to the expected shape - loader returns either json or defer with same structure
  const { token, traktEnabled, imdbEnabled, watchlistData } = data as unknown as {
    token: string;
    traktEnabled: boolean;
    imdbEnabled: boolean;
    watchlistData: WatchlistData | Promise<WatchlistData>;
  };

  return (
    <Suspense fallback={<WatchlistSkeleton />}>
      <Await resolve={watchlistData}>
        {(resolvedData) => (
          <WatchlistContent
            watchlistData={resolvedData}
            token={token}
            traktEnabled={traktEnabled}
            imdbEnabled={imdbEnabled}
          />
        )}
      </Await>
    </Suspense>
  );
}
