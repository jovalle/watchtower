/**
 * API route to serve cached files (logos, images, etc.)
 * GET /api/cache/*
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import * as fs from "fs/promises";
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

  // Prevent directory traversal attacks
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.resolve(env.DATA_PATH, normalizedPath);
  const dataPathResolved = path.resolve(env.DATA_PATH);

  // Ensure the path is within DATA_PATH
  if (!fullPath.startsWith(dataPathResolved)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const data = await fs.readFile(fullPath);
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
