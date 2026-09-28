import type { ActionFunctionArgs } from "@remix-run/node";
import { invalidateCache, getUserCacheKey } from "~/lib/plex/cache.server";
import { scrobbleTimeline } from "~/lib/trakt/scrobble.server";
import { nativePlexClient, plexData } from "~/lib/native/catalog.server";
import type { TimelineResponse } from "~/lib/native/contract";
import { NativeError, nativeJson, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";
import { requireOwnedPlayback, serializedTimeline } from "~/lib/native/playback-resources.server";

export { nativeMethodNotAllowed as loader } from "~/lib/native/http.server";

export async function action({ request, params }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "POST");
    const principal = await requireNativePrincipal(request);
    const session = requireOwnedPlayback(params.playbackId, principal);
    const body = await readJsonObject(request);
    if (!["playing", "paused", "stopped"].includes(String(body.state)) || !Number.isSafeInteger(body.positionMs) || Number(body.positionMs) < 0 || !Number.isSafeInteger(body.durationMs) || Number(body.durationMs) < 0 || !Number.isSafeInteger(body.sequence) || Number(body.sequence) < 0) {
      throw new NativeError(400, "invalid_request", "Invalid timeline request.");
    }
    const client = nativePlexClient(principal);
    const accepted = await serializedTimeline(session, Number(body.sequence), async () => {
      plexData(await client.reportTimeline({ ratingKey: session.ratingKey, state: body.state as "playing" | "paused" | "stopped", time: Number(body.positionMs), duration: Number(body.durationMs) }));
      if (body.state !== "playing") await invalidateCache(getUserCacheKey("home", principal.serverToken));
      void scrobbleTimeline({ userId: Number(principal.userId), client, ratingKey: session.ratingKey, state: body.state as "playing" | "paused" | "stopped", time: Number(body.positionMs), duration: Number(body.durationMs) }).catch(() => {
        console.error("[Native Playback] Failed to update Trakt timeline.");
      });
    });
    return nativeJson({ accepted } satisfies TimelineResponse, requestId);
  });
}