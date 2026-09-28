
export { nativeMethodNotAllowed as loader } from "~/lib/native/http.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import { nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeEmpty, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";

export async function action({ request, params }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "DELETE");
    if (!params.playlistId || !params.playlistItemId) throw new NativeError(404, "not_found", "Playlist item not found.");
    const principal = await requireNativePrincipal(request); const client = nativePlexClient(principal);
    const playlist = plexData(await client.getPlaylists()).find((item) => item.ratingKey === params.playlistId);
    if (!playlist) throw new NativeError(404, "not_found", "Playlist not found.");
    if (playlist.smart) throw new NativeError(409, "conflict", "Smart playlists cannot be edited.");
    await recheckPrincipal(principal); plexData(await client.removeFromPlaylist(params.playlistId, params.playlistItemId));
    return nativeEmpty(requestId);
  });
}