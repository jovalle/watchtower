import type { LoaderFunctionArgs } from "@remix-run/node";
import type { LibraryFilter, LibraryLettersResponse } from "~/lib/native/contract";
import { encodeCursor, nativePlexClient, pageLimit, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

const FILTERS = new Set<LibraryFilter>(["all", "unwatched", "in_progress"]);

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    if (!params.sectionId) throw new NativeError(404, "not_found", "Library not found.");
    const url = new URL(request.url);
    const sort = url.searchParams.get("sort") ?? "titleSort:asc";
    const filter = (url.searchParams.get("filter") ?? "all") as LibraryFilter;
    const genre = url.searchParams.get("genre") ?? undefined;
    if (!["titleSort:asc", "titleSort:desc"].includes(sort) || !FILTERS.has(filter) || (genre && genre.length > 128)) {
      throw new NativeError(400, "invalid_request", "Invalid library query.");
    }
    const limit = pageLimit(url);
    const normalized = `${params.sectionId}|${sort}|${filter}|${genre ?? ""}|${limit}`;
    const client = nativePlexClient(await requireNativePrincipal(request));
    const libraries = plexData(await client.getLibraries());
    if (!libraries.some((section) => section.key === params.sectionId && (section.type === "movie" || section.type === "show"))) {
      throw new NativeError(404, "not_found", "Library not found.");
    }
    const filterQuery = filter === "unwatched" ? "unwatched=1" : filter === "in_progress" ? "inProgress=1" : undefined;
    const groups = plexData(await client.getLibraryFacet(params.sectionId, "firstCharacter", { genre, filter: filterQuery }));
    // PMS facets are ascending; their counts locate groups within the reversed title list too.
    if (sort === "titleSort:desc") groups.reverse();
    const letters: LibraryLettersResponse["letters"] = [];
    let offset = 0;
    for (const group of groups) {
      const count = group.size;
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(offset + count) || typeof group.title !== "string" || !group.title.trim()) {
        throw new NativeError(503, "upstream_unavailable", "Library letter counts are unavailable.", true, 15);
      }
      if (count > 0) letters.push({ letter: group.title, cursor: encodeCursor(offset, normalized) });
      offset += count;
    }
    return nativeJson({ letters } satisfies LibraryLettersResponse, requestId);
  });
}
