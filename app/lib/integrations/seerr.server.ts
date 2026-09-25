/**
 * Seerr (Overseerr/Jellyseerr-compatible) API client.
 */

import { LRUCache } from "lru-cache";
import { getIntegrations } from "./storage.server";

const REQUEST_TIMEOUT = 8000;
const DETECT_CANDIDATES = [
  "http://seerr:5055",
  "http://jellyseerr:5055",
  "http://overseerr:5055",
  "http://localhost:5055",
  "http://host.docker.internal:5055",
];

export type SeerrMediaType = "movie" | "tv";

/** Seerr MediaStatus values. */
export type SeerrStatus = "unknown" | "pending" | "processing" | "partially_available" | "available";

const STATUS_BY_CODE: Record<number, SeerrStatus> = {
  1: "unknown",
  2: "pending",
  3: "processing",
  4: "partially_available",
  5: "available",
};

const userIdCache = new LRUCache<number, number>({ max: 1000, ttl: 10 * 60 * 1000 });

export class SeerrClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}, userId?: number): Promise<T> {
    const response = await fetch(`${this.baseUrl}/api/v1${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Api-Key": this.apiKey,
        ...(userId !== undefined ? { "X-Api-User": String(userId) } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message || `Seerr returned HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  /** Validates the API key (the main settings endpoint is admin-only). */
  async testConnection(): Promise<{ applicationTitle?: string }> {
    return this.request("/settings/main");
  }

  async getStatus(type: SeerrMediaType, tmdbId: number): Promise<SeerrStatus> {
    const media = await this.request<{ mediaInfo?: { status?: number } }>(`/${type}/${tmdbId}`);
    return STATUS_BY_CODE[media.mediaInfo?.status ?? 1] ?? "unknown";
  }

  /** Maps a plex.tv account ID to the Seerr user ID, or null if the user was never imported into Seerr. */
  async findUserIdByPlexId(plexId: number): Promise<number | null> {
    const cachedId = userIdCache.get(plexId);
    if (cachedId !== undefined) return cachedId;
    const users = await this.request<{ results: Array<{ id: number; plexId?: number }> }>("/user?take=1000");
    for (const user of users.results) {
      if (user.plexId) userIdCache.set(user.plexId, user.id);
    }
    return userIdCache.get(plexId) ?? null;
  }

  async createRequest(type: SeerrMediaType, tmdbId: number, seerrUserId: number): Promise<void> {
    await this.request(
      "/request",
      {
        method: "POST",
        body: JSON.stringify({ mediaType: type, mediaId: tmdbId, ...(type === "tv" ? { seasons: "all" } : {}) }),
      },
      seerrUserId,
    );
  }
}

export async function createSeerrClient(): Promise<SeerrClient | null> {
  const { seerr } = await getIntegrations();
  return seerr?.url && seerr.apiKey ? new SeerrClient(seerr.url, seerr.apiKey) : null;
}

/** Probes common Seerr addresses and returns the first that answers the public status endpoint. */
export async function detectSeerrUrl(): Promise<string | null> {
  const results = await Promise.all(
    DETECT_CANDIDATES.map(async (url) => {
      try {
        const response = await fetch(`${url}/api/v1/status`, { signal: AbortSignal.timeout(2000) });
        const body = (await response.json()) as { version?: string };
        return response.ok && body.version ? url : null;
      } catch {
        return null;
      }
    }),
  );
  return results.find((url) => url !== null) ?? null;
}
