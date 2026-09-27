import { json, redirect } from "@remix-run/node";
import type { PlexClient } from "./plex/client.server";
import { requireUser } from "./auth/user.server";
import { getUserSettings } from "./settings/storage.server";
import { seerrForUser } from "./integrations/seerr.server";
import { titleRequestStates } from "./integrations/request-state";
import { createTMDBClient } from "./tmdb/client.server";

/** External identities share the existing detail route; accessible library titles resolve there. */
export async function externalTitle(request: Request, client: PlexClient, type: "movie" | "show", id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Response("Invalid title ID", { status: 400 });
  const matches = await client.findByTmdbId(type, id);
  if (matches.success && matches.data.length) {
    const [item] = matches.data;
    throw redirect(`/app/media/${type}/${encodeURIComponent(item.ratingKey)}`);
  }
  const user = await requireUser(request);
  if ((await getUserSettings(user.id))?.preferences.discoveryDisabled) {
    throw new Response("This title is outside your library. Discovery is disabled in Settings.", { status: 403 });
  }
  let error: string | null = matches.success ? null : "Couldn't check your library. Retry before requesting this title.";
  let requestEnabled = false;
  let requests: ReturnType<typeof titleRequestStates> = [];
  let status: number | null = null;
  let status4k: number | null = null;
  let title: { title: string; overview?: string; posterPath?: string | null; backdropPath?: string | null; year: string } | null = null;
  try {
    const { client: seerr, userId } = await seerrForUser(user.id);
    const item = await seerr.getTitle(type === "show" ? "tv" : "movie", id, userId);
    title = { title: item.title || item.name || "Untitled", overview: item.overview, posterPath: item.posterPath, year: (item.releaseDate || item.firstAirDate || "").slice(0, 4) };
    requests = titleRequestStates(item.mediaInfo, userId);
    status = item.mediaInfo?.status ?? 1;
    status4k = item.mediaInfo?.status4k ?? 1;
    requestEnabled = matches.success;
  } catch {
    error ??= "Requests are unavailable. Check your Seerr connection and account access in Settings.";
  }
  if (!title) title = await createTMDBClient()?.getTitle(type, id) ?? null;
  if (!title) throw new Response("Title details are unavailable. Try again later.", { status: 503 });
  return json({ external: { ...title, type, id, status, status4k, requests, requestEnabled, error } });
}

/** IMDb-only watchlist entries use the same destination, with exact IDs at each hop. */
export async function externalImdbTitle(request: Request, client: PlexClient, type: "movie" | "show", id: string) {
  if (!/^tt\d+$/.test(id)) throw new Response("Invalid IMDb ID", { status: 400 });
  const matches = await client.findByImdbId(type, id);
  if (matches.success && matches.data.length) throw redirect(`/app/media/${type}/${encodeURIComponent(matches.data[0].ratingKey)}`);
  const user = await requireUser(request);
  if ((await getUserSettings(user.id))?.preferences.discoveryDisabled) throw new Response("This title is outside your library. Discovery is disabled in Settings.", { status: 403 });
  const match = await createTMDBClient()?.findByIMDB(id);
  if (match?.success && match.data?.type === type) throw redirect(`/app/media/${type}/tmdb-${match.data.id}`);
  return json({ external: { title: `IMDb ${id}`, overview: "", imdbId: id, type, id: null, year: "", status: null, status4k: null, requestEnabled: false, error: matches.success ? "Title metadata is unavailable. Retry when the metadata service is connected." : "Couldn't check your library. Refresh to try again." } });
}
