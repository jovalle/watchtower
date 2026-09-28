import type { LoaderFunctionArgs } from "@remix-run/node";
import type { MediaSummary, Page } from "~/lib/native/contract";
import { decodeCursor, encodeCursor, mediaSummary, nativePlexClient, pageLimit, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    if (!params.ratingKey) throw new NativeError(404, "not_found", "Media not found.");
    const url = new URL(request.url);
    const limit = pageLimit(url);
    const normalized = `${params.ratingKey}|${limit}`;
    const offset = decodeCursor(url.searchParams.get("cursor"), normalized);
    const all = plexData(await nativePlexClient(await requireNativePrincipal(request)).getChildren(params.ratingKey), true);
    const response = { items: all.slice(offset, offset + limit).map(mediaSummary), nextCursor: offset + limit < all.length ? encodeCursor(offset + limit, normalized) : null, totalCount: all.length } satisfies Page<MediaSummary>;
    return nativeJson(response, requestId);
  });
}