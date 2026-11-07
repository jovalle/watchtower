import type { LoaderFunctionArgs } from "@remix-run/node";
import { mediaDetail, nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    if (!params.ratingKey) throw new NativeError(404, "not_found", "Media not found.");
    const client = nativePlexClient(await requireNativePrincipal(request));
    const metadata = plexData(await client.getMetadata(params.ratingKey, { includeMarkers: true }), true);
    const detail = mediaDetail(metadata);
    const showKey = metadata.type === "episode" ? metadata.grandparentRatingKey : metadata.type === "season" ? metadata.parentRatingKey : undefined;
    if (!detail.clearLogoUrl && showKey) {
      const show = await client.getMetadata(showKey);
      if (show.success) detail.clearLogoUrl = mediaDetail(show.data).clearLogoUrl;
      else if (show.error.status === 401) plexData(show);
    }
    if (detail.guids.plex && (metadata.type === "movie" || metadata.type === "show")) {
      const siblings = await client.findByPlexGuid(metadata.type, detail.guids.plex);
      if (siblings.success) detail.editions = siblings.data.filter((item) => item.ratingKey !== metadata.ratingKey).map((item) => ({ ratingKey: item.ratingKey, editionTitle: (item as typeof item & { editionTitle?: string }).editionTitle ?? null }));
      else if (siblings.error.status === 401) plexData(siblings);
    }
    return nativeJson(detail, requestId);
  });
}
