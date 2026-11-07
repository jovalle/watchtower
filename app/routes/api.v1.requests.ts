import { listParams } from "~/lib/integrations/seerr-pages.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { NativeError, nativeJson, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { nativePlexClient } from "~/lib/native/catalog.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";
import { REQUEST_FILTERS, requestInbox, parseRequestTarget, requestAvailability, requireSeerrUser, seerrOperation } from "~/lib/native/requests.server";

export async function action({ request }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "POST"); const principal = await requireNativePrincipal(request); const body = await readJsonObject(request);
    const target = parseRequestTarget(body.type, body.tmdbId); const seerr = await requireSeerrUser(Number(principal.userId));
    const plex = nativePlexClient(principal);
    const before = await requestAvailability(seerr.client, target, seerr.userId, plex);
    if (!before.canRequest) {
      const reason = before.status === "available" ? "This title is already available in the library."
        : before.status === "blocklisted" ? "This title is blocked from requests."
        : before.status === "partially_available" ? "This movie is already partially available in the library."
        : "This title already has an active request.";
      throw new NativeError(409, "conflict", reason);
    }
    await recheckPrincipal(principal); await seerrOperation(() => seerr.client.createRequest(target.type, target.tmdbId, seerr.userId));
    const result = await requestAvailability(seerr.client, target, seerr.userId, plex)
      .catch(() => ({ ...before, status: "pending" as const, canRequest: false }));
    await recheckPrincipal(principal);
    return nativeJson({ ...result, status: result.status === "unknown" ? "pending" : result.status, canRequest: false }, requestId, { status: 201 });
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    const { page, filter } = listParams(request, REQUEST_FILTERS);
    const result = await requestInbox(Number(principal.userId), page, filter);
    await recheckPrincipal(principal);
    return nativeJson(result, requestId);
  });
}
