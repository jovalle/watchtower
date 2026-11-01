import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deviceStore = vi.hoisted(() => ({ createDeviceSession: vi.fn() }));

vi.mock("~/lib/native/device-store.server", () => ({
  createDeviceSession: deviceStore.createDeviceSession,
}));

vi.mock("~/lib/native/resources.server", () => ({
  meResponse: vi.fn(async (_principal, record) => ({
    deviceSessionId: record.deviceSessionId,
    identityVersion: record.identityVersion,
    expiresAtMs: record.expiresAtMs,
    server: {
      machineId: record.serverMachineId,
      name: record.serverName,
    },
    account: record.account,
    profile: record.profile,
    features: {
      profiles: false,
      requests: false,
      discovery: true,
      rooms: false,
    },
  })),
}));

import {
  approveAuthorization,
  createAuthorization,
  pollAuthorization,
  resetPairingForTests,
} from "~/lib/native/pairing.server";
import { resetNativeRateLimitsForTests } from "~/lib/native/rate-limit.server";

const approval = {
  name: "TV",
  platform: "android-tv" as const,
  model: null,
  appVersion: null,
  account: { userId: "10", title: "Owner" },
  profile: {
    userId: "10",
    title: "Owner",
    restricted: false,
    owner: true,
    protected: false,
  },
  serverMachineId: "machine",
  serverName: "PMS",
  plexToken: "profile-token",
  serverToken: "server-token",
  isOwner: true,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
  resetPairingForTests();
  resetNativeRateLimitsForTests();
  deviceStore.createDeviceSession.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("native pairing claims", () => {
  it("restores approval after a failed session creation so polling can retry", async () => {
    const created = createAuthorization(
      {
        deviceName: "TV",
        platform: "android-tv",
        model: null,
        appVersion: null,
      },
      "https://watchtower.test",
      "127.0.0.1",
    );
    expect(approveAuthorization(created.userCode, approval)).toBe(true);
    deviceStore.createDeviceSession
      .mockRejectedValueOnce(new Error("disk unavailable"))
      .mockResolvedValueOnce({
        accessToken: `wtd_${"A".repeat(43)}`,
        record: {
          deviceSessionId: "device-1",
          identityVersion: 1,
          expiresAtMs: Date.now() + 60_000,
          serverMachineId: "machine",
          serverName: "PMS",
          account: approval.account,
          profile: approval.profile,
        },
      });

    await expect(pollAuthorization(created.pollingSecret)).rejects.toMatchObject({
      status: 503,
      code: "upstream_unavailable",
      retryable: true,
    });
    vi.advanceTimersByTime(5_000);
    await expect(pollAuthorization(created.pollingSecret)).resolves.toMatchObject({
      status: "approved",
      session: { deviceSessionId: "device-1" },
    });
    expect(deviceStore.createDeviceSession).toHaveBeenCalledTimes(2);
  });
});