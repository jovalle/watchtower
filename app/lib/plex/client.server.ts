/**
 * Plex API client for server communication.
 * The .server.ts suffix ensures this is never bundled for the client.
 */

import { PLEX_HEADERS, PLEX_REQUEST_TIMEOUT, PLEX_DISCOVER_URL } from "./constants";
import type {
  PlexServerIdentity,
  PlexIdentityResponse,
  PlexResult,
  PlexServerConfig,
  PlexLibrarySection,
  PlexLibrarySectionsResponse,
  PlexMediaItem,
  PlexLibraryItemsResponse,
  PlexMetadata,
  PlexMetadataResponse,
  LibraryQueryOptions,
  PlexPlaybackInfo,
  PlexWatchlistItem,
  PlexWatchlistResponse,
  QualityProfile,
  PlexPlaylist,
  PlexPlaylistsResponse,
  PlexCollection,
  PlexCollectionsResponse,
  PlexActiveSession,
  PlexSessionsResponse,
} from "./types";
import { QUALITY_PROFILES } from "./types";

/**
 * Plex API client for communicating with a Plex Media Server.
 */
export class PlexClient {
  private readonly serverUrl: string;
  private readonly token: string;
  private readonly clientId: string;

  constructor(config: PlexServerConfig) {
    // Ensure no trailing slash on server URL
    this.serverUrl = config.serverUrl.replace(/\/$/, "");
    this.token = config.token;
    this.clientId = config.clientId;
  }

  /**
   * Build headers for Plex API requests.
   */
  private getHeaders(): HeadersInit {
    return {
      ...PLEX_HEADERS,
      "X-Plex-Client-Identifier": this.clientId,
      "X-Plex-Token": this.token,
    };
  }

