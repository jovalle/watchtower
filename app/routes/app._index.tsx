import { useWatchlistActions } from "~/hooks/useWatchlistActions";
/**
 * Authenticated home page - the main landing page for logged-in users.
 * Features a cinematic Billboard component for the hero section with real Plex data.
 */

import { useState, useCallback, useEffect, Suspense } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { defer } from "@remix-run/node";
import { Await, useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import { Plus, ListX, X } from "lucide-react";
import { Billboard, MediaCard, MediaRow } from "~/components/media";
import { Container } from "~/components/layout";
import { ContextMenu, type ContextMenuItem } from "~/components/ui";
import { requireServerToken, requirePlexToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { getCache, setCache, getUserCacheKey } from "~/lib/plex/cache.server";
import { env } from "~/lib/env.server";
import { createTMDBClient } from "~/lib/tmdb/client.server";
import type { PlexMediaItem } from "~/lib/plex/types";
import { getCurrentUser } from "~/lib/auth/user.server";
import {
  getUserSettings,
  DEFAULT_PREFERENCES,
} from "~/lib/settings/storage.server";
import {
  personalRecommendations,
  resolveTrendingLibraryMatches,
  splitContinueWatching,
} from "~/lib/home.server";


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
  nextRows: ExtraRow[];
  extraRows: Promise<ExtraRow[]>;
  logos: Promise<Record<string, string>>;
  feedErrors: string[];
}

interface RowItem {
  key: string;
  title: string;
  year?: string;
  imageUrl: string;
  href: string;
  ratingKey?: string; // Set when the title is in the library
  tmdb?: { id: number; type: "movie" | "show"; posterUrl: string | null }; // Set for titles not in the library
}

interface ExtraRow {
  title: string;
  items: RowItem[];
}

// Use shared image URL helpers with proper sizing
import { buildBackdropUrl } from "~/lib/plex/images";

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
    backdropUrl: buildBackdropUrl(
      item.art || item.grandparentThumb || item.thumb
    ),
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
  feedErrors?: string[];
}

function libraryRowItem(item: PlexMediaItem): RowItem {
  return {
    key: item.ratingKey,
    title: item.title,
    year: item.year?.toString(),
    imageUrl: buildBackdropUrl(item.art || item.thumb),
    href: `/app/media/${item.type}/${item.ratingKey}`,
    ratingKey: item.ratingKey,
  };
}

/** TMDB trending titles, linked to the library when a matching title exists. */
async function getTrendingRow(
  client: PlexClient,
  token: string
): Promise<RowItem[]> {
  const cacheKey = getUserCacheKey("home-trending-guid-v2", token);
  const cached = await getCache<RowItem[]>(cacheKey);
  if (cached) return cached.data;

  const tmdb = createTMDBClient();
  const trending = tmdb ? await tmdb.getTrending() : null;
  if (!trending?.success) return [];

  const resolved = await resolveTrendingLibraryMatches(
    client,
    trending.data.slice(0, 20),
  );
  const items = resolved.map(
    ({ recommendation: rec, match }): RowItem => {
      if (match) return libraryRowItem(match);
      return {
        key: `tmdb-${rec.type}-${rec.id}`,
        title: rec.title,
        year: rec.releaseDate?.slice(0, 4),
        imageUrl: rec.backdropUrl || "",
        href: `/app/media/${rec.type}/tmdb-${rec.id}`,
        tmdb: { id: rec.id, type: rec.type, posterUrl: rec.posterUrl },
      };
    },
  );
  if (items.length > 0) await setCache(cacheKey, items);
  return items;
}

