import type { LoaderFunctionArgs } from "@remix-run/node";
import { findDeviceSession } from "~/lib/native/device-store.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";
import { meResponse } from "~/lib/native/resources.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request, { requireIdentityVersion: false });
    const token = request.headers.get("Authorization")!.slice("Bearer ".length);
    const record = await findDeviceSession(token);
    if (!record) throw new NativeError(401, "unauthenticated", "A valid device credential is required.");
    return nativeJson(meResponse(principal, record), requestId);
  });
}