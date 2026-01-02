/**
 * Plex sessions endpoint.
 * GET /api/plex/sessions
 *
 * Returns currently active playback sessions from the Plex server.
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { PlexClient } from "~/lib/plex/client.server";
import { requirePlexToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const token = await requirePlexToken(request);

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  const result = await client.getSessions();

  if (!result.success) {
    return json(
      { error: result.error.message },
      { status: result.error.status || 500 }
    );
  }

  return json({ sessions: result.data });
}
