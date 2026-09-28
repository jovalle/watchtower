import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createDeviceSession, findDeviceSession, resetDeviceStoreForTests, unsealDeviceCredentials } from "~/lib/native/device-store.server";
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
});