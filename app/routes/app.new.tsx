/**
 * New & Popular page - Netflix-style discovery page with tabs.
 * GET /app/new
 */

import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Flame, TrendingUp, Clock, Star } from "lucide-react";
import { Container } from "~/components/layout";
import { PosterCard } from "~/components/media";
import { Typography } from "~/components/ui";
import { requireServerToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { getCache, setCache, getUserCacheKey } from "~/lib/plex/cache.server";
import { PLEX_DISCOVER_URL } from "~/lib/plex/constants";
import type { PlexMediaItem, PlexWatchlistItem } from "~/lib/plex/types";
import { createTMDBClient } from "~/lib/tmdb/client.server";
import { env } from "~/lib/env.server";

export const meta: MetaFunction = () => {
  return [
    { title: "New & Popular | Watchtower" },
    { name: "description", content: "Discover trending and popular content" },
  ];
};

interface MediaItemView {
  ratingKey: string;
  title: string;
  year?: string;
  posterUrl: string;
  backdropUrl: string;
  type: "movie" | "show" | "episode";
  audienceRating?: number;
  addedAt?: number;
  logoUrl?: string;
  // Episode-specific fields
  showTitle?: string;
  seasonEpisode?: string;
  details: {
    backdropUrl?: string;
    releaseDate?: string;
    runtime?: string;
    seasons?: number;
    episodes?: number;
    genres?: string[];
    directors?: string[];
    cast?: string[];
    summary?: string;
  };
}

interface LoaderData {
  trending: MediaItemView[];
  top10: MediaItemView[];
  comingSoon: MediaItemView[];
  worthTheWait: MediaItemView[];
}

interface CachedNewPopularData {
  trending: MediaItemView[];
  top10: MediaItemView[];
  comingSoon: MediaItemView[];
  worthTheWait: MediaItemView[];
}

type TabId = "trending" | "top10" | "coming" | "worth";

const TABS: { id: TabId; label: string; icon: typeof Flame }[] = [
  { id: "trending", label: "Trending Now", icon: Flame },
  { id: "top10", label: "Top 10", icon: TrendingUp },
  { id: "coming", label: "Coming Soon", icon: Clock },
  { id: "worth", label: "Worth the Wait", icon: Star },
];

// Use shared image URL helpers with proper sizing
import { buildPosterUrl, buildBackdropUrl, POSTER_DIMENSIONS, BACKDROP_DIMENSIONS } from "~/lib/plex/images";

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

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const token = await requireServerToken(request);
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

  // Try cache first for instant loading (user-specific cache key)
  const cacheKey = getUserCacheKey("new-popular", token);
  const cached = !forceRefresh ? await getCache<CachedNewPopularData>(cacheKey) : null;

  if (cached && !cached.isStale) {
    // Fresh cache - return immediately
    return json<LoaderData>(cached.data);
  }

  // If we have stale cache, return it immediately
  if (cached) {
    return json<LoaderData>(cached.data);
  }

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  // Get all libraries
  const librariesResult = await client.getLibraries();
  if (!librariesResult.success) {
    return json<LoaderData>({
      trending: [],
      top10: [],
      comingSoon: [],
      worthTheWait: [],
    });
  }

  const movieLibrary = librariesResult.data.find((lib) => lib.type === "movie");
  const tvLibrary = librariesResult.data.find((lib) => lib.type === "show");

  // Fetch recently added for trending (movies + TV) and watchlist
  const [recentMovies, recentShows, watchlistResult] = await Promise.all([
    movieLibrary
      ? client.getLibraryItems(movieLibrary.key, { sort: "addedAt:desc", limit: 10 })
      : Promise.resolve({ success: false as const, error: { code: 0, message: "" } }),
    tvLibrary
      ? client.getLibraryItems(tvLibrary.key, { sort: "addedAt:desc", limit: 10 })
      : Promise.resolve({ success: false as const, error: { code: 0, message: "" } }),
    client.getWatchlist(),
  ]);

  // Fetch content from past week for Top 10 (sorted by audience rating)
  // Get timestamp for 7 days ago
  const oneWeekAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  // Fetch recently added content (within past week), we'll sort by rating client-side
  const [recentMoviesForTop10, recentShowsForTop10, recentEpisodesForTop10] = await Promise.all([
    movieLibrary
      ? client.getLibraryItems(movieLibrary.key, { sort: "addedAt:desc", limit: 50 })
      : Promise.resolve({ success: false as const, error: { code: 0, message: "" } }),
    tvLibrary
      ? client.getLibraryItems(tvLibrary.key, { sort: "addedAt:desc", limit: 50 })
      : Promise.resolve({ success: false as const, error: { code: 0, message: "" } }),
    // Also get recently added episodes
    client.getRecentlyAdded(undefined, 50),
  ]);

  // Build set of GUIDs from local library for "Coming Soon" filtering
  // Fetch all library items (not just recent) to properly check against watchlist
  const [allMovies, allShows] = await Promise.all([
    movieLibrary
      ? client.getLibraryItems(movieLibrary.key, { limit: 10000 })
      : Promise.resolve({ success: false as const, error: { code: 0, message: "" } }),
    tvLibrary
      ? client.getLibraryItems(tvLibrary.key, { limit: 10000 })
      : Promise.resolve({ success: false as const, error: { code: 0, message: "" } }),
  ]);

  const localLibraryGuids = new Set<string>();
  if (allMovies.success) {
    for (const movie of allMovies.data) {
      if (movie.guid) localLibraryGuids.add(movie.guid);
    }
  }
  if (allShows.success) {
    for (const show of allShows.data) {
      if (show.guid) localLibraryGuids.add(show.guid);
    }
  }

  // Transform items
  const transformItem = (item: PlexMediaItem, type: "movie" | "show" | "episode"): MediaItemView => {
    const isEpisode = type === "episode";
    return {
      ratingKey: item.ratingKey,
      title: isEpisode ? item.grandparentTitle || item.title : item.title,
      year: item.year?.toString(),
      posterUrl: buildPosterUrl(item.thumb),
      backdropUrl: buildBackdropUrl(item.art || item.grandparentArt || item.thumb),
      type,
      audienceRating: item.audienceRating,
      addedAt: item.addedAt,
      showTitle: isEpisode ? item.grandparentTitle : undefined,
      seasonEpisode: isEpisode ? `S${item.parentIndex}:E${item.index}` : undefined,
      details: {
        backdropUrl: buildBackdropUrl(item.art || item.grandparentArt),
        runtime: type === "movie" ? formatRuntime(item.duration) : undefined,
        seasons: type === "show" ? item.childCount : undefined,
        episodes: type === "show" ? item.leafCount : undefined,
        genres: item.Genre?.map((g) => g.tag),
        directors: item.Director?.map((d) => d.tag),
        cast: item.Role?.slice(0, 5).map((r) => r.tag),
        summary: item.summary,
      },
    };
  };

  // Transform watchlist item (from Plex Discover API)
  const transformWatchlistItem = (item: PlexWatchlistItem): MediaItemView => {
    // Watchlist items use Plex's discover API image format
    // Thumb paths look like "/library/metadata/xxx/thumb/yyy" and need the discover URL + token
    const buildDiscoverImageUrl = (path: string | undefined, dimensions?: { width?: number; height?: number }): string => {
      if (!path) return "";
      // Build dimension params
      const dimParams = dimensions
        ? `&width=${dimensions.width || ""}&height=${dimensions.height || ""}`
        : "";
      // Relative paths starting with / go to Plex Discover API
      if (path.startsWith("/")) {
        return `${PLEX_DISCOVER_URL}${path}?X-Plex-Token=${token}${dimParams}`;
      }
      // Absolute URLs (http:// or https://) should be proxied to avoid mixed content
      if (path.startsWith('http://') || path.startsWith('https://')) {
        const separator = path.includes("?") ? "&" : "?";
        const pathWithDims = dimensions
          ? `${path}${separator}width=${dimensions.width || ""}&height=${dimensions.height || ""}`
          : path;
        return `/api/plex/image?path=${encodeURIComponent(pathWithDims)}`;
      }
      // Fallback for any other format
      return path;
    };

    const thumbUrl = buildDiscoverImageUrl(item.thumb, POSTER_DIMENSIONS);
    const artUrl = buildDiscoverImageUrl(item.art, BACKDROP_DIMENSIONS);

    return {
      ratingKey: item.ratingKey,
      title: item.title,
      year: item.year?.toString(),
      posterUrl: thumbUrl,
      backdropUrl: artUrl || thumbUrl,
      type: item.type as "movie" | "show",
      audienceRating: item.audienceRating,
      addedAt: item.watchlistedAt,
      details: {
        backdropUrl: artUrl,
        genres: item.Genre?.map((g) => g.tag),
        summary: item.summary,
      },
    };
  };

  // Combine and interleave movies and shows for trending
  const trendingItems: MediaItemView[] = [];
  const recentMoviesData = recentMovies.success ? recentMovies.data : [];
  const recentShowsData = recentShows.success ? recentShows.data : [];
  const maxLen = Math.max(recentMoviesData.length, recentShowsData.length);
  for (let i = 0; i < maxLen && trendingItems.length < 20; i++) {
    if (i < recentMoviesData.length) {
      trendingItems.push(transformItem(recentMoviesData[i], "movie"));
    }
    if (i < recentShowsData.length) {
      trendingItems.push(transformItem(recentShowsData[i], "show"));
    }
  }

  // Top 10 - combine all movies/shows with ratings, sort by rating
  // If we have more than 10, prioritize items from the past week, then fill with top-rated
  const top10Candidates: MediaItemView[] = [];
  const seenKeys = new Set<string>();

  // Add all movies with ratings
  if (recentMoviesForTop10.success) {
    for (const movie of recentMoviesForTop10.data) {
      if (movie.audienceRating && !seenKeys.has(movie.ratingKey)) {
        seenKeys.add(movie.ratingKey);
        top10Candidates.push(transformItem(movie, "movie"));
      }
    }
  }

  // Add all shows with ratings
  if (recentShowsForTop10.success) {
    for (const show of recentShowsForTop10.data) {
      if (show.audienceRating && !seenKeys.has(show.ratingKey)) {
        seenKeys.add(show.ratingKey);
        top10Candidates.push(transformItem(show, "show"));
      }
    }
  }

  // Add recently released episodes (representing their parent shows)
  if (recentEpisodesForTop10.success) {
    for (const episode of recentEpisodesForTop10.data) {
      if (episode.type === "episode" && episode.audienceRating) {
        // Use grandparent (show) rating key to avoid duplicates
        const showKey = episode.grandparentRatingKey || episode.ratingKey;
        if (!seenKeys.has(showKey)) {
          seenKeys.add(showKey);
          top10Candidates.push(transformItem(episode, "episode"));
        }
      }
    }
  }

  // Sort by audience rating (descending) and take top 10
  // If we have more than 10 items, prioritize recent ones (past week) then by rating
  let topItems: MediaItemView[];
  if (top10Candidates.length > 10) {
    // Separate into recent (past week) and older
    const recentItems = top10Candidates.filter(
      (item) => item.addedAt && item.addedAt >= oneWeekAgo
    );
    const olderItems = top10Candidates.filter(
      (item) => !item.addedAt || item.addedAt < oneWeekAgo
    );

    // Sort both by rating
    recentItems.sort((a, b) => (b.audienceRating ?? 0) - (a.audienceRating ?? 0));
    olderItems.sort((a, b) => (b.audienceRating ?? 0) - (a.audienceRating ?? 0));

    // Take recent first, fill with older if needed
    topItems = [...recentItems, ...olderItems].slice(0, 10);
  } else {
    topItems = top10Candidates
      .sort((a, b) => (b.audienceRating ?? 0) - (a.audienceRating ?? 0));
  }

  // Fetch logos for Top 10 items via TMDB
  const tmdbClient = createTMDBClient();
  if (tmdbClient && topItems.length > 0) {
    const fetchLogo = async (item: MediaItemView) => {
      try {
        const titleForLookup = item.showTitle || item.title;
        const isShow = item.type === "show" || item.type === "episode";
        const logoUrl = isShow
          ? await tmdbClient.getCachedTVLogoUrl(titleForLookup, item.year ? parseInt(item.year) : undefined)
          : await tmdbClient.getCachedMovieLogoUrl(item.title, item.year ? parseInt(item.year) : undefined);
        if (logoUrl) {
          item.logoUrl = logoUrl;
        }
      } catch {
        // Logos are optional
      }
    };
    await Promise.all(topItems.map(fetchLogo));
  }

  // Coming Soon - watchlist items NOT in the local library
  const comingSoonItems: MediaItemView[] = [];
  if (watchlistResult.success) {
    for (const watchlistItem of watchlistResult.data) {
      // Check if this item is NOT in the local library
      if (!localLibraryGuids.has(watchlistItem.guid)) {
        comingSoonItems.push(transformWatchlistItem(watchlistItem));
      }
    }
  }

  const data: CachedNewPopularData = {
    trending: trendingItems,
    top10: topItems,
    comingSoon: comingSoonItems,
    worthTheWait: topItems.filter((_, i) => i >= 5), // Placeholder - use lower-ranked top items
  };

  // Only cache if we have actual data - prevents caching empty results from API failures
  const hasData = trendingItems.length > 0 || topItems.length > 0 || comingSoonItems.length > 0;
  if (hasData) {
    await setCache<CachedNewPopularData>(cacheKey, data);
  }

  return json<LoaderData>(data);
}

