/**
 * Mirrors Plex playback state changes to Trakt scrobbles.
 */

import { LRUCache } from "lru-cache";
import type { PlexClient } from "~/lib/plex/client.server";
import type { PlexMetadata } from "~/lib/plex/types";
import {
  getTraktAccount,
  getTraktAccessToken,
  getTraktApp,
  traktFetch,
} from "./oauth.server";

type PlaybackState = "playing" | "paused" | "stopped";
type ScrobbleAction = "start" | "pause" | "stop";

type TraktIds = { imdb?: string; tmdb?: number; tvdb?: number };
export type ScrobbleTarget =
  | { movie: { title: string; year?: number; ids: TraktIds } }
  | { episode: { ids: TraktIds } }
  | {
      show: { title?: string; ids: TraktIds };
      episode: { season: number; number: number };
    };

const lastState = new LRUCache<string, PlaybackState>({
  max: 5000,
  ttl: 6 * 60 * 60 * 1000,
});
const targets = new LRUCache<string, ScrobbleTarget | false>({
  max: 5000,
  ttl: 24 * 60 * 60 * 1000,
});

function externalIds(guids: PlexMetadata["Guid"]): TraktIds | null {
  const ids: TraktIds = {};
  for (const { id } of guids ?? []) {
    const [scheme, value] = id.split("://");
    if (scheme === "imdb" && value) ids.imdb = value;
    else if (scheme === "tmdb" && Number(value)) ids.tmdb = Number(value);
    else if (scheme === "tvdb" && Number(value)) ids.tvdb = Number(value);
  }
  return ids.imdb || ids.tmdb || ids.tvdb ? ids : null;
}

type ScrobbleSource = Pick<
  PlexMetadata,
  "type" | "Guid" | "title" | "year" | "parentIndex" | "index"
>;

/**
 * Builds the Trakt item from Plex external GUIDs, or null if Trakt can't identify it.
 * Trakt only identifies episodes by TVDB ID, so without one the show's IDs and episode numbers are used.
 */
export function toScrobbleTarget(
  metadata: ScrobbleSource,
  show?: Pick<PlexMetadata, "Guid" | "title">
): ScrobbleTarget | null {
  const ids = externalIds(metadata.Guid);
  if (metadata.type === "movie")
    return (
      ids && { movie: { title: metadata.title, year: metadata.year, ids } }
    );
  if (metadata.type !== "episode") return null;
  if (ids?.tvdb) return { episode: { ids } };
  const showIds = show && externalIds(show.Guid);
  if (
    showIds &&
    metadata.parentIndex !== undefined &&
    metadata.index !== undefined
  ) {
    return {
      show: { title: show.title, ids: showIds },
      episode: { season: metadata.parentIndex, number: metadata.index },
    };
  }
  return ids && { episode: { ids } };
}

/** Only state changes produce a scrobble; repeated progress reports are ignored. */
export function nextScrobbleAction(
  previous: PlaybackState | undefined,
  state: PlaybackState
): ScrobbleAction | null {
  if (state === previous) return null;
  if (state === "playing") return "start";
  if (state === "paused") return previous === "playing" ? "pause" : null;
  return previous ? "stop" : null;
}

export async function scrobbleTimeline(params: {
  userId: number;
  client: PlexClient;
  ratingKey: string;
  state: PlaybackState;
  time: number;
  duration: number;
}): Promise<void> {
  const { userId, client, ratingKey, state, time, duration } = params;
  const key = `${userId}:${ratingKey}`;
  const action = nextScrobbleAction(lastState.get(key), state);
  lastState.set(key, state);
  if (!action) return;

  const account = await getTraktAccount(userId);
  const app = account?.scrobble ? await getTraktApp() : null;
  if (!app) return;

  let target = targets.get(ratingKey);
  if (target === undefined) {
    const metadata = await client.getMetadata(ratingKey);
    const episode =
      metadata.success && metadata.data.type === "episode"
        ? metadata.data
        : null;
    const needsShow =
      episode && !episode.Guid?.some(({ id }) => id.startsWith("tvdb://"));
    const show =
      needsShow && episode.grandparentRatingKey
        ? await client.getMetadata(episode.grandparentRatingKey)
        : null;
    target =
      (metadata.success &&
        toScrobbleTarget(
          metadata.data,
          show?.success ? show.data : undefined
        )) ||
      false;
    targets.set(ratingKey, target);
  }
  if (!target) return;

  const accessToken = await getTraktAccessToken(userId, app);
  if (!accessToken) return;

  const progress = Math.min(100, Math.max(0, (time / duration) * 100));
  const response = await traktFetch(`/scrobble/${action}`, app.clientId, {
    accessToken,
    body: { ...target, progress: Math.round(progress * 100) / 100 },
  });
  // 409: Trakt already recorded this watch recently. 422: stopped under 1% progress, which Trakt ignores.
  if (!response.ok && response.status !== 409 && response.status !== 422) {
    console.error(
      `[Trakt] scrobble/${action} failed for ${ratingKey}: HTTP ${response.status}`
    );
  }
}
