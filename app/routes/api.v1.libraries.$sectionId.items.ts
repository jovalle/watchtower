import type { LoaderFunctionArgs } from "@remix-run/node";
import type { LibraryFilter, LibrarySort, Page, MediaSummary } from "~/lib/native/contract";
import { decodeCursor, encodeCursor, mediaSummary, nativePlexClient, pageLimit, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

const SORTS = new Set<LibrarySort>(["titleSort:asc", "titleSort:desc", "addedAt:desc", "originallyAvailableAt:desc", "audienceRating:desc", "lastViewedAt:desc"]);
const FILTERS = new Set<LibraryFilter>(["all", "unwatched", "in_progress"]);

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    if (!params.sectionId) throw new NativeError(404, "not_found", "Library not found.");
    const url = new URL(request.url);
    const sort = (url.searchParams.get("sort") ?? "titleSort:asc") as LibrarySort;
    const filter = (url.searchParams.get("filter") ?? "all") as LibraryFilter;
    const genre = url.searchParams.get("genre") ?? undefined;
    if (!SORTS.has(sort) || !FILTERS.has(filter) || (genre && genre.length > 128)) {
      throw new NativeError(400, "invalid_request", "Invalid library query.");
    }
    const limit = pageLimit(url);
    const normalized = `${params.sectionId}|${sort}|${filter}|${genre ?? ""}|${limit}`;
    const offset = decodeCursor(url.searchParams.get("cursor"), normalized);
    const client = nativePlexClient(await requireNativePrincipal(request));
    const libraries = plexData(await client.getLibraries());
    if (!libraries.some((section) => section.key === params.sectionId && (section.type === "movie" || section.type === "show"))) {
      throw new NativeError(404, "not_found", "Library not found.");
    }
    const filterQuery = filter === "unwatched" ? "unwatched=1" : filter === "in_progress" ? "inProgress=1" : undefined;
    const raw = plexData(await client.getLibraryItems(params.sectionId, { sort, genre, filter: filterQuery, limit: limit + 1, offset }));
    const hasMore = raw.length > limit;
    const response = {
      items: raw.slice(0, limit).map(mediaSummary),
      nextCursor: hasMore ? encodeCursor(offset + limit, normalized) : null,
      totalCount: null,
    } satisfies Page<MediaSummary>;
    return nativeJson(response, requestId);
  });
}