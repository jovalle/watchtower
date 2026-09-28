import type { ActionFunctionArgs } from "@remix-run/node";
import { findDeviceSession } from "~/lib/native/device-store.server";
import { NativeError, nativeJson, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { negotiatePlayback, parsePlaybackRequest } from "~/lib/native/playback.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export async function action({ request }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "POST");
    const principal = await requireNativePrincipal(request);
    const accessToken = request.headers.get("Authorization")!.slice("Bearer ".length);
    const record = await findDeviceSession(accessToken);
    if (!record) throw new NativeError(401, "unauthenticated", "A valid device credential is required.");
    return nativeJson(await negotiatePlayback(principal, record.name, parsePlaybackRequest(await readJsonObject(request))), requestId, { status: 201 });
  });
}