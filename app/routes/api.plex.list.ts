/**
 * Watchlist API - Add/remove items from user's Plex watchlist.
 * POST /api/plex/list - Add to watchlist
 * DELETE /api/plex/list - Remove from watchlist
 *
 * Uses Plex's discover API (discover.provider.plex.tv) for real watchlist.
 * Requires the item's GUID which is fetched from local metadata.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireServerToken, requirePlexToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";

export async function action({ request }: ActionFunctionArgs) {
  // Get both tokens:
  // - serverToken: for accessing local Plex server (metadata lookup)
  // - plexToken: for plex.tv cloud services (add/remove from watchlist)
  const serverToken = await requireServerToken(request);
  const plexToken = await requirePlexToken(request);

  const body = await request.json();
  const { ratingKey, guid } = body;

  // Accept either guid directly or ratingKey (we'll fetch the guid)
  if (!ratingKey && !guid) {
    return json({ error: "Missing ratingKey or guid" }, { status: 400 });
  }

  // Client for local server operations (metadata lookup)
  const serverClient = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token: serverToken,
    clientId: env.PLEX_CLIENT_ID,
  });

  // Client for Discover API operations (watchlist)
  const discoverClient = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token: plexToken,
    clientId: env.PLEX_CLIENT_ID,
  });

  // If no guid provided, fetch it from metadata using serverClient
  let itemGuid = guid;
  if (!itemGuid && ratingKey) {
    const metadataResult = await serverClient.getMetadata(ratingKey);
    if (!metadataResult.success) {
      return json({ error: "Failed to fetch item metadata" }, { status: 500 });
    }
    itemGuid = metadataResult.data.guid;
  }

  if (!itemGuid) {
    return json({ error: "Could not determine item GUID" }, { status: 400 });
  }

  // Use discoverClient for watchlist operations (requires plexToken)
  if (request.method === "POST") {
    const result = await discoverClient.addToWatchlist(itemGuid);

    if (!result.success) {
      return json({ error: result.error.message }, { status: 500 });
    }

    return json({ success: true, action: "added" });
  }

  if (request.method === "DELETE") {
    const result = await discoverClient.removeFromWatchlist(itemGuid);

    if (!result.success) {
      return json({ error: result.error.message }, { status: 500 });
    }

    return json({ success: true, action: "removed" });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
