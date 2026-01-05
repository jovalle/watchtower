/**
 * OMDb API client for fetching individual ratings from multiple sources.
 * OMDb provides ratings from IMDb, Rotten Tomatoes, and Metacritic.
 */

const OMDB_BASE_URL = "https://www.omdbapi.com";
const OMDB_REQUEST_TIMEOUT = 10000;

export interface OMDbRating {
  source: string;
  value: string;
}

export interface OMDbRatings {
  imdb?: { rating: string; votes: string };
  rottenTomatoes?: { rating: string };
  metacritic?: { rating: string };
}

interface OMDbResponse {
  Response: "True" | "False";
  Error?: string;
  imdbRating?: string;
  imdbVotes?: string;
  Metascore?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
}

export type OMDbResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * OMDb API client for fetching ratings.
 */
export class OMDbClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch ratings by IMDb ID.
   */
  async getRatingsByIMDbId(imdbId: string): Promise<OMDbResult<OMDbRatings>> {
    const url = `${OMDB_BASE_URL}/?apikey=${this.apiKey}&i=${imdbId}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), OMDB_REQUEST_TIMEOUT);

      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data: OMDbResponse = await response.json();

      if (data.Response === "False") {
        return {
          success: false,
          error: data.Error || "Unknown error",
        };
      }

      const ratings: OMDbRatings = {};

      // IMDb rating
      if (data.imdbRating && data.imdbRating !== "N/A") {
        ratings.imdb = {
          rating: data.imdbRating,
          votes: data.imdbVotes?.replace(/,/g, "") || "0",
        };
      }

      // Parse Ratings array for RT and Metacritic
      if (data.Ratings) {
        for (const rating of data.Ratings) {
          if (rating.Source === "Rotten Tomatoes") {
            ratings.rottenTomatoes = { rating: rating.Value };
          } else if (rating.Source === "Metacritic") {
            ratings.metacritic = { rating: rating.Value };
          }
        }
      }

      // Metacritic from Metascore field (fallback)
      if (!ratings.metacritic && data.Metascore && data.Metascore !== "N/A") {
        ratings.metacritic = { rating: `${data.Metascore}/100` };
      }

      return { success: true, data: ratings };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          return { success: false, error: "Request timed out" };
        }
        return { success: false, error: error.message };
      }
      return { success: false, error: "Unknown error" };
    }
  }

  /**
   * Fetch ratings by title and year.
   */
  async getRatingsByTitle(
    title: string,
    year?: number,
    type?: "movie" | "series"
  ): Promise<OMDbResult<OMDbRatings>> {
    const params = new URLSearchParams({
      apikey: this.apiKey,
      t: title,
    });

    if (year) {
      params.set("y", year.toString());
    }
    if (type) {
      params.set("type", type);
    }

    const url = `${OMDB_BASE_URL}/?${params.toString()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), OMDB_REQUEST_TIMEOUT);

      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data: OMDbResponse = await response.json();

      if (data.Response === "False") {
        return {
          success: false,
          error: data.Error || "Unknown error",
        };
      }

      const ratings: OMDbRatings = {};

      // IMDb rating
      if (data.imdbRating && data.imdbRating !== "N/A") {
        ratings.imdb = {
          rating: data.imdbRating,
          votes: data.imdbVotes?.replace(/,/g, "") || "0",
        };
      }

      // Parse Ratings array for RT and Metacritic
      if (data.Ratings) {
        for (const rating of data.Ratings) {
          if (rating.Source === "Rotten Tomatoes") {
            ratings.rottenTomatoes = { rating: rating.Value };
          } else if (rating.Source === "Metacritic") {
            ratings.metacritic = { rating: rating.Value };
          }
        }
      }

      // Metacritic from Metascore field (fallback)
      if (!ratings.metacritic && data.Metascore && data.Metascore !== "N/A") {
        ratings.metacritic = { rating: `${data.Metascore}/100` };
      }

      return { success: true, data: ratings };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          return { success: false, error: "Request timed out" };
        }
        return { success: false, error: error.message };
      }
      return { success: false, error: "Unknown error" };
    }
  }
}

/**
 * Get OMDb API key from environment.
 */
export function getOMDbApiKey(): string | null {
  return process.env.OMDB_API_KEY || null;
}

/**
 * Create an OMDbClient if API key is configured.
 */
export function createOMDbClient(): OMDbClient | null {
  const apiKey = getOMDbApiKey();
  if (!apiKey) {
    return null;
  }
  return new OMDbClient(apiKey);
}
