import type { LoaderFunctionArgs } from "@remix-run/node";
import { proxyHls } from "~/lib/plex/hls-proxy.server";
import { NativeError, requireMethod, withNativeErrors, withNativeResponseHeaders } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";
import { requireOwnedPlayback } from "~/lib/native/playback-resources.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    const session = requireOwnedPlayback(params.playbackId, principal);
    const splat = params["*"] ?? "start.m3u8";
    const pathSession = /^session\/([^/]+)\//.exec(splat)?.[1];
    if (pathSession && pathSession !== params.playbackId) throw new NativeError(404, "not_found", "Playback resource not found.");
    const response = await proxyHls({
      request,
      ratingKey: session.ratingKey,
      splat,
      serverUrl: principal.serverUrl,
      token: principal.serverToken,
      clientId: session.clientId,
      rewriteBase: `/api/v1/playback/${encodeURIComponent(params.playbackId!)}/hls`,
      decisionBeforeStart: false,
      queryOverride: splat === "start.m3u8" ? session.native?.hlsQuery : null,
    });
    return withNativeResponseHeaders(response, requestId);
  });
}