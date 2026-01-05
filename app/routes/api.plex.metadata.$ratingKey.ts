/**
 * Plex metadata endpoint.
 * GET /api/plex/metadata/:ratingKey
 *
 * Returns full metadata for a specific media item.
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { PlexClient } from "~/lib/plex/client.server";
import { requireServerToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";

export async function loader({ request, params }: LoaderFunctionArgs): Promise<Response> {
  const token = await requireServerToken(request);
  const { ratingKey } = params;

  if (!ratingKey) {
    return json({ error: "Rating key is required" }, { status: 400 });
  }

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  const result = await client.getMetadata(ratingKey);

  if (!result.success) {
    const status = result.error.status || 500;
    return json({ error: result.error.message }, { status });
  }

  return json(result.data);
}
