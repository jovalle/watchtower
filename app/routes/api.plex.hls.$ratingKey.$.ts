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
import { ownedPlaybackSession } from "~/lib/plex/playback-session.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = await requireServerToken(request);
  const { ratingKey } = params;
  const splat = params["*"] || "start.m3u8";
  if (!/^[a-zA-Z0-9._/-]+$/.test(splat) || splat.split("/").some((part) => part === "." || part === "..")) return new Response("Invalid playback resource", { status: 400 });

  if (!ratingKey) {
    return new Response("Missing rating key", { status: 400 });
  }

  // Build the Plex URL
  const url = new URL(request.url);
  const pathSession = /^session\/([^/]+)\//.exec(splat)?.[1];
  const session = pathSession || url.searchParams.get("session");
  const owner = session ? ownedPlaybackSession(session, ratingKey, env.PLEX_SERVER_URL, token) : null;
  if (!owner) return new Response("Playback session expired or unavailable. Reload the player.", { status: 403 });
  if (pathSession && url.searchParams.has("session") && url.searchParams.get("session") !== pathSession) return new Response("Invalid playback session", { status: 400 });
  if (!pathSession && !["start.m3u8", "ping", "stop"].includes(splat)) return new Response("Invalid playback resource", { status: 400 });
  const queryString = url.search;

  // Determine the path on the Plex server
  // All HLS resources go through /video/:/transcode/universal/
  const plexPath = `/video/:/transcode/universal/${splat}`;

  const plexUrl = `${env.PLEX_SERVER_URL}${plexPath}${queryString}`;


  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const signal = AbortSignal.any([request.signal, controller.signal]);
  try {
    // Use the authenticated user's token for every request, including child playlists.
    const fetchUrl = new URL(plexUrl);
    fetchUrl.searchParams.set("X-Plex-Token", token);
    fetchUrl.searchParams.set("X-Plex-Client-Identifier", owner.clientId);

    if (splat === "start.m3u8") {
      fetchUrl.searchParams.set("path", `/library/metadata/${ratingKey}`);
      // Plex caches the media decision by client identity. Negotiate this stream
      // before starting it, rather than inheriting another player's codec/quality.
      const decisionUrl = new URL(fetchUrl);
      decisionUrl.pathname = "/video/:/transcode/universal/decision";
      const decision = await fetch(decisionUrl, {
        headers: { Accept: "application/json" },
        signal,
      });
      if (!decision.ok) {
        return new Response("Plex playback negotiation failed", { status: decision.status });
      }
      const { MediaContainer } = await decision.json();
      if (MediaContainer?.generalDecisionCode >= 2000) {
        return new Response("Plex cannot play this item with the requested settings", { status: 422 });
      }
    }

    const response = await fetch(fetchUrl.toString(), {
      signal,
      headers: {
        Accept: "*/*",
        ...(request.headers.has("Range") ? { Range: request.headers.get("Range")! } : {}),
      },
    });

    if (!response.ok) {
      return new Response(`Plex error: ${response.status}`, {
        status: response.status,
        headers: response.headers.has("Content-Range")
          ? { "Content-Range": response.headers.get("Content-Range")! }
          : {},
      });
    }

    const contentType = response.headers.get("Content-Type") || "";

    // If it's a playlist, we need to rewrite URLs
    if (contentType.includes("mpegurl") || splat.endsWith(".m3u8")) {
      const text = await response.text();
      const rewritten = rewritePlaylistUrls(text, ratingKey, url.origin, response.url || fetchUrl.toString());

      return new Response(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "private, no-store",
        },
      });
    }

    // For segments and other binary content, stream through
    const headers = new Headers();
    const segmentContentType = response.headers.get("Content-Type");
    const contentLength = response.headers.get("Content-Length");

    if (segmentContentType) headers.set("Content-Type", segmentContentType);
    if (contentLength) headers.set("Content-Length", contentLength);
    for (const name of ["Content-Range", "Accept-Ranges"]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "private, no-store");

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch {
    return new Response("Failed to fetch from Plex", { status: controller.signal.aborted ? 504 : 502 });
  } finally {
    clearTimeout(timeout);
  }
}

/** Resolve every URI against the actual upstream playlist, including redirects. */
function rewritePlaylistUrls(
  content: string,
  ratingKey: string,
  origin: string,
  upstreamUrl: string
): string {
  const rewrite = (uri: string) => {
    const url = new URL(uri, upstreamUrl);
    url.searchParams.delete("X-Plex-Token");
    const prefix = /^\/video\/:?\/transcode\/universal\//;
    // Plex also uses /video:/ on some servers.
    const path = url.pathname.replace(prefix, "").replace(/^\/video:\/transcode\/universal\//, "");
    if (path.startsWith("/")) throw new Error("Unsupported playlist resource");
    return `${origin}/api/plex/hls/${encodeURIComponent(ratingKey)}/${path}${url.search}`;
  };
  return content.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    return trimmed.startsWith("#")
      ? line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${rewrite(uri)}"`)
      : rewrite(trimmed);
  }).join("\n");
}
