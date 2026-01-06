/**
 * Server-side image caching with LRU memory cache + disk persistence.
 *
 * Cache hierarchy:
 * 1. Memory (LRU) - fastest, limited size
 * 2. Disk - larger capacity, survives restarts
 * 3. Plex server - source of truth
 */

import { LRUCache } from "lru-cache";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

// Configuration
const MEMORY_CACHE_MAX_SIZE = 100 * 1024 * 1024; // 100MB max memory
const MEMORY_CACHE_MAX_ITEMS = 1000; // Max 1000 images in memory
const DISK_CACHE_DIR = process.env.IMAGE_CACHE_DIR || "/tmp/watchtower-image-cache";
const DISK_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedImage {
  data: Buffer;
  contentType: string;
  cachedAt: number;
}

// Memory cache - stores actual image buffers
const memoryCache = new LRUCache<string, CachedImage>({
  max: MEMORY_CACHE_MAX_ITEMS,
  maxSize: MEMORY_CACHE_MAX_SIZE,
  sizeCalculation: (value) => value.data.length,
  ttl: 24 * 60 * 60 * 1000, // 24 hours in memory
});

// Track disk cache initialization
let diskCacheReady = false;
let diskCacheInitPromise: Promise<void> | null = null;

/**
 * Generate a cache key from the image path
 */
function getCacheKey(imagePath: string): string {
  return crypto.createHash("md5").update(imagePath).digest("hex");
}

/**
 * Get the disk cache file path for a cache key
 */
function getDiskPath(cacheKey: string): string {
  // Use first 2 chars as subdirectory to avoid too many files in one dir
  const subDir = cacheKey.substring(0, 2);
  return path.join(DISK_CACHE_DIR, subDir, `${cacheKey}.cache`);
}

/**
 * Initialize disk cache directory
 */
async function initDiskCache(): Promise<void> {
  if (diskCacheReady) return;

  if (!diskCacheInitPromise) {
    diskCacheInitPromise = (async () => {
      try {
        await fs.mkdir(DISK_CACHE_DIR, { recursive: true });
        diskCacheReady = true;
        console.log(`[ImageCache] Disk cache initialized at ${DISK_CACHE_DIR}`);
      } catch (error) {
        console.error("[ImageCache] Failed to initialize disk cache:", error);
      }
    })();
  }

  await diskCacheInitPromise;
}

/**
 * Read from disk cache
 */
async function readFromDisk(cacheKey: string): Promise<CachedImage | null> {
  try {
    const filePath = getDiskPath(cacheKey);
    const metaPath = `${filePath}.meta`;

    const [data, metaJson] = await Promise.all([
      fs.readFile(filePath),
      fs.readFile(metaPath, "utf-8"),
    ]);

    const meta = JSON.parse(metaJson);

    // Check if expired
    if (Date.now() - meta.cachedAt > DISK_CACHE_MAX_AGE_MS) {
      // Clean up expired cache
      await Promise.all([
        fs.unlink(filePath).catch(() => {}),
        fs.unlink(metaPath).catch(() => {}),
      ]);
      return null;
    }

    return {
      data,
      contentType: meta.contentType,
      cachedAt: meta.cachedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Write to disk cache
 */
async function writeToDisk(
  cacheKey: string,
  image: CachedImage
): Promise<void> {
  try {
    const filePath = getDiskPath(cacheKey);
    const metaPath = `${filePath}.meta`;
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });

    await Promise.all([
      fs.writeFile(filePath, image.data),
      fs.writeFile(
        metaPath,
        JSON.stringify({
          contentType: image.contentType,
          cachedAt: image.cachedAt,
        })
      ),
    ]);
  } catch (error) {
    console.error("[ImageCache] Failed to write to disk:", error);
  }
}

/**
 * Get an image from cache (memory or disk)
 */
export async function getCachedImage(
  imagePath: string
): Promise<CachedImage | null> {
  const cacheKey = getCacheKey(imagePath);

  // 1. Check memory cache
  const memCached = memoryCache.get(cacheKey);
  if (memCached) {
    return memCached;
  }

  // 2. Check disk cache
  await initDiskCache();
  const diskCached = await readFromDisk(cacheKey);
  if (diskCached) {
    // Promote to memory cache
    memoryCache.set(cacheKey, diskCached);
    return diskCached;
  }

  return null;
}

/**
 * Store an image in cache (memory + disk)
 */
export async function setCachedImage(
  imagePath: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  const cacheKey = getCacheKey(imagePath);
  const image: CachedImage = {
    data,
    contentType,
    cachedAt: Date.now(),
  };

  // Store in memory
  memoryCache.set(cacheKey, image);

  // Store on disk (async, don't wait)
  initDiskCache().then(() => writeToDisk(cacheKey, image));
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  memorySize: number;
  memoryItems: number;
  memoryMaxSize: number;
} {
  return {
    memorySize: memoryCache.calculatedSize || 0,
    memoryItems: memoryCache.size,
    memoryMaxSize: MEMORY_CACHE_MAX_SIZE,
  };
}

/**
 * Clear all caches
 */
export async function clearCache(): Promise<void> {
  memoryCache.clear();

  try {
    await fs.rm(DISK_CACHE_DIR, { recursive: true, force: true });
    diskCacheReady = false;
    diskCacheInitPromise = null;
    console.log("[ImageCache] Cache cleared");
  } catch (error) {
    console.error("[ImageCache] Failed to clear disk cache:", error);
  }
}
