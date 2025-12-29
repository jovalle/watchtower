/**
 * Plex timeline reporting endpoint.
 * POST /api/plex/timeline
 *
 * Reports playback progress to Plex server for real-time tracking.
 * This should be called every 10 seconds during playback.
 */

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { PlexClient } from "~/lib/plex/client.server";
import { requirePlexToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";
import { invalidateCache } from "~/lib/plex/cache.server";

interface TimelineRequest {
  ratingKey: string;
  state: "playing" | "paused" | "stopped";
  time: number;
  duration: number;
}

function isValidState(state: unknown): state is "playing" | "paused" | "stopped" {
  return state === "playing" || state === "paused" || state === "stopped";
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const token = await requirePlexToken(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ratingKey, state, time, duration } = body as TimelineRequest;

  // Validate required fields
  if (!ratingKey || typeof ratingKey !== "string") {
    return json({ error: "ratingKey is required" }, { status: 400 });
  }

  if (!isValidState(state)) {
    return json({ error: "state must be 'playing', 'paused', or 'stopped'" }, { status: 400 });
  }

  if (typeof time !== "number" || time < 0) {
    return json({ error: "time must be a non-negative number" }, { status: 400 });
  }

  if (typeof duration !== "number" || duration <= 0) {
    return json({ error: "duration must be a positive number" }, { status: 400 });
  }

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

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

  // Invalidate home cache when playback stops so Continue Watching updates immediately
  if (state === "stopped") {
    await invalidateCache("home");
  }

  return json({ success: true });
}