async function getCollectionRows(
  client: PlexClient,
  token: string
): Promise<ExtraRow[]> {
  const cacheKey = getUserCacheKey("home-collections", token);
  const cached = await getCache<ExtraRow[]>(cacheKey);
  if (cached) return cached.data;

  const result = await client.getPromotedCollections();
  if (!result.success) return [];
  const rows = result.data.map((hub) => ({
    title: hub.title,
    items: hub.items.map(libraryRowItem),
  }));
  await setCache(cacheKey, rows);
  return rows;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const token = await requireServerToken(request);
  const user = await getCurrentUser(request);
  const prefs = user
    ? (await getUserSettings(user.id))?.preferences ?? DEFAULT_PREFERENCES
    : DEFAULT_PREFERENCES;
  const extrasClient = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  const respond = (data: CachedHomeData) => {
    const { nextEpisodes, continuing: continueItems } = splitContinueWatching(
      prefs.showContinueWatching ? data.continueWatching : [],
    );
    const inProgress = new Set(continueItems.map((item) => item.ratingKey));
    const nextKeys = new Set(nextEpisodes.map((item) => item.ratingKey));
    const recentlyAdded = prefs.showRecentlyAdded ? data.recentlyAdded.filter((item) => !inProgress.has(item.ratingKey) && !nextKeys.has(item.ratingKey)) : [];
    const used = new Set([...continueItems, ...nextEpisodes, ...recentlyAdded].map((item) => item.ratingKey));
    const nextRows: ExtraRow[] = nextEpisodes.length ? [{ title: "Next episodes for you", items: nextEpisodes.map((item) => ({ key: item.ratingKey, title: item.showTitle || item.title, year: item.seasonEpisode, imageUrl: item.backdropUrl, href: `/app/media/episode/${item.ratingKey}`, ratingKey: item.ratingKey })) }] : [];
    const extraRows = (async () => {
      const [trending, collections, recommendations] = await Promise.all([
        prefs.showTrending && !prefs.discoveryDisabled ? getTrendingRow(extrasClient, token).catch(() => []) : [],
        prefs.showCollections ? getCollectionRows(extrasClient, token).catch(() => []) : [],
        personalRecommendations(extrasClient).catch(() => null),
      ]);
      const rows: ExtraRow[] = [
        ...(recommendations ? [{ title: recommendations.title, items: recommendations.items.map(libraryRowItem) }] : []),
        ...(trending.length ? [{ title: "Trending Now", items: trending }] : []),
        ...collections,
      ];
      return rows.map((row) => ({ ...row, items: row.items.filter((item) => {
        const key = item.ratingKey || item.href;
        if (used.has(key)) return false;
        used.add(key);
        return true;
      }) })).filter((row) => row.items.length > 0);
    })();
    const logos = (async () => {
      const tmdb = prefs.discoveryDisabled ? null : createTMDBClient();
      if (!tmdb) return {};
      const items = [...data.continueWatching, ...data.recentlyAdded.slice(0, 10)];
      const pairs = await Promise.all(items.map(async (item) => {
        try {
          const year = item.year ? parseInt(item.year) : undefined;
          const logo = item.type === "show" || item.type === "episode"
            ? await tmdb.getCachedTVLogoUrl(item.showTitle || item.title, year)
            : await tmdb.getCachedMovieLogoUrl(item.title, year);
          return [item.ratingKey, logo] as const;
        } catch { return [item.ratingKey, null] as const; }
      }));
      return Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => !!pair[1]));
    })().catch(() => ({}));
    return defer({ billboardCandidates: data.billboardCandidates, continueWatching: continueItems, recentlyAdded, nextRows, extraRows, logos, feedErrors: data.feedErrors ?? [] } satisfies LoaderData);
  };
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

  // Try cache first for instant loading (user-specific cache key)
  const cacheKey = getUserCacheKey("home", token);
  const cached = !forceRefresh
    ? await getCache<CachedHomeData>(cacheKey)
    : null;

  if (cached && !cached.isStale) {
    // Fresh cache - return immediately
    return respond(cached.data);
  }

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  // If we have stale cache, return it immediately while fetching fresh data
  // For now, we'll just return stale data and let the next request get fresh
  // Stale data must actually refresh so playback updates become visible.

  // Fetch data in parallel
  const [onDeckResult, recentlyAddedResult, watchlistResult] =
    await Promise.all([
      prefs.showContinueWatching ? client.getContinueWatching(20) : Promise.resolve({ success: true as const, data: [] }),
      client.getRecentlyAdded(undefined, 20),
      new PlexClient({ serverUrl: env.PLEX_SERVER_URL, token: await requirePlexToken(request), clientId: env.PLEX_CLIENT_ID }).getWatchlist(),
    ]);

  // Build a set of GUIDs that are in watchlist for fast lookup
  const watchlistGuids = new Set(
    watchlistResult.success ? watchlistResult.data.map((item) => item.guid) : []
  );

  // Sort by lastViewedAt descending (most recently watched first) to match Plex app order
  const sortedOnDeck = onDeckResult.success
    ? [...onDeckResult.data].sort(
        (a, b) => (b.lastViewedAt || 0) - (a.lastViewedAt || 0)
      )
    : [];

  const continueWatching: MediaItemView[] = sortedOnDeck.map((item) =>
    transformToView(item, watchlistGuids, true)
  );

  const recentlyAdded: MediaItemView[] = recentlyAddedResult.success
    ? recentlyAddedResult.data
        .filter((item) => item.type === "movie" || item.type === "show")
        .map((item) => transformToView(item, watchlistGuids, false))
    : [];

  // Build billboard candidates from watchlist items (in library) + recently added
  // This allows the hero to cycle through both
  const billboardCandidates: BillboardData[] = [];
  const seenRatingKeys = new Set<string>();

  // First, add watchlist items that are in our library (prioritize user's picks)
  for (const item of recentlyAdded) {
    if (
      item.isInWatchlist &&
      item.backdropUrl &&
      (item.type === "movie" || item.type === "show")
    ) {
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

  // Only cache if we have actual data - prevents caching empty results from API failures
  const hasData =
    limitedCandidates.length > 0 ||
    continueWatching.length > 0 ||
    recentlyAdded.length > 0;
  const feedErrors = [!onDeckResult.success && "Couldn't refresh Continue Watching.", !recentlyAddedResult.success && "Couldn't refresh recently added titles."].filter((value): value is string => !!value);
  if (hasData && !feedErrors.length) {
    await setCache<CachedHomeData>(cacheKey, {
      billboardCandidates: limitedCandidates,
      continueWatching,
      recentlyAdded,
    });
  }

  return respond({
    billboardCandidates: limitedCandidates,
    continueWatching,
    recentlyAdded,
    feedErrors,
  });
}

// Context menu state type
interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  item: MediaItemView | null;
}

