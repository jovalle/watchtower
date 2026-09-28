import { getPlexToken, getServerToken, getSession, isServerOwner } from "~/lib/auth/session.server";
import { getCurrentUser } from "~/lib/auth/user.server";
import { checkServerAccessDetailed } from "~/lib/auth/plex.server";
import { getServerConfig } from "~/lib/config/server-config.server";
import { sha256 } from "./crypto.server";
import {
  findDeviceSession,
  replaceServerToken,
  revokeDeviceSession,
  unsealDeviceCredentials,
  updateDeviceSession,
  type DeviceSessionRecord,
} from "./device-store.server";
import { NativeError } from "./http.server";

const VERIFY_INTERVAL_MS = 15 * 60 * 1000;
const MAX_VERIFICATION_AGE_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_RETRY_MS = 60 * 1000;
const LAST_SEEN_WRITE_MS = 60 * 1000;
const verificationRetryAt = new Map<string, number>();

export interface NativePrincipal {
  deviceSessionId: string;
  identityVersion: number;
  serverMachineId: string;
  serverUrl: string;
  userId: string;
  accountUserId: string;
  serverToken: string;
  plexToken: string;
  isOwner: boolean;
  profile: DeviceSessionRecord["profile"];
}

export interface PlaybackPrincipal {
  deviceSessionId: string;
  identityVersion: number;
  serverMachineId: string;
  serverUrl: string;
  userId: string;
  accountUserId: string;
  serverToken: string;
  plexToken: string;
  isOwner: boolean;
  profile: DeviceSessionRecord["profile"];
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("Authorization");
  if (!value) return null;
  const match = /^Bearer (wtd_[A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) throw new NativeError(401, "unauthenticated", "A valid device credential is required.");
  return match[1];
}

async function hasPlexCookie(request: Request): Promise<boolean> {
  if (!request.headers.get("Cookie")?.includes("__plex_session=")) return false;
  return (await getPlexToken(request)) !== null;
}

function requireIdentityVersion(request: Request, record: DeviceSessionRecord): void {
  const value = request.headers.get("X-Watchtower-Identity-Version");
  if (!/^\d+$/.test(value ?? "") || Number(value) !== record.identityVersion) {
    throw new NativeError(409, "identity_version_mismatch", "The active profile changed. Refresh identity and retry.");
  }
}

export async function requireNativePrincipal(
  request: Request,
  options: { requireIdentityVersion?: boolean } = {},
): Promise<Readonly<NativePrincipal>> {
  const token = bearerToken(request);
  if (!token) throw new NativeError(401, "unauthenticated", "A device credential is required.");
  if (await hasPlexCookie(request)) {
    throw new NativeError(400, "ambiguous_credentials", "Use either device or browser credentials, not both.");
  }
  let record = await findDeviceSession(token);
  if (!record) throw new NativeError(401, "unauthenticated", "A valid device credential is required.");
  if (record.revokedAtMs !== null) throw new NativeError(401, "session_revoked", "This device has been revoked.");
  if (record.expiresAtMs <= Date.now()) throw new NativeError(401, "session_expired", "This device session expired.");
  const config = getServerConfig();
  if (!config) throw new NativeError(503, "not_configured", "No Plex server is configured.", true, 30);
  if (record.serverMachineId !== config.machineIdentifier) {
    await revokeDeviceSession(record.deviceSessionId);
    throw new NativeError(401, "server_changed", "The configured Plex server changed. Pair this device again.");
  }
  if (options.requireIdentityVersion !== false) requireIdentityVersion(request, record);
  let credentials;
  try {
    credentials = await unsealDeviceCredentials(record, token);
  } catch {
    await revokeDeviceSession(record.deviceSessionId);
    throw new NativeError(401, "session_revoked", "This device credential can no longer be opened.");
  }
  const now = Date.now();
  const verificationAgeMs = now - record.verifiedAtMs;
  const retryAtMs = verificationRetryAt.get(record.tokenHash) ?? 0;
  if (
    (record.verifyImmediately || verificationAgeMs >= VERIFY_INTERVAL_MS) &&
    retryAtMs <= now
  ) {
    const access = await checkServerAccessDetailed(credentials.plexToken);
    if (access.status === "denied") {
      verificationRetryAt.delete(record.tokenHash);
      await revokeDeviceSession(record.deviceSessionId);
      throw new NativeError(401, "upstream_auth_failed", "Plex access could not be verified.");
    }
    if (access.status === "unavailable") {
      verificationRetryAt.set(record.tokenHash, now + VERIFICATION_RETRY_MS);
      if (verificationAgeMs >= MAX_VERIFICATION_AGE_MS) {
        throw new NativeError(
          503,
          "upstream_unavailable",
          "Plex access verification is temporarily unavailable.",
          true,
          Math.ceil(VERIFICATION_RETRY_MS / 1000),
        );
      }
    } else {
      verificationRetryAt.delete(record.tokenHash);
      record = (await updateDeviceSession(record.tokenHash, (stored) => {
        stored.verifiedAtMs = Date.now();
        stored.verifyImmediately = false;
      }))!;
      credentials.serverToken = access.serverToken;
      await replaceServerToken(token, access.serverToken);
    }
  } else if (verificationAgeMs >= MAX_VERIFICATION_AGE_MS) {
    throw new NativeError(
      503,
      "upstream_unavailable",
      "Plex access verification is temporarily unavailable.",
      true,
      Math.max(1, Math.ceil((retryAtMs - now) / 1000)),
    );
  }
  if (record.lastSeenAtMs === null || Date.now() - record.lastSeenAtMs >= LAST_SEEN_WRITE_MS) {
    void updateDeviceSession(record.tokenHash, (stored) => {
      stored.lastSeenAtMs = Date.now();
    }).catch(() => {
      console.error("[Native Auth] Failed to update device last seen time.");
    });
  }
  return Object.freeze({
    deviceSessionId: record.deviceSessionId,
    identityVersion: record.identityVersion,
    serverMachineId: record.serverMachineId,
    serverUrl: config.serverUrl,
    userId: record.profile.userId,
    accountUserId: record.account.userId,
    serverToken: credentials.serverToken,
    plexToken: credentials.plexToken,
    isOwner: record.isOwner,
    profile: Object.freeze({ ...record.profile }),
  });
}

export async function recheckPrincipal(principal: NativePrincipal): Promise<void> {
  const devices = await import("./device-store.server");
  const records = await devices.listAccountDevices(principal.accountUserId);
  const record = records.find((item) => item.deviceSessionId === principal.deviceSessionId);
  const config = getServerConfig();
  if (
    !record ||
    record.revokedAtMs !== null ||
    record.expiresAtMs <= Date.now() ||
    record.identityVersion !== principal.identityVersion ||
    config?.machineIdentifier !== principal.serverMachineId
  ) {
    throw new NativeError(409, "identity_version_mismatch", "The active profile changed. Retry from the current identity.");
  }
}

export async function resolveRequestPrincipal(
  request: Request,
  options: { allowCookie: boolean },
): Promise<Readonly<PlaybackPrincipal>> {
  const bearer = request.headers.has("Authorization");
  const cookie = await hasPlexCookie(request);
  if (bearer && cookie) throw new NativeError(400, "ambiguous_credentials", "Use either device or browser credentials, not both.");
  if (bearer) return requireNativePrincipal(request);
  if (!options.allowCookie || !cookie) throw new NativeError(401, "unauthenticated", "Authentication is required.");
  const [plexToken, serverToken, session, user] = await Promise.all([
    getPlexToken(request),
    getServerToken(request),
    getSession(request),
    getCurrentUser(request),
  ]);
  const config = getServerConfig();
  if (!plexToken || !serverToken || !user || !config || session.get("serverMachineId") !== config.machineIdentifier) {
    throw new NativeError(401, "unauthenticated", "Authentication is required.");
  }
  return Object.freeze({
    deviceSessionId: `web:${sha256(`${config.machineIdentifier}:${plexToken}`).slice(0, 32)}`,
    identityVersion: 0,
    serverMachineId: config.machineIdentifier,
    serverUrl: config.serverUrl,
    userId: String(user.id),
    accountUserId: String(user.id),
    serverToken,
    plexToken,
    isOwner: await isServerOwner(request),
    profile: Object.freeze({
      userId: String(user.id),
      title: user.title,
      restricted: false,
      owner: await isServerOwner(request),
      protected: false,
    }),
  });
}

export async function markPrincipalForVerification(principal: NativePrincipal): Promise<void> {
  const devices = await import("./device-store.server");
  const records = await devices.listAccountDevices(principal.accountUserId);
  const record = records.find((item) => item.deviceSessionId === principal.deviceSessionId);
  if (record) await updateDeviceSession(record.tokenHash, (stored) => { stored.verifyImmediately = true; });
}