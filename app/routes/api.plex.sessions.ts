/**
 * Plex sessions endpoint.
 * GET /api/plex/sessions
 *
 * Returns currently active playback sessions from the Plex server.
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { PlexClient } from "~/lib/plex/client.server";
import { requireServerToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const token = await requireServerToken(request);

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  const result = await client.getSessions();

  if (!result.success) {
    // 403 = shared user without admin access - return empty sessions instead of error
    if (result.error.status === 403) {
      return json({ sessions: [], isRestricted: true });
    }
    return json(
      { error: result.error.message },
      { status: result.error.status || 500 }
    );
  }

  return json({ sessions: result.data });
}