export default function AppIndex() {
  const {
    billboardCandidates,
    continueWatching,
    recentlyAdded,
    nextRows,
    extraRows,
    logos,
    feedErrors,
  } = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    setLogoUrls({});
    Promise.resolve(logos).then((result) => { if (active) setLogoUrls(result); }).catch(() => {});
    return () => { active = false; };
  }, [logos]);

  // Billboard cycling state
  const [billboardIndex, setBillboardIndex] = useState(0);
  const [isBillboardHovered, setIsBillboardHovered] = useState(false);
  const [billboardFocused, setBillboardFocused] = useState(false);
  const billboard = billboardCandidates[billboardIndex] || null;

  // Cycle through billboard candidates every 10 seconds (pauses when hovered)
  useEffect(() => {
    if (billboardCandidates.length <= 1) return;
    if (isBillboardHovered || billboardFocused) return;

    const interval = setInterval(() => {
      setBillboardIndex((prev) => (prev + 1) % billboardCandidates.length);
    }, 10000);

    return () => clearInterval(interval);
  }, [billboardCandidates.length, isBillboardHovered, billboardFocused]);

  // Revalidate when page becomes visible (returning from video player)
  // This ensures Continue Watching updates after watching something
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        revalidator.revalidate();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [revalidator]);

  const watchlist = useWatchlistActions();
  const [actionError, setActionError] = useState("");
  const [removedFromContinueWatching, setRemovedFromContinueWatching] =
    useState<Set<string>>(new Set());

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
    navigate(`/app/media/${item.type}/${item.ratingKey}`);
  };

  const handleContextMenu = useCallback(
    (item: MediaItemView, position: { x: number; y: number }) => {
      setContextMenu({
        isOpen: true,
        position,
        item,
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleRemoveFromContinueWatching = useCallback(
    async (item: MediaItemView) => {
      setActionError("");
      // Optimistic update - hide from UI immediately
      setRemovedFromContinueWatching((prev) =>
        new Set(prev).add(item.ratingKey)
      );

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
          setActionError("Could not remove the title from Continue Watching. Try again.");
          setRemovedFromContinueWatching((prev) => {
            const newSet = new Set(prev);
            newSet.delete(item.ratingKey);
            return newSet;
          });
        }
      } catch {
        setActionError("Could not remove the title from Continue Watching. Try again.");
        setRemovedFromContinueWatching((prev) => {
          const newSet = new Set(prev);
          newSet.delete(item.ratingKey);
          return newSet;
        });
      }
    },
    [revalidator]
  );


  // Build context menu items for the current item
  const getContextMenuItems = (item: MediaItemView): ContextMenuItem[] => {
    const isInWatchlist = watchlist.isSaved(item);
    const menuItems: ContextMenuItem[] = [];

    if (isInWatchlist) {
      menuItems.push({
        label: "Remove from Watchlist",
        icon: <ListX className="h-4 w-4" />,
        disabled: watchlist.isPending(item.ratingKey),
        onClick: () => watchlist.toggle(item),
        destructive: true,
      });
    } else {
      menuItems.push({
        label: "Add to Watchlist",
        icon: <Plus className="h-4 w-4" />,
        disabled: watchlist.isPending(item.ratingKey),
        onClick: () => watchlist.toggle(item),
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
          logoUrl={logoUrls[billboard.ratingKey] || billboard.logoUrl}
          onPlay={() => handlePlay(billboard.ratingKey)}
          onMoreInfo={() => handleMoreInfo(billboard.type, billboard.ratingKey)}
          onFocusChange={setBillboardFocused}
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
        {(watchlist.error || actionError) && <p role="alert" className="my-4 text-red-400">{watchlist.error || actionError}</p>}
        {feedErrors.map((message) => <p key={message} role="alert" className="text-red-400">{message}</p>)}
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
                logoUrl={logoUrls[item.ratingKey] || item.logoUrl}
                showProgressBar
                onClick={() => handleCardClick(item)}
                onPlay={() => handlePlay(item.ratingKey, item.viewOffset)}
                onRemove={() => handleRemoveFromContinueWatching(item)}
                onContextMenu={(position) => handleContextMenu(item, position)}
              />
            ))}
          </MediaRow>
        )}

        {nextRows.map((row) => <MediaRow key={row.title} title={row.title}>
          {row.items.map((item) => <MediaCard key={item.key} imageUrl={item.imageUrl} title={item.title} year={item.year} onClick={() => navigate(item.href)} onPlay={item.ratingKey ? () => handlePlay(item.ratingKey!) : undefined} />)}
        </MediaRow>)}
        <Suspense fallback={<p role="status">Loading Recommendations…</p>}>
          <Await resolve={extraRows} errorElement={<p role="alert">Could not load recommendations.</p>}>
            {(rows) => rows.map((row, index) => (
              <MediaRow key={`${index}:${row.title}`} title={row.title}>
                {row.items.map(({ ratingKey, ...item }) => (
                  <MediaCard key={item.key} imageUrl={item.imageUrl} title={item.title} year={item.year} badge={ratingKey ? undefined : "Not in library"} onClick={() => navigate(item.href)} onPlay={ratingKey ? () => handlePlay(ratingKey) : undefined} />
                ))}
              </MediaRow>
            ))}
          </Await>
        </Suspense>
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
                isInWatchlist={watchlist.isSaved(item)}
                logoUrl={logoUrls[item.ratingKey] || item.logoUrl}
                onClick={() => handleCardClick(item)}
                onPlay={() => handlePlay(item.ratingKey)}
                watchlistPending={watchlist.isPending(item.ratingKey)}
                    onAddToWatchlist={() => watchlist.toggle(item)}
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
