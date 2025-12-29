/**
 * Plex scrobble/unscrobble endpoint.
 * POST /api/plex/scrobble - Mark item as watched
 * DELETE /api/plex/scrobble - Mark item as unwatched
 */

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { PlexClient } from "~/lib/plex/client.server";
import { requirePlexToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";
import { invalidateCache } from "~/lib/plex/cache.server";

interface ScrobbleRequest {
  ratingKey: string;
}

export async function action({ request }: ActionFunctionArgs): Promise<Response> {
  const method = request.method;

  if (method !== "POST" && method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const token = await requirePlexToken(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { ratingKey } = body as ScrobbleRequest;

  // Validate required fields
  if (!ratingKey || typeof ratingKey !== "string") {
    return json({ error: "ratingKey is required" }, { status: 400 });
  }

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  // POST = scrobble (mark watched), DELETE = unscrobble (mark unwatched)
  const result = method === "POST"
    ? await client.scrobble(ratingKey)
    : await client.unscrobble(ratingKey);

  if (!result.success) {
    const status = result.error.status || 500;
    return json({ error: result.error.message }, { status });
  }

  // Invalidate home cache so Continue Watching updates immediately
  await invalidateCache("home");

  return json({ success: true });
}
