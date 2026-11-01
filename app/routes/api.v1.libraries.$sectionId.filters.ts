import type { LoaderFunctionArgs } from "@remix-run/node";
import type { LibraryFiltersResponse } from "~/lib/native/contract";
import { nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    if (!params.sectionId) throw new NativeError(404, "not_found", "Library not found.");
    const client = nativePlexClient(await requireNativePrincipal(request));
    const filters = plexData(await client.getLibraryFilters(params.sectionId));
    const response = { genres: filters.genres, years: filters.years } satisfies LibraryFiltersResponse;
    return nativeJson(response, requestId);
  });
}