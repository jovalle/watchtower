/**
 * Plex data caching layer.
 * Caches library data to avoid slow API calls on every page load.
 * Uses stale-while-revalidate pattern for near-instant loading.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { env } from "~/lib/env.server";

// Cache configuration
const CACHE_DIR = "plex";
const CACHE_FRESH_TTL_MS = 30 * 1000; // 30 seconds - considered fresh
const CACHE_STALE_TTL_MS = 5 * 60 * 1000; // 5 minutes - serve stale but trigger refresh

interface CacheData<T> {
  version: number;
  fetchedAt: number;
  data: T;
}

interface CacheResult<T> {
  data: T;
  isStale: boolean;
  cachedAt: number;
}

/**
 * Get the cache directory path.
 */
function getCacheDir(): string {
  return path.join(env.DATA_PATH, CACHE_DIR);
}

/**
 * Get the cache file path for a specific cache key.
 */
function getCachePath(key: string): string {
  return path.join(getCacheDir(), `${key}.json`);
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
function isCacheFresh<T>(data: CacheData<T>): boolean {
  return Date.now() - data.fetchedAt < CACHE_FRESH_TTL_MS;
}

/**
 * Check if cache is still usable (can be served while refreshing).
 */
function isCacheUsable<T>(data: CacheData<T>): boolean {
  return Date.now() - data.fetchedAt < CACHE_STALE_TTL_MS;
}

/**
 * Load cached data for a specific key.
 * Returns stale data with isStale=true if cache is old but still usable.
 * Returns null only if cache doesn't exist or is too old.
 */
export async function getCache<T>(key: string): Promise<CacheResult<T> | null> {
  try {
    const data = await fs.readFile(getCachePath(key), "utf-8");
    const cache = JSON.parse(data) as CacheData<T>;

    if (cache.version !== 1) {
      return null;
    }

    const isFresh = isCacheFresh(cache);
    const isUsable = isCacheUsable(cache);

    if (!isUsable) {
      return null;
    }

    return {
      data: cache.data,
      isStale: !isFresh,
      cachedAt: Math.floor(cache.fetchedAt / 1000),
    };
  } catch {
    return null;
  }
}

/**
 * Save data to cache.
 */
export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    await ensureCacheDir();

    const cache: CacheData<T> = {
      version: 1,
      fetchedAt: Date.now(),
      data,
    };

    await fs.writeFile(getCachePath(key), JSON.stringify(cache));
  } catch (error) {
    console.error(`[PlexCache] Failed to save cache for ${key}:`, error);
  }
}

/**
 * Invalidate a specific cache.
 */
export async function invalidateCache(key: string): Promise<void> {
  try {
    await fs.unlink(getCachePath(key));
  } catch {
    // Ignore if file doesn't exist
  }
}
