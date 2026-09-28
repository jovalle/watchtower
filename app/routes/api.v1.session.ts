import type { ActionFunctionArgs } from "@remix-run/node";
import { revokeDeviceSession } from "~/lib/native/device-store.server";
import { nativeEmpty, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export { nativeMethodNotAllowed as loader } from "~/lib/native/http.server";

export async function action({ request }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "DELETE");
    const principal = await requireNativePrincipal(request, { requireIdentityVersion: false });
    await revokeDeviceSession(principal.deviceSessionId);
    return nativeEmpty(requestId);
  });
}