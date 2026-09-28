import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { createTMDBClient } from "~/lib/tmdb/client.server";
import { createTraktClient } from "~/lib/trakt/client.server";
import { getUserSettings } from "~/lib/settings/storage.server";
import { getUnifiedWatchlist } from "~/lib/watchlist/service.server";
import type { WatchlistResponse, WatchlistSource } from "~/lib/native/contract";
import { imageUrl, nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeEmpty, nativeJson, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET"); const principal = await requireNativePrincipal(request);
    const source = new URL(request.url).searchParams.get("source") ?? "all";
    if (!["all", "plex", "trakt", "imdb"].includes(source)) throw new NativeError(400, "invalid_request", "Invalid watchlist source.");
    const serverClient = nativePlexClient(principal); const discoverClient = new (serverClient.constructor as typeof import("~/lib/plex/client.server").PlexClient)({ serverUrl: principal.serverUrl, token: principal.plexToken, clientId: process.env.PLEX_CLIENT_ID ?? "watchtower-001" });
    const local = new Map<string, { type: "movie" | "show"; ratingKey: string; thumb?: string; audienceRating?: number }>();
    for (const section of plexData(await serverClient.getLibraries()).filter((item) => item.type === "movie" || item.type === "show")) {
      const items = plexData(await serverClient.getLibraryItems(section.key, { all: true, includeGuids: true }));
      for (const item of items) { const value = { type: item.type as "movie" | "show", ratingKey: item.ratingKey, thumb: item.thumb, audienceRating: item.audienceRating }; local.set(`${item.type}:${item.guid}`, value); for (const guid of item.Guid ?? []) local.set(`${item.type}:${guid.id}`, value); }
    }
    const settings = await getUserSettings(Number(principal.userId));
    const result = await getUnifiedWatchlist(discoverClient, principal.plexToken, await createTraktClient(), createTMDBClient(), source as "all" | WatchlistSource, (thumb) => imageUrl(thumb, 400, 600) ?? "", local, settings ?? undefined);
    const response: WatchlistResponse = { items: result.items.map((item) => ({ id: item.id, title: item.title, type: item.type, year: item.year ?? null, posterUrl: item.thumb ? imageUrl(item.thumb, 400, 600) ?? item.thumb : null, sources: item.sources, ratingKey: item.localRatingKey ?? null, plexGuid: item.plexGuid ?? null, external: item.tmdbId ? { provider: "tmdb", id: String(item.tmdbId), type: item.type } : null, imdbId: item.imdbId ?? null, addedAtMs: Math.max(...Object.values(item.addedAt).filter((value): value is number => value !== undefined).map((value) => value * 1000), 0) || null })), counts: result.counts, errors: result.errors };
    return nativeJson(response, requestId);
  });
}

export async function action({ request }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "PUT", "DELETE"); const principal = await requireNativePrincipal(request); const body = await readJsonObject(request);
    const ratingKey = body.ratingKey; let plexGuid = body.plexGuid;
    if ((ratingKey === null) === (plexGuid === null) || (ratingKey !== null && typeof ratingKey !== "string") || (plexGuid !== null && typeof plexGuid !== "string")) throw new NativeError(400, "invalid_request", "Provide exactly one ratingKey or plexGuid.");
    if (ratingKey) plexGuid = plexData(await nativePlexClient(principal).getMetadata(ratingKey as string), true).guid;
    if (typeof plexGuid !== "string" || !/^plex:\/\/(movie|show)\/[a-f0-9]{24}$/.test(plexGuid)) throw new NativeError(400, "invalid_request", "A valid Plex GUID is required.");
    await recheckPrincipal(principal);
    const discover = new (await import("~/lib/plex/client.server")).PlexClient({ serverUrl: principal.serverUrl, token: principal.plexToken, clientId: process.env.PLEX_CLIENT_ID ?? "watchtower-001" });
    plexData(request.method === "PUT" ? await discover.addToWatchlist(plexGuid) : await discover.removeFromWatchlist(plexGuid));
    return nativeEmpty(requestId);
  });
}