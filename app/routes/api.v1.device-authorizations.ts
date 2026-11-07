import type { ActionFunctionArgs } from "@remix-run/node";
import type { DeviceAuthorizationResponse } from "~/lib/native/contract";
import { nativeJson, readJsonObject, requestClientIp, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { createAuthorization, parseCreateAuthorization } from "~/lib/native/pairing.server";

export { nativeMethodNotAllowed as loader } from "~/lib/native/http.server";

export async function action({ request, context }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "POST");
    const input = parseCreateAuthorization(await readJsonObject(request));
    const response = createAuthorization(
      input,
      new URL(request.url).origin,
      requestClientIp(request, context),
    ) satisfies DeviceAuthorizationResponse;
    return nativeJson(response, requestId, { status: 201 });
  });
}