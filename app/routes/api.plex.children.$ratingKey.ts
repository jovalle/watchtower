/**
 * API route to fetch children of a Plex item (e.g., seasons for a show, episodes for a season).
 * GET /api/plex/children/:ratingKey
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireServerToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = await requireServerToken(request);
  const { ratingKey } = params;

  if (!ratingKey) {
    return json({ error: "Missing rating key" }, { status: 400 });
  }

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  const result = await client.getChildren(ratingKey);

  if (!result.success) {
    return json({ error: result.error.message }, { status: 404 });
  }

  return json({ children: result.data });
}
