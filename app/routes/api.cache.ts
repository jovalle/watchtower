/**
 * API endpoint for cache management.
 * DELETE /api/cache - Clear all cached data (server owner only)
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import * as fs from "fs/promises";
import * as path from "path";
import { requireServerToken, isServerOwner } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";

const CACHE_DIR = path.join(env.DATA_PATH, "plex");

/**
 * Clear all cache files.
 */
async function clearAllCaches(): Promise<{ cleared: number; errors: string[] }> {
  const errors: string[] = [];
  let cleared = 0;

  try {
    const files = await fs.readdir(CACHE_DIR);

    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          await fs.unlink(path.join(CACHE_DIR, file));
          cleared++;
        } catch (err) {
          errors.push(`Failed to delete ${file}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }
    }
  } catch (err) {
    // Cache directory might not exist
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      errors.push(`Failed to read cache directory: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return { cleared, errors };
}

export async function action({ request }: ActionFunctionArgs) {
  // Require authentication
  await requireServerToken(request);

  // Only server owners can clear cache
  const isOwner = await isServerOwner(request);
  if (!isOwner) {
    return json(
      { error: "Only the server owner can clear the cache" },
      { status: 403 }
    );
  }

  if (request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const result = await clearAllCaches();

  if (result.errors.length > 0) {
    console.error("[Cache API] Errors during cache clear:", result.errors);
  }

  console.log(`[Cache API] Cleared ${result.cleared} cache files`);

  return json({
    success: true,
    cleared: result.cleared,
    errors: result.errors.length > 0 ? result.errors : undefined,
  });
}
