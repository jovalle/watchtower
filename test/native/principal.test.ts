import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { saveServerConfig } from "~/lib/config/server-config.server";
import { resetNativeCryptoForTests } from "~/lib/native/crypto.server";
import {
  createDeviceSession,
  findDeviceSession,
  revokeDeviceSession,
  resetDeviceStoreForTests,
  updateDeviceSession,
} from "~/lib/native/device-store.server";
import {
  recheckPrincipal,
  requireNativePrincipal,
} from "~/lib/native/principal.server";

const dataPath = path.resolve("tmp/native-principal-test");

beforeEach(async () => {
  process.env.DATA_PATH = dataPath;
  process.env.SESSION_SECRET = "native-principal-test-secret";
  await rm(dataPath, { recursive: true, force: true });
  await mkdir(dataPath, { recursive: true });
  resetDeviceStoreForTests();
  resetNativeCryptoForTests();
  saveServerConfig({
    serverUrl: "http://plex.test:32400",
    machineIdentifier: "fake-machine",
    serverName: "Fake PMS",
    token: "owner-token-must-not-be-used",
    adminUserId: 10,
    adminUsername: "Owner",
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dataPath, { recursive: true, force: true });
});

async function createPrincipalSession(verificationAgeMs = 0) {
  const created = await createDeviceSession({
    name: "Living Room",
    platform: "android-tv",
    model: "Test TV",
    appVersion: "1.0",
    account: { userId: "10", title: "Owner" },
    profile: {
      userId: "10",
      title: "Owner",
      restricted: false,
      owner: true,
      protected: false,
    },
    serverMachineId: "fake-machine",
    serverName: "Fake PMS",
    plexToken: "profile-plex-token",
    serverToken: "profile-server-token",
    isOwner: true,
  });
  if (verificationAgeMs > 0) {
    await updateDeviceSession(created.record.tokenHash, (record) => {
      record.verifiedAtMs = Date.now() - verificationAgeMs;
    });
  }
  return created;
}

function principalRequest(accessToken: string): Request {
  return new Request("https://watchtower.test/api/v1/home", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Watchtower-Identity-Version": "1",
    },
  });
}

describe("native principal verification", () => {
  it("rejects missing and malformed bearer credentials", async () => {
    await expect(
      requireNativePrincipal(
        new Request("https://watchtower.test/api/v1/home"),
      ),
    ).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
    await expect(
      requireNativePrincipal(
        new Request("https://watchtower.test/api/v1/home", {
          headers: { Authorization: "Bearer garbage" },
        }),
      ),
    ).rejects.toMatchObject({ status: 401, code: "unauthenticated" });
  });

  it("rejects revoked and expired sessions", async () => {
    const revoked = await createPrincipalSession();
    await revokeDeviceSession(revoked.record.deviceSessionId);
    await expect(
      requireNativePrincipal(principalRequest(revoked.accessToken)),
    ).rejects.toMatchObject({ status: 401, code: "session_revoked" });

    const expired = await createPrincipalSession();
    await updateDeviceSession(expired.record.tokenHash, (record) => {
      record.expiresAtMs = Date.now() - 1;
    });
    await expect(
      requireNativePrincipal(principalRequest(expired.accessToken)),
    ).rejects.toMatchObject({ status: 401, code: "session_expired" });
  });

  it("revokes a session when the configured server machine changes", async () => {
    const created = await createPrincipalSession(20 * 60 * 1000);
    saveServerConfig({
      serverUrl: "http://other-plex.test:32400",
      machineIdentifier: "other-machine",
      serverName: "Other PMS",
      token: "other-owner-token",
      adminUserId: 10,
      adminUsername: "Owner",
    });

    await expect(
      requireNativePrincipal(principalRequest(created.accessToken)),
    ).rejects.toMatchObject({ status: 401, code: "server_changed" });
    expect(
      (await findDeviceSession(created.accessToken))?.revokedAtMs,
    ).not.toBeNull();
  });

  it("keeps a recently verified session authorized while plex.tv is unavailable", async () => {
    const created = await createPrincipalSession(20 * 60 * 1000);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    );

    await expect(
      requireNativePrincipal(principalRequest(created.accessToken)),
    ).resolves.toMatchObject({
      deviceSessionId: created.record.deviceSessionId,
      serverToken: "profile-server-token",
    });
    expect((await findDeviceSession(created.accessToken))?.revokedAtMs).toBeNull();
  });

  it("revokes the session when plex.tv explicitly denies access", async () => {
    const created = await createPrincipalSession(20 * 60 * 1000);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 401 }),
    );

    await expect(
      requireNativePrincipal(principalRequest(created.accessToken)),
    ).rejects.toMatchObject({ status: 401, code: "upstream_auth_failed" });
    expect(
      (await findDeviceSession(created.accessToken))?.revokedAtMs,
    ).not.toBeNull();
  });

  it("returns retryable unavailable after the 24 hour verification grace", async () => {
    const created = await createPrincipalSession(20 * 60 * 1000);
    await updateDeviceSession(created.record.tokenHash, (record) => {
      record.verifiedAtMs = Date.now() - 24 * 60 * 60 * 1000;
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    );

    await expect(
      requireNativePrincipal(principalRequest(created.accessToken)),
    ).rejects.toMatchObject({
      status: 503,
      code: "upstream_unavailable",
      retryable: true,
      retryAfterSeconds: 60,
    });
    expect((await findDeviceSession(created.accessToken))?.revokedAtMs).toBeNull();
  });

  it("backs off verification attempts for one minute during an outage", async () => {
    const created = await createPrincipalSession(20 * 60 * 1000);
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("unavailable", { status: 503 }));

    await requireNativePrincipal(principalRequest(created.accessToken));
    await requireNativePrincipal(principalRequest(created.accessToken));

    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("rechecks revocation, expiry, and identity changes before mutations", async () => {
    const revoked = await createPrincipalSession();
    const revokedPrincipal = await requireNativePrincipal(
      principalRequest(revoked.accessToken),
    );
    await revokeDeviceSession(revoked.record.deviceSessionId);
    await expect(recheckPrincipal(revokedPrincipal)).rejects.toMatchObject({
      status: 409,
      code: "identity_version_mismatch",
    });

    const changed = await createPrincipalSession();
    const changedPrincipal = await requireNativePrincipal(
      principalRequest(changed.accessToken),
    );
    await updateDeviceSession(changed.record.tokenHash, (record) => {
      record.identityVersion += 1;
    });
    await expect(recheckPrincipal(changedPrincipal)).rejects.toMatchObject({
      status: 409,
      code: "identity_version_mismatch",
    });

    const expired = await createPrincipalSession();
    const expiredPrincipal = await requireNativePrincipal(
      principalRequest(expired.accessToken),
    );
    await updateDeviceSession(expired.record.tokenHash, (record) => {
      record.expiresAtMs = Date.now() - 1;
    });
    await expect(recheckPrincipal(expiredPrincipal)).rejects.toMatchObject({
      status: 409,
      code: "identity_version_mismatch",
    });
  });
});