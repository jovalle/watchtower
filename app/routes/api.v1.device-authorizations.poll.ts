import type { ActionFunctionArgs } from "@remix-run/node";
import type { PollDeviceAuthorizationResponse } from "~/lib/native/contract";
import { NativeError, nativeJson, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { pollAuthorization } from "~/lib/native/pairing.server";

export async function action({ request }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "POST");
    const body = await readJsonObject(request);
    if (typeof body.pollingSecret !== "string") {
      throw new NativeError(400, "invalid_request", "pollingSecret is required.");
    }
    const response = (await pollAuthorization(body.pollingSecret)) satisfies PollDeviceAuthorizationResponse;
    return nativeJson(response, requestId);
  });
}