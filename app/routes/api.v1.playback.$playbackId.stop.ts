import type { ActionFunctionArgs } from "@remix-run/node";
import { nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeEmpty, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";
import { requireOwnedPlayback, serializedTimeline, transcodeCommand } from "~/lib/native/playback-resources.server";

export { nativeMethodNotAllowed as loader } from "~/lib/native/http.server";

export async function action({ request, params }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "POST");
    const principal = await requireNativePrincipal(request);
    const session = requireOwnedPlayback(params.playbackId, principal);
    const body = await readJsonObject(request);
    const hasFinal = body.positionMs !== null || body.durationMs !== null || body.sequence !== null;
    if (hasFinal && (!Number.isSafeInteger(body.positionMs) || Number(body.positionMs) < 0 || !Number.isSafeInteger(body.durationMs) || Number(body.durationMs) < 0 || !Number.isSafeInteger(body.sequence) || Number(body.sequence) < 0)) {
      throw new NativeError(400, "invalid_request", "Invalid stop request.");
    }
    if (hasFinal) {
      const client = nativePlexClient(principal);
      await serializedTimeline(session, Number(body.sequence), async () => {
        plexData(await client.reportTimeline({ ratingKey: session.ratingKey, state: "stopped", time: Number(body.positionMs), duration: Number(body.durationMs) }));
      });
    }
    await transcodeCommand(principal, session, "stop");
    return nativeEmpty(requestId);
  });
}