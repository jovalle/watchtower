import { createHash } from "node:crypto";
import { LRUCache } from "lru-cache";
import type { PlexClient } from "./plex/client.server";
import { getUserCacheKey } from "./plex/cache.server";
import type { LibraryQueryOptions, PlexMediaItem } from "./plex/types";

const indexes = new LRUCache<string, PlexMediaItem[]>({
  max: 20,
  maxSize: 32 * 1024 * 1024,
  ttl: 30_000,
  sizeCalculation: (items) => Math.max(1, Buffer.byteLength(JSON.stringify(items))),
});
let generation = 0;

export function invalidateLibraryIndex(token: string) {
  generation++;
  const suffix = getUserCacheKey("", token);
  for (const key of indexes.keys()) if (key.endsWith(suffix)) indexes.delete(key);
}

export async function getLibraryIndex(client: PlexClient, token: string, sections: string[], options: LibraryQueryOptions) {
  const query = createHash("sha256").update(JSON.stringify([sections, options])).digest("hex").slice(0, 20);
  const key = `library-${query}${getUserCacheKey("", token)}`;
  // shortcut: a cold index reads every Plex page; use upstream paging when cross-section sort and filters can be preserved.
  const cached = indexes.get(key);
  if (cached) return { success: true as const, data: cached };
  const startedAt = generation;
  const result = await client.getLibraryItemsForSections(sections, options);
  if (result.success && generation === startedAt) indexes.set(key, result.data);
  return result;
}
