import { activatePlaybackSession, ownedNativePlaybackSession, playbackSessionExists, type PlaybackSession } from "~/lib/plex/playback-session.server";
import { NativeError } from "./http.server";
import type { NativePrincipal } from "./principal.server";
import { requireNativePlexResponse } from "./catalog.server";

export function requireOwnedPlayback(
  playbackId: string | undefined,
  principal: NativePrincipal,
): PlaybackSession {
  if (!playbackId) throw new NativeError(409, "playback_session_expired", "Playback session expired.");
  const session = ownedNativePlaybackSession(playbackId, principal);
  if (session) return session;
  if (playbackSessionExists(playbackId)) throw new NativeError(404, "not_found", "Playback session not found.");
  throw new NativeError(409, "playback_session_expired", "Playback session expired.");
}

export async function serializedTimeline(
  session: PlaybackSession,
  sequence: number,
  operation: () => Promise<void>,
): Promise<boolean> {
  const previous = session.queue.pending;
  let release!: () => void;
  session.queue.pending = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    if (session.native?.replaced || sequence <= session.sequence || !activatePlaybackSession(session)) return false;
    await operation();
    session.sequence = sequence;
    return true;
  } finally {
    release();
  }
}

export async function proxyNativeFile(
  request: Request,
  principal: NativePrincipal,
  session: PlaybackSession,
  partId: string,
): Promise<Response> {
  const key = session.native?.partKeys[partId];
  if (!key || !session.native?.partIds.includes(partId)) throw new NativeError(404, "not_found", "Media part not found.");
  const url = new URL(key, principal.serverUrl);
  if (url.origin !== new URL(principal.serverUrl).origin) throw new NativeError(404, "not_found", "Media part not found.");
  url.searchParams.set("X-Plex-Token", principal.serverToken);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const upstream = await requireNativePlexResponse(await fetch(url, {
      headers: { Accept: "*/*", ...(request.headers.has("Range") ? { Range: request.headers.get("Range")! } : {}) },
      signal: AbortSignal.any([request.signal, controller.signal]),
    }), principal);
    const headers = new Headers();
    for (const name of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    throw new NativeError(502, "upstream_unavailable", "Plex media is unavailable.", true);
  } finally {
    clearTimeout(timeout);
  }
}

export async function transcodeCommand(
  principal: NativePrincipal,
  session: PlaybackSession,
  command: "ping" | "stop",
): Promise<void> {
  if (session.native?.delivery !== "hls" || session.native.replaced) return;
  const url = new URL(`/video/:/transcode/universal/${command}`, principal.serverUrl);
  url.searchParams.set("session", session.native ? session.clientId.split("-").slice(-5).join("-") : "");
  url.searchParams.set("X-Plex-Token", principal.serverToken);
  url.searchParams.set("X-Plex-Client-Identifier", session.clientId);
  try {
    await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    // Heartbeat/stop cleanup is best effort; ownership has already been enforced.
  }
}