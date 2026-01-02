/**
 * Plex recently viewed endpoint.
 * GET /api/plex/sessions/history
 *
 * Returns recently viewed/watched items from the Plex library.
 * Accepts optional query params:
 * - `limit` (default 10, max 50)
 * - `offset` (default 0) for pagination
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { PlexClient } from "~/lib/plex/client.server";
import { requirePlexToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";

export async function loader({ request }: LoaderFunctionArgs): Promise<Response> {
  const token = await requirePlexToken(request);

  // Parse query params
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 10), 50) : 10;
  const offsetParam = url.searchParams.get("offset");
  const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10) || 0) : 0;

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  const result = await client.getRecentlyViewed({ limit, offset });

  if (!result.success) {
    return json(
      { error: result.error.message },
      { status: result.error.status || 500 }
    );
  }

  return json({
    history: result.data.items,
    hasMore: result.data.hasMore,
  });
}