  /**
   * Make a request to the Plex server.
   */
  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<PlexResult<T>> {
    const url = `${this.serverUrl}${path}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        PLEX_REQUEST_TIMEOUT
      );

      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
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

        // Network errors (connection refused, DNS failure, etc.)
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
   * Get server identity information.
   * This is a lightweight call to verify connectivity and get basic server info.
   */
  async getServerIdentity(): Promise<PlexResult<PlexServerIdentity>> {
    const result = await this.request<PlexIdentityResponse>("/");

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.MediaContainer,
    };
  }

  /**
   * Check if the server is connected and responding.
   */
  async isConnected(): Promise<boolean> {
    const result = await this.getServerIdentity();
    return result.success;
  }

  /**
   * Get all library sections from the server.
   */
  async getLibraries(): Promise<PlexResult<PlexLibrarySection[]>> {
    const result = await this.request<PlexLibrarySectionsResponse>(
      "/library/sections"
    );

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.MediaContainer.Directory || [],
    };
  }

  /**
   * Get items from a library section.
   */
  async getLibraryItems(
    sectionKey: string,
    options: LibraryQueryOptions = {}
  ): Promise<PlexResult<PlexMediaItem[]>> {
    const params = new URLSearchParams();

    if (options.sort) {
      params.set("sort", options.sort);
    }
    if (options.genre) {
      params.set("genre", options.genre);
    }
    if (options.year !== undefined) {
      params.set("year", options.year.toString());
    }
    if (options.limit !== undefined) {
      params.set("X-Plex-Container-Size", options.limit.toString());
    }
    if (options.offset !== undefined) {
      params.set("X-Plex-Container-Start", options.offset.toString());
    }

    // Build query string, including raw filter if provided
    let queryString = params.toString();
    if (options.filter) {
      // Append filter directly (e.g., "unwatched=1" or "inProgress=1")
      queryString = queryString ? `${queryString}&${options.filter}` : options.filter;
    }
    const path = `/library/sections/${sectionKey}/all${queryString ? `?${queryString}` : ""}`;

    const result = await this.request<PlexLibraryItemsResponse>(path);

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.MediaContainer.Metadata || [],
    };
  }

  /**
   * Get available filter values for a library (genres, years, etc.)
   */
  async getLibraryFilters(sectionKey: string): Promise<PlexResult<{
    genres: string[];
    years: number[];
    contentRatings: string[];
  }>> {
    // Fetch all items with minimal fields to extract filter values
    const result = await this.request<PlexLibraryItemsResponse>(
      `/library/sections/${sectionKey}/all?X-Plex-Container-Size=5000`
    );

    if (!result.success) {
      return result;
    }

    const items = result.data.MediaContainer.Metadata || [];

    // Extract unique genres, years, and content ratings
    const genreSet = new Set<string>();
    const yearSet = new Set<number>();
    const contentRatingSet = new Set<string>();

    for (const item of items) {
      if (item.Genre) {
        for (const g of item.Genre) {
          genreSet.add(g.tag);
        }
      }
      if (item.year) {
        yearSet.add(item.year);
      }
      if (item.contentRating) {
        contentRatingSet.add(item.contentRating);
      }
    }

    return {
      success: true,
      data: {
        genres: Array.from(genreSet).sort(),
        years: Array.from(yearSet).sort((a, b) => b - a), // Descending (newest first)
        contentRatings: Array.from(contentRatingSet).sort(),
      },
    };
  }

  /**
   * Get recently added items, optionally from a specific library.
   */
  async getRecentlyAdded(
    sectionKey?: string,
    limit: number = 20
  ): Promise<PlexResult<PlexMediaItem[]>> {
    const params = new URLSearchParams();
    params.set("X-Plex-Container-Size", limit.toString());

    const path = sectionKey
      ? `/library/sections/${sectionKey}/recentlyAdded?${params.toString()}`
      : `/library/recentlyAdded?${params.toString()}`;

    const result = await this.request<PlexLibraryItemsResponse>(path);

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.MediaContainer.Metadata || [],
    };
  }

  /**
   * Get full metadata for a specific item.
   */
  async getMetadata(ratingKey: string): Promise<PlexResult<PlexMetadata>> {
    const result = await this.request<PlexMetadataResponse>(
      `/library/metadata/${ratingKey}`
    );

    if (!result.success) {
      return result;
    }

    const metadata = result.data.MediaContainer.Metadata?.[0];
    if (!metadata) {
      return {
        success: false,
        error: {
          code: 404,
          message: "Metadata not found",
          status: 404,
        },
      };
    }

    return {
      success: true,
      data: metadata,
    };
  }

  /**
   * Get children of a media item (e.g., seasons for a show, episodes for a season).
   */
  async getChildren(ratingKey: string): Promise<PlexResult<PlexMediaItem[]>> {
    const result = await this.request<PlexLibraryItemsResponse>(
      `/library/metadata/${ratingKey}/children`
    );

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.MediaContainer.Metadata || [],
    };
  }

  /**
   * Get items from a library section filtered by actor ID.
   */
  async getLibraryItemsByActor(
    sectionKey: string,
    actorId: string
  ): Promise<PlexResult<PlexMediaItem[]>> {
    const path = `/library/sections/${sectionKey}/all?actor=${actorId}`;

    const result = await this.request<PlexLibraryItemsResponse>(path);

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.MediaContainer.Metadata || [],
    };
  }

  /**
   * Get items currently "on deck" (continue watching).
   */
  async getOnDeck(limit: number = 20): Promise<PlexResult<PlexMediaItem[]>> {
    const params = new URLSearchParams();
    params.set("X-Plex-Container-Size", limit.toString());

    const result = await this.request<PlexLibraryItemsResponse>(
      `/library/onDeck?${params.toString()}`
    );

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.MediaContainer.Metadata || [],
    };
  }

  /**
   * Get playback information for streaming a media item.
   * Returns an HLS stream URL with authentication parameters.
   *
   * @param ratingKey - The rating key of the media item
   * @param options.offsetSeconds - Resume position in SECONDS
   * @param options.quality - Quality profile to use (defaults to original)
   * @param options.forceTranscode - Force transcoding instead of direct play
   */
  getPlaybackInfo(
    ratingKey: string,
    options: {
      offsetSeconds?: number;
      quality?: QualityProfile;
      forceTranscode?: boolean;
    } = {}
  ): PlexPlaybackInfo {
    const { offsetSeconds = 0, quality, forceTranscode = false } = options;
    const selectedQuality = quality || QUALITY_PROFILES[0];
    const useDirectPlay = Boolean(selectedQuality.isOriginal) && !forceTranscode;

    const params = new URLSearchParams();

    // Media path reference
    params.set("path", `/library/metadata/${ratingKey}`);

    // HLS streaming
    params.set("protocol", "hls");
    params.set("copyts", "1");
    params.set("mediaIndex", "0");
    params.set("partIndex", "0");

    if (useDirectPlay) {
      // Direct play/stream mode
      params.set("directPlay", "1");
      params.set("directStream", "1");
      params.set("directStreamAudio", "1");
    } else {
      // Transcode mode
      params.set("directPlay", "0");
      params.set("directStream", "0");
      params.set("videoCodec", "h264");
      params.set("audioCodec", "aac");
      params.set("context", "streaming");

      if (selectedQuality.maxBitrate) {
        params.set("videoBitrate", selectedQuality.maxBitrate.toString());
        params.set("maxVideoBitrate", selectedQuality.maxBitrate.toString());
      }

      const resolutions: Record<string, string> = {
        "1080p": "1920x1080",
        "720p": "1280x720",
        "480p": "854x480",
      };
      if (selectedQuality.resolution && resolutions[selectedQuality.resolution]) {
        params.set("videoResolution", resolutions[selectedQuality.resolution]);
      }
    }

    // Resume position - Plex expects SECONDS
    if (offsetSeconds > 0) {
      params.set("offset", Math.floor(offsetSeconds).toString());
    }

    // Client identification
    params.set("X-Plex-Token", this.token);
    params.set("X-Plex-Client-Identifier", this.clientId);
    params.set("X-Plex-Product", PLEX_HEADERS["X-Plex-Product"]);
    params.set("X-Plex-Version", PLEX_HEADERS["X-Plex-Version"]);
    params.set("X-Plex-Platform", PLEX_HEADERS["X-Plex-Platform"]);
    params.set("X-Plex-Platform-Version", PLEX_HEADERS["X-Plex-Platform-Version"]);
    params.set("X-Plex-Device", PLEX_HEADERS["X-Plex-Device"]);
    params.set("X-Plex-Device-Name", PLEX_HEADERS["X-Plex-Device-Name"]);

    const streamUrl = `${this.serverUrl}/video/:/transcode/universal/start.m3u8?${params.toString()}`;

    return {
      streamUrl,
      protocol: "hls",
      directPlay: useDirectPlay,
      directStream: useDirectPlay,
      quality: selectedQuality,
      availableQualities: QUALITY_PROFILES,
      method: useDirectPlay ? "direct_play" : "transcode",
    };
  }

  /**
   * Report playback timeline to Plex (for real-time progress during playback).
   * This should be called every 10 seconds during playback.
   *
   * @param params.ratingKey - The rating key of the media item
   * @param params.state - Current playback state
   * @param params.time - Current position in milliseconds
   * @param params.duration - Total duration in milliseconds
   */
  async reportTimeline(params: {
    ratingKey: string;
    state: "playing" | "paused" | "stopped";
    time: number;
    duration: number;
  }): Promise<PlexResult<void>> {
    const queryParams = new URLSearchParams();
    queryParams.set("ratingKey", params.ratingKey);
    queryParams.set("key", `/library/metadata/${params.ratingKey}`);
    queryParams.set("state", params.state);
    queryParams.set("time", params.time.toString());
    queryParams.set("duration", params.duration.toString());
    queryParams.set("identifier", "com.plexapp.plugins.library");

    const path = `/:/timeline?${queryParams.toString()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        PLEX_REQUEST_TIMEOUT
      );

      const response = await fetch(`${this.serverUrl}${path}`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          },
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: {
            code: -1,
            message: error.name === "AbortError" ? "Request timed out" : error.message,
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
   * Mark an item as watched (scrobble).
   *
   * @param ratingKey - The rating key of the media item
   */
  async scrobble(ratingKey: string): Promise<PlexResult<void>> {
    const queryParams = new URLSearchParams();
    queryParams.set("key", ratingKey);
    queryParams.set("identifier", "com.plexapp.plugins.library");

    const path = `/:/scrobble?${queryParams.toString()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        PLEX_REQUEST_TIMEOUT
      );

      const response = await fetch(`${this.serverUrl}${path}`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          },
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: {
            code: -1,
            message: error.name === "AbortError" ? "Request timed out" : error.message,
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
   * Mark an item as unwatched (unscrobble).
   *
   * @param ratingKey - The rating key of the media item
   */
  async unscrobble(ratingKey: string): Promise<PlexResult<void>> {
    const queryParams = new URLSearchParams();
    queryParams.set("key", ratingKey);
    queryParams.set("identifier", "com.plexapp.plugins.library");

    const path = `/:/unscrobble?${queryParams.toString()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        PLEX_REQUEST_TIMEOUT
      );

      const response = await fetch(`${this.serverUrl}${path}`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          },
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: {
            code: -1,
            message: error.name === "AbortError" ? "Request timed out" : error.message,
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
   * Rate an item (0-10 scale, or -1 to remove rating).
   * Rating 10 = 5 stars (used for Watchlist functionality).
   *
   * @param ratingKey - The rating key of the media item
   * @param rating - Rating from 0-10, or -1 to remove rating
   */
  async rateItem(ratingKey: string, rating: number): Promise<PlexResult<void>> {
    const queryParams = new URLSearchParams();
    queryParams.set("key", ratingKey);
    queryParams.set("identifier", "com.plexapp.plugins.library");
    queryParams.set("rating", rating.toString());

    const path = `/:/rate?${queryParams.toString()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        PLEX_REQUEST_TIMEOUT
      );

      const response = await fetch(`${this.serverUrl}${path}`, {
        method: "PUT",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          },
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: {
            code: -1,
            message: error.name === "AbortError" ? "Request timed out" : error.message,
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

  // ============================================================================
  // Watchlist Methods (using Plex Discover API)
  // ============================================================================

  /**
   * Get the user's watchlist from Plex's discover API.
   *
   * @param options.type - Filter by "movie" or "show"
   * @param options.sort - Sort field (watchlistedAt, titleSort, originallyAvailableAt, rating)
   * @param options.sortDir - Sort direction ("asc" or "desc")
   * @param options.limit - Maximum number of items to return (default: 500)
   */
  async getWatchlist(options: {
    type?: "movie" | "show";
    sort?: "watchlistedAt" | "titleSort" | "originallyAvailableAt" | "rating";
    sortDir?: "asc" | "desc";
    limit?: number;
  } = {}): Promise<PlexResult<PlexWatchlistItem[]>> {
    const params = new URLSearchParams();
    params.set("includeCollections", "1");
    params.set("includeExternalMedia", "1");

    // Set container size (Plex Discover API max is ~50)
    params.set("X-Plex-Container-Size", (options.limit || 50).toString());
    params.set("X-Plex-Container-Start", "0");

    if (options.type) {
      params.set("type", options.type === "movie" ? "1" : "2");
    }
    if (options.sort) {
      const sortDir = options.sortDir || "desc";
      params.set("sort", `${options.sort}:${sortDir}`);
    }

    // Discover API requires token as query parameter
    params.set("X-Plex-Token", this.token);

    const url = `${PLEX_DISCOVER_URL}/library/sections/watchlist/all?${params.toString()}`;
    console.log("[Watchlist API] Fetching from URL:", url.replace(/X-Plex-Token=[^&]+/, "X-Plex-Token=***"));

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        PLEX_REQUEST_TIMEOUT
      );

      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log("[Watchlist API] Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Watchlist API] Error response:", errorText.substring(0, 500));
        return {
          success: false,
          error: {
            code: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          },
        };
      }

      const data = (await response.json()) as PlexWatchlistResponse;
      console.log("[Watchlist API] Got MediaContainer with size:", data.MediaContainer?.size, "totalSize:", data.MediaContainer?.totalSize);
      console.log("[Watchlist API] Metadata items:", data.MediaContainer?.Metadata?.length ?? 0);
      return {
        success: true,
        data: data.MediaContainer.Metadata || [],
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: {
            code: -1,
            message: error.name === "AbortError" ? "Request timed out" : error.message,
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
   * Extract the discover ratingKey from a Plex GUID.
   * GUIDs look like "plex://movie/5d7768ba96b655001fdc8b00"
   * Returns "5d7768ba96b655001fdc8b00"
   */
  private extractRatingKeyFromGuid(guid: string): string {
    return guid.split("/").pop() || guid;
  }

  /**
   * Search local library for an item matching the given GUID.
   * Returns the local ratingKey if found.
   */
  async findLocalItemByGuid(guid: string): Promise<PlexResult<PlexMediaItem | null>> {
    // Search using the hub search endpoint with the GUID
    const searchParams = new URLSearchParams();
    searchParams.set("query", guid);
    searchParams.set("limit", "10");

    const result = await this.request<{
      MediaContainer: {
        size: number;
        Hub?: Array<{
          type: string;
          Metadata?: PlexMediaItem[];
        }>;
      };
    }>(`/hubs/search?${searchParams.toString()}`);

    if (!result.success) {
      return result;
    }

    // Search through hubs for matching item
    for (const hub of result.data.MediaContainer.Hub || []) {
      for (const item of hub.Metadata || []) {
        if (item.guid === guid) {
          return { success: true, data: item };
        }
      }
    }

    return { success: true, data: null };
  }

  /**
   * Search all libraries for items matching a discover GUID.
   * The discover GUID format is "plex://movie/xxx" or "plex://show/xxx".
   */
  async findLocalItemByDiscoverGuid(discoverGuid: string): Promise<PlexResult<PlexMediaItem | null>> {
    // Get all libraries
    const librariesResult = await this.getLibraries();
    if (!librariesResult.success) {
      return librariesResult;
    }

    // Determine type from guid (plex://movie/... or plex://show/...)
    const isMovie = discoverGuid.includes("/movie/");
    const isShow = discoverGuid.includes("/show/");
    const targetType = isMovie ? "movie" : isShow ? "show" : null;

    // Search through relevant libraries
    for (const library of librariesResult.data) {
      if (targetType && library.type !== targetType) {
        continue;
      }

      // Get items from this library and check GUIDs
      const itemsResult = await this.getLibraryItems(library.key, { limit: 500 });
      if (!itemsResult.success) {
        continue;
      }

      for (const item of itemsResult.data) {
        if (item.guid === discoverGuid) {
          return { success: true, data: item };
        }
      }
    }

    return { success: true, data: null };
  }

  /**
   * Add an item to the user's watchlist.
   *
   * @param guid - The Plex GUID of the item (e.g., "plex://movie/...")
   */
  async addToWatchlist(guid: string): Promise<PlexResult<void>> {
    const ratingKey = this.extractRatingKeyFromGuid(guid);
    const url = `${PLEX_DISCOVER_URL}/actions/addToWatchlist?ratingKey=${ratingKey}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        PLEX_REQUEST_TIMEOUT
      );

      const response = await fetch(url, {
        method: "PUT",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          },
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: {
            code: -1,
            message: error.name === "AbortError" ? "Request timed out" : error.message,
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
   * Remove an item from the user's watchlist.
   *
   * @param guid - The Plex GUID of the item (e.g., "plex://movie/...")
   */
  async removeFromWatchlist(guid: string): Promise<PlexResult<void>> {
    const ratingKey = this.extractRatingKeyFromGuid(guid);
    const url = `${PLEX_DISCOVER_URL}/actions/removeFromWatchlist?ratingKey=${ratingKey}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        PLEX_REQUEST_TIMEOUT
      );

      const response = await fetch(url, {
        method: "PUT",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          },
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: {
            code: -1,
            message: error.name === "AbortError" ? "Request timed out" : error.message,
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

  // ============================================================================
  // Playlist Methods
  // ============================================================================

  /**
   * Get all playlists from the server.
   */
  async getPlaylists(): Promise<PlexResult<PlexPlaylist[]>> {
    const result = await this.request<PlexPlaylistsResponse>("/playlists");

    if (!result.success) {
      return result;
    }

    // Filter to video playlists only (ignore audio/photo playlists)
    const videoPlaylists = (result.data.MediaContainer.Metadata || []).filter(
      (p) => p.playlistType === "video"
    );

    return {
      success: true,
      data: videoPlaylists,
    };
  }

  /**
   * Get items in a playlist.
   */
  async getPlaylistItems(ratingKey: string): Promise<PlexResult<PlexMediaItem[]>> {
    const result = await this.request<PlexLibraryItemsResponse>(
      `/playlists/${ratingKey}/items`
    );

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.MediaContainer.Metadata || [],
    };
  }

  /**
   * Add an item to a playlist.
   *
   * @param playlistRatingKey - The rating key of the playlist
   * @param itemRatingKey - The rating key of the item to add
   */
  async addToPlaylist(playlistRatingKey: string, itemRatingKey: string): Promise<PlexResult<void>> {
    // Get server identity for machine identifier
    const identityResult = await this.getServerIdentity();
    if (!identityResult.success) {
      return identityResult;
    }

    const machineIdentifier = identityResult.data.machineIdentifier;
    const uri = `server://${machineIdentifier}/com.plexapp.plugins.library/library/metadata/${itemRatingKey}`;
    const path = `/playlists/${playlistRatingKey}/items?uri=${encodeURIComponent(uri)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        PLEX_REQUEST_TIMEOUT
      );

      const response = await fetch(`${this.serverUrl}${path}`, {
        method: "PUT",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          },
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: {
            code: -1,
            message: error.name === "AbortError" ? "Request timed out" : error.message,
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
   * Remove an item from a playlist.
   *
   * @param playlistRatingKey - The rating key of the playlist
   * @param playlistItemId - The playlist item ID (from the item in the playlist, not the media's ratingKey)
   */
  async removeFromPlaylist(playlistRatingKey: string, playlistItemId: string): Promise<PlexResult<void>> {
    const path = `/playlists/${playlistRatingKey}/items/${playlistItemId}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        PLEX_REQUEST_TIMEOUT
      );

      const response = await fetch(`${this.serverUrl}${path}`, {
        method: "DELETE",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: response.status,
            message: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          },
        };
      }

      return { success: true, data: undefined };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          error: {
            code: -1,
            message: error.name === "AbortError" ? "Request timed out" : error.message,
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
   * Check if an item is in a playlist and get its playlist item ID.
   *
   * @param playlistRatingKey - The rating key of the playlist
   * @param itemRatingKey - The rating key of the item to check
   * @returns The playlist item ID if found, null otherwise
   */
  async getPlaylistItemId(playlistRatingKey: string, itemRatingKey: string): Promise<PlexResult<string | null>> {
    const itemsResult = await this.getPlaylistItems(playlistRatingKey);
    if (!itemsResult.success) {
      return itemsResult;
    }

    const item = itemsResult.data.find((i) => i.ratingKey === itemRatingKey);
    // The playlistItemID is stored in the item's playlistItemID field
    return {
      success: true,
      data: item?.playlistItemID?.toString() || null,
    };
  }

  // ============================================================================
  // Collection Methods
  // ============================================================================

  /**
   * Get all collections from a library section.
   */
  async getCollections(sectionKey: string): Promise<PlexResult<PlexCollection[]>> {
    const result = await this.request<PlexCollectionsResponse>(
      `/library/sections/${sectionKey}/collections`
    );

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.MediaContainer.Metadata || [],
    };
  }

  /**
   * Get items in a collection.
   */
  async getCollectionItems(ratingKey: string): Promise<PlexResult<PlexMediaItem[]>> {
    const result = await this.request<PlexLibraryItemsResponse>(
      `/library/collections/${ratingKey}/children`
    );

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.MediaContainer.Metadata || [],
    };
  }

  // ============================================================================
  // Session/Activity Methods
  // ============================================================================

  /**
   * Get currently active playback sessions on the server.
   * Returns all media currently being played by any user.
   */
  async getSessions(): Promise<PlexResult<PlexActiveSession[]>> {
    const result = await this.request<PlexSessionsResponse>("/status/sessions");

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      data: result.data.MediaContainer.Metadata || [],
    };
  }

  /**
   * Get recently viewed items across all library sections.
   * Queries each section for items sorted by lastViewedAt descending.
   *
   * @param options.limit - Maximum number of items to return (default 10, max 50)
   * @param options.offset - Number of items to skip for pagination (default 0)
   */
  async getRecentlyViewed(options: { limit?: number; offset?: number } = {}): Promise<PlexResult<{ items: PlexMediaItem[]; hasMore: boolean }>> {
    const { limit = 10, offset = 0 } = options;
    const clampedLimit = Math.min(Math.max(1, limit), 50);

    // Get all library sections
    const librariesResult = await this.getLibraries();
    if (!librariesResult.success) {
      return librariesResult;
    }

    // Query each video library section for recently viewed items
    // We need to fetch enough items to cover offset + limit
    const fetchSize = offset + clampedLimit + 10; // Fetch extra to ensure we have enough
    const allItems: PlexMediaItem[] = [];

    for (const library of librariesResult.data) {
      // Only query movie and show libraries
      if (library.type !== "movie" && library.type !== "show") {
        continue;
      }

      const params = new URLSearchParams();
      params.set("sort", "lastViewedAt:desc");
      params.set("lastViewedAt>>", "0"); // Only items that have been viewed
      params.set("X-Plex-Container-Size", fetchSize.toString());

      const result = await this.request<PlexLibraryItemsResponse>(
        `/library/sections/${library.key}/all?${params.toString()}`
      );

      if (result.success) {
        const items = result.data.MediaContainer.Metadata || [];
        allItems.push(...items);
      }
    }

    // Sort combined results by lastViewedAt descending
    const sorted = allItems
      .filter(item => item.lastViewedAt)
      .sort((a, b) => (b.lastViewedAt || 0) - (a.lastViewedAt || 0));

    // Apply offset and limit for pagination
    const paginated = sorted.slice(offset, offset + clampedLimit);
    const hasMore = sorted.length > offset + clampedLimit;

    return {
      success: true,
      data: { items: paginated, hasMore },
    };
  }
}

