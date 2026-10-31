/**
 * API route to serve cached files (logos, images, etc.)
 * GET /api/cache/*
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import * as fs from "fs/promises";
import { constants } from "fs";
import * as path from "path";
import { env } from "~/lib/env.server";

// Content type mapping
const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
};

export async function loader({ params }: LoaderFunctionArgs) {
  const requestedPath = params["*"] || params.path;

  if (!requestedPath) {
    return new Response("Not found", { status: 404 });
  }

  const match = /^tmdb\/logos\/([^/\\]+\.(?:png|jpe?g|webp|svg|gif))$/i.exec(requestedPath);
  if (!match) return new Response("Not found", { status: 404 });
  const fullPath = path.join(env.DATA_PATH, "tmdb", "logos", match[1]);

  try {
    const root = await fs.realpath(env.DATA_PATH);
    const directory = await fs.realpath(path.dirname(fullPath));
    if (directory !== path.join(root, "tmdb", "logos")) return new Response("Not found", { status: 404 });
    const file = await fs.open(fullPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const data = await file.readFile().finally(() => file.close());
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, immutable", // 7 days
      },
    });
  } catch {
    // Log missing cache files for debugging
    console.warn(`[Cache] File not found: ${fullPath}`);
    return new Response("Not found", { status: 404 });
  }
}
