import type { ActionFunctionArgs } from "@remix-run/node";
import { checkServerAccessDetailed } from "~/lib/auth/plex.server";
import { findDeviceSession, replaceDeviceProfile, unsealAccountToken } from "~/lib/native/device-store.server";
import { NativeError, nativeJson, readJsonObject, requireMethod, withNativeErrors } from "~/lib/native/http.server";
import { recheckPrincipal, requireNativePrincipal } from "~/lib/native/principal.server";
import { listPlexHomeUsers, switchPlexHomeUser } from "~/lib/native/profiles.server";
import { checkRateLimitFailures, clearRateLimit, recordRateLimitFailure, serializeRateLimited } from "~/lib/native/rate-limit.server";
import { meResponse } from "~/lib/native/resources.server";

export { nativeMethodNotAllowed as loader } from "~/lib/native/http.server";

export async function action({ request }: ActionFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "POST");
    if (process.env.WATCHTOWER_PLEX_HOME_PROFILES !== "1") {
      throw new NativeError(501, "feature_unavailable", "Plex Home profiles are disabled.");
    }
    const principal = await requireNativePrincipal(request);
    const body = await readJsonObject(request);
    if (typeof body.profileId !== "string" || body.profileId.length > 128 ||
        (body.pin !== null && typeof body.pin !== "string") ||
        !Number.isInteger(body.expectedIdentityVersion)) {
      throw new NativeError(400, "invalid_request", "Invalid profile switch request.");
    }
    if (body.expectedIdentityVersion !== principal.identityVersion) {
      throw new NativeError(409, "identity_version_mismatch", "The active profile changed. Refresh identity and retry.");
    }
    const accessToken = request.headers.get("Authorization")!.slice("Bearer ".length);
    const record = await findDeviceSession(accessToken);
    if (!record) throw new NativeError(401, "unauthenticated", "A valid device credential is required.");
    const accountToken = await unsealAccountToken(record, accessToken);
    const users = await listPlexHomeUsers(accountToken, principal.userId);
    const selected = users.find(({ profile }) => profile.profileId === body.profileId);
    if (!selected) throw new NativeError(404, "not_found", "Profile not found.");
    const pinLimitKey = `${principal.deviceSessionId}:${body.profileId}`;
    return serializeRateLimited("profile-pin", pinLimitKey, async () => {
      checkRateLimitFailures("profile-pin", pinLimitKey, 5, 15 * 60 * 1000);
      await recheckPrincipal(principal);
      let switched;
      try {
        switched = await switchPlexHomeUser(accountToken, selected.raw, body.pin as string | null);
      } catch (error) {
        if (error instanceof NativeError && error.code === "invalid_pin") {
          recordRateLimitFailure("profile-pin", pinLimitKey, 5, 15 * 60 * 1000);
        }
        throw error;
      }
      const access = await checkServerAccessDetailed(switched.authToken);
      if (access.status === "unavailable") {
        throw new NativeError(503, "upstream_unavailable", "Plex access verification is temporarily unavailable.", true, 60);
      }
      if (access.status === "denied") {
        throw new NativeError(403, "forbidden", "This profile cannot access the configured Plex server.");
      }
      await recheckPrincipal(principal);
      const updated = await replaceDeviceProfile(accessToken, principal.identityVersion, {
        profile: switched.profile,
        plexToken: switched.authToken,
        serverToken: access.serverToken,
        isOwner: access.isOwner === true,
      });
      if (updated === "stale") throw new NativeError(409, "identity_version_mismatch", "The active profile changed. Refresh identity and retry.");
      if (!updated) throw new NativeError(401, "session_revoked", "This device has been revoked.");
      clearRateLimit("profile-pin", pinLimitKey);
      const nextPrincipal = Object.freeze({ ...principal, identityVersion: updated.identityVersion, userId: updated.profile.userId, serverToken: access.serverToken, plexToken: switched.authToken, isOwner: access.isOwner === true, profile: updated.profile });
      return nativeJson(await meResponse(nextPrincipal, updated), requestId);
    });
  });
}