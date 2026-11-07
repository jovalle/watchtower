import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";

// ponytail: active sessions belong to one process; use shared storage before load-balancing multiple app processes.
export interface PlaybackSession {
  owner: string;
  ratingKey: string;
  clientId: string;
  generation: number;
  sequence: number;
  queue: { pending: Promise<void> };
  /** Device/player context; replacement ordering applies only within one device. */
  scope: string;
  native?: {
    deviceSessionId: string;
    identityVersion: number;
    mediaId: string;
    mediaIndex: number;
    partIds: string[];
    partKeys: Record<string, string>;
    allowedSubtitleStreams: Record<string, string>;
    delivery: "file" | "hls";
    hlsQuery: string | null;
    replaced: boolean;
  };
}
const sessions = new LRUCache<string, PlaybackSession>({ max: 5000, ttl: 6 * 60 * 60 * 1000, updateAgeOnGet: true });
const latest = new LRUCache<string, string>({ max: 5000, ttl: 6 * 60 * 60 * 1000, updateAgeOnGet: true });
const active = new LRUCache<string, number>({ max: 5000, ttl: 6 * 60 * 60 * 1000, updateAgeOnGet: true });
let generation = 0;
const ownerKey = (server: string, token: string) => createHash("sha256").update(`${server.replace(/\/$/, "")}:${token}`).digest("hex");
const generationKey = (owner: string, scope: string, ratingKey: string) => `${owner}:${scope}:${ratingKey}`;

// `scope` is the device/player context; replacements order only within one device.
export function registerPlaybackSession(session: string, ratingKey: string, server: string, token: string, clientId: string, scope = "") {
  const owner = ownerKey(server, token);
  const key = generationKey(owner, scope, ratingKey);
  const previous = sessions.get(latest.get(key) ?? "");
  sessions.set(session, { owner, ratingKey, clientId, scope, generation: ++generation, sequence: -1, queue: previous?.queue ?? { pending: Promise.resolve() } });
  latest.set(key, session);
}

export function activatePlaybackSession(entry: PlaybackSession) {
  const scope = generationKey(entry.owner, entry.scope, entry.ratingKey);
  if ((active.get(scope) ?? -1) > entry.generation) return false;
  active.set(scope, entry.generation);
  return true;
}

export function ownedPlaybackSession(session: string, ratingKey: string, server: string, token: string) {
  const entry = sessions.get(session);
  return entry?.ratingKey === ratingKey && entry.owner === ownerKey(server, token) ? entry : null;
}

export function registerNativePlaybackSession(
  session: string,
  principal: { deviceSessionId: string; identityVersion: number; serverUrl: string; serverToken: string },
  input: {
    ratingKey: string;
    clientId: string;
    mediaId: string;
    mediaIndex?: number;
    partIds: string[];
    partKeys: Record<string, string>;
    allowedSubtitleStreams: Record<string, string>;
    delivery: "file" | "hls";
    hlsQuery: string | null;
  },
): PlaybackSession {
  const owner = ownerKey(principal.serverUrl, principal.serverToken);
  const key = generationKey(owner, principal.deviceSessionId, input.ratingKey);
  const previous = sessions.get(latest.get(key) ?? "");
  const entry: PlaybackSession = {
    owner,
    ratingKey: input.ratingKey,
    clientId: input.clientId,
    generation: ++generation,
    sequence: -1,
    queue: previous?.queue ?? { pending: Promise.resolve() },
    scope: principal.deviceSessionId,
    native: {
      deviceSessionId: principal.deviceSessionId,
      identityVersion: principal.identityVersion,
      mediaId: input.mediaId,
      mediaIndex: input.mediaIndex ?? 0,
      partIds: [...input.partIds],
      partKeys: { ...input.partKeys },
      allowedSubtitleStreams: { ...input.allowedSubtitleStreams },
      delivery: input.delivery,
      hlsQuery: input.hlsQuery,
      replaced: false,
    },
  };
  sessions.set(session, entry);
  latest.set(key, session);
  return entry;
}

export function ownedNativePlaybackSession(
  session: string,
  principal: { deviceSessionId: string; identityVersion: number; serverUrl: string; serverToken: string },
): PlaybackSession | null {
  const entry = sessions.get(session);
  return entry?.native &&
    entry.owner === ownerKey(principal.serverUrl, principal.serverToken) &&
    entry.native.deviceSessionId === principal.deviceSessionId &&
    entry.native.identityVersion === principal.identityVersion
    ? entry
    : null;
}

export function replaceNativePlaybackSession(session: string): void {
  const entry = sessions.get(session);
  if (entry?.native) entry.native.replaced = true;
}

export function playbackSessionExists(session: string): boolean {
  return sessions.has(session);
}
