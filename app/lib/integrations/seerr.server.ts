/**
 * Seerr (Overseerr/Jellyseerr-compatible) API client.
 */

import { LRUCache } from "lru-cache";
import { getIntegrations } from "./storage.server";

export interface SeerrMedia {
  id: number;
  tmdbId: number;
  mediaType: SeerrMediaType;
  status: number;
  status4k?: number;
  seasons?: Array<{ seasonNumber: number; status: number; status4k?: number }>;
  requests?: Array<Pick<SeerrRequest, "id" | "status" | "is4k" | "requestedBy">>;
}

export interface SeerrTitle {
  id: number;
  mediaType: SeerrMediaType;
  title?: string;
  name?: string;
  posterPath?: string;
  releaseDate?: string;
  firstAirDate?: string;
  overview?: string;
  mediaInfo?: SeerrMedia;
}

export interface SeerrRequest {
  id: number;
  status: number;
  createdAt: string;
  is4k: boolean;
  media: SeerrMedia;
  requestedBy: { id: number };
  seasons?: Array<{ seasonNumber: number }>;
}

export interface SeerrIssue {
  id: number;
  issueType: number;
  status: number;
  createdAt: string;
  media: SeerrMedia;
  createdBy: { id: number };
  comments: Array<{
    id: number;
    message: string;
    createdAt: string;
    user?: { displayName?: string; username?: string };
  }>;
}

export interface SeerrPage<T> {
  pageInfo: { pages: number; results: number; page: number };
  results: T[];
}

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
export type SeerrStatus =
  | "unknown"
  | "pending"
  | "processing"
  | "partially_available"
  | "available"
  | "blocklisted";

const STATUS_BY_CODE: Record<number, SeerrStatus> = {
  1: "unknown",
  2: "pending",
  3: "processing",
  4: "partially_available",
  5: "available",
  6: "blocklisted",
  // Deleted media can be requested again.
  7: "unknown",
};

export const seerrMediaStatus = (code?: number): SeerrStatus => STATUS_BY_CODE[code ?? 1] ?? "unknown";

const userIdCache = new LRUCache<string, number>({
  max: 1000,
  ttl: 10 * 60 * 1000,
});

