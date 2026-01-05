/**
 * Video stream proxy - streams video content from Plex.
 * GET /api/plex/stream/:ratingKey
 *
 * This proxy solves:
 * 1. CORS: Browser can't directly access Plex server
 * 2. Mixed content: HTTPS page can't load HTTP resources
 * 3. Token security: Keeps Plex token server-side
 *
 * Approach: Direct file streaming with range request support.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireServerToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = await requireServerToken(request);
  const { ratingKey } = params;

  if (!ratingKey) {
    return new Response("Missing rating key", { status: 400 });
  }

  // Get metadata to find the media file
  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  const metadataResult = await client.getMetadata(ratingKey);
  if (!metadataResult.success) {
    console.error("[Stream] Failed to get metadata:", metadataResult.error);
    return new Response("Media not found", { status: 404 });
  }

  const metadata = metadataResult.data;
  const mediaPart = metadata.Media?.[0]?.Part?.[0];

  if (!mediaPart?.key) {
    console.error("[Stream] No media part found for:", ratingKey);
    return new Response("No media stream available", { status: 404 });
  }

  // Build direct stream URL
  const streamUrl = `${env.PLEX_SERVER_URL}${mediaPart.key}?X-Plex-Token=${token}`;
  console.log(`[Stream] Streaming: ${metadata.title} (${ratingKey})`);

  try {
    // Forward range headers for seeking support
    const headers: HeadersInit = {
      Accept: "*/*",
    };

    const rangeHeader = request.headers.get("Range");
    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    // Fetch from Plex with range support
    const plexResponse = await fetch(streamUrl, { headers });

    if (!plexResponse.ok && plexResponse.status !== 206) {
      console.error("[Stream] Plex error:", plexResponse.status, plexResponse.statusText);
      return new Response(`Plex error: ${plexResponse.statusText}`, {
        status: plexResponse.status,
      });
    }

    // Build response headers
    const responseHeaders = new Headers();

    // Copy important headers from Plex response
    const contentType = plexResponse.headers.get("Content-Type");
    const contentLength = plexResponse.headers.get("Content-Length");
    const contentRange = plexResponse.headers.get("Content-Range");
    const acceptRanges = plexResponse.headers.get("Accept-Ranges");

    if (contentType) responseHeaders.set("Content-Type", contentType);
    if (contentLength) responseHeaders.set("Content-Length", contentLength);
    if (contentRange) responseHeaders.set("Content-Range", contentRange);
    if (acceptRanges) responseHeaders.set("Accept-Ranges", acceptRanges);

    // CORS headers
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Range");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");

    // Return the stream
    return new Response(plexResponse.body, {
      status: plexResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[Stream] Proxy error:", error);
    return new Response("Failed to fetch stream", { status: 500 });
  }
}
