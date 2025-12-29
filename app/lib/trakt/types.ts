/**
 * Trakt API type definitions.
 */

/**
 * Trakt API error structure.
 */
export interface TraktError {
  code: number;
  message: string;
  status?: number;
}

/**
 * Result type for Trakt API operations.
 */
export type TraktResult<T> =
  | { success: true; data: T }
  | { success: false; error: TraktError };

/**
 * Trakt movie IDs object.
 */
export interface TraktMovieIds {
  trakt: number;
  slug: string;
  imdb?: string;
  tmdb?: number;
}

/**
 * Trakt show IDs object.
 */
export interface TraktShowIds {
  trakt: number;
  slug: string;
  imdb?: string;
  tmdb?: number;
  tvdb?: number;
}

/**
 * Trakt movie from API responses.
 */
export interface TraktMovie {
  title: string;
  year: number | null;
  ids: TraktMovieIds;
}

/**
 * Trakt show from API responses.
 */
export interface TraktShow {
  title: string;
  year: number | null;
  ids: TraktShowIds;
}

/**
 * Trakt watchlist item from API responses.
 */
export interface TraktWatchlistItem {
  rank: number;
  id: number;
  listed_at: string; // ISO 8601 date string
  notes: string | null;
  type: "movie" | "show";
  movie?: TraktMovie;
  show?: TraktShow;
}
