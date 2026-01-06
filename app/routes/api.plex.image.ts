/**
 * Image proxy - proxies image requests to Plex server with caching.
 * GET /api/plex/image?path=<encoded_path>
 *
 * This proxy solves:
 * 1. CORS: Browser can't directly access Plex server (e.g., http://plex:32400)
 * 2. Mixed content: HTTPS page can't load HTTP resources
 * 3. Token security: Keeps Plex token server-side
 * 4. Performance: Server-side caching (memory + disk)
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireServerToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";
import { getCachedImage, setCachedImage } from "~/lib/cache/image-cache.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");

  const token = await requireServerToken(request);

  if (!path) {
    console.error("[Image Proxy] Missing path parameter");
    return new Response("Missing path parameter", { status: 400 });
  }

  // Check cache first (includes width/height in cache key via full path)
  const cached = await getCachedImage(path);
  if (cached) {
    return new Response(new Uint8Array(cached.data), {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Content-Length": cached.data.length.toString(),
        "Cache-Control": "public, max-age=2592000, immutable",
        "X-Cache": "HIT",
      },
    });
  }

  // Build the direct image URL
  // Plex image paths can be:
  // 1. Relative paths: /library/metadata/12345/thumb/1234567890
  // 2. Absolute URLs: https://metadata-static.plex.tv/... (for external metadata)
  // Some paths may already have query params (e.g., ?width=400&height=600)
  const isAbsoluteUrl = path.startsWith('http://') || path.startsWith('https://');
  const separator = path.includes('?') ? '&' : '?';
  const imageUrl = isAbsoluteUrl
    ? `${path}${separator}X-Plex-Token=${token}`
    : `${env.PLEX_SERVER_URL}${path}${separator}X-Plex-Token=${token}`;

  try {
    const plexResponse = await fetch(imageUrl, {
      headers: {
        Accept: "image/*",
      },
    });

    if (!plexResponse.ok) {
      const status = plexResponse.status;
      const statusText = plexResponse.statusText;

      // Log detailed error
      console.error(`[Image Proxy] FAILED ${status} ${statusText}`);
      console.error(`[Image Proxy]   Path: ${path}`);
      console.error(`[Image Proxy]   URL: ${isAbsoluteUrl ? path : `${env.PLEX_SERVER_URL}${path}`}`);

      // Check for rate limiting
      if (status === 429) {
        const retryAfter = plexResponse.headers.get("Retry-After");
        console.error(`[Image Proxy]   Rate limited${retryAfter ? ` (retry after ${retryAfter}s)` : ""}`);
        return new Response(JSON.stringify({
          error: "rate_limited",
          message: "Plex is rate limiting requests",
          retryAfter: retryAfter ? parseInt(retryAfter, 10) : 60,
          path,
        }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            ...(retryAfter && { "Retry-After": retryAfter }),
          },
        });
      }

      // For 404s, the image doesn't exist
      if (status === 404) {
        console.error(`[Image Proxy]   Image not found in Plex`);
        return new Response(JSON.stringify({
          error: "not_found",
          message: "Image not found",
          path,
        }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Generic error
      return new Response(JSON.stringify({
        error: "plex_error",
        message: `Plex returned ${status}: ${statusText}`,
        status,
        path,
      }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Success - cache and return the image
    const contentType = plexResponse.headers.get("Content-Type") || "image/jpeg";
    const imageBuffer = Buffer.from(await plexResponse.arrayBuffer());

    // Store in cache (async, don't block response)
    setCachedImage(path, imageBuffer, contentType);

    return new Response(new Uint8Array(imageBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": imageBuffer.length.toString(),
        // Cache aggressively - Plex image paths include a timestamp that changes
        // when the image is updated (e.g., /library/metadata/12345/thumb/1767302900)
        "Cache-Control": "public, max-age=2592000, immutable",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Image Proxy] NETWORK ERROR: ${message}`);
    console.error(`[Image Proxy]   Path: ${path}`);

    return new Response(JSON.stringify({
      error: "network_error",
      message: `Failed to fetch image: ${message}`,
      path,
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
