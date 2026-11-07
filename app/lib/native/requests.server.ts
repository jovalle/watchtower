import { mediaTitles } from "~/lib/integrations/seerr-pages.server";
import { imageUrl, plexData } from "./catalog.server";
import type { PlexClient } from "~/lib/plex/client.server";
import { createSeerrClient, seerrMediaStatus, SeerrRequestError, type SeerrClient, type SeerrMediaType, type SeerrIssue } from "~/lib/integrations/seerr.server";
import { requestState, titleRequestStates } from "~/lib/integrations/request-state";
import type { IssueDetail, IssueSummary, RequestAvailability, RequestSummary, ServicePage } from "./contract";
import { NativeError } from "./http.server";

export function parseRequestTarget(type: unknown, tmdbId: unknown): { type: SeerrMediaType; tmdbId: number } {
  if ((type !== "movie" && type !== "tv") || !Number.isSafeInteger(tmdbId) || Number(tmdbId) < 1) {
    throw new NativeError(400, "invalid_request", "type and a positive integer tmdbId are required.");
  }
  return { type, tmdbId: Number(tmdbId) };
}

export async function requireSeerrUser(plexUserId: number): Promise<{ client: SeerrClient; userId: number }> {
  return seerrOperation(async () => {
    const client = await createSeerrClient();
    if (!client) throw new NativeError(501, "feature_unavailable", "Seerr is not configured.");
    const userId = await client.findUserIdByPlexId(plexUserId);
    if (userId === null) throw new NativeError(403, "requests_not_linked", "This Plex profile is not linked to Seerr.");
    return { client, userId };
  });
}

export async function requestAvailability(
  client: SeerrClient,
  target: { type: SeerrMediaType; tmdbId: number },
  userId: number,
  plex: Pick<PlexClient, "findByTmdbId">,
): Promise<RequestAvailability> {
  return seerrOperation(async () => {
    const [title, matches] = await Promise.all([
      client.getTitle(target.type, target.tmdbId, userId),
      plex.findByTmdbId(target.type === "tv" ? "show" : "movie", target.tmdbId),
    ]);
    const ratingKey = plexData(matches)[0]?.ratingKey ?? null;
    const status = ratingKey !== null && target.type === "movie" ? "available" : seerrMediaStatus(title.mediaInfo?.status);
    const activeRequest = title.mediaInfo?.requests?.some((request) => !request.is4k &&
      (request.status === 1 || request.status === 2 || (request.status === 5 && title.mediaInfo?.status !== 7))) ?? false;
    return {
      status,
      canRequest: (status === "unknown" && !activeRequest) || (target.type === "tv" && status === "partially_available"),
      ratingKey,
      status4k: seerrMediaStatus(title.mediaInfo?.status4k),
      requests: titleRequestStates(title.mediaInfo, userId).map((request) => ({
        id: request.id,
        status: request.state === "Awaiting approval" ? "pending" : request.state === "Approved" ? "approved" : request.state === "Declined" ? "declined" : "unknown",
        is4k: request.is4k,
        mine: true,
      })),
      seasons: title.mediaInfo?.seasons?.map((season) => ({ number: season.seasonNumber, status: seerrMediaStatus(season.status), status4k: seerrMediaStatus(season.status4k) })) ?? [],
    };
  });
}

export const REQUEST_FILTERS = ["all", "pending", "processing", "available", "failed"];
export const ISSUE_FILTERS = ["all", "open", "resolved"];

export async function seerrOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TypeError || ((error instanceof Error || error instanceof DOMException) && ["AbortError", "TimeoutError"].includes(error.name))) {
      throw new NativeError(503, "upstream_unavailable", "Seerr is temporarily unavailable.", true, 15);
    }
    if (!(error instanceof SeerrRequestError)) throw error;
    if (error.status === 400) throw new NativeError(400, "invalid_request", "Seerr could not accept this action. Check the title and action details.");
    if (error.status === 401 || error.status === 403) {
      throw new NativeError(403, "forbidden", "This profile cannot access this Seerr resource.");
    }
    if (error.status === 404) throw new NativeError(404, "not_found", "This Seerr resource was not found.");
    if (error.status === 409) throw new NativeError(409, "conflict", "This action conflicts with the current Seerr state. Refresh the title before trying again.");
    if (error.status === 429) throw new NativeError(429, "rate_limited", "Seerr's limit has been reached. Wait for the limit to reset before trying again.");
    throw new NativeError(503, "upstream_unavailable", "Seerr is temporarily unavailable.", true, 15);
  }
}

function servicePage<T>(items: T[], page: number, pageInfo: { pages: number; results: number }): ServicePage<T> {
  return { items, page, pages: pageInfo.pages, totalResults: pageInfo.results };
}

function issueSummary(item: SeerrIssue & { title: string; posterUrl: string | null }): IssueSummary {
  return {
    id: item.id,
    type: item.media.mediaType,
    tmdbId: item.media.tmdbId,
    title: item.title,
    posterUrl: imageUrl(item.posterUrl ?? undefined, 400, 600),
    ratingKey: null,
    status: item.status === 1 ? "open" : item.status === 2 ? "resolved" : "unknown",
    issueType: item.issueType,
    message: item.comments?.[0]?.message ?? "",
    createdAt: item.createdAt,
  };
}

export function requestInbox(plexUserId: number, page: number, filter: string): Promise<ServicePage<RequestSummary>> {
  return seerrOperation(async () => {
    const { client, userId } = await requireSeerrUser(plexUserId);
    const data = await client.getRequests(userId, page, filter);
    if (data.results.some((item) => item.requestedBy?.id !== userId)) {
      throw new NativeError(503, "upstream_unavailable", "Seerr returned an invalid request page.", true, 15);
    }
    const titles = await mediaTitles(client, userId, data.results);
    return servicePage(titles.map((item) => ({
      id: item.id,
      type: item.media.mediaType,
      tmdbId: item.media.tmdbId,
      title: item.title,
      posterUrl: imageUrl(item.posterUrl ?? undefined, 400, 600),
      ratingKey: null,
      status: requestState(item),
      is4k: item.is4k,
      createdAt: item.createdAt,
    })), page, data.pageInfo);
  });
}

export function issueInbox(plexUserId: number, page: number, filter: string): Promise<ServicePage<IssueSummary>> {
  return seerrOperation(async () => {
    const { client, userId } = await requireSeerrUser(plexUserId);
    const data = await client.getIssues(userId, page, filter);
    return servicePage((await mediaTitles(client, userId, data.results)).map(issueSummary), page, data.pageInfo);
  });
}

export function readIssue(plexUserId: number, id: number): Promise<IssueDetail> {
  return seerrOperation(async () => {
    const { client, userId } = await requireSeerrUser(plexUserId);
    const item = await client.getIssue(id, userId);
    const [title] = await mediaTitles(client, userId, [item]);
    return {
      ...issueSummary(title),
      comments: (item.comments ?? []).map((comment) => ({
        id: comment.id,
        message: comment.message,
        createdAt: comment.createdAt,
        author: comment.user?.displayName || comment.user?.username || null,
      })),
    };
  });
}
