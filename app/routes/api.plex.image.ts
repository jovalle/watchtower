/**
 * Image proxy - proxies image requests to Plex server.
 * GET /api/plex/image?path=<encoded_path>
 *
 * This proxy solves:
 * 1. CORS: Browser can't directly access Plex server (e.g., http://plex:32400)
 * 2. Mixed content: HTTPS page can't load HTTP resources
 * 3. Token security: Keeps Plex token server-side
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { requirePlexToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const token = await requirePlexToken(request);

  const url = new URL(request.url);
  const path = url.searchParams.get("path");

  if (!path) {
    console.error("[Image Proxy] Missing path parameter");
    return new Response("Missing path parameter", { status: 400 });
  }

  // Build the direct image URL
  // Plex image paths look like: /library/metadata/12345/thumb/1234567890
  // Some paths may already have query params (e.g., ?width=400&height=600)
  const separator = path.includes('?') ? '&' : '?';
  const imageUrl = `${env.PLEX_SERVER_URL}${path}${separator}X-Plex-Token=${token}`;

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
      console.error(`[Image Proxy]   URL: ${env.PLEX_SERVER_URL}${path}`);

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

    // Success - pass through the image
    const contentType = plexResponse.headers.get("Content-Type");
    const contentLength = plexResponse.headers.get("Content-Length");

    const responseHeaders = new Headers();
    if (contentType) responseHeaders.set("Content-Type", contentType);
    if (contentLength) responseHeaders.set("Content-Length", contentLength);

    // Cache aggressively - Plex image paths include a timestamp that changes
    // when the image is updated (e.g., /library/metadata/12345/thumb/1767302900)
    // So we can cache for 30 days and treat as immutable
    responseHeaders.set("Cache-Control", "public, max-age=2592000, immutable");

    return new Response(plexResponse.body, {
      status: 200,
      headers: responseHeaders,
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
