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
import { proxyHls } from "~/lib/plex/hls-proxy.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = await requireServerToken(request);
  const { ratingKey } = params;
  const splat = params["*"] || "start.m3u8";
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
  return proxyHls({
    request,
    ratingKey,
    splat,
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: owner.clientId,
    rewriteBase: `${url.origin}/api/plex/hls/${encodeURIComponent(ratingKey)}`,
  });
}
