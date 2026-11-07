import type { LoaderFunctionArgs } from "@remix-run/node";
import { listAccountDevices, toDeviceSummary } from "~/lib/native/device-store.server";
import { nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    const records = await listAccountDevices(principal.accountUserId);
    return nativeJson(
      { items: records.map((record) => toDeviceSummary(record, principal.deviceSessionId)) },
      requestId,
    );
  });
}