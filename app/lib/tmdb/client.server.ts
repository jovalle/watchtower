/**
 * TMDB API client for fetching movie/TV recommendations.
 * The .server.ts suffix ensures this is never bundled for the client.
 */

import type {
  TMDBResult,
  TMDBMovie,
  TMDBShow,
  TMDBPaginatedResponse,
  TMDBRecommendation,
  TMDBImagesResponse,
  TMDBFindResponse,
  TMDBFindResult,
} from "./types";
import { getCachedLogo, cacheLogo } from "./cache.server";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p";
const TMDB_REQUEST_TIMEOUT = 10000; // 10 seconds

/**
 * TMDB API client for fetching recommendations.
 */
export class TMDBClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Make a request to the TMDB API.
   */
  private async request<T>(path: string): Promise<TMDBResult<T>> {
    const url = `${TMDB_BASE_URL}${path}`;
    const separator = path.includes("?") ? "&" : "?";
    const urlWithKey = `${url}${separator}api_key=${this.apiKey}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        TMDB_REQUEST_TIMEOUT
      );

      const response = await fetch(urlWithKey, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Check for rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After") || "unknown";
          console.error(`[TMDB] RATE LIMITED! Retry after: ${retryAfter}s. Path: ${path}`);
        }

        return {
          success: false,
          error: {
            code: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          },
        };
      }

      const data = (await response.json()) as T;
      return { success: true, data };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          return {
            success: false,
            error: {
              code: -1,
              message: "Request timed out",
            },
          };
        }

        return {
          success: false,
          error: {
            code: -1,
            message: error.message,
          },
        };
      }

      return {
        success: false,
        error: {
          code: -1,
          message: "Unknown error occurred",
        },
      };
    }
  }

  /**
   * Get movie recommendations by TMDB ID.
   */
  async getMovieRecommendations(
    tmdbId: number
  ): Promise<TMDBResult<TMDBMovie[]>> {
    const result = await this.request<TMDBPaginatedResponse<TMDBMovie>>(
      `/movie/${tmdbId}/recommendations`
    );

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.results,
    };
  }

  /**
   * Get TV show recommendations by TMDB ID.
   */
  async getTVRecommendations(tmdbId: number): Promise<TMDBResult<TMDBShow[]>> {
    const result = await this.request<TMDBPaginatedResponse<TMDBShow>>(
      `/tv/${tmdbId}/recommendations`
    );

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.results,
    };
  }

  /**
   * Search for a movie by title and optional year.
   */
  async searchMovie(
    title: string,
    year?: number
  ): Promise<TMDBResult<TMDBMovie[]>> {
    const params = new URLSearchParams();
    params.set("query", title);
    if (year) {
      params.set("year", year.toString());
    }

    const result = await this.request<TMDBPaginatedResponse<TMDBMovie>>(
      `/search/movie?${params.toString()}`
    );

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.results,
    };
  }

  /**
   * Search for a TV show by title and optional year.
   */
  async searchTV(title: string, year?: number): Promise<TMDBResult<TMDBShow[]>> {
    const params = new URLSearchParams();
    params.set("query", title);
    if (year) {
      params.set("first_air_date_year", year.toString());
    }

    const result = await this.request<TMDBPaginatedResponse<TMDBShow>>(
      `/search/tv?${params.toString()}`
    );

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.results,
    };
  }

  /**
   * Find a movie or TV show by IMDB ID.
   * Uses TMDB's find endpoint to look up by external ID.
   */
  async findByIMDB(imdbId: string): Promise<TMDBResult<TMDBFindResult | null>> {
    const result = await this.request<TMDBFindResponse>(
      `/find/${imdbId}?external_source=imdb_id`
    );

    if (!result.success) {
      return result;
    }

    // Check for movie first
    if (result.data.movie_results.length > 0) {
      const movie = result.data.movie_results[0];
      const year = movie.release_date
        ? parseInt(movie.release_date.split("-")[0], 10)
        : undefined;

      return {
        success: true,
        data: {
          type: "movie",
          id: movie.id,
          title: movie.title,
          year,
          posterPath: movie.poster_path,
          backdropPath: movie.backdrop_path,
          overview: movie.overview,
          rating: movie.vote_average > 0 ? movie.vote_average : undefined,
        },
      };
    }

    // Check for TV show
    if (result.data.tv_results.length > 0) {
      const show = result.data.tv_results[0];
      const year = show.first_air_date
        ? parseInt(show.first_air_date.split("-")[0], 10)
        : undefined;

      return {
        success: true,
        data: {
          type: "show",
          id: show.id,
          title: show.name,
          year,
          posterPath: show.poster_path,
          backdropPath: show.backdrop_path,
          overview: show.overview,
          rating: show.vote_average > 0 ? show.vote_average : undefined,
        },
      };
    }

    // No match found
    return { success: true, data: null };
  }

  /**
   * Get recommendations for a movie by title and year.
   * First searches for the movie to get TMDB ID, then fetches recommendations.
   */
  async getMovieRecommendationsByTitle(
    title: string,
    year?: number
  ): Promise<TMDBResult<TMDBRecommendation[]>> {
    // Search for the movie
    const searchResult = await this.searchMovie(title, year);
    if (!searchResult.success) {
      return searchResult;
    }

    if (searchResult.data.length === 0) {
      return { success: true, data: [] };
    }

    // Use the first match
    const movie = searchResult.data[0];

    // Get recommendations
    const recsResult = await this.getMovieRecommendations(movie.id);
    if (!recsResult.success) {
      return recsResult;
    }

    // Transform to unified format
    const recommendations = recsResult.data.slice(0, 12).map((m) =>
      this.movieToRecommendation(m)
    );

    return { success: true, data: recommendations };
  }

  /**
   * Get recommendations for a TV show by title and year.
   * First searches for the show to get TMDB ID, then fetches recommendations.
   */
  async getTVRecommendationsByTitle(
    title: string,
    year?: number
  ): Promise<TMDBResult<TMDBRecommendation[]>> {
    // Search for the show
    const searchResult = await this.searchTV(title, year);
    if (!searchResult.success) {
      return searchResult;
    }

    if (searchResult.data.length === 0) {
      return { success: true, data: [] };
    }

    // Use the first match
    const show = searchResult.data[0];

    // Get recommendations
    const recsResult = await this.getTVRecommendations(show.id);
    if (!recsResult.success) {
      return recsResult;
    }

    // Transform to unified format
    const recommendations = recsResult.data.slice(0, 12).map((s) =>
      this.showToRecommendation(s)
    );

    return { success: true, data: recommendations };
  }

  /**
   * Convert TMDB movie to unified recommendation format.
   */
  private movieToRecommendation(movie: TMDBMovie): TMDBRecommendation {
    return {
      id: movie.id,
      title: movie.title,
      type: "movie",
      overview: movie.overview,
      posterUrl: movie.poster_path
        ? `${TMDB_IMAGE_BASE_URL}/w342${movie.poster_path}`
        : null,
      backdropUrl: movie.backdrop_path
        ? `${TMDB_IMAGE_BASE_URL}/w780${movie.backdrop_path}`
        : null,
      rating: movie.vote_average,
      releaseDate: movie.release_date,
      tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`,
    };
  }

  /**
   * Convert TMDB show to unified recommendation format.
   */
  private showToRecommendation(show: TMDBShow): TMDBRecommendation {
    return {
      id: show.id,
      title: show.name,
      type: "show",
      overview: show.overview,
      posterUrl: show.poster_path
        ? `${TMDB_IMAGE_BASE_URL}/w342${show.poster_path}`
        : null,
      backdropUrl: show.backdrop_path
        ? `${TMDB_IMAGE_BASE_URL}/w780${show.backdrop_path}`
        : null,
      rating: show.vote_average,
      releaseDate: show.first_air_date,
      tmdbUrl: `https://www.themoviedb.org/tv/${show.id}`,
    };
  }

  /**
   * Get images (logos, backdrops, posters) for a movie by TMDB ID.
   */
  async getMovieImages(tmdbId: number): Promise<TMDBResult<TMDBImagesResponse>> {
    return this.request<TMDBImagesResponse>(`/movie/${tmdbId}/images`);
  }

  /**
   * Get images (logos, backdrops, posters) for a TV show by TMDB ID.
   */
  async getTVImages(tmdbId: number): Promise<TMDBResult<TMDBImagesResponse>> {
    return this.request<TMDBImagesResponse>(`/tv/${tmdbId}/images`);
  }

  /**
   * Get the best logo URL for a movie by title and year.
   * Returns the highest-voted English logo, or null if none found.
   */
  async getMovieLogoUrl(title: string, year?: number): Promise<string | null> {
    const searchResult = await this.searchMovie(title, year);
    if (!searchResult.success || searchResult.data.length === 0) {
      return null;
    }

    const movie = searchResult.data[0];
    const imagesResult = await this.getMovieImages(movie.id);

    if (!imagesResult.success || imagesResult.data.logos.length === 0) {
      return null;
    }

    // Prefer English logos, then fall back to any logo
    const logos = imagesResult.data.logos;
    const englishLogo = logos.find(logo => logo.iso_639_1 === 'en');
    const bestLogo = englishLogo || logos[0];

    return `${TMDB_IMAGE_BASE_URL}/w500${bestLogo.file_path}`;
  }

  /**
   * Get the best logo URL for a TV show by title and year.
   * Returns the highest-voted English logo, or null if none found.
   */
  async getTVLogoUrl(title: string, year?: number): Promise<string | null> {
    const searchResult = await this.searchTV(title, year);
    if (!searchResult.success || searchResult.data.length === 0) {
      return null;
    }

    const show = searchResult.data[0];
    const imagesResult = await this.getTVImages(show.id);

    if (!imagesResult.success || imagesResult.data.logos.length === 0) {
      return null;
    }

    // Prefer English logos, then fall back to any logo
    const logos = imagesResult.data.logos;
    const englishLogo = logos.find(logo => logo.iso_639_1 === 'en');
    const bestLogo = englishLogo || logos[0];

    return `${TMDB_IMAGE_BASE_URL}/w500${bestLogo.file_path}`;
  }

  /**
   * Get a cached movie logo URL, fetching and caching if needed.
   * Returns a local URL that can be served from the cache.
   */
  async getCachedMovieLogoUrl(title: string, year?: number): Promise<string | null> {
    // Clean up title - remove year suffixes like "(2017)" that might be in the title
    const cleanTitle = title.replace(/\s*\(\d{4}\)\s*$/, "").trim();

    // Check cache first
    const cached = await getCachedLogo("movie", cleanTitle, year);
    if (cached.hit) {
      if (cached.logoPath) {
        console.log(`[TMDB] Logo cache HIT: movie "${cleanTitle}" -> ${cached.logoPath.split("/").pop()}`);
        return `/api/cache/tmdb/logos/${cached.logoPath.split("/").pop()}`;
      }
      // Cached negative result - no logo available
      console.log(`[TMDB] Logo cache HIT (no logo exists): movie "${cleanTitle}" (${year || 'no year'})`);
      return null;
    }

    console.log(`[TMDB] Logo cache MISS: movie "${cleanTitle}" (${year || 'no year'}) - fetching from TMDB...`);

    // Try with year first for movies (more accurate), then without
    let searchResult = await this.searchMovie(cleanTitle, year);

    // If no results with year, try without
    if ((!searchResult.success || searchResult.data.length === 0) && year) {
      searchResult = await this.searchMovie(cleanTitle);
    }

    if (!searchResult.success) {
      console.error(`[TMDB] Search failed for movie "${cleanTitle}":`, searchResult.error);
      await cacheLogo("movie", cleanTitle, year, null);
      return null;
    }

    if (searchResult.data.length === 0) {
      console.warn(`[TMDB] No movie found for "${cleanTitle}" (${year || 'no year'})`);
      await cacheLogo("movie", cleanTitle, year, null);
      return null;
    }

    const movie = searchResult.data[0];
    const imagesResult = await this.getMovieImages(movie.id);

    if (!imagesResult.success) {
      console.error(`[TMDB] Failed to get images for movie "${cleanTitle}" (TMDB ID: ${movie.id}):`, imagesResult.error);
      await cacheLogo("movie", cleanTitle, year, null, movie.id);
      return null;
    }

    if (imagesResult.data.logos.length === 0) {
      console.warn(`[TMDB] No logos available for movie "${cleanTitle}" (TMDB ID: ${movie.id}, matched: "${movie.title}")`);
      await cacheLogo("movie", cleanTitle, year, null, movie.id);
      return null;
    }

    // Prefer English logos, then fall back to any logo
    const logos = imagesResult.data.logos;
    const englishLogo = logos.find(logo => logo.iso_639_1 === 'en');
    const bestLogo = englishLogo || logos[0];
    const remoteUrl = `${TMDB_IMAGE_BASE_URL}/w500${bestLogo.file_path}`;

    // Download and cache the logo
    const localPath = await cacheLogo("movie", cleanTitle, year, remoteUrl, movie.id);

    if (localPath) {
      console.log(`[TMDB] Logo cached for movie "${cleanTitle}" (TMDB ID: ${movie.id})`);
      return `/api/cache/tmdb/logos/${localPath.split("/").pop()}`;
    }

    console.error(`[TMDB] Failed to download/cache logo for movie "${cleanTitle}"`);
    return null;
  }

  /**
   * Get a cached TV show logo URL, fetching and caching if needed.
   * Returns a local URL that can be served from the cache.
   * Note: For TV shows, year is often unreliable (could be last aired year),
   * so we search without year first, then fall back to with year.
   */
  async getCachedTVLogoUrl(title: string, year?: number): Promise<string | null> {
    // Clean up title - remove year suffixes like "(2017)" that Plex sometimes adds
    const cleanTitle = title.replace(/\s*\(\d{4}\)\s*$/, "").trim();

    // Check cache first (use clean title for cache key)
    const cached = await getCachedLogo("tv", cleanTitle, year);
    if (cached.hit) {
      if (cached.logoPath) {
        console.log(`[TMDB] Logo cache HIT: tv "${cleanTitle}" -> ${cached.logoPath.split("/").pop()}`);
        return `/api/cache/tmdb/logos/${cached.logoPath.split("/").pop()}`;
      }
      // Cached negative result - no logo available
      console.log(`[TMDB] Logo cache HIT (no logo exists): tv "${cleanTitle}" (${year || 'no year'})`);
      return null;
    }

    console.log(`[TMDB] Logo cache MISS: tv "${cleanTitle}" (${year || 'no year'}) - fetching from TMDB...`);

    // For TV shows, try searching without year first (more reliable)
    // since Plex often provides the "last aired" year, not premiere year
    let searchResult = await this.searchTV(cleanTitle);

    // If no results, try with year
    if ((!searchResult.success || searchResult.data.length === 0) && year) {
      searchResult = await this.searchTV(cleanTitle, year);
    }

    if (!searchResult.success) {
      console.error(`[TMDB] Search failed for TV "${cleanTitle}":`, searchResult.error);
      await cacheLogo("tv", cleanTitle, year, null);
      return null;
    }

    if (searchResult.data.length === 0) {
      console.warn(`[TMDB] No TV show found for "${cleanTitle}" (${year || 'no year'})`);
      await cacheLogo("tv", cleanTitle, year, null);
      return null;
    }

    const show = searchResult.data[0];
    const imagesResult = await this.getTVImages(show.id);

    if (!imagesResult.success) {
      console.error(`[TMDB] Failed to get images for TV "${cleanTitle}" (TMDB ID: ${show.id}):`, imagesResult.error);
      await cacheLogo("tv", cleanTitle, year, null, show.id);
      return null;
    }

    if (imagesResult.data.logos.length === 0) {
      console.warn(`[TMDB] No logos available for TV "${cleanTitle}" (TMDB ID: ${show.id}, matched: "${show.name}")`);
      await cacheLogo("tv", cleanTitle, year, null, show.id);
      return null;
    }

    // Prefer English logos, then fall back to any logo
    const logos = imagesResult.data.logos;
    const englishLogo = logos.find(logo => logo.iso_639_1 === 'en');
    const bestLogo = englishLogo || logos[0];
    const remoteUrl = `${TMDB_IMAGE_BASE_URL}/w500${bestLogo.file_path}`;

    // Download and cache the logo
    const localPath = await cacheLogo("tv", cleanTitle, year, remoteUrl, show.id);

    if (localPath) {
      console.log(`[TMDB] Logo cached for TV "${cleanTitle}" (TMDB ID: ${show.id})`);
      return `/api/cache/tmdb/logos/${localPath.split("/").pop()}`;
    }

    console.error(`[TMDB] Failed to download/cache logo for TV "${cleanTitle}"`);
    return null;
  }

}

/**
 * Get TMDB API key from environment.
 * Returns null if not configured (graceful fallback).
 */
export function getTMDBApiKey(): string | null {
  return process.env.TMDB_API_KEY || null;
}

/**
 * Create a TMDBClient if API key is configured.
 * Returns null if TMDB is not configured.
 */
export function createTMDBClient(): TMDBClient | null {
  const apiKey = getTMDBApiKey();
  if (!apiKey) {
    return null;
  }
  return new TMDBClient(apiKey);
}
