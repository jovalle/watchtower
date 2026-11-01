import type { ActionFunctionArgs } from "@remix-run/node";
import { nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeEmpty, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";

export { nativeMethodNotAllowed as loader } from "~/lib/native/http.server";

export async function action({ request, params }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "PUT", "DELETE");
    if (!params.ratingKey) throw new NativeError(404, "not_found", "Media not found.");
    const principal = await requireNativePrincipal(request);
    const client = nativePlexClient(principal);
    plexData(await client.getMetadata(params.ratingKey), true);
    await recheckPrincipal(principal);
    plexData(request.method === "PUT" ? await client.scrobble(params.ratingKey) : await client.unscrobble(params.ratingKey));
    return nativeEmpty(requestId);
  });
}