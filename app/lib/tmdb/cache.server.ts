/**
 * TMDB caching layer for logos and metadata.
 * Caches data locally to reduce API calls and bandwidth.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { env } from "~/lib/env.server";

// Cache configuration
const CACHE_DIR = "tmdb";
const LOGOS_DIR = "logos";
const CACHE_INDEX_FILE = "logo-cache.json";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for successful lookups
const NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for failed lookups (retry sooner)

interface LogoCacheEntry {
  logoPath: string | null; // Filename only (e.g., "movie-avatar-2009.png"), or null if no logo exists
  fetchedAt: number; // Timestamp when fetched
  tmdbId?: number; // TMDB ID for reference
}

interface LogoCacheIndex {
  version: number;
  entries: Record<string, LogoCacheEntry>; // Key: "movie:title:year" or "tv:title:year"
}

/**
 * Get the cache directory path.
 */
function getCacheDir(): string {
  return path.join(env.DATA_PATH, CACHE_DIR);
}

/**
 * Get the logos directory path.
 */
function getLogosDir(): string {
  return path.join(getCacheDir(), LOGOS_DIR);
}

/**
 * Get the cache index file path.
 */
function getCacheIndexPath(): string {
  return path.join(getCacheDir(), CACHE_INDEX_FILE);
}

/**
 * Ensure cache directories exist.
 */
async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(getLogosDir(), { recursive: true });
}

/**
 * Load the cache index from disk.
 */
async function loadCacheIndex(): Promise<LogoCacheIndex> {
  try {
    const data = await fs.readFile(getCacheIndexPath(), "utf-8");
    return JSON.parse(data) as LogoCacheIndex;
  } catch {
    // Return empty cache if file doesn't exist or is invalid
    return { version: 1, entries: {} };
  }
}

/**
 * Save the cache index to disk.
 */
async function saveCacheIndex(index: LogoCacheIndex): Promise<void> {
  await ensureCacheDir();
  await fs.writeFile(getCacheIndexPath(), JSON.stringify(index, null, 2));
}

/**
 * Generate a cache key for a media item.
 */
function getCacheKey(type: "movie" | "tv", title: string, year?: number): string {
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `${type}:${normalizedTitle}:${year || "unknown"}`;
}

/**
 * Generate a safe filename for a logo (without extension - extension added after download).
 */
function getLogoFilenameBase(type: "movie" | "tv", title: string, year?: number): string {
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 50);
  return `${type}-${normalizedTitle}-${year || "unknown"}`;
}

/**
 * Detect file extension from content-type or magic bytes.
 */
function detectImageExtension(buffer: Buffer, contentType?: string): string {
  // Check magic bytes first
  if (buffer.length >= 8) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return ".png";
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return ".jpg";
    }
    // SVG: starts with < (text-based)
    const textStart = buffer.toString("utf-8", 0, Math.min(100, buffer.length)).trim();
    if (textStart.startsWith("<?xml") || textStart.startsWith("<svg")) {
      return ".svg";
    }
  }

  // Fallback to content-type
  if (contentType) {
    if (contentType.includes("svg")) return ".svg";
    if (contentType.includes("png")) return ".png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
    if (contentType.includes("webp")) return ".webp";
  }

  // Default to PNG
  return ".png";
}

/**
 * Check if a cache entry is still valid.
 * Uses shorter TTL for negative results (no logo found) to retry sooner.
 */
function isCacheValid(entry: LogoCacheEntry): boolean {
  const ttl = entry.logoPath ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
  return Date.now() - entry.fetchedAt < ttl;
}

/**
 * Download and cache a logo image.
 * Returns just the filename (not full path) for storage in cache index.
 */
async function downloadLogo(url: string, filenameBase: string): Promise<string | null> {
  try {
    await ensureCacheDir();

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[TMDBCache] Failed to download logo: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    const buffer = Buffer.from(await response.arrayBuffer());

    // Detect actual file type and use correct extension
    const extension = detectImageExtension(buffer, contentType);
    const filename = filenameBase + extension;
    const fullPath = path.join(getLogosDir(), filename);

    await fs.writeFile(fullPath, buffer);

    // Return just the filename for cache storage
    return filename;
  } catch (error) {
    console.error(`[TMDBCache] Error downloading logo:`, error);
    return null;
  }
}

/**
 * Get the full path for a logo filename.
 */
function getLogoFullPath(filename: string): string {
  return path.join(getLogosDir(), filename);
}

/**
 * Validate that a cached logo file is not corrupted.
 * Returns false if the file extension doesn't match its actual content.
 */
