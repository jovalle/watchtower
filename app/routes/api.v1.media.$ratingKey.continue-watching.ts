import type { ActionFunctionArgs } from "@remix-run/node";
import { nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeEmpty, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";

export { nativeMethodNotAllowed as loader } from "~/lib/native/http.server";

export async function action({ request, params }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "DELETE");
    if (!params.ratingKey || !/^[A-Za-z0-9_-]+$/.test(params.ratingKey)) {
      throw new NativeError(400, "invalid_request", "Invalid media selector.");
    }
    const principal = await requireNativePrincipal(request);
    const client = nativePlexClient(principal);
    plexData(await client.getMetadata(params.ratingKey), true);
    await recheckPrincipal(principal);
    plexData(await client.removeFromContinueWatching(params.ratingKey));
    await recheckPrincipal(principal);
    return nativeEmpty(requestId);
  });
}
