/**
 * Plex library items endpoint.
 * GET /api/plex/libraries/:key
 *
 * Returns items from a specific library section.
 * Supports query params: sort, genre, year, limit, offset
 */

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { PlexClient } from "~/lib/plex/client.server";
import { requirePlexToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";
import type { LibraryQueryOptions } from "~/lib/plex/types";

export async function loader({ request, params }: LoaderFunctionArgs): Promise<Response> {
  const token = await requirePlexToken(request);
  const { key } = params;

  if (!key) {
    return json({ error: "Library key is required" }, { status: 400 });
  }

  const url = new URL(request.url);
  const options: LibraryQueryOptions = {};

  const sort = url.searchParams.get("sort");
  if (sort) options.sort = sort;

  const genre = url.searchParams.get("genre");
  if (genre) options.genre = genre;

  const year = url.searchParams.get("year");
  if (year) options.year = parseInt(year, 10);

  const limit = url.searchParams.get("limit");
  if (limit) options.limit = parseInt(limit, 10);

  const offset = url.searchParams.get("offset");
  if (offset) options.offset = parseInt(offset, 10);

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  const result = await client.getLibraryItems(key, options);

  if (!result.success) {
    const status = result.error.status || 500;
    return json({ error: result.error.message }, { status });
  }

  return json(result.data);
}
