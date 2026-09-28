import { createSeerrClient, seerrMediaStatus, type SeerrClient, type SeerrMediaType } from "~/lib/integrations/seerr.server";
import { titleRequestStates } from "~/lib/integrations/request-state";
import type { RequestAvailability } from "./contract";
import { NativeError } from "./http.server";

export function parseRequestTarget(type: unknown, tmdbId: unknown): { type: SeerrMediaType; tmdbId: number } {
  if ((type !== "movie" && type !== "tv") || !Number.isSafeInteger(tmdbId) || Number(tmdbId) < 1) {
    throw new NativeError(400, "invalid_request", "type and a positive integer tmdbId are required.");
  }
  return { type, tmdbId: Number(tmdbId) };
}

export async function requireSeerrUser(plexUserId: number): Promise<{ client: SeerrClient; userId: number }> {
  const client = await createSeerrClient();
  if (!client) throw new NativeError(501, "feature_unavailable", "Seerr is not configured.");
  const userId = await client.findUserIdByPlexId(plexUserId);
  if (userId === null) throw new NativeError(403, "requests_not_linked", "This Plex profile is not linked to Seerr.");
  return { client, userId };
}

export async function requestAvailability(
  client: SeerrClient,
  target: { type: SeerrMediaType; tmdbId: number },
  userId: number,
): Promise<RequestAvailability> {
  const title = await client.getTitle(target.type, target.tmdbId, userId);
  return {
    status: seerrMediaStatus(title.mediaInfo?.status),
    status4k: seerrMediaStatus(title.mediaInfo?.status4k),
    requests: titleRequestStates(title.mediaInfo, userId).map((request) => ({
      id: request.id,
      status: request.state === "Awaiting approval" ? "pending" : request.state === "Approved" ? "approved" : request.state === "Declined" ? "declined" : "unknown",
      is4k: request.is4k,
      mine: true,
    })),
    seasons: title.mediaInfo?.seasons?.map((season) => ({ number: season.seasonNumber, status: seerrMediaStatus(season.status), status4k: seerrMediaStatus(season.status4k) })) ?? [],
  };
}