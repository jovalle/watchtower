import type { LoaderFunctionArgs } from "@remix-run/node";
import { NativeError, requireMethod, withNativeErrors, withNativeResponseHeaders } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";
import { proxyNativeFile, requireOwnedPlayback } from "~/lib/native/playback-resources.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    const session = requireOwnedPlayback(params.playbackId, principal);
    if (!params.partId) throw new NativeError(404, "not_found", "Media part not found.");
    return withNativeResponseHeaders(await proxyNativeFile(request, principal, session, params.partId), requestId);
  });
}