import type { LoaderFunctionArgs } from "@remix-run/node";
import { toWebVtt } from "~/lib/plex/tracks";
import { NativeError, requireMethod, withNativeErrors, withNativeResponseHeaders } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";
import { requireOwnedPlayback } from "~/lib/native/playback-resources.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    const session = requireOwnedPlayback(params.playbackId, principal);
    const path = params.streamId ? session.native?.allowedSubtitleStreams[params.streamId] : undefined;
    if (!path) throw new NativeError(404, "not_found", "Subtitle not found.");
    const url = new URL(path, principal.serverUrl);
    if (url.origin !== new URL(principal.serverUrl).origin) throw new NativeError(404, "not_found", "Subtitle not found.");
    url.searchParams.set("X-Plex-Token", principal.serverToken);
    const upstream = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!upstream.ok) throw new NativeError(upstream.status === 404 ? 404 : 502, upstream.status === 404 ? "not_found" : "upstream_unavailable", "Subtitle unavailable.");
    return withNativeResponseHeaders(new Response(toWebVtt(await upstream.text()), { headers: { "Content-Type": "text/vtt; charset=utf-8" } }), requestId);
  });
}