/**
 * Authenticated home page - the main landing page for logged-in users.
 * Features a cinematic Billboard component for the hero section with real Plex data.
 */

import { useState, useCallback, useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import { Plus, ListX, X } from "lucide-react";
import { Billboard, MediaCard, MediaRow } from "~/components/media";
import { Container } from "~/components/layout";
import { ContextMenu, type ContextMenuItem } from "~/components/ui";
import { requirePlexToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { getCache, setCache, getUserCacheKey } from "~/lib/plex/cache.server";
import { env } from "~/lib/env.server";
import { createTMDBClient } from "~/lib/tmdb/client.server";
import type { PlexMediaItem } from "~/lib/plex/types";

export const meta: MetaFunction = () => {
  return [
    { title: "Home | Watchtower" },
    { name: "description", content: "Your personal streaming experience" },
  ];
};

interface MediaItemView {
  ratingKey: string;
  guid: string;
  title: string;
  year?: string;
  type: "movie" | "show" | "episode";
  backdropUrl: string;
  progress?: number;
  viewOffset?: number; // Resume position in milliseconds
  viewCount: number; // Number of times watched
  leafCount?: number; // Total episodes (TV shows only)
  viewedLeafCount?: number; // Watched episodes (TV shows only)
  duration?: string;
  rating?: string;
  summary?: string;
  isInWatchlist: boolean;
  logoUrl?: string; // Optional TMDB logo URL
  // For episodes
  showTitle?: string;
  seasonEpisode?: string;
  // For continue watching - indicates this is in progress
  isContinueWatching?: boolean;
}

interface BillboardData {
  ratingKey: string;
  title: string;
  type: "movie" | "show";
  backdropUrl: string;
  year?: string;
  rating?: string;
  duration?: string;
  summary?: string;
  logoUrl?: string;
}

interface LoaderData {
  billboardCandidates: BillboardData[];
  continueWatching: MediaItemView[];
  recentlyAdded: MediaItemView[];
}

// Use shared image URL helper
import { buildPlexImageUrl } from "~/lib/plex/images";

function formatRuntime(durationMs?: number): string | undefined {
  if (!durationMs) return undefined;
  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${remainingMinutes}m`;
}

function transformToView(
  item: PlexMediaItem,
  watchlistGuids: Set<string>,
  isContinueWatching = false,
  logoUrl?: string
): MediaItemView {
  const isEpisode = item.type === "episode";
  const progress =
    item.viewOffset && item.duration
      ? Math.floor((item.viewOffset / item.duration) * 100)
      : undefined;

  return {
    ratingKey: item.ratingKey,
    guid: item.guid,
    title: isEpisode ? item.grandparentTitle || item.title : item.title,
    year: item.year?.toString(),
    type: item.type as "movie" | "show" | "episode",
    backdropUrl: buildPlexImageUrl(item.art || item.grandparentThumb || item.thumb),
    progress,
    viewOffset: item.viewOffset,
    viewCount: item.viewCount ?? 0,
    leafCount: item.leafCount,
    viewedLeafCount: item.viewedLeafCount,
    duration: formatRuntime(item.duration),
    rating: item.contentRating,
    summary: item.summary,
    isInWatchlist: watchlistGuids.has(item.guid),
    logoUrl,
    showTitle: isEpisode ? item.grandparentTitle : undefined,
    seasonEpisode: isEpisode
      ? `S${item.parentIndex}:E${item.index}`
      : undefined,
    isContinueWatching,
  };
}

interface CachedHomeData {
  billboardCandidates: BillboardData[];
  continueWatching: MediaItemView[];
  recentlyAdded: MediaItemView[];
}

export async function loader({ request }: LoaderFunctionArgs) {
  const token = await requirePlexToken(request);
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

  // Try cache first for instant loading (user-specific cache key)
  const cacheKey = getUserCacheKey("home", token);
  const cached = !forceRefresh ? await getCache<CachedHomeData>(cacheKey) : null;

  if (cached && !cached.isStale) {
    // Fresh cache - return immediately
    return json<LoaderData>(cached.data);
  }

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  // If we have stale cache, return it immediately while fetching fresh data
  // For now, we'll just return stale data and let the next request get fresh
  if (cached) {
    // Return stale data - background refresh will happen on next navigation
    return json<LoaderData>(cached.data);
  }

  // Fetch data in parallel
  const [onDeckResult, recentlyAddedResult, watchlistResult] = await Promise.all([
    client.getOnDeck(10),
    client.getRecentlyAdded(undefined, 20),
    client.getWatchlist(),
  ]);

  // Build a set of GUIDs that are in watchlist for fast lookup
  const watchlistGuids = new Set(
    watchlistResult.success
      ? watchlistResult.data.map((item) => item.guid)
      : []
  );

  // Sort by lastViewedAt descending (most recently watched first) to match Plex app order
  const sortedOnDeck = onDeckResult.success
    ? [...onDeckResult.data].sort((a, b) => (b.lastViewedAt || 0) - (a.lastViewedAt || 0))
    : [];

  const continueWatching: MediaItemView[] = sortedOnDeck.map((item) =>
    transformToView(item, watchlistGuids, true)
  );

  const recentlyAdded: MediaItemView[] = recentlyAddedResult.success
    ? recentlyAddedResult.data
        .filter((item) => item.type === "movie" || item.type === "show")
        .map((item) => transformToView(item, watchlistGuids, false))
    : [];

  // Fetch logos for all items (continue watching + recently added)
  // Uses local caching to reduce TMDB API calls and bandwidth
  const tmdbClient = createTMDBClient();
  if (!tmdbClient) {
    console.log("[Logo] TMDB not configured - skipping logo fetch. Set TMDB_API_KEY in .env");
  }
  if (tmdbClient) {
    // Helper to fetch logo for an item (uses cache)
    const fetchLogo = async (item: MediaItemView) => {
      try {
        // For episodes, use the show title; for movies/shows, use the item title
        const titleForLookup = item.showTitle || item.title;
        const isShow = item.type === "show" || item.type === "episode";

        // Use cached methods - downloads and stores logos locally
        const logoUrl = isShow
          ? await tmdbClient.getCachedTVLogoUrl(titleForLookup, item.year ? parseInt(item.year) : undefined)
          : await tmdbClient.getCachedMovieLogoUrl(item.title, item.year ? parseInt(item.year) : undefined);

        if (logoUrl) {
          item.logoUrl = logoUrl;
        }
      } catch (error) {
        // Silently fail - logos are optional
        console.error(`[Logo] Failed to fetch logo for ${item.title}:`, error);
      }
    };

    // Fetch logos in parallel for both sections
    await Promise.all([
      ...continueWatching.map(fetchLogo),
      ...recentlyAdded.slice(0, 10).map(fetchLogo),
    ]);
  }

  // Build billboard candidates from watchlist items (in library) + recently added
  // This allows the hero to cycle through both
  const billboardCandidates: BillboardData[] = [];
  const seenRatingKeys = new Set<string>();

  // First, add watchlist items that are in our library (prioritize user's picks)
  for (const item of recentlyAdded) {
    if (item.isInWatchlist && item.backdropUrl && (item.type === "movie" || item.type === "show")) {
      if (!seenRatingKeys.has(item.ratingKey)) {
        seenRatingKeys.add(item.ratingKey);
        billboardCandidates.push({
          ratingKey: item.ratingKey,
          title: item.title,
          type: item.type as "movie" | "show",
          backdropUrl: item.backdropUrl,
          year: item.year,
          rating: item.rating,
          duration: item.duration,
          summary: item.summary,
          logoUrl: item.logoUrl,
        });
      }
    }
  }

  // Then add trending (recently added) items
  for (const item of recentlyAdded) {
    if (item.backdropUrl && (item.type === "movie" || item.type === "show")) {
      if (!seenRatingKeys.has(item.ratingKey)) {
        seenRatingKeys.add(item.ratingKey);
        billboardCandidates.push({
          ratingKey: item.ratingKey,
          title: item.title,
          type: item.type as "movie" | "show",
          backdropUrl: item.backdropUrl,
          year: item.year,
          rating: item.rating,
          duration: item.duration,
          summary: item.summary,
          logoUrl: item.logoUrl,
        });
      }
    }
  }

  // Limit to reasonable number for cycling
  const limitedCandidates = billboardCandidates.slice(0, 10);

  // Cache the data for future requests (user-specific)
  await setCache<CachedHomeData>(cacheKey, {
    billboardCandidates: limitedCandidates,
    continueWatching,
    recentlyAdded,
  });

  return json<LoaderData>({
    billboardCandidates: limitedCandidates,
    continueWatching,
    recentlyAdded,
  });
}

// Context menu state type
interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  item: MediaItemView | null;
}

export default function AppIndex() {
  const { billboardCandidates, continueWatching, recentlyAdded } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  // Billboard cycling state
  const [billboardIndex, setBillboardIndex] = useState(0);
  const [isBillboardHovered, setIsBillboardHovered] = useState(false);
  const billboard = billboardCandidates[billboardIndex] || null;

  // Cycle through billboard candidates every 10 seconds (pauses when hovered)
  useEffect(() => {
    if (billboardCandidates.length <= 1) return;
    if (isBillboardHovered) return; // Don't cycle when hovered

    const interval = setInterval(() => {
      setBillboardIndex((prev) => (prev + 1) % billboardCandidates.length);
    }, 10000);

    return () => clearInterval(interval);
  }, [billboardCandidates.length, isBillboardHovered]);

  // Revalidate when page becomes visible (returning from video player)
  // This ensures Continue Watching updates after watching something
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        revalidator.revalidate();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [revalidator]);

  // Local state for optimistic updates
  const [localWatchlistState, setLocalWatchlistState] = useState<Record<string, boolean>>({});
  const [removedFromContinueWatching, setRemovedFromContinueWatching] = useState<Set<string>>(new Set());

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    item: null,
  });

  const handlePlay = (ratingKey: string, viewOffset?: number) => {
    const url = viewOffset
      ? `/app/watch/${ratingKey}?t=${viewOffset}`
      : `/app/watch/${ratingKey}`;
    navigate(url);
  };

  const handleMoreInfo = (type: string, ratingKey: string) => {
    const mediaType = type === "episode" ? "show" : type;
    navigate(`/app/media/${mediaType}/${ratingKey}`);
  };

  const handleCardClick = (item: MediaItemView) => {
    const mediaType = item.type === "episode" ? "show" : item.type;
    // For episodes, navigate to the show's detail page
    const ratingKey =
      item.type === "episode" && item.showTitle
        ? item.ratingKey // Would need grandparentRatingKey for show page
        : item.ratingKey;
    navigate(`/app/media/${mediaType}/${ratingKey}`);
  };

  const handleContextMenu = useCallback((item: MediaItemView, position: { x: number; y: number }) => {
    setContextMenu({
      isOpen: true,
      position,
      item,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleAddToWatchlist = useCallback(async (item: MediaItemView) => {
    // Optimistic update
    setLocalWatchlistState((prev) => ({ ...prev, [item.ratingKey]: true }));

    try {
      const response = await fetch("/api/plex/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingKey: item.ratingKey }),
      });

      if (!response.ok) {
        // Revert on failure
        setLocalWatchlistState((prev) => ({ ...prev, [item.ratingKey]: false }));
      }
    } catch {
      // Revert on error
      setLocalWatchlistState((prev) => ({ ...prev, [item.ratingKey]: false }));
    }
  }, []);

  const handleRemoveFromWatchlist = useCallback(async (item: MediaItemView) => {
    // Optimistic update
    setLocalWatchlistState((prev) => ({ ...prev, [item.ratingKey]: false }));

    try {
      const response = await fetch("/api/plex/list", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingKey: item.ratingKey }),
      });

      if (!response.ok) {
        // Revert on failure
        setLocalWatchlistState((prev) => ({ ...prev, [item.ratingKey]: true }));
      }
    } catch {
      // Revert on error
      setLocalWatchlistState((prev) => ({ ...prev, [item.ratingKey]: true }));
    }
  }, []);

  const handleRemoveFromContinueWatching = useCallback(async (item: MediaItemView) => {
    // Optimistic update - hide from UI immediately
    setRemovedFromContinueWatching((prev) => new Set(prev).add(item.ratingKey));

    try {
      const response = await fetch("/api/plex/scrobble", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingKey: item.ratingKey }),
      });

      if (response.ok) {
        // Revalidate data after successful removal
        revalidator.revalidate();
      } else {
        // Revert on failure
        setRemovedFromContinueWatching((prev) => {
          const newSet = new Set(prev);
          newSet.delete(item.ratingKey);
          return newSet;
        });
      }
    } catch {
      // Revert on error
      setRemovedFromContinueWatching((prev) => {
        const newSet = new Set(prev);
        newSet.delete(item.ratingKey);
        return newSet;
      });
    }
  }, [revalidator]);

  // Get the effective watchlist state for an item
  const getIsInWatchlist = (item: MediaItemView): boolean => {
    if (item.ratingKey in localWatchlistState) {
      return localWatchlistState[item.ratingKey];
    }
    return item.isInWatchlist;
  };

  // Build context menu items for the current item
  const getContextMenuItems = (item: MediaItemView): ContextMenuItem[] => {
    const isInWatchlist = getIsInWatchlist(item);
    const menuItems: ContextMenuItem[] = [];

    if (isInWatchlist) {
      menuItems.push({
        label: "Remove from Watchlist",
        icon: <ListX className="h-4 w-4" />,
        onClick: () => handleRemoveFromWatchlist(item),
        destructive: true,
      });
    } else {
      menuItems.push({
        label: "Add to Watchlist",
        icon: <Plus className="h-4 w-4" />,
        onClick: () => handleAddToWatchlist(item),
      });
    }

    // Add "Remove from Continue Watching" option for on-deck items
    if (item.isContinueWatching) {
      menuItems.push({
        label: "Remove from Continue Watching",
        icon: <X className="h-4 w-4" />,
        onClick: () => handleRemoveFromContinueWatching(item),
        destructive: true,
      });
    }

    return menuItems;
  };

  // Filter out items removed from continue watching
  const filteredContinueWatching = continueWatching.filter(
    (item) => !removedFromContinueWatching.has(item.ratingKey)
  );

  return (
    <div className="pb-16">
      {billboard ? (
        <Billboard
          key={billboard.ratingKey}
          backdropUrl={billboard.backdropUrl}
          title={billboard.title}
          description={billboard.summary}
          year={billboard.year}
          rating={billboard.rating}
          duration={billboard.duration}
          logoUrl={billboard.logoUrl}
          onPlay={() => handlePlay(billboard.ratingKey)}
          onMoreInfo={() => handleMoreInfo(billboard.type, billboard.ratingKey)}
          onMouseEnter={() => setIsBillboardHovered(true)}
          onMouseLeave={() => setIsBillboardHovered(false)}
        />
      ) : (
        <Billboard
          backdropUrl="https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1920&q=80"
          title="Welcome to Watchtower"
          description="Your personal streaming experience, powered by Plex. Browse your library, continue watching, and discover new content."
          year="2025"
          onPlay={() => navigate("/app/movies")}
          onMoreInfo={() => navigate("/app/movies")}
        />
      )}

      {/* Media rows below the billboard */}
      <Container size="wide" className="relative z-10 -mt-16 space-y-8">
        {/* Continue Watching row */}
        {filteredContinueWatching.length > 0 && (
          <MediaRow title="Continue Watching">
            {filteredContinueWatching.map((item) => (
              <MediaCard
                key={item.ratingKey}
                imageUrl={item.backdropUrl}
                title={item.showTitle || item.title}
                year={item.seasonEpisode || item.year}
                badge={item.seasonEpisode}
                progress={item.progress}
                viewCount={item.viewCount}
                logoUrl={item.logoUrl}
                showProgressBar
                onClick={() => handleCardClick(item)}
                onPlay={() => handlePlay(item.ratingKey, item.viewOffset)}
                onRemove={() => handleRemoveFromContinueWatching(item)}
                onContextMenu={(position) => handleContextMenu(item, position)}
              />
            ))}
          </MediaRow>
        )}

        {/* Recently Added row */}
        {recentlyAdded.length > 0 && (
          <MediaRow title="Recently Added">
            {recentlyAdded.map((item) => (
              <MediaCard
                key={item.ratingKey}
                imageUrl={item.backdropUrl}
                title={item.title}
                year={item.year}
                viewCount={item.viewCount}
                leafCount={item.leafCount}
                viewedLeafCount={item.viewedLeafCount}
                isInWatchlist={getIsInWatchlist(item)}
                logoUrl={item.logoUrl}
                onClick={() => handleCardClick(item)}
                onPlay={() => handlePlay(item.ratingKey)}
                onAddToWatchlist={() => {
                  const isInWatchlist = getIsInWatchlist(item);
                  if (isInWatchlist) {
                    handleRemoveFromWatchlist(item);
                  } else {
                    handleAddToWatchlist(item);
                  }
                }}
                onContextMenu={(position) => handleContextMenu(item, position)}
              />
            ))}
          </MediaRow>
        )}
      </Container>

      {/* Context Menu */}
      {contextMenu.isOpen && contextMenu.item && (
        <ContextMenu
          items={getContextMenuItems(contextMenu.item)}
          position={contextMenu.position}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
