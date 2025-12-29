/**
 * Unified watchlist service.
 * Aggregates watchlists from multiple sources (Plex, Trakt, IMDB).
 */

import type { PlexClient } from "~/lib/plex/client.server";
import type { PlexWatchlistItem } from "~/lib/plex/types";
import type { TraktClient } from "~/lib/trakt/client.server";
import type { TraktWatchlistItem } from "~/lib/trakt/types";
import type { TMDBClient } from "~/lib/tmdb/client.server";
import { getIMDBWatchlists, type IMDBWatchlistItem } from "~/lib/imdb/client.server";
import { env } from "~/lib/env.server";
import type {
  UnifiedWatchlistItem,
  WatchlistSource,
  WatchlistFilter,
  WatchlistCounts,
} from "./types";

const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

/**
 * Result from the unified watchlist service.
 */
export interface UnifiedWatchlistResult {
  items: UnifiedWatchlistItem[];
  counts: WatchlistCounts;
}

/**
 * Convert Plex watchlist item to unified format.
 */
function plexToUnified(
  item: PlexWatchlistItem,
  thumbUrl: string,
  localRatingKey?: string
): UnifiedWatchlistItem {
  // Extract IMDB ID from Plex GUID if available
  const imdbMatch = item.guid?.match(/imdb:\/\/(tt\d+)/);
  const tmdbMatch = item.guid?.match(/tmdb:\/\/(\d+)/);

  return {
    id: item.guid || item.ratingKey,
    title: item.title,
    type: item.type,
    year: item.year,
    thumb: thumbUrl,
    sources: ["plex"],
    addedAt: {
      plex: item.watchlistedAt,
    },
    localRatingKey,
    isLocal: !!localRatingKey,
    imdbId: imdbMatch?.[1],
    tmdbId: tmdbMatch ? parseInt(tmdbMatch[1], 10) : undefined,
    plexGuid: item.guid,
  };
}

/**
 * Convert Trakt watchlist item to unified format.
 */
function traktToUnified(item: TraktWatchlistItem): UnifiedWatchlistItem {
  const isMovie = item.type === "movie";
  const media = isMovie ? item.movie : item.show;

  if (!media) {
    throw new Error(`Invalid Trakt watchlist item: missing ${item.type} data`);
  }

  // Parse ISO date to unix timestamp
  const addedAt = Math.floor(new Date(item.listed_at).getTime() / 1000);

  return {
    id: media.ids.imdb || `trakt-${media.ids.trakt}`,
    title: media.title,
    type: isMovie ? "movie" : "show",
    year: media.year ?? undefined,
    thumb: "",
    sources: ["trakt"],
    addedAt: {
      trakt: addedAt,
    },
    isLocal: false,
    imdbId: media.ids.imdb,
    tmdbId: media.ids.tmdb,
  };
}

/**
 * Convert IMDB watchlist item to unified format.
 */
function imdbToUnified(item: IMDBWatchlistItem): UnifiedWatchlistItem {
  return {
    id: item.imdbId,
    title: item.title,
    type: item.type,
    year: item.year,
    thumb: "", // Will be filled by TMDB lookup
    sources: ["imdb"],
    addedAt: {
      imdb: item.addedAt,
    },
    isLocal: false,
    imdbId: item.imdbId,
  };
}

/**
 * Merge two unified items (when the same item appears in multiple sources).
 */
function mergeItems(
  existing: UnifiedWatchlistItem,
  incoming: UnifiedWatchlistItem
): UnifiedWatchlistItem {
  const sources = [...new Set([...existing.sources, ...incoming.sources])] as WatchlistSource[];

  const addedAt = {
    plex: existing.addedAt.plex || incoming.addedAt.plex,
    trakt: existing.addedAt.trakt || incoming.addedAt.trakt,
    imdb: existing.addedAt.imdb || incoming.addedAt.imdb,
  };

  return {
    ...existing,
    sources,
    addedAt,
    thumb: existing.thumb || incoming.thumb,
    year: existing.year || incoming.year,
    imdbId: existing.imdbId || incoming.imdbId,
    tmdbId: existing.tmdbId || incoming.tmdbId,
    localRatingKey: existing.localRatingKey || incoming.localRatingKey,
    isLocal: existing.isLocal || incoming.isLocal,
    rating: existing.rating || incoming.rating,
  };
}

/**
 * Get a deduplication key for an item.
 */
