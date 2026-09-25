import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";

// ponytail: active sessions belong to one process; use shared storage before load-balancing multiple app processes.
interface PlaybackSession { owner: string; ratingKey: string; clientId: string; generation: number; sequence: number; queue: { pending: Promise<void> }; }
const sessions = new LRUCache<string, PlaybackSession>({ max: 5000, ttl: 6 * 60 * 60 * 1000, updateAgeOnGet: true });
const latest = new LRUCache<string, string>({ max: 5000, ttl: 6 * 60 * 60 * 1000, updateAgeOnGet: true });
const active = new LRUCache<string, number>({ max: 5000, ttl: 6 * 60 * 60 * 1000, updateAgeOnGet: true });
let generation = 0;
const ownerKey = (server: string, token: string) => createHash("sha256").update(`${server.replace(/\/$/, "")}:${token}`).digest("hex");

export function registerPlaybackSession(session: string, ratingKey: string, server: string, token: string, clientId: string) {
  const owner = ownerKey(server, token);
  const previous = sessions.get(latest.get(`${owner}:${ratingKey}`) ?? "");
  sessions.set(session, { owner, ratingKey, clientId, generation: ++generation, sequence: -1, queue: previous?.queue ?? { pending: Promise.resolve() } });
  latest.set(`${owner}:${ratingKey}`, session);
}

export function activatePlaybackSession(entry: PlaybackSession) {
  const scope = `${entry.owner}:${entry.ratingKey}`;
  if ((active.get(scope) ?? -1) > entry.generation) return false;
  active.set(scope, entry.generation);
  return true;
}

export function ownedPlaybackSession(session: string, ratingKey: string, server: string, token: string) {
  const entry = sessions.get(session);
  return entry?.ratingKey === ratingKey && entry.owner === ownerKey(server, token) ? entry : null;
}