export class SeerrRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export class SeerrClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
    userId?: number
  ): Promise<T> {
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
      const body = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      throw new SeerrRequestError(
        body?.message || body?.error || `Seerr returned HTTP ${response.status}`, response.status
      );
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  }

  /** Validates the API key (the main settings endpoint is admin-only). */
  async testConnection(): Promise<{ applicationTitle?: string }> {
    return this.request("/settings/main");
  }

  async getStatus(type: SeerrMediaType, tmdbId: number, userId?: number): Promise<SeerrStatus> {
    const media = await this.request<{ mediaInfo?: { status?: number } }>(
      `/${type}/${tmdbId}`, {}, userId
    );
    return seerrMediaStatus(media.mediaInfo?.status);
  }

  /** Maps a plex.tv account ID to the Seerr user ID, or null if the user was never imported into Seerr. */
  async findUserIdByPlexId(plexId: number): Promise<number | null> {
    const cachedId = userIdCache.get(`${this.baseUrl}:${plexId}`);
    if (cachedId !== undefined) return cachedId;
    const users = await this.request<{
      results: Array<{ id: number; plexId?: number }>;
    }>("/user?take=1000");
    for (const user of users.results) {
      if (user.plexId) userIdCache.set(`${this.baseUrl}:${user.plexId}`, user.id);
    }
    return userIdCache.get(`${this.baseUrl}:${plexId}`) ?? null;
  }

  async createRequest(
    type: SeerrMediaType,
    tmdbId: number,
    seerrUserId: number
  ): Promise<void> {
    const result = await this.request<{ id?: number; message?: string }>(
      "/request",
      {
        method: "POST",
        body: JSON.stringify({
          mediaType: type,
          mediaId: tmdbId,
          ...(type === "tv" ? { seasons: "all" } : {}),
        }),
      },
      seerrUserId
    );
    if (!Number.isSafeInteger(result?.id) || result.id! < 1) {
      throw new SeerrRequestError(result?.message || "Seerr did not create a request. Refresh availability before trying again.", 409);
    }
  }

  async discover(
    feed: "trending" | "movies" | "tv" | "movies/upcoming" | "tv/upcoming",
    userId: number
  ) {
    return this.request<{ results: SeerrTitle[] }>(
      `/discover/${feed}`,
      {},
      userId
    );
  }

  async getTitle(type: SeerrMediaType, id: number, userId: number) {
    return this.request<SeerrTitle>(`/${type}/${id}`, {}, userId);
  }

  async search(query: string, userId: number) {
    return this.request<{ results: SeerrTitle[] }>(
      `/search?query=${encodeURIComponent(query)}`,
      {},
      userId
    );
  }

  async getRequests(userId: number, page: number, filter: string) {
    return this.request<SeerrPage<SeerrRequest>>(
      `/request?take=20&skip=${
        (page - 1) * 20
      }&requestedBy=${userId}&filter=${encodeURIComponent(filter)}`,
      {},
      userId
    );
  }

  async getRequest(id: number, userId: number) {
    return this.request<SeerrRequest>(`/request/${id}`, {}, userId);
  }

  async cancelRequest(id: number, userId: number) {
    const item = await this.request<SeerrRequest>(`/request/${id}`, {}, userId);
    if (item.requestedBy.id !== userId || item.status !== 1)
      throw new Error("Only your pending requests can be cancelled.");
    return this.request<void>(`/request/${id}`, { method: "DELETE" }, userId);
  }

  async getIssues(userId: number, page: number, filter: string) {
    return this.request<SeerrPage<SeerrIssue>>(
      `/issue?take=20&skip=${
        (page - 1) * 20
      }&filter=${encodeURIComponent(filter)}`,
      {},
      userId
    );
  }

  async getIssue(id: number, userId: number) {
    const issue = await this.request<SeerrIssue>(`/issue/${id}`, {}, userId);
    return issue;
  }

  async updateIssue(
    id: number,
    userId: number,
    action: "comment" | "open" | "resolved",
    message?: string
  ) {
    const issue = await this.getIssue(id, userId);
    if (issue.createdBy.id !== userId)
      throw new Error("This issue belongs to another user.");
    return this.request<SeerrIssue>(
      `/issue/${id}/${action}`,
      { method: "POST", body: JSON.stringify({ message }) },
      userId
    );
  }

  async createIssue(
    mediaId: number,
    issueType: number,
    message: string,
    userId: number
  ) {
    return this.request<SeerrIssue>(
      "/issue",
      { method: "POST", body: JSON.stringify({ mediaId, issueType, message }) },
      userId
    );
  }
}

export async function seerrForUser(plexId: number) {
  const client = await createSeerrClient();
  if (!client)
    throw new Error(
      "Connect Seerr in Settings → Integrations to use this page."
    );
  const userId = await client.findUserIdByPlexId(plexId);
  if (userId === null)
    throw new Error(
      "Your Plex account needs to be imported into Seerr. Ask your server administrator."
    );
  return { client, userId };
}

export async function createSeerrClient(): Promise<SeerrClient | null> {
  const { seerr } = await getIntegrations();
  return seerr?.url && seerr.apiKey
    ? new SeerrClient(seerr.url, seerr.apiKey)
    : null;
}

/** Probes common Seerr addresses and returns the first that answers the public status endpoint. */
export async function detectSeerrUrl(): Promise<string | null> {
  const results = await Promise.all(
    DETECT_CANDIDATES.map(async (url) => {
      try {
        const response = await fetch(`${url}/api/v1/status`, {
          signal: AbortSignal.timeout(2000),
        });
        const body = (await response.json()) as { version?: string };
        return response.ok && body.version ? url : null;
      } catch {
        return null;
      }
    })
  );
  return results.find((url) => url !== null) ?? null;
}
