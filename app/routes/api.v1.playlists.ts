import type { LoaderFunctionArgs } from "@remix-run/node";
import { nativePlexClient, playlistSummary, plexData } from "~/lib/native/catalog.server";
import { nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const items = plexData(await nativePlexClient(await requireNativePrincipal(request)).getPlaylists()).map(playlistSummary);
    return nativeJson({ items }, requestId);
  });
}