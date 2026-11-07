import type { LoaderFunctionArgs } from "@remix-run/node";
import { findDeviceSession, unsealAccountToken } from "~/lib/native/device-store.server";
import { NativeError, nativeJson, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";
import { listPlexHomeUsers } from "~/lib/native/profiles.server";

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    if (process.env.WATCHTOWER_PLEX_HOME_PROFILES !== "1") {
      throw new NativeError(501, "feature_unavailable", "Plex Home profiles are disabled.");
    }
    const principal = await requireNativePrincipal(request);
    const accessToken = request.headers.get("Authorization")!.slice("Bearer ".length);
    const record = await findDeviceSession(accessToken);
    if (!record) throw new NativeError(401, "unauthenticated", "A valid device credential is required.");
    const accountToken = await unsealAccountToken(record, accessToken);
    const users = await listPlexHomeUsers(accountToken, principal.userId);
    return nativeJson({ items: users.map(({ profile }) => profile) }, requestId);
  });
}