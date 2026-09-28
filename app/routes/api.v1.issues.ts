import type { ActionFunctionArgs } from "@remix-run/node";
import { NativeError, nativeJson, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";
import { parseRequestTarget, requireSeerrUser } from "~/lib/native/requests.server";

export async function action({ request }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "POST"); const principal = await requireNativePrincipal(request); const body = await readJsonObject(request);
    const target = parseRequestTarget(body.type, body.tmdbId);
    if (![1, 2, 3, 4].includes(Number(body.issueType)) || typeof body.message !== "string" || body.message.trim().length < 1 || body.message.length > 1000) throw new NativeError(400, "invalid_request", "A valid issue type and message are required.");
    const seerr = await requireSeerrUser(Number(principal.userId)); const title = await seerr.client.getTitle(target.type, target.tmdbId, seerr.userId);
    if (!title.mediaInfo?.id) throw new NativeError(404, "not_found", "Requested media is not known to Seerr.");
    await recheckPrincipal(principal); const issue = await seerr.client.createIssue(title.mediaInfo.id, Number(body.issueType), body.message.trim(), seerr.userId);
    return nativeJson({ id: issue.id }, requestId, { status: 201 });
  });
}