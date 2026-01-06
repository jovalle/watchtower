/**
 * HLS proxy - proxies HLS streams from Plex through the app server.
 * GET /api/plex/hls/:ratingKey/*
 *
 * This proxy solves:
 * 1. CORS: Browser can't directly access Plex server
 * 2. Mixed content: HTTPS page can't load HTTP resources
 * 3. Network isolation: Internal Plex URLs (e.g., http://plex:32400) aren't reachable from browser
 *
 * URL patterns:
 * - /api/plex/hls/:ratingKey/start.m3u8?... - Master playlist
 * - /api/plex/hls/:ratingKey/session/... - Session-specific resources (playlists, segments)
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireServerToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = await requireServerToken(request);
  const { ratingKey } = params;
  const splat = params["*"] || "start.m3u8";

  if (!ratingKey) {
    return new Response("Missing rating key", { status: 400 });
  }

  // Build the Plex URL
  const url = new URL(request.url);
  const queryString = url.search;

  // Determine the path on the Plex server
  // All HLS resources go through /video/:/transcode/universal/
  const plexPath = `/video/:/transcode/universal/${splat}`;

  const plexUrl = `${env.PLEX_SERVER_URL}${plexPath}${queryString}`;


  try {
    // Add Plex token if not in query string
    const fetchUrl = new URL(plexUrl);
    if (!fetchUrl.searchParams.has("X-Plex-Token")) {
      fetchUrl.searchParams.set("X-Plex-Token", token);
    }

    const response = await fetch(fetchUrl.toString(), {
      headers: {
        Accept: "*/*",
      },
    });

    if (!response.ok) {
      // Try to get error details from response body
      const errorBody = await response.text().catch(() => "");
      console.error(`[HLS Proxy] Plex error: ${response.status} for ${plexPath}`);
      if (errorBody) {
        console.error(`[HLS Proxy] Error body: ${errorBody.slice(0, 500)}`);
      }
      return new Response(`Plex error: ${response.statusText}`, {
        status: response.status,
      });
    }

    const contentType = response.headers.get("Content-Type") || "";

    // If it's a playlist, we need to rewrite URLs
    if (contentType.includes("mpegurl") || splat.endsWith(".m3u8")) {
      const text = await response.text();
      const rewritten = rewritePlaylistUrls(text, ratingKey, url.origin);

      return new Response(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache",
        },
      });
    }

    // For segments and other binary content, stream through
    const headers = new Headers();
    const segmentContentType = response.headers.get("Content-Type");
    const contentLength = response.headers.get("Content-Length");

    if (segmentContentType) headers.set("Content-Type", segmentContentType);
    if (contentLength) headers.set("Content-Length", contentLength);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "max-age=3600");

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error("[HLS Proxy] Error:", error);
    return new Response("Failed to fetch from Plex", { status: 500 });
  }
}

/**
 * Rewrite URLs in HLS playlists to point to our proxy
 *
 * Key insight: We only rewrite absolute URLs and root-relative URLs.
 * Pure relative URLs (like "00000.ts") should remain relative so the browser
 * resolves them correctly based on the current playlist location.
 */
function rewritePlaylistUrls(
  content: string,
  ratingKey: string,
  origin: string
): string {
  const proxyBase = `${origin}/api/plex/hls/${ratingKey}`;

  // Process line by line to handle various URL formats
  const lines = content.split("\n");
  const rewrittenLines = lines.map((line) => {
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === "") {
      return line;
    }

    // Handle comments/tags - check for URI attributes
    if (trimmed.startsWith("#")) {
      if (trimmed.includes('URI="')) {
        return rewriteUriAttribute(line, ratingKey, origin);
      }
      return line;
    }

    // Handle absolute URLs (http:// or https://) - must rewrite
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const url = new URL(trimmed);
      const path = url.pathname + url.search;
      return rewritePath(path, proxyBase);
    }

    // Handle root-relative URLs (start with /) - must rewrite
    if (trimmed.startsWith("/")) {
      return rewritePath(trimmed, proxyBase);
    }

    // Pure relative URLs (like "00000.ts" or "session/abc/file.ts")
    // Keep them relative - browser will resolve based on current playlist URL
    return line;
  });

  return rewrittenLines.join("\n");
}

/**
 * Rewrite a path to use the proxy
 */
function rewritePath(path: string, proxyBase: string): string {
  // /video/:/transcode/universal/... -> /api/plex/hls/:ratingKey/...
  if (path.startsWith("/video/:/transcode/universal/")) {
    const subPath = path.slice("/video/:/transcode/universal/".length);
    return `${proxyBase}/${subPath}`;
  }

  // Handle paths that start with /video:/ (alternate format)
  if (path.startsWith("/video:/transcode/universal/")) {
    const subPath = path.slice("/video:/transcode/universal/".length);
    return `${proxyBase}/${subPath}`;
  }

  // Fallback: append path to proxy base (for relative URLs)
  if (path.startsWith("/")) {
    return `${proxyBase}${path}`;
  }
  return `${proxyBase}/${path}`;
}

/**
 * Rewrite URI attributes in HLS tags (e.g., #EXT-X-MAP:URI="...")
 * Only rewrites absolute and root-relative URIs; keeps relative URIs as-is.
 */
function rewriteUriAttribute(
  line: string,
  ratingKey: string,
  origin: string
): string {
  const proxyBase = `${origin}/api/plex/hls/${ratingKey}`;

  return line.replace(/URI="([^"]+)"/g, (match, uri) => {
    // Absolute URL - rewrite
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      const url = new URL(uri);
      const rewritten = rewritePath(url.pathname + url.search, proxyBase);
      return `URI="${rewritten}"`;
    }
    // Root-relative URL - rewrite
    if (uri.startsWith("/")) {
      const rewritten = rewritePath(uri, proxyBase);
      return `URI="${rewritten}"`;
    }
    // Relative URL - keep as-is for browser to resolve
    return match;
  });
}
