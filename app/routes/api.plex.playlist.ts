/**
 * Playlist API - Get playlists and add/remove items from playlists.
 * GET /api/plex/playlist - Get all playlists
 * POST /api/plex/playlist - Add item to a playlist
 * DELETE /api/plex/playlist - Remove item from a playlist
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requirePlexToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";

/**
 * GET - Return all playlists with their current items for checking membership.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const token = await requirePlexToken(request);

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  const result = await client.getPlaylists();

  if (!result.success) {
    return json({ error: result.error.message }, { status: 500 });
  }

  // Optionally fetch items for each playlist to check membership
  // This is passed as a query param: ?includeItems=true&itemRatingKey=123
  const url = new URL(request.url);
  const includeItems = url.searchParams.get("includeItems") === "true";
  const checkItemRatingKey = url.searchParams.get("itemRatingKey");

  if (includeItems && checkItemRatingKey) {
    // For each playlist, check if the item is in it
    const playlistsWithMembership = await Promise.all(
      result.data.map(async (playlist) => {
        const itemsResult = await client.getPlaylistItems(playlist.ratingKey);
        if (!itemsResult.success) {
          return { ...playlist, containsItem: false, playlistItemId: null };
        }
        const matchingItem = itemsResult.data.find(
          (item) => item.ratingKey === checkItemRatingKey
        );
        return {
          ...playlist,
          containsItem: !!matchingItem,
          playlistItemId: matchingItem?.playlistItemID?.toString() || null,
        };
      })
    );
    return json({ playlists: playlistsWithMembership });
  }

  return json({ playlists: result.data });
}

/**
 * POST/DELETE - Add or remove items from a playlist.
 */
export async function action({ request }: ActionFunctionArgs) {
  const token = await requirePlexToken(request);

  const body = await request.json();
  const { playlistRatingKey, itemRatingKey, playlistItemId } = body;

  if (!playlistRatingKey) {
    return json({ error: "Missing playlistRatingKey" }, { status: 400 });
  }

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  if (request.method === "POST") {
    if (!itemRatingKey) {
      return json({ error: "Missing itemRatingKey for add operation" }, { status: 400 });
    }

    const result = await client.addToPlaylist(playlistRatingKey, itemRatingKey);

    if (!result.success) {
      return json({ error: result.error.message }, { status: 500 });
    }

    return json({ success: true, action: "added" });
  }

  if (request.method === "DELETE") {
    // For removal, we need either playlistItemId directly, or we'll look it up
    let itemId = playlistItemId;

    if (!itemId && itemRatingKey) {
      const lookupResult = await client.getPlaylistItemId(playlistRatingKey, itemRatingKey);
      if (!lookupResult.success || !lookupResult.data) {
        return json({ error: "Item not found in playlist" }, { status: 404 });
      }
      itemId = lookupResult.data;
    }

    if (!itemId) {
      return json({ error: "Missing playlistItemId or itemRatingKey for remove operation" }, { status: 400 });
    }

    const result = await client.removeFromPlaylist(playlistRatingKey, itemId);

    if (!result.success) {
      return json({ error: result.error.message }, { status: 500 });
    }

    return json({ success: true, action: "removed" });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
