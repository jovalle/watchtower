import type { LoaderFunctionArgs } from "@remix-run/node";
import { createTMDBClient } from "~/lib/tmdb/client.server";
import { getUserSettings, DEFAULT_PREFERENCES } from "~/lib/settings/storage.server";
import { excludeLibraryMatches } from "~/lib/search";
import type { MediaSummary, SearchResponse } from "~/lib/native/contract";
import { imageUrl, mediaSummary, nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    const url = new URL(request.url);
    const query = (url.searchParams.get("q") ?? "").trim();
    const limit = Number(url.searchParams.get("limit") ?? 30);
    if (!query || query.length > 100 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new NativeError(400, "invalid_request", "Invalid search query.");
    const client = nativePlexClient(principal);
    const libraryItems = plexData(await client.search(query, limit));
    const prefs = { ...DEFAULT_PREFERENCES, ...(await getUserSettings(Number(principal.userId)))?.preferences };
    const tmdb = prefs.discoveryDisabled ? null : createTMDBClient();
    const externalResult = tmdb ? await tmdb.searchMulti(query) : null;
    const external: MediaSummary[] = externalResult?.success ? excludeLibraryMatches(externalResult.data, libraryItems).slice(0, limit).map((item) => ({
      ratingKey: null, type: item.type, title: item.title, year: item.releaseDate ? Number(item.releaseDate.slice(0, 4)) : null,
      posterUrl: imageUrl(item.posterUrl ?? undefined, 400, 600), backdropUrl: imageUrl(item.backdropUrl ?? undefined, 1280, 720), thumbUrl: null,
      durationMs: null, viewOffsetMs: null, viewCount: 0, leafCount: null, viewedLeafCount: null, contentRating: null,
      showTitle: null, seasonNumber: null, episodeNumber: null, parentRatingKey: null, grandparentRatingKey: null,
      external: { provider: "tmdb", id: String(item.id), type: item.type },
    })) : [];
    return nativeJson({ library: libraryItems.map(mediaSummary), external } satisfies SearchResponse, requestId);
  });
}