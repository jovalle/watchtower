import type { LoaderFunctionArgs } from "@remix-run/node";
import { positiveId } from "~/lib/integrations/seerr-pages.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";
import { readIssue } from "~/lib/native/requests.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    let id: number;
    try {
      id = positiveId(params.id);
    } catch {
      throw new NativeError(400, "invalid_request", "A positive integer issue ID is required.");
    }
    const result = await readIssue(Number(principal.userId), id);
    await recheckPrincipal(principal);
    return nativeJson(result, requestId);
  });
}

export { nativeMethodNotAllowed as action } from "~/lib/native/http.server";
