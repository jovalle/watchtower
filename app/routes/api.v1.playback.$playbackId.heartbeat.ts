import type { ActionFunctionArgs } from "@remix-run/node";
import { nativeEmpty, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";
import { requireOwnedPlayback, transcodeCommand } from "~/lib/native/playback-resources.server";

export async function action({ request, params }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "POST");
    const principal = await requireNativePrincipal(request);
    await transcodeCommand(principal, requireOwnedPlayback(params.playbackId, principal), "ping");
    return nativeEmpty(requestId);
  });
}