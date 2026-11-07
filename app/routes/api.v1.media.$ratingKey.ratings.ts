import type { LoaderFunctionArgs } from "@remix-run/node";
import { nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";
import { mediaRatings } from "~/lib/native/ratings.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    if (!params.ratingKey || !/^\d+$/.test(params.ratingKey)) throw new NativeError(400, "invalid_request", "A numeric media key is required.");
    const principal = await requireNativePrincipal(request);
    const metadata = plexData(await nativePlexClient(principal).getMetadata(params.ratingKey), true);
    await recheckPrincipal(principal);
    const ratings = await mediaRatings(metadata);
    await recheckPrincipal(principal);
    return nativeJson(ratings, requestId);
  });
}
