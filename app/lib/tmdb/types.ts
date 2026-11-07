/**
 * TMDB API type definitions.
 */

/**
 * TMDB API error structure.
 */
export interface TMDBError {
  code: number;
  message: string;
  status?: number;
}

/**
 * Result type for TMDB API operations.
 */
export type TMDBResult<T> =
  | { success: true; data: T }
  | { success: false; error: TMDBError };

/**
 * TMDB movie from API responses.
 */
export interface TMDBMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  release_date: string;
  popularity: number;
  adult: boolean;
  genre_ids: number[];
}

/**
 * TMDB TV show from API responses.
 */
export interface TMDBShow {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  first_air_date: string;
  popularity: number;
  genre_ids: number[];
}

/**
 * TMDB paginated response wrapper.
 */
export interface TMDBPaginatedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

/**
 * Unified recommendation item for UI display.
 * Normalizes movies and shows into a common format.
 */
export interface TMDBRecommendation {
  id: number;
  title: string;
  type: "movie" | "show";
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  rating: number;
  releaseDate: string;
  tmdbUrl: string;
}

/**
 * TMDB image (logo, backdrop, poster) from API responses.
 */
export interface TMDBImage {
  aspect_ratio: number;
  file_path: string;
  height: number;
  width: number;
  iso_639_1?: string | null;
  vote_average: number;
  vote_count: number;
}

/**
 * TMDB images response (logos, backdrops, posters).
 */
export interface TMDBImagesResponse {
  id: number;
  logos: TMDBImage[];
  backdrops: TMDBImage[];
  posters: TMDBImage[];
}

/**
 * TMDB find by external ID response.
 */
export interface TMDBFindResponse {
  movie_results: TMDBMovie[];
  tv_results: TMDBShow[];
  person_results: unknown[];
}

/**
 * Unified find result (movie or show).
 */
export interface TMDBFindResult {
  type: "movie" | "show";
  id: number;
  title: string;
  year?: number;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  /** TMDB rating (0-10 scale) */
  rating?: number;
}

export interface TMDBCastMember {
  id: number;
  name: string;
  character?: string;
}

export interface TMDBPerson {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  known_for_department: string | null;
  profile_path: string | null;
}

export type TMDBPersonCredit =
  | (TMDBMovie & { media_type: "movie"; character?: string })
  | (TMDBShow & { media_type: "tv"; character?: string; adult?: boolean });

export interface TMDBPersonSearchResult {
  id: number;
  adult?: boolean;
  known_for: TMDBPersonCredit[];
}