async function isValidCachedLogo(filename: string): Promise<boolean> {
  try {
    const fullPath = getLogoFullPath(filename);
    const buffer = await fs.readFile(fullPath);
    const extension = path.extname(filename).toLowerCase();
    const actualExtension = detectImageExtension(buffer);

    // If extension doesn't match actual content, it's corrupted
    if (extension !== actualExtension) {
      console.warn(`[TMDBCache] Corrupted logo detected: ${filename} (is ${actualExtension}, saved as ${extension})`);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Extract just the filename from a path (handles both full paths and filenames).
 * This helps migrate legacy cache entries that stored full paths.
 */
function extractFilename(pathOrFilename: string): string {
  return path.basename(pathOrFilename);
}

/**
 * Get cached logo path for a media item.
 * Returns the local file path if cached, null if not in cache or expired.
 */
export async function getCachedLogo(
  type: "movie" | "tv",
  title: string,
  year?: number
): Promise<{ hit: boolean; logoPath: string | null }> {
  const cacheKey = getCacheKey(type, title, year);
  const index = await loadCacheIndex();
  const entry = index.entries[cacheKey];

  if (entry && isCacheValid(entry)) {
    // Check if the cached file still exists (for non-null entries)
    if (entry.logoPath) {
      // Extract filename (handles legacy entries with full paths)
      const filename = extractFilename(entry.logoPath);
      const fullPath = getLogoFullPath(filename);

      try {
        await fs.access(fullPath);

        // Validate the file is not corrupted (extension matches content)
        const isValid = await isValidCachedLogo(filename);
        if (!isValid) {
          // Delete corrupted file and treat as cache miss
          try {
            await fs.unlink(fullPath);
          } catch {
            // Ignore delete errors
          }
          delete index.entries[cacheKey];
          await saveCacheIndex(index);
          return { hit: false, logoPath: null };
        }

        // Migrate legacy entries to filename-only format
        if (entry.logoPath !== filename) {
          entry.logoPath = filename;
          await saveCacheIndex(index);
        }

        return { hit: true, logoPath: fullPath };
      } catch {
        // File was deleted, treat as cache miss
        return { hit: false, logoPath: null };
      }
    }
    // Entry exists but no logo available (cached negative result)
    return { hit: true, logoPath: null };
  }

  return { hit: false, logoPath: null };
}

/**
 * Cache a logo for a media item.
 * Downloads the logo from URL and stores it locally.
 * Returns the full path to the cached logo for immediate use.
 */
export async function cacheLogo(
  type: "movie" | "tv",
  title: string,
  year: number | undefined,
  logoUrl: string | null,
  tmdbId?: number
): Promise<string | null> {
  const cacheKey = getCacheKey(type, title, year);
  const index = await loadCacheIndex();

  let filename: string | null = null;

  if (logoUrl) {
    const filenameBase = getLogoFilenameBase(type, title, year);
    filename = await downloadLogo(logoUrl, filenameBase);
  }

  // Update cache index with filename only
  index.entries[cacheKey] = {
    logoPath: filename,
    fetchedAt: Date.now(),
    tmdbId,
  };

  await saveCacheIndex(index);

  // Return full path for immediate use by caller
  return filename ? getLogoFullPath(filename) : null;
}

/**
 * Get the URL path to serve a cached logo.
 * Returns a path relative to the data directory that can be served.
 */
export function getLogoServePath(absolutePath: string): string {
  // Convert absolute path to relative path for serving
  const relativePath = path.relative(env.DATA_PATH, absolutePath);
  return `/data/${relativePath}`;
}

/**
 * Clear expired entries from the cache.
 */
export async function cleanExpiredCache(): Promise<number> {
  const index = await loadCacheIndex();
  let cleaned = 0;

  for (const [key, entry] of Object.entries(index.entries)) {
    if (!isCacheValid(entry)) {
      // Delete the logo file if it exists
      if (entry.logoPath) {
        try {
          const filename = extractFilename(entry.logoPath);
          const fullPath = getLogoFullPath(filename);
          await fs.unlink(fullPath);
        } catch {
          // Ignore if file doesn't exist
        }
      }
      delete index.entries[key];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    await saveCacheIndex(index);
  }

  return cleaned;
}

/**
 * Clear all negative cache entries (no logo found).
 * This allows retrying to fetch logos that previously failed.
 */
export async function clearNegativeCache(): Promise<number> {
  const index = await loadCacheIndex();
  let cleared = 0;

  for (const [key, entry] of Object.entries(index.entries)) {
    if (entry.logoPath === null) {
      delete index.entries[key];
      cleared++;
    }
  }

  if (cleared > 0) {
    await saveCacheIndex(index);
  }

  return cleared;
}

/**
 * Clear cache entries for a specific title to force refetch.
 */
export async function clearCacheForTitle(
  type: "movie" | "tv",
  title: string,
  year?: number
): Promise<boolean> {
  const cacheKey = getCacheKey(type, title, year);
  const index = await loadCacheIndex();

  if (index.entries[cacheKey]) {
    // Delete the logo file if it exists
    if (index.entries[cacheKey].logoPath) {
      try {
        const filename = extractFilename(index.entries[cacheKey].logoPath);
        const fullPath = getLogoFullPath(filename);
        await fs.unlink(fullPath);
      } catch {
        // Ignore if file doesn't exist
      }
    }
    delete index.entries[cacheKey];
    await saveCacheIndex(index);
    return true;
  }

  return false;
}

/**
 * Get cache statistics.
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
  withLogos: number;
  withoutLogos: number;
}> {
  const index = await loadCacheIndex();
  const entries = Object.values(index.entries);

  let validEntries = 0;
  let expiredEntries = 0;
  let withLogos = 0;
  let withoutLogos = 0;

  for (const entry of entries) {
    if (isCacheValid(entry)) {
      validEntries++;
      if (entry.logoPath) {
        withLogos++;
      } else {
        withoutLogos++;
      }
    } else {
      expiredEntries++;
    }
  }

  return {
    totalEntries: entries.length,
    validEntries,
    expiredEntries,
    withLogos,
    withoutLogos,
  };
}
