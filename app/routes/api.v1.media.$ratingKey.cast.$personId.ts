import type { LoaderFunctionArgs } from "@remix-run/node";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { getPersonProfile } from "~/lib/native/people.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    if (!params.ratingKey || !params.personId) throw new NativeError(400, "invalid_request", "Source media and cast identifiers are required.");
    const profile = await getPersonProfile(principal, params.ratingKey, params.personId);
    await recheckPrincipal(principal);
    return nativeJson(profile, requestId);
  });
}
