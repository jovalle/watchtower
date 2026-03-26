/**
 * API: Movie search for vote showings.
 * GET /api/vote/search?q=...              — Search movies by title
 * GET /api/vote/search?list=recent        — Recently added movies
 * GET /api/vote/search?list=top           — Top-rated movies
 * GET /api/vote/search?list=catalog       — All movies alphabetically
 *
 * Supports pagination: &offset=0&limit=30
 *
 * Requires auth (needs Plex server token to search catalog).
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireServerToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";

interface SearchResult {
  ratingKey: string;
  title: string;
  year?: number;
  posterUrl: string;
  summary?: string;
}

function toSearchResult(item: {
  ratingKey: string;
  title: string;
  year?: number;
  thumb?: string;
  summary?: string;
}): SearchResult {
  return {
    ratingKey: item.ratingKey,
    title: item.title,
    year: item.year,
    posterUrl: item.thumb
      ? `/api/plex/image?path=${encodeURIComponent(item.thumb)}&width=400&height=600`
      : "",
    summary: item.summary,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const token = await requireServerToken(request);

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const list = url.searchParams.get("list");
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "30", 10) || 30,
    100,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") || "0", 10) || 0,
    0,
  );

  // Get movie library sections
  const libResult = await client.getLibraries();
  if (!libResult.success) {
    return json({ error: "Failed to fetch libraries" }, { status: 500 });
  }

  const movieLibraries = libResult.data.filter((l) => l.type === "movie");
  if (movieLibraries.length === 0) {
    return json({ results: [] });
  }

  const results: SearchResult[] = [];

  if (list === "recent") {
    for (const lib of movieLibraries) {
      const r = await client.getRecentlyAdded(lib.key, limit + offset);
      if (r.success) {
        results.push(
          ...r.data.filter((i) => i.type === "movie").map(toSearchResult),
        );
      }
    }
    return json({ results: results.slice(offset, offset + limit) });
  }

  if (list === "top") {
    for (const lib of movieLibraries) {
      const r = await client.getLibraryItems(lib.key, {
        sort: "audienceRating:desc",
        limit: limit,
        offset: offset,
      });
      if (r.success) {
        results.push(
          ...r.data.filter((i) => i.type === "movie").map(toSearchResult),
        );
      }
    }
    return json({ results: results.slice(0, limit) });
  }

  if (list === "catalog") {
    for (const lib of movieLibraries) {
      const r = await client.getLibraryItems(lib.key, {
        sort: "titleSort:asc",
        limit: limit,
        offset: offset,
      });
      if (r.success) {
        results.push(
          ...r.data.filter((i) => i.type === "movie").map(toSearchResult),
        );
      }
    }
    return json({ results: results.slice(0, limit) });
  }

  if (query && query.length >= 2) {
    for (const lib of movieLibraries) {
      // Use title search via the Plex hub search
      const r = await client.getLibraryItems(lib.key, {
        limit: 30,
        filter: `title=${encodeURIComponent(query)}`,
      });
      if (r.success) {
        results.push(
          ...r.data.filter((i) => i.type === "movie").map(toSearchResult),
        );
      }
    }
    return json({ results: results.slice(0, 30) });
  }

  return json({ results: [] });
}
