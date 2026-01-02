/**
 * Watchlist caching layer.
 * Caches unified watchlist data to avoid slow API calls on every page load.
 * Uses stale-while-revalidate pattern for near-instant loading.
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import { env } from "~/lib/env.server";
import type { UnifiedWatchlistItem, WatchlistCounts } from "./types";

// Cache configuration
const CACHE_DIR = "watchlist";
const CACHE_FRESH_TTL_MS = 5 * 60 * 1000; // 5 minutes - considered fresh
const CACHE_STALE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - serve stale but trigger refresh

interface WatchlistCacheData {
  version: number;
  fetchedAt: number;
  items: UnifiedWatchlistItem[];
  counts: WatchlistCounts;
}

/**
 * Get the cache directory path.
 */
function getCacheDir(): string {
  return path.join(env.DATA_PATH, CACHE_DIR);
}

/**
 * Create a short hash from a token for use in cache keys.
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 12);
}

/**
 * Get the cache file path for a specific user.
 */
function getCachePath(token: string): string {
  return path.join(getCacheDir(), `watchlist-${hashToken(token)}.json`);
}

/**
 * Ensure cache directory exists.
 */
async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(getCacheDir(), { recursive: true });
}

/**
 * Check if cache is still fresh (no refresh needed).
 */
function isCacheFresh(data: WatchlistCacheData): boolean {
  return Date.now() - data.fetchedAt < CACHE_FRESH_TTL_MS;
}

/**
 * Check if cache is still usable (can be served while refreshing).
 */
function isCacheUsable(data: WatchlistCacheData): boolean {
  return Date.now() - data.fetchedAt < CACHE_STALE_TTL_MS;
}

export interface WatchlistCacheResult {
  items: UnifiedWatchlistItem[];
  counts: WatchlistCounts;
  /** Whether the cache is stale and should be refreshed in background */
  isStale: boolean;
  /** Timestamp when data was cached (unix seconds) - use as fallback for items without addedAt */
  cachedAt: number;
}

/**
 * Load cached watchlist data for a specific user.
 * Returns stale data with isStale=true if cache is old but still usable.
 * Returns null only if cache doesn't exist or is too old.
 */
export async function getWatchlistCache(token: string): Promise<WatchlistCacheResult | null> {
  try {
    const data = await fs.readFile(getCachePath(token), "utf-8");
    const cache = JSON.parse(data) as WatchlistCacheData;

    if (cache.version !== 1) {
      console.log("[WatchlistCache] Cache version mismatch, will refresh");
      return null;
    }

    const isFresh = isCacheFresh(cache);
    const isUsable = isCacheUsable(cache);
    const ageSeconds = Math.round((Date.now() - cache.fetchedAt) / 1000);

    if (!isUsable) {
      console.log(`[WatchlistCache] Cache too old (${ageSeconds}s), will refresh`);
      return null;
    }

    console.log(
      `[WatchlistCache] Cache ${isFresh ? "hit" : "stale"} - ${cache.items.length} items, age: ${ageSeconds}s`
    );

    return {
      items: cache.items,
      counts: cache.counts,
      isStale: !isFresh,
      cachedAt: Math.floor(cache.fetchedAt / 1000), // Convert to unix seconds
    };
  } catch {
    // Cache doesn't exist or is invalid
    return null;
  }
}

/**
 * Save watchlist data to cache for a specific user.
 */
export async function setWatchlistCache(
  token: string,
  items: UnifiedWatchlistItem[],
  counts: WatchlistCounts
): Promise<void> {
  try {
    await ensureCacheDir();

    const cache: WatchlistCacheData = {
      version: 1,
      fetchedAt: Date.now(),
      items,
      counts,
    };

    await fs.writeFile(getCachePath(token), JSON.stringify(cache, null, 2));
    console.log(`[WatchlistCache] Cached ${items.length} items`);
  } catch (error) {
    console.error("[WatchlistCache] Failed to save cache:", error);
  }
}

/**
 * Invalidate the watchlist cache for a specific user.
 * Call this when the user modifies their watchlist.
 */
export async function invalidateWatchlistCache(token: string): Promise<void> {
  try {
    await fs.unlink(getCachePath(token));
    console.log("[WatchlistCache] Cache invalidated");
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Get cache status for debugging.
 */
export async function getWatchlistCacheStatus(token: string): Promise<{
  exists: boolean;
  fresh: boolean;
  usable: boolean;
  itemCount: number;
  ageSeconds: number;
  freshTtlSeconds: number;
  staleTtlSeconds: number;
}> {
  try {
    const data = await fs.readFile(getCachePath(token), "utf-8");
    const cache = JSON.parse(data) as WatchlistCacheData;
    const ageSeconds = Math.round((Date.now() - cache.fetchedAt) / 1000);

    return {
      exists: true,
      fresh: isCacheFresh(cache),
      usable: isCacheUsable(cache),
      itemCount: cache.items.length,
      ageSeconds,
      freshTtlSeconds: Math.round(CACHE_FRESH_TTL_MS / 1000),
      staleTtlSeconds: Math.round(CACHE_STALE_TTL_MS / 1000),
    };
  } catch {
    return {
      exists: false,
      fresh: false,
      usable: false,
      itemCount: 0,
      ageSeconds: 0,
      freshTtlSeconds: Math.round(CACHE_FRESH_TTL_MS / 1000),
      staleTtlSeconds: Math.round(CACHE_STALE_TTL_MS / 1000),
    };
  }
}