function getDedupeKey(item: UnifiedWatchlistItem): string {
  if (item.imdbId) {
    return `imdb:${item.imdbId}`;
  }
  if (item.tmdbId) {
    return `tmdb:${item.tmdbId}`;
  }
  const normalizedTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `title:${normalizedTitle}:${item.year || "unknown"}`;
}

/**
 * Get earliest added timestamp from addedAt object.
 */
function getEarliestAddedAt(item: UnifiedWatchlistItem): number {
  const timestamps = [
    item.addedAt.plex,
    item.addedAt.trakt,
    item.addedAt.imdb,
  ].filter((t): t is number => t !== undefined);

  return timestamps.length > 0 ? Math.min(...timestamps) : 0;
}

/**
 * Fetch IMDB watchlists and enrich with TMDB poster data and ratings.
 */
async function getIMDBWatchlistWithPosters(
  tmdbClient: TMDBClient | null
): Promise<UnifiedWatchlistItem[]> {
  const items = await getIMDBWatchlists();
  const unified = items.map(imdbToUnified);

  // Fetch poster URLs and ratings from TMDB
  if (tmdbClient) {
    for (const item of unified) {
      if (item.imdbId) {
        const findResult = await tmdbClient.findByIMDB(item.imdbId);
        if (findResult.success && findResult.data) {
          if (findResult.data.posterPath && !item.thumb) {
            item.thumb = `${TMDB_IMAGE_BASE_URL}/w342${findResult.data.posterPath}`;
          }
          item.tmdbId = findResult.data.id;
          // Update type from TMDB if RSS parsing was uncertain
          item.type = findResult.data.type;
          if (findResult.data.year) {
            item.year = findResult.data.year;
          }
          // Add rating
          if (findResult.data.rating) {
            item.rating = findResult.data.rating;
          }
        }
      }
    }
  }

  return unified;
}

/**
 * Fetch Trakt watchlist items with poster URLs and ratings from TMDB.
 */
async function getTraktWatchlistWithPosters(
  traktClient: TraktClient,
  username: string,
  tmdbClient: TMDBClient | null
): Promise<UnifiedWatchlistItem[]> {
  const result = await traktClient.getPublicWatchlist(username);

  if (!result.success) {
    console.error("[Watchlist] Failed to fetch Trakt watchlist:", result.error);
    return [];
  }

  const items = result.data.map(traktToUnified);

  // Fetch poster URLs and ratings from TMDB
  if (tmdbClient) {
    for (const item of items) {
      if (item.imdbId) {
        const findResult = await tmdbClient.findByIMDB(item.imdbId);
        if (findResult.success && findResult.data) {
          if (findResult.data.posterPath && !item.thumb) {
            item.thumb = `${TMDB_IMAGE_BASE_URL}/w342${findResult.data.posterPath}`;
          }
          if (findResult.data.rating) {
            item.rating = findResult.data.rating;
          }
        }
      }
    }
  }

  return items;
}

/**
 * Normalize a title for matching (lowercase, remove special chars, trim).
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Local library item data type */
interface LocalItemData {
  ratingKey: string;
  thumb?: string;
  audienceRating?: number;
}

/**
 * Fetch Plex watchlist items with poster URLs and ratings from TMDB.
 */
async function getPlexWatchlistWithRatings(
  plexClient: PlexClient,
  plexToken: string,
  tmdbClient: TMDBClient | null,
  buildPlexImageUrl: (thumb: string | undefined, token: string) => string,
  localItemsByGuid: Map<string, LocalItemData>
): Promise<UnifiedWatchlistItem[]> {
  const result = await plexClient.getWatchlist({ sort: "watchlistedAt", sortDir: "desc" });
  if (!result.success) {
    console.error("[Watchlist] Failed to fetch Plex watchlist:", result.error);
    return [];
  }

  const items = result.data.map((item) => {
    const localItem = localItemsByGuid.get(item.guid);
    const thumbUrl = localItem?.thumb
      ? buildPlexImageUrl(localItem.thumb, plexToken)
      : buildPlexImageUrl(item.thumb, plexToken);
    const unified = plexToUnified(item, thumbUrl, localItem?.ratingKey);
    // Use local audienceRating as initial rating (will be overwritten by TMDB if available)
    if (localItem?.audienceRating && !unified.rating) {
      unified.rating = localItem.audienceRating;
    }
    return unified;
  });

  // Fetch ratings and tmdbIds from TMDB
  if (tmdbClient) {
    for (const item of items) {
      // Try to find by IMDB ID first (if we have one)
      if (item.imdbId) {
        const findResult = await tmdbClient.findByIMDB(item.imdbId);
        if (findResult.success && findResult.data) {
          if (findResult.data.rating && !item.rating) {
            item.rating = findResult.data.rating;
          }
          if (findResult.data.id && !item.tmdbId) {
            item.tmdbId = findResult.data.id;
          }
        }
      }

      // If still no tmdbId, search by title and year
      if (!item.tmdbId && item.title) {
        const searchResult = item.type === 'movie'
          ? await tmdbClient.searchMovie(item.title, item.year)
          : await tmdbClient.searchTV(item.title, item.year);

        if (searchResult.success && searchResult.data.length > 0) {
          const match = searchResult.data[0];
          if (match.vote_average > 0 && !item.rating) {
            item.rating = match.vote_average;
          }
          item.tmdbId = match.id;
        }
      }
    }
  }

  return items;
}

