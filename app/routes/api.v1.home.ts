import type { LoaderFunctionArgs } from "@remix-run/node";
import { personalRecommendations } from "~/lib/home.server";
import { getUserSettings, DEFAULT_PREFERENCES } from "~/lib/settings/storage.server";
import type { HomeResponse } from "~/lib/native/contract";
import { mediaSummary, nativePlexClient } from "~/lib/native/catalog.server";
import { nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    const client = nativePlexClient(principal);
    const prefs = { ...DEFAULT_PREFERENCES, ...(await getUserSettings(Number(principal.userId)))?.preferences };
    const [continuing, recent, promoted, recommended] = await Promise.all([
      prefs.showContinueWatching ? client.getContinueWatching(30) : null,
      prefs.showRecentlyAdded ? client.getRecentlyAdded(undefined, 30) : null,
      prefs.showCollections ? client.getPromotedCollections() : null,
      personalRecommendations(client),
    ]);
    const errors: string[] = [];
    if (continuing && !continuing.success) errors.push("Continue Watching could not be loaded.");
    if (recent && !recent.success) errors.push("Recently Added could not be loaded.");
    if (promoted && !promoted.success) errors.push("Collections could not be loaded.");
    const continueItems = continuing?.success ? continuing.data : [];
    const recentItems = recent?.success ? recent.data.filter((item) => item.type === "movie" || item.type === "show") : [];
    const rows: HomeResponse["rows"] = [];
    if (continueItems.length) rows.push({ id: "continue-watching", kind: "continue_watching", title: "Continue Watching", items: continueItems.map(mediaSummary) });
    if (recentItems.length) rows.push({ id: "recently-added", kind: "recently_added", title: "Recently Added", items: recentItems.map(mediaSummary) });
    if (recommended?.items.length) rows.push({ id: "recommendations", kind: "recommendations", title: recommended.title, items: recommended.items.map(mediaSummary) });
    if (promoted?.success) promoted.data.forEach((collection, index) => rows.push({ id: `collection-${index}`, kind: "collection", title: collection.title, items: collection.items.map(mediaSummary) }));
    const response = { hero: recentItems.slice(0, 10).map(mediaSummary), rows, errors } satisfies HomeResponse;
    return nativeJson(response, requestId);
  });
}