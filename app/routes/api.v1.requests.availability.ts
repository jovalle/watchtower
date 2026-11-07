import type { LoaderFunctionArgs } from "@remix-run/node";
import { nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";
import { nativePlexClient } from "~/lib/native/catalog.server";
import { parseRequestTarget, requestAvailability, requireSeerrUser } from "~/lib/native/requests.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET"); const principal = await requireNativePrincipal(request); const url = new URL(request.url);
    const rawId = url.searchParams.get("tmdbId");
    const target = parseRequestTarget(url.searchParams.get("type"), rawId && /^\d+$/.test(rawId) ? Number(rawId) : NaN);
    const seerr = await requireSeerrUser(Number(principal.userId));
    const result = await requestAvailability(seerr.client, target, seerr.userId, nativePlexClient(principal));
    await recheckPrincipal(principal);
    return nativeJson(result, requestId);
  });
}
