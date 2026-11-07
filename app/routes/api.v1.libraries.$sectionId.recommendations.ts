import type { LoaderFunctionArgs } from "@remix-run/node";
import type { LibraryRecommendationsResponse } from "~/lib/native/contract";
import { mediaSummary, nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    if (!params.sectionId) throw new NativeError(404, "not_found", "Library not found.");
    const client = nativePlexClient(await requireNativePrincipal(request));
    const libraries = plexData(await client.getLibraries());
    if (!libraries.some((section) => section.key === params.sectionId && (section.type === "movie" || section.type === "show"))) {
      throw new NativeError(404, "not_found", "Library not found.");
    }
    const hubs = plexData(await client.getLibraryHubs(params.sectionId));
    const rows = hubs.map((hub, index) => ({
      id: `library-${params.sectionId}-${hub.hubIdentifier ?? index}`,
      kind: "recommendations" as const,
      title: hub.title,
      items: (hub.Metadata ?? []).filter((item) => ["movie", "show", "season", "episode"].includes(item.type) && item.ratingKey).map(mediaSummary),
    })).filter((row) => row.items.length);
    return nativeJson({ rows } satisfies LibraryRecommendationsResponse, requestId);
  });
}
