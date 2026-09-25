/**
 * Plex timeline reporting endpoint.
 * POST /api/plex/timeline
 *
 * Reports playback progress to Plex server for real-time tracking.
 * This should be called every 10 seconds during playback.
 */

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { PlexClient } from "~/lib/plex/client.server";
import { requireServerToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";
import { invalidateCache, getUserCacheKey } from "~/lib/plex/cache.server";
import { getCurrentUser } from "~/lib/auth/user.server";
import { scrobbleTimeline } from "~/lib/trakt/scrobble.server";
import { ownedPlaybackSession, activatePlaybackSession } from "~/lib/plex/playback-session.server";

interface TimelineRequest {
  ratingKey: string;
  state: "playing" | "paused" | "stopped";
  time: number;
  duration: number;
  session?: string | null;
  sequence?: number;
}

function isValidState(
  state: unknown
): state is "playing" | "paused" | "stopped" {
  return state === "playing" || state === "paused" || state === "stopped";
}

export async function action({
  request,
}: ActionFunctionArgs): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const token = await requireServerToken(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return json({ error: "Invalid timeline body" }, { status: 400 });
  }
  const { ratingKey, state, time, duration, session, sequence } = body as TimelineRequest;
  if (sequence !== undefined && (!Number.isSafeInteger(sequence) || sequence < 0)) return json({ error: "Invalid timeline sequence" }, { status: 400 });
  if (
    session != null &&
    (typeof session !== "string" || !/^[a-f0-9-]{36}$/.test(session))
  ) {
    return json({ error: "Invalid playback session" }, { status: 400 });
  }

  // Validate required fields
  if (!ratingKey || typeof ratingKey !== "string") {
    return json({ error: "ratingKey is required" }, { status: 400 });
  }
  const owner = session ? ownedPlaybackSession(session, ratingKey, env.PLEX_SERVER_URL, token) : null;
  if (session && !owner) return json({ error: "Playback session expired or unavailable" }, { status: 403 });

  if (!isValidState(state)) {
    return json(
      { error: "state must be 'playing', 'paused', or 'stopped'" },
      { status: 400 }
    );
  }

  if (typeof time !== "number" || !Number.isFinite(time) || time < 0) {
    return json(
      { error: "time must be a non-negative number" },
      { status: 400 }
    );
  }

  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return json(
      { error: "duration must be a positive number" },
      { status: 400 }
    );
  }

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: owner?.clientId ?? env.PLEX_CLIENT_ID,
  });

  let release: (() => void) | undefined;
  if (owner) {
    const previous = owner.queue.pending;
    owner.queue.pending = new Promise<void>((resolve) => { release = resolve; });
    await previous;
  }
  try {
    if (owner && (!activatePlaybackSession(owner) || (sequence !== undefined && sequence <= owner.sequence))) return json({ success: true, ignored: true });
    const result = await client.reportTimeline({
      ratingKey,
      state,
      time,
      duration,
    });

    if (!result.success) {
      const status = result.error.status || 500;
      return json({ error: result.error.message }, { status });
    }
    if (owner && sequence !== undefined) owner.sequence = sequence;

    // Invalidate user's home cache when playback stops so Continue Watching updates immediately
    if (state !== "playing") {
      await invalidateCache(getUserCacheKey("home", token));
    }

    const user = await getCurrentUser(request);
    if (user) {
      scrobbleTimeline({
        userId: user.id,
        client,
        ratingKey,
        state,
        time,
        duration,
      }).catch((error) => console.error("[Trakt] Scrobble failed:", error));
    }

    return json({ success: true });
  } finally { release?.(); }
}
