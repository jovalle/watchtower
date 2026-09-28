import type { ActionFunctionArgs } from "@remix-run/node";
import { listAccountDevices, revokeDeviceSession } from "~/lib/native/device-store.server";
import { NativeError, nativeEmpty, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export async function action({ request, params }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "DELETE");
    const principal = await requireNativePrincipal(request, { requireIdentityVersion: false });
    const target = params.deviceSessionId;
    const devices = await listAccountDevices(principal.accountUserId);
    if (!target || !devices.some((device) => device.deviceSessionId === target)) {
      throw new NativeError(404, "not_found", "Device not found.");
    }
    await revokeDeviceSession(target);
    return nativeEmpty(requestId);
  });
}