import type { LoaderFunctionArgs } from "@remix-run/node";
import type { AdjacentResponse } from "~/lib/native/contract";
import { mediaSummary, nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    if (!params.ratingKey) throw new NativeError(404, "not_found", "Media not found.");
    const client = nativePlexClient(await requireNativePrincipal(request));
    const metadata = plexData(await client.getMetadata(params.ratingKey), true);
    let response: AdjacentResponse = { previous: null, next: null };
    if (metadata.type === "episode" && metadata.grandparentRatingKey) {
      const leaves = plexData(await client.getAllLeaves(metadata.grandparentRatingKey));
      const index = leaves.findIndex((item) => item.ratingKey === metadata.ratingKey);
      response = { previous: index > 0 ? mediaSummary(leaves[index - 1]) : null, next: index >= 0 && index + 1 < leaves.length ? mediaSummary(leaves[index + 1]) : null };
    }
    return nativeJson(response, requestId);
  });
}