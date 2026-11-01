import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createDeviceSession, findDeviceSession, onDeviceIdentityEnded, replaceDeviceProfile, resetDeviceStoreForTests, revokeDeviceSession, unsealDeviceCredentials } from "~/lib/native/device-store.server";
import { resetNativeCryptoForTests } from "~/lib/native/crypto.server";

const dataPath = path.resolve("tmp/native-device-store-test");

beforeEach(async () => {
  process.env.DATA_PATH = dataPath;
  await rm(dataPath, { recursive: true, force: true });
  await mkdir(dataPath, { recursive: true });
  resetDeviceStoreForTests();
  resetNativeCryptoForTests();
});

afterEach(async () => {
  await rm(dataPath, { recursive: true, force: true });
});

describe("native device store", () => {
  it("persists hashes and sealed credentials, not plaintext tokens", async () => {
    const created = await createDeviceSession({
      name: "Living Room",
      platform: "android-tv",
      model: "Test TV",
      appVersion: "1.0",
      account: { userId: "10", title: "Owner" },
      profile: { userId: "10", title: "Owner", restricted: false, owner: true, protected: false },
      serverMachineId: "fake-machine",
      serverName: "Fake PMS",
      plexToken: "profile-plex-secret",
      serverToken: "profile-server-secret",
      isOwner: true,
    });
    const persisted = await readFile(path.join(dataPath, "devices/sessions.json"), "utf8");
    expect(persisted).not.toContain(created.accessToken);
    expect(persisted).not.toContain("profile-plex-secret");
    expect(persisted).not.toContain("profile-server-secret");
    const loaded = await findDeviceSession(created.accessToken);
    expect(loaded?.deviceSessionId).toBe(created.record.deviceSessionId);
    await expect(unsealDeviceCredentials(loaded!, "wtd_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"))
      .rejects.toThrow();
    await expect(unsealDeviceCredentials(loaded!, created.accessToken)).resolves.toEqual({
      plexToken: "profile-plex-secret",
      serverToken: "profile-server-secret",
    });
  });

  it("notifies identity-ended listeners on revocation and profile replacement", async () => {
    const ended: Array<{ userId: string; deviceSessionId: string }> = [];
    const stop = onDeviceIdentityEnded((identity) => ended.push(identity));
    const created = await createDeviceSession({
      name: "Living Room",
      platform: "android-tv",
      model: null,
      appVersion: null,
      account: { userId: "10", title: "Owner" },
      profile: { userId: "10", title: "Owner", restricted: false, owner: true, protected: false },
      serverMachineId: "fake-machine",
      serverName: "Fake PMS",
      plexToken: "owner-plex",
      serverToken: "owner-server",
      isOwner: true,
    });
    await replaceDeviceProfile(created.accessToken, 1, {
      profile: { userId: "11", title: "Kid", restricted: true, owner: false, protected: true },
      plexToken: "kid-plex",
      serverToken: "kid-server",
      isOwner: false,
    });
    await revokeDeviceSession(created.record.deviceSessionId);
    await revokeDeviceSession(created.record.deviceSessionId);
    stop();

    expect(ended).toEqual([
      { userId: "10", deviceSessionId: created.record.deviceSessionId },
      { userId: "11", deviceSessionId: created.record.deviceSessionId },
    ]);
  });
});