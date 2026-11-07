import type { LoaderFunctionArgs } from "@remix-run/node";
import { PlexClient } from "~/lib/plex/client.server";
import { nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    if (!/^\d+$/.test(params.ratingKey ?? "")) throw new NativeError(400, "invalid_request", "Invalid media identifier.");
    const principal = await requireNativePrincipal(request);
    const metadata = plexData(await nativePlexClient(principal).getMetadata(params.ratingKey!), true);
    if (!(metadata.type === "movie" || metadata.type === "show") ||
      !new RegExp(`^plex://${metadata.type}/[a-f0-9]{24}$`).test(metadata.guid ?? "")) {
      await recheckPrincipal(principal);
      return nativeJson({ onWatchlist: null }, requestId);
    }
    await recheckPrincipal(principal);
    const discover = new PlexClient({ serverUrl: principal.serverUrl, token: principal.plexToken,
      clientId: process.env.PLEX_CLIENT_ID ?? "watchtower-001" });
    const items = plexData(await discover.getWatchlist());
    await recheckPrincipal(principal);
    return nativeJson({ onWatchlist: items.some((item) => item.guid === metadata.guid) }, requestId);
  });
}
