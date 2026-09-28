/**
 * Request-principal boundary for room routes (shared-contract `PlaybackPrincipal`).
 * This file is the web-cookie adapter. Native bearer credentials are owned by the
 * Android TV track; until its resolver lands, bearer requests fail closed instead
 * of downgrading to cookie authentication.
 */

import { createCookie } from "@remix-run/node";
import { randomUUID } from "node:crypto";
import { getSession } from "~/lib/auth/session.server";
import { getCurrentUser } from "~/lib/auth/user.server";
import { getServerConfig } from "~/lib/config/server-config.server";
import { env } from "~/lib/env.server";
import { isUuid, ROOM_POLICY, type RoomErrorCode } from "./protocol";

export type PlaybackPrincipal = {
  kind: "web";
  userId: string;
  displayName: string;
  serverMachineId: string;
  /** Secret; server-only, never serialized. */
  serverToken: string;
  deviceSessionId: string;
  /** Web identity context is the (userId, device cookie) binding; logout clears memberships. */
  identityVersion: number;
};

export type PrincipalResult =
  | { ok: true; principal: PlaybackPrincipal; setCookie: string | null }
  | { ok: false; code: RoomErrorCode; message: string };

let deviceCookie: ReturnType<typeof createCookie> | undefined;
function getDeviceCookie() {
  deviceCookie ??= createCookie("__wt_device", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: env.SECURE_COOKIES,
    secrets: [env.SESSION_SECRET],
    maxAge: 60 * 60 * 24 * 365,
  });
  return deviceCookie;
}

/** Server-issued browser device scope; tabs of one browser profile share it. */
export async function getWebDevice(request: Request): Promise<{ deviceSessionId: string; setCookie: string | null }> {
  const cookie = getDeviceCookie();
  const existing = await cookie.parse(request.headers.get("Cookie"));
  if (isUuid(existing)) return { deviceSessionId: existing, setCookie: null };
  const deviceSessionId = randomUUID();
  return { deviceSessionId, setCookie: await cookie.serialize(deviceSessionId) };
}

export async function resolveRoomPrincipal(request: Request): Promise<PrincipalResult> {
  if (request.headers.has("Authorization")) {
    return request.headers.get("Cookie")?.includes("__plex_session=")
      ? { ok: false, code: "identity_ambiguous", message: "Send either a device credential or a browser session, not both." }
      : { ok: false, code: "bearer_unsupported", message: "Device credentials are not supported by this server yet." };
  }
  const session = await getSession(request);
  const serverToken = session.get("serverToken");
  if (!session.get("plexToken") || !serverToken) {
    return { ok: false, code: "unauthenticated", message: "Sign in to use Watch Together." };
  }
  const config = getServerConfig();
  if (!config || session.get("serverMachineId") !== config.machineIdentifier) {
    return { ok: false, code: "server_changed", message: "Reload Watchtower to verify access to this server." };
  }
  const user = await getCurrentUser(request);
  if (!user) return { ok: false, code: "unauthenticated", message: "Your Plex sign-in has expired." };
  const device = await getWebDevice(request);
  return {
    ok: true,
    setCookie: device.setCookie,
    principal: {
      kind: "web",
      userId: String(user.id),
      displayName: (user.title || user.username || "Viewer").slice(0, ROOM_POLICY.maxDisplayNameLength),
      serverMachineId: config.machineIdentifier,
      serverToken,
      deviceSessionId: device.deviceSessionId,
      identityVersion: 0,
    },
  };
}
