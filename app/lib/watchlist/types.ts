/**
 * Multi-source watchlist types
 */

export type WatchlistSource = "plex" | "trakt" | "imdb";
export type WatchlistFilter = "all" | WatchlistSource;

/**
 * Unified watchlist item that can come from any source
 */
export interface UnifiedWatchlistItem {
  /** Unique identifier (prefer IMDB ID, fall back to TMDB ID or Plex GUID) */
  id: string;
  /** Display title */
  title: string;
  /** Media type */
  type: "movie" | "show";
  /** Release year */
  year?: number;
  /** Poster/thumbnail URL */
  thumb: string;
  /** Which watchlist sources this item appears in */
  sources: WatchlistSource[];
  /** Timestamps when added to each source (unix seconds) */
  addedAt: {
    plex?: number;
    trakt?: number;
    imdb?: number;
  };
  /** Local Plex library rating key if available */
  localRatingKey?: string;
  /** Whether item exists in local Plex library */
  isLocal: boolean;
  /** External IDs for cross-referencing and deduplication */
  imdbId?: string;
  tmdbId?: number;
  plexGuid?: string;
  /** IMDb/TMDB rating (0-10 scale) */
  rating?: number;
  /** Whether the item has been watched (for movies) or fully watched (for shows) */
  isWatched?: boolean;
}

/**
 * Counts per source for filter UI
 */
export interface WatchlistCounts {
  all: number;
  plex: number;
  trakt: number;
  imdb: number;
}
