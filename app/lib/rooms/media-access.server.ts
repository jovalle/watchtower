import { PlexClient } from "~/lib/plex/client.server";
import { findNextEpisode } from "~/lib/plex/markers";
import type { PlexMetadata } from "~/lib/plex/types";
import { env } from "~/lib/env.server";
import type { PlaybackPrincipal } from "./principal.server";
import type { MediaIdentity, RoomErrorCode } from "./protocol";

export type AuthorizedMedia = {
  media: MediaIdentity;
  durationMs: number;
  metadata: PlexMetadata;
};

export type MediaAccessResult =
  | { ok: true; value: AuthorizedMedia }
  | { ok: false; code: RoomErrorCode; message: string };

function clientFor(principal: PlaybackPrincipal) {
  return new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token: principal.serverToken,
    clientId: env.PLEX_CLIENT_ID,
  });
}

function upstreamFailure(status: number | undefined, hideMissing: boolean): MediaAccessResult {
  if (status === 401 || status === 403 || status === 404) {
    return hideMissing
      ? { ok: false, code: "media_forbidden", message: "You do not have access to this media." }
      : { ok: false, code: "not_found", message: "Media was not found." };
  }
  return { ok: false, code: "upstream_unavailable", message: "Plex is temporarily unavailable." };
}

export async function authorizeMedia(
  principal: PlaybackPrincipal,
  ratingKey: string,
  expected?: { mediaId: string; partId: string },
  hideMissing = false
): Promise<MediaAccessResult> {
  const result = await clientFor(principal).getMetadata(ratingKey);
  if (!result.success) return upstreamFailure(result.error.status, hideMissing);

  const metadata = result.data;
  if (metadata.type !== "movie" && metadata.type !== "episode") {
    return { ok: false, code: "media_unsupported", message: "Only movies and episodes can be watched together." };
  }
  const media = metadata.Media?.[0];
  if (!media || media.Part?.length !== 1) {
    return { ok: false, code: "media_unsupported", message: "Multipart or missing media is not supported." };
  }
  const part = media.Part[0];
  const mediaId = String(media.id);
  const partId = String(part.id);
  if (expected && (expected.mediaId !== mediaId || expected.partId !== partId)) {
    return { ok: false, code: "media_mismatch", message: "The selected media edition no longer matches." };
  }
  const durationMs = Math.round(metadata.duration ?? media.duration ?? part.duration ?? 0);
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    return { ok: false, code: "media_unsupported", message: "Media duration is unavailable." };
  }
  return {
    ok: true,
    value: {
      media: {
        serverMachineId: principal.serverMachineId,
        ratingKey,
        mediaId,
        partId,
      },
      durationMs,
      metadata,
    },
  };
}

export async function resolveNextMedia(
  principal: PlaybackPrincipal,
  ratingKey: string
): Promise<MediaAccessResult> {
  const client = clientFor(principal);
  const current = await client.getMetadata(ratingKey);
  if (!current.success) return upstreamFailure(current.error.status, false);
  if (current.data.type !== "episode") {
    return { ok: false, code: "not_found", message: "There is no next episode." };
  }

  let next = null;
  if (current.data.parentRatingKey) {
    const siblings = await client.getChildren(current.data.parentRatingKey);
    if (!siblings.success) return upstreamFailure(siblings.error.status, false);
    next = findNextEpisode(siblings.data, ratingKey);
  }
  if (!next && current.data.grandparentRatingKey) {
    const leaves = await client.getAllLeaves(current.data.grandparentRatingKey);
    if (!leaves.success) return upstreamFailure(leaves.error.status, false);
    next = findNextEpisode(leaves.data, ratingKey);
  }
  if (!next) return { ok: false, code: "not_found", message: "There is no next episode." };
  return authorizeMedia(principal, next.ratingKey);
}