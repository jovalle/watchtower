/**
 * Logo cache management API.
 *
 * GET /api/logos - Get cache statistics
 * POST /api/logos?action=clear - Clear all logo cache
 * POST /api/logos?action=clear-corrupted - Clear only corrupted logos
 * POST /api/logos?action=clear-negative - Clear negative cache entries (retry failed lookups)
 * POST /api/logos?action=refresh&title=X&type=movie|tv&year=Y - Force refresh specific logo
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import {
  getCacheStats,
  cleanExpiredCache,
  clearNegativeCache,
  clearCacheForTitle,
} from "~/lib/tmdb/cache.server";
import * as fs from "fs/promises";
import * as path from "path";
import { env } from "~/lib/env.server";

export async function loader() {
  try {
    const stats = await getCacheStats();

    // Also get disk usage
    const logosDir = path.join(env.DATA_PATH, "tmdb", "logos");
    let diskUsage = 0;
    let fileCount = 0;

    try {
      const files = await fs.readdir(logosDir);
      fileCount = files.length;

      for (const file of files) {
        const filePath = path.join(logosDir, file);
        const stat = await fs.stat(filePath);
        diskUsage += stat.size;
      }
    } catch {
      // Directory might not exist yet
    }

    return Response.json({
      ...stats,
      diskUsage: `${(diskUsage / 1024 / 1024).toFixed(2)} MB`,
      fileCount,
      cacheDir: logosDir,
      usage: {
        "GET /api/logos": "Get cache statistics",
        "POST /api/logos?action=clear": "Clear all logos",
        "POST /api/logos?action=clear-corrupted": "Clear corrupted logos only",
        "POST /api/logos?action=clear-negative": "Clear negative cache (retry failed lookups)",
        "POST /api/logos?action=refresh&title=X&type=movie|tv&year=Y": "Force refresh specific logo",
      }
    });
  } catch (error) {
    console.error("[Logo API] Error getting stats:", error);
    return Response.json({ error: "Failed to get cache stats" }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    switch (action) {
      case "clear": {
        // Clear all logos
        const logosDir = path.join(env.DATA_PATH, "tmdb", "logos");
        const cacheFile = path.join(env.DATA_PATH, "tmdb", "logo-cache.json");

        let deletedFiles = 0;
        try {
          const files = await fs.readdir(logosDir);
          for (const file of files) {
            await fs.unlink(path.join(logosDir, file));
            deletedFiles++;
          }
        } catch {
          // Directory might not exist
        }

        // Clear the cache index
        try {
          await fs.unlink(cacheFile);
        } catch {
          // File might not exist
        }

        console.log(`[Logo API] Cleared all logos: ${deletedFiles} files deleted`);
        return Response.json({
          success: true,
          message: `Cleared ${deletedFiles} logo files`,
          deletedFiles
        });
      }

      case "clear-corrupted": {
        // Clear only corrupted logos (handled by cleanExpiredCache + validation)
        const logosDir = path.join(env.DATA_PATH, "tmdb", "logos");
        let deletedFiles = 0;

        try {
          const files = await fs.readdir(logosDir);
          for (const file of files) {
            const filePath = path.join(logosDir, file);
            const buffer = await fs.readFile(filePath);
            const ext = path.extname(file).toLowerCase();

            // Check if extension matches actual content
            let actualExt = ".png";
            if (buffer[0] === 0x89 && buffer[1] === 0x50) {
              actualExt = ".png";
            } else if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
              actualExt = ".jpg";
            } else {
              const textStart = buffer.toString("utf-8", 0, 100).trim();
              if (textStart.startsWith("<?xml") || textStart.startsWith("<svg")) {
                actualExt = ".svg";
              }
            }

            if (ext !== actualExt) {
              await fs.unlink(filePath);
              deletedFiles++;
              console.log(`[Logo API] Deleted corrupted: ${file} (was ${actualExt}, saved as ${ext})`);
            }
          }
        } catch {
          // Directory might not exist
        }

        // Also clean expired entries from cache index
        const expiredCleaned = await cleanExpiredCache();

        console.log(`[Logo API] Cleared ${deletedFiles} corrupted files, ${expiredCleaned} expired entries`);
        return Response.json({
          success: true,
          message: `Cleared ${deletedFiles} corrupted files, ${expiredCleaned} expired entries`,
          deletedFiles,
          expiredCleaned
        });
      }

      case "clear-negative": {
        // Clear negative cache entries (no logo found) to retry
        const cleared = await clearNegativeCache();
        console.log(`[Logo API] Cleared ${cleared} negative cache entries`);
        return Response.json({
          success: true,
          message: `Cleared ${cleared} negative cache entries (will retry on next request)`,
          cleared
        });
      }

      case "refresh": {
        // Force refresh specific logo
        const title = url.searchParams.get("title");
        const type = url.searchParams.get("type") as "movie" | "tv";
        const yearStr = url.searchParams.get("year");
        const year = yearStr ? parseInt(yearStr, 10) : undefined;

        if (!title || !type || !["movie", "tv"].includes(type)) {
          return Response.json(
            { error: "Missing required params: title, type (movie|tv)" },
            { status: 400 }
          );
        }

        const cleared = await clearCacheForTitle(type, title, year);
        console.log(`[Logo API] Cleared cache for ${type}:"${title}" (${year || 'any year'}): ${cleared}`);

        return Response.json({
          success: true,
          message: cleared
            ? `Cleared cache for "${title}" - will refetch on next request`
            : `No cache entry found for "${title}"`,
          cleared,
        });
      }

      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Logo API] Error:", error);
    return Response.json({ error: "Operation failed" }, { status: 500 });
  }
}
