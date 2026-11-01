import type { ActionFunctionArgs } from "@remix-run/node";
import { nativePlexClient, plexData } from "~/lib/native/catalog.server";
import { NativeError, nativeEmpty, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";

export { nativeMethodNotAllowed as loader } from "~/lib/native/http.server";

export async function action({ request, params }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "PUT");
    if (!params.ratingKey) throw new NativeError(404, "not_found", "Media not found.");
    const body = await readJsonObject(request);
    if (body.rating !== null && (typeof body.rating !== "number" || !Number.isFinite(body.rating) || body.rating < 0 || body.rating > 10)) {
      throw new NativeError(400, "invalid_request", "rating must be null or a number from 0 to 10.");
    }
    const principal = await requireNativePrincipal(request);
    const client = nativePlexClient(principal);
    plexData(await client.getMetadata(params.ratingKey), true);
    await recheckPrincipal(principal);
    plexData(await client.rateItem(params.ratingKey, body.rating === null ? -1 : body.rating as number));
    return nativeEmpty(requestId);
  });
}