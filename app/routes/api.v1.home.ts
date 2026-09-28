import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  personalRecommendations,
  resolveTrendingLibraryMatches,
  splitContinueWatching,
} from "~/lib/home.server";
import { getUserSettings, DEFAULT_PREFERENCES } from "~/lib/settings/storage.server";
import type { HomeResponse } from "~/lib/native/contract";
import { imageUrl, mediaSummary, nativePlexClient } from "~/lib/native/catalog.server";
import { nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";
import { createTMDBClient } from "~/lib/tmdb/client.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    const client = nativePlexClient(principal);
    const prefs = { ...DEFAULT_PREFERENCES, ...(await getUserSettings(Number(principal.userId)))?.preferences };
    const tmdb = !prefs.discoveryDisabled && prefs.showTrending
      ? createTMDBClient()
      : null;
    const [continuing, recent, promoted, recommended, trending] = await Promise.all([
      prefs.showContinueWatching ? client.getContinueWatching(30) : null,
      prefs.showRecentlyAdded ? client.getRecentlyAdded(undefined, 30) : null,
      prefs.showCollections ? client.getPromotedCollections() : null,
      personalRecommendations(client),
      tmdb ? tmdb.getTrending() : null,
    ]);
    const errors: string[] = [];
    if (continuing && !continuing.success) errors.push("Continue Watching could not be loaded.");
    if (recent && !recent.success) errors.push("Recently Added could not be loaded.");
    if (promoted && !promoted.success) errors.push("Collections could not be loaded.");
    if (trending && !trending.success) errors.push("Trending could not be loaded.");
    const split = splitContinueWatching(
      continuing?.success ? continuing.data : [],
    );
    const continueItems = split.continuing;
    const nextEpisodes = split.nextEpisodes;
    const recentItems = recent?.success ? recent.data.filter((item) => item.type === "movie" || item.type === "show") : [];
    const resolvedTrending = trending?.success
      ? await resolveTrendingLibraryMatches(client, trending.data.slice(0, 20))
      : [];
    const rows: HomeResponse["rows"] = [];
    if (continueItems.length) rows.push({ id: "continue-watching", kind: "continue_watching", title: "Continue Watching", items: continueItems.map(mediaSummary) });
    if (nextEpisodes.length) rows.push({ id: "next-episodes", kind: "next_episodes", title: "Next episodes for you", items: nextEpisodes.map(mediaSummary) });
    if (recentItems.length) rows.push({ id: "recently-added", kind: "recently_added", title: "Recently Added", items: recentItems.map(mediaSummary) });
    if (recommended?.items.length) rows.push({ id: "recommendations", kind: "recommendations", title: recommended.title, items: recommended.items.map(mediaSummary) });
    if (resolvedTrending.length) rows.push({
      id: "trending",
      kind: "trending",
      title: "Trending Now",
      items: resolvedTrending.map(({ recommendation, match }) => match
        ? mediaSummary(match)
        : {
            ratingKey: null,
            type: recommendation.type,
            title: recommendation.title,
            year: Number.parseInt(recommendation.releaseDate.slice(0, 4), 10) || null,
            posterUrl: imageUrl(recommendation.posterUrl ?? undefined, 400, 600),
            backdropUrl: imageUrl(recommendation.backdropUrl ?? undefined, 1280, 720),
            thumbUrl: null,
            durationMs: null,
            viewOffsetMs: null,
            viewCount: 0,
            leafCount: null,
            viewedLeafCount: null,
            contentRating: null,
            showTitle: null,
            seasonNumber: null,
            episodeNumber: null,
            parentRatingKey: null,
            grandparentRatingKey: null,
            external: {
              provider: "tmdb" as const,
              id: String(recommendation.id),
              type: recommendation.type,
            },
          }),
    });
    if (promoted?.success) promoted.data.forEach((collection, index) => rows.push({ id: `collection-${index}`, kind: "collection", title: collection.title, items: collection.items.map(mediaSummary) }));
    const response = { hero: recentItems.slice(0, 10).map(mediaSummary), rows, errors } satisfies HomeResponse;
    return nativeJson(response, requestId);
  });
}