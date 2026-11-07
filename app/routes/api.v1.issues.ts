import { listParams } from "~/lib/integrations/seerr-pages.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { NativeError, nativeJson, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";
import { ISSUE_FILTERS, issueInbox, parseRequestTarget, requireSeerrUser, seerrOperation } from "~/lib/native/requests.server";

export async function action({ request }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "POST"); const principal = await requireNativePrincipal(request); const body = await readJsonObject(request);
    const target = parseRequestTarget(body.type, body.tmdbId);
    if (![1, 2, 3, 4].includes(Number(body.issueType)) || typeof body.message !== "string" || body.message.trim().length < 1 || body.message.length > 1000) throw new NativeError(400, "invalid_request", "A valid issue type and message are required.");
    const seerr = await requireSeerrUser(Number(principal.userId)); const title = await seerrOperation(() => seerr.client.getTitle(target.type, target.tmdbId, seerr.userId));
    if (!title.mediaInfo?.id) throw new NativeError(404, "not_found", "Requested media is not known to Seerr.");
    const mediaId = title.mediaInfo.id; const issueType = Number(body.issueType); const message = body.message.trim();
    await recheckPrincipal(principal); const issue = await seerrOperation(() => seerr.client.createIssue(mediaId, issueType, message, seerr.userId));
    await recheckPrincipal(principal);
    return nativeJson({ id: issue.id }, requestId, { status: 201 });
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    const { page, filter } = listParams(request, ISSUE_FILTERS);
    const result = await issueInbox(Number(principal.userId), page, filter);
    await recheckPrincipal(principal);
    return nativeJson(result, requestId);
  });
}