/**
 * Top 10 card with large rank number and horizontal layout.
 * Mirrors the MediaCard aesthetic from the home page.
 */
function Top10Card({
  item,
  rank,
  onNavigate,
}: {
  item: MediaItemView;
  rank: number;
  onNavigate: (path: string) => void;
}) {
  const detailPath = item.type === "episode"
    ? `/app/media/show/${item.ratingKey}` // Navigate to show for episodes
    : `/app/media/${item.type}/${item.ratingKey}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(detailPath)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNavigate(detailPath);
        }
      }}
      className="group relative flex w-[320px] flex-shrink-0 cursor-pointer flex-col sm:w-[380px]"
    >
      {/* Card with rank number */}
      <div className="flex items-center gap-0">
        {/* Large rank number */}
        <div className="relative z-10 flex h-32 w-20 flex-shrink-0 items-center justify-center sm:h-36 sm:w-24">
          <span
            className="text-[80px] font-black leading-none sm:text-[100px]"
            style={{
              WebkitTextStroke: "2px rgba(255,255,255,0.8)",
              color: "transparent",
              textShadow: "4px 4px 8px rgba(0,0,0,0.5)",
            }}
          >
            {rank}
          </span>
        </div>

        {/* Card content - horizontal backdrop image */}
        <div className="relative -ml-6 aspect-[16/9] w-[240px] overflow-hidden rounded-lg bg-background-elevated shadow-xl ring-1 ring-white/10 transition-all duration-250 ease-out group-hover:-translate-y-0.5 group-hover:scale-[1.02] group-hover:ring-2 group-hover:ring-white/40 sm:w-[280px]">
          {/* Backdrop image */}
          <img
            src={item.backdropUrl || item.posterUrl}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />

          {/* Rating badge - top right */}
          {item.audienceRating && item.audienceRating > 0 && (
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-xs font-medium text-white">
                {item.audienceRating.toFixed(1)}
              </span>
            </div>
          )}

          {/* Episode badge */}
          {item.seasonEpisode && (
            <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white ring-1 ring-white/10">
              {item.seasonEpisode}
            </span>
          )}

          {/* Logo overlay with gradient backdrop */}
          {item.logoUrl && (
            <>
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-3 max-w-[70%] pointer-events-none">
                <img
                  src={item.logoUrl}
                  alt={`${item.title} logo`}
                  className="h-auto max-h-10 w-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                  loading="lazy"
                />
              </div>
            </>
          )}

          {/* Gradient overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
      </div>

      {/* Title and year - always visible below card */}
      <div className="mt-2 pl-14 sm:pl-[4.5rem]">
        <p className="line-clamp-1 text-sm font-medium text-foreground-primary">
          {item.title}
        </p>
        {item.year && (
          <span className="text-xs text-foreground-secondary">{item.year}</span>
        )}
      </div>
    </div>
  );
}

export default function NewAndPopularPage() {
  const { trending, top10, comingSoon, worthTheWait } = useLoaderData<LoaderData>();
  const [activeTab, setActiveTab] = useState<TabId>("trending");
  const navigate = useNavigate();

  const tabContent: Record<TabId, MediaItemView[]> = {
    trending,
    top10,
    coming: comingSoon,
    worth: worthTheWait,
  };

  const activeItems = tabContent[activeTab];

  return (
    <div className="min-h-screen pb-16">
      <Container size="wide" className="pt-8">
        {/* Page Header */}
        <Typography variant="title" as="h1" className="mb-6">
          New & Popular
        </Typography>

        {/* Tab Navigation */}
        <div className="mb-8 flex gap-2 overflow-x-auto pb-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white text-black"
                    : "bg-background-elevated text-foreground-secondary hover:bg-background-elevated/80 hover:text-foreground-primary"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab === "top10" ? (
          // Special Top 10 layout with large rank numbers and horizontal cards
          top10.length > 0 ? (
            <div className="-mx-4 sm:-mx-6 lg:-mx-8">
              <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto overflow-y-visible px-4 py-4 sm:gap-4 sm:px-6 lg:px-8">
                {top10.map((item, index) => (
                  <div key={item.ratingKey} className="snap-start py-2">
                    <Top10Card
                      item={item}
                      rank={index + 1}
                      onNavigate={navigate}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <TrendingUp className="mb-4 h-16 w-16 text-foreground-muted" />
              <Typography variant="subtitle" className="mb-2">
                No top content this week
              </Typography>
              <Typography variant="body" className="text-foreground-secondary">
                Check back when new highly-rated content is added.
              </Typography>
            </div>
          )
        ) : activeItems.length > 0 ? (
          // Standard grid for other tabs
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {activeItems.map((item) => {
              const detailPath = `/app/media/${item.type}/${item.ratingKey}`;
              return (
                <PosterCard
                  key={item.ratingKey}
                  ratingKey={item.ratingKey}
                  posterUrl={item.posterUrl}
                  title={item.title}
                  year={item.year}
                  details={item.details}
                  hideHoverPlay
                  onClick={() => navigate(detailPath)}
                  onMoreInfo={() => navigate(detailPath)}
                  onPlay={() => {
                    console.log(`Play: ${item.title}`);
                  }}
                />
              );
            })}
          </div>
        ) : (
          // Empty state
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="mb-4 h-16 w-16 text-foreground-muted" />
            <Typography variant="subtitle" className="mb-2">
              {activeTab === "coming"
                ? "Nothing on your radar"
                : "No content available"}
            </Typography>
            <Typography variant="body" className="text-foreground-secondary">
              {activeTab === "coming"
                ? "Add movies and shows to your watchlist that aren't in your library yet."
                : "We couldn't find any content for this category."}
            </Typography>
          </div>
        )}
      </Container>
    </div>
  );
}
