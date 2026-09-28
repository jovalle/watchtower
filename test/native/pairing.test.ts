import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { resetNativeCryptoForTests } from "~/lib/native/crypto.server";
import { resetDeviceStoreForTests } from "~/lib/native/device-store.server";
import {
  approveAuthorization,
  createAuthorization,
  lookupAuthorization,
  parseCreateAuthorization,
  pollAuthorization,
  resetPairingForTests,
} from "~/lib/native/pairing.server";
import { resetNativeRateLimitsForTests } from "~/lib/native/rate-limit.server";

const dataPath = path.resolve("tmp/native-pairing-test");
const approval = {
  name: "ignored",
  platform: "android-tv" as const,
  model: null,
  appVersion: null,
  account: { userId: "10", title: "Owner" },
  profile: { userId: "10", title: "Owner", restricted: false, owner: true, protected: false },
  serverMachineId: "fake-machine",
  serverName: "Fake PMS",
  plexToken: "profile-token",
  serverToken: "server-token",
  isOwner: true,
};

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
  process.env.DATA_PATH = dataPath;
  await rm(dataPath, { recursive: true, force: true });
  await mkdir(dataPath, { recursive: true });
  resetNativeCryptoForTests();
  resetDeviceStoreForTests();
  resetPairingForTests();
  resetNativeRateLimitsForTests();
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dataPath, { recursive: true, force: true });
});

describe("native pairing", () => {
  it("does not reveal unknown or incorrect polling secrets", async () => {
    await expect(
      pollAuthorization(`wtp_${"A".repeat(43)}`),
    ).rejects.toMatchObject({ status: 404, code: "authorization_not_found" });
    await expect(pollAuthorization("not-a-secret")).rejects.toMatchObject({
      status: 404,
      code: "authorization_not_found",
    });
  });

  it("validates create input and slows fast polling", async () => {
    expect(() => parseCreateAuthorization({ deviceName: "TV", platform: "phone", model: null, appVersion: null }))
      .toThrowError(expect.objectContaining({ code: "invalid_request" }));
    const created = createAuthorization(
      { deviceName: "TV", platform: "android-tv", model: null, appVersion: null },
      "https://watchtower.test",
      "127.0.0.1",
    );
    expect(created.userCode).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ23456789]{4}-[BCDFGHJKLMNPQRSTVWXZ23456789]{4}$/);
    await expect(pollAuthorization(created.pollingSecret)).resolves.toMatchObject({ status: "pending" });
    await expect(pollAuthorization(created.pollingSecret)).rejects.toMatchObject({ code: "slow_down", status: 429 });
  });

  it("atomically creates one session and replays the identical grant for 60 seconds", async () => {
    const created = createAuthorization(
      { deviceName: "TV", platform: "android-tv", model: "Model", appVersion: "1" },
      "https://watchtower.test",
      "127.0.0.1",
    );
    expect(approveAuthorization(created.userCode, approval)).toBe(true);
    expect(approveAuthorization(created.userCode, approval)).toBe(false);
    const [first, concurrent] = await Promise.all([
      pollAuthorization(created.pollingSecret),
      pollAuthorization(created.pollingSecret),
    ]);
    expect(first).toEqual(concurrent);
    expect(first.status).toBe("approved");
    vi.advanceTimersByTime(59_000);
    await expect(pollAuthorization(created.pollingSecret)).resolves.toEqual(first);
    vi.advanceTimersByTime(2_000);
    await expect(pollAuthorization(created.pollingSecret)).rejects.toMatchObject({ code: "authorization_not_found" });
  });

  it("forgets pending authorizations when process state resets", async () => {
    const created = createAuthorization(
      { deviceName: "TV", platform: "android-tv", model: null, appVersion: null },
      "https://watchtower.test",
      "127.0.0.1",
    );
    resetPairingForTests();
    await expect(pollAuthorization(created.pollingSecret)).rejects.toMatchObject({ code: "authorization_not_found" });
  });

  it("returns terminal states once and prunes expired authorizations", async () => {
    const denied = createAuthorization(
      { deviceName: "Denied", platform: "android-tv", model: null, appVersion: null },
      "https://watchtower.test",
      "denied-ip",
    );
    const expired = createAuthorization(
      { deviceName: "Expired", platform: "android-tv", model: null, appVersion: null },
      "https://watchtower.test",
      "expired-ip",
    );
    const { denyAuthorization } = await import("~/lib/native/pairing.server");
    expect(denyAuthorization(denied.userCode)).toBe(true);
    await expect(pollAuthorization(denied.pollingSecret)).resolves.toEqual({ status: "denied" });
    await expect(pollAuthorization(denied.pollingSecret)).rejects.toMatchObject({ code: "authorization_not_found" });
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(lookupAuthorization(expired.userCode)).toBeNull();
    await expect(pollAuthorization(expired.pollingSecret)).resolves.toEqual({ status: "expired" });
    await expect(pollAuthorization(expired.pollingSecret)).rejects.toMatchObject({ code: "authorization_not_found" });
  });

  it("rejects creation when all tracked slots are live and frees expired slots", () => {
    for (let index = 0; index < 200; index += 1) {
      createAuthorization(
        { deviceName: `TV ${index}`, platform: "android-tv", model: null, appVersion: null },
        "https://watchtower.test",
        `client-${index}`,
      );
    }
    expect(() =>
      createAuthorization(
        { deviceName: "Overflow", platform: "android-tv", model: null, appVersion: null },
        "https://watchtower.test",
        "overflow-client",
      ),
    ).toThrowError(expect.objectContaining({ status: 503, retryable: true }));
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(() =>
      createAuthorization(
        { deviceName: "After prune", platform: "android-tv", model: null, appVersion: null },
        "https://watchtower.test",
        "after-prune-client",
      ),
    ).not.toThrow();
  });
});