/**
 * Fetch unified watchlist from all enabled sources.
 */
export async function getUnifiedWatchlist(
  plexClient: PlexClient,
  plexToken: string,
  traktClient: TraktClient | null,
  tmdbClient: TMDBClient | null,
  filter: WatchlistFilter = "all",
  buildPlexImageUrl: (thumb: string | undefined, token: string) => string,
  localItemsByGuid: Map<string, LocalItemData>,
  localItemsByTitleYear?: Map<string, LocalItemData>
): Promise<UnifiedWatchlistResult> {
  const counts: WatchlistCounts = { all: 0, plex: 0, trakt: 0, imdb: 0 };

  // Fetch from all sources in parallel
  const [plexItems, traktItems, imdbItems] = await Promise.all([
    // Plex watchlist (with TMDB ratings)
    (async () => {
      if (filter !== "all" && filter !== "plex") return [];
      return getPlexWatchlistWithRatings(plexClient, plexToken, tmdbClient, buildPlexImageUrl, localItemsByGuid);
    })(),

    // Trakt watchlist
    (async () => {
      if (filter !== "all" && filter !== "trakt") return [];
      if (!traktClient || !env.TRAKT_USERNAME) return [];

      return getTraktWatchlistWithPosters(traktClient, env.TRAKT_USERNAME, tmdbClient);
    })(),

    // IMDB watchlist
    (async () => {
      if (filter !== "all" && filter !== "imdb") return [];
      if (env.IMDB_WATCHLISTS.length === 0) return [];

      return getIMDBWatchlistWithPosters(tmdbClient);
    })(),
  ]);

  // Count items per source before deduplication
  counts.plex = plexItems.length;
  counts.trakt = traktItems.length;
  counts.imdb = imdbItems.length;

  // Combine and deduplicate
  const itemsByKey = new Map<string, UnifiedWatchlistItem>();

  // Process items in order of priority: Plex (has local info), then IMDB, then Trakt
  for (const item of [...plexItems, ...imdbItems, ...traktItems]) {
    const key = getDedupeKey(item);
    const existing = itemsByKey.get(key);

    if (existing) {
      itemsByKey.set(key, mergeItems(existing, item));
    } else {
      itemsByKey.set(key, item);
    }
  }

  // Convert to array and sort by earliest added date (newest first)
  const items = Array.from(itemsByKey.values()).sort((a, b) => {
    const aTime = getEarliestAddedAt(a);
    const bTime = getEarliestAddedAt(b);
    return bTime - aTime;
  });

  counts.all = items.length;

  // Match Trakt/IMDB items to local Plex library and apply rating fallback
  for (const item of items) {
    if (!item.isLocal) {
      let localItem: LocalItemData | undefined;

      // First try matching by Plex GUID
      if (item.plexGuid) {
        localItem = localItemsByGuid.get(item.plexGuid);
      }

      // Fallback: match by normalized title + year
      if (!localItem && localItemsByTitleYear && item.title && item.year) {
        const titleYearKey = `${normalizeTitle(item.title)}:${item.year}`;
        localItem = localItemsByTitleYear.get(titleYearKey);
      }

      if (localItem) {
        item.localRatingKey = localItem.ratingKey;
        item.isLocal = true;
        // Update thumb to use local library thumbnail
        if (localItem.thumb) {
          item.thumb = buildPlexImageUrl(localItem.thumb, plexToken);
        }
        // Use local audienceRating as fallback if no rating from TMDB
        if (localItem.audienceRating && !item.rating) {
          item.rating = localItem.audienceRating;
        }
      }
    }
  }

  return { items, counts };
}
