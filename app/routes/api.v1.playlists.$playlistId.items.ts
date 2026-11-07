import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import type { Page, PlaylistItem } from "~/lib/native/contract";
import { decodeCursor, encodeCursor, nativePlexClient, pageLimit, playlistItem, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeEmpty, nativeJson, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    if (!params.playlistId) throw new NativeError(404, "not_found", "Playlist not found.");
    const url = new URL(request.url); const limit = pageLimit(url); const normalized = `${params.playlistId}|${limit}`; const offset = decodeCursor(url.searchParams.get("cursor"), normalized);
    const all = plexData(await nativePlexClient(await requireNativePrincipal(request)).getPlaylistItems(params.playlistId), true);
    const response = { items: all.slice(offset, offset + limit).map(playlistItem), nextCursor: offset + limit < all.length ? encodeCursor(offset + limit, normalized) : null, totalCount: all.length } satisfies Page<PlaylistItem>;
    return nativeJson(response, requestId);
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "POST");
    if (!params.playlistId) throw new NativeError(404, "not_found", "Playlist not found.");
    const principal = await requireNativePrincipal(request); const body = await readJsonObject(request);
    if (typeof body.ratingKey !== "string" || body.ratingKey.length > 64) throw new NativeError(400, "invalid_request", "ratingKey is required.");
    const client = nativePlexClient(principal); const playlist = plexData(await client.getPlaylists()).find((item) => item.ratingKey === params.playlistId);
    if (!playlist) throw new NativeError(404, "not_found", "Playlist not found.");
    if (playlist.smart) throw new NativeError(409, "conflict", "Smart playlists cannot be edited.");
    await recheckPrincipal(principal); plexData(await client.addToPlaylist(params.playlistId, body.ratingKey));
    return nativeEmpty(requestId);
  });
}