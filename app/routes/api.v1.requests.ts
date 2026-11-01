
export { nativeMethodNotAllowed as loader } from "~/lib/native/http.server";
import type { ActionFunctionArgs } from "@remix-run/node";
import { nativeJson, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";
import { parseRequestTarget, requestAvailability, requireSeerrUser } from "~/lib/native/requests.server";

export async function action({ request }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "POST"); const principal = await requireNativePrincipal(request); const body = await readJsonObject(request);
    const target = parseRequestTarget(body.type, body.tmdbId); const seerr = await requireSeerrUser(Number(principal.userId));
    await recheckPrincipal(principal); await seerr.client.createRequest(target.type, target.tmdbId, seerr.userId);
    return nativeJson(await requestAvailability(seerr.client, target, seerr.userId), requestId, { status: 201 });
  });
}