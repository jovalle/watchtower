/**
 * Trakt API client for fetching public watchlists.
 * The .server.ts suffix ensures this is never bundled for the client.
 */

import type { TraktResult, TraktWatchlistItem } from "./types";
import { env } from "~/lib/env.server";

const TRAKT_BASE_URL = "https://api.trakt.tv";
const TRAKT_REQUEST_TIMEOUT = 10000; // 10 seconds

/**
 * Trakt API client for fetching public watchlists.
 */
export class TraktClient {
  private readonly clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  /**
   * Get headers for Trakt API requests.
   */
  private getHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": this.clientId,
    };
  }

  /**
   * Make a request to the Trakt API.
   */
  private async request<T>(path: string): Promise<TraktResult<T>> {
    const url = `${TRAKT_BASE_URL}${path}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        TRAKT_REQUEST_TIMEOUT
      );

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Handle specific Trakt error codes
        if (response.status === 404) {
          return {
            success: false,
            error: {
              code: 404,
              message: "User not found or watchlist is private",
              status: 404,
            },
          };
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
   * Get a user's public watchlist.
   * @param username The Trakt username
   * @param type Optional filter for movies or shows only
   */
  async getPublicWatchlist(
    username: string,
    type?: "movies" | "shows"
  ): Promise<TraktResult<TraktWatchlistItem[]>> {
    const path = type
      ? `/users/${username}/watchlist/${type}`
      : `/users/${username}/watchlist`;

    return this.request<TraktWatchlistItem[]>(path);
  }
}

/**
 * Create a TraktClient if configured.
 * Returns null if Trakt is not configured.
 */
export function createTraktClient(): TraktClient | null {
  const clientId = env.TRAKT_CLIENT_ID;
  if (!clientId) {
    return null;
  }
  return new TraktClient(clientId);
}

/**
 * Check if Trakt integration is enabled.
 */
export function isTraktEnabled(): boolean {
  return !!(env.TRAKT_CLIENT_ID && env.TRAKT_USERNAME);
}
