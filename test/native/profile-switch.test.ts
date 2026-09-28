import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeError } from "~/lib/native/http.server";
import { resetNativeRateLimitsForTests } from "~/lib/native/rate-limit.server";

const auth = vi.hoisted(() => ({
  checkServerAccessDetailed: vi.fn(),
}));
const devices = vi.hoisted(() => ({
  findDeviceSession: vi.fn(),
  replaceDeviceProfile: vi.fn(),
  unsealAccountToken: vi.fn(),
}));
const principal = vi.hoisted(() => ({
  recheckPrincipal: vi.fn(),
  requireNativePrincipal: vi.fn(),
}));
const profiles = vi.hoisted(() => ({
  listPlexHomeUsers: vi.fn(),
  switchPlexHomeUser: vi.fn(),
}));

vi.mock("~/lib/auth/plex.server", () => auth);
vi.mock("~/lib/native/device-store.server", () => devices);
vi.mock("~/lib/native/principal.server", () => principal);
vi.mock("~/lib/native/profiles.server", () => profiles);
vi.mock("~/lib/native/resources.server", () => ({
  meResponse: vi.fn(async () => ({ user: { id: "20" } })),
}));

import { action } from "~/routes/api.v1.profiles.switch";

const nativePrincipal = {
  deviceSessionId: "device-1",
  identityVersion: 1,
  serverMachineId: "machine-1",
  serverUrl: "http://plex.test:32400",
  userId: "10",
  accountUserId: "10",
  serverToken: "server-token-1",
  plexToken: "plex-token-1",
  isOwner: true,
  profile: {
    userId: "10",
    title: "Owner",
    restricted: false,
    owner: true,
    protected: false,
  },
};

function switchRequest(pin = "0000") {
  return new Request("https://watchtower.test/api/v1/profiles/switch", {
    method: "POST",
    headers: {
      Authorization: `Bearer wtd_${"A".repeat(43)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      profileId: "profile-20",
      pin,
      expectedIdentityVersion: 1,
    }),
  });
}

async function callSwitch(pin?: string) {
  return action({
    request: switchRequest(pin),
    params: {},
    context: {},
  });
}

describe("native protected profile switching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNativeRateLimitsForTests();
    process.env.WATCHTOWER_PLEX_HOME_PROFILES = "1";
    principal.requireNativePrincipal.mockResolvedValue(nativePrincipal);
    principal.recheckPrincipal.mockResolvedValue(undefined);
    devices.findDeviceSession.mockResolvedValue({ tokenHash: "device-token-hash" });
    devices.unsealAccountToken.mockResolvedValue("account-token");
    devices.replaceDeviceProfile.mockResolvedValue({
      identityVersion: 2,
      profile: { ...nativePrincipal.profile, userId: "20", title: "Home User" },
    });
    profiles.listPlexHomeUsers.mockResolvedValue([
      {
        profile: { profileId: "profile-20", userId: "20" },
        raw: { id: 20 },
      },
    ]);
    auth.checkServerAccessDetailed.mockResolvedValue({
      status: "ok",
      serverToken: "server-token-20",
      isOwner: false,
    });
  });

  it("blocks the sixth failed PIN before calling Plex", async () => {
    profiles.switchPlexHomeUser.mockRejectedValue(
      new NativeError(403, "invalid_pin", "The profile PIN is incorrect."),
    );

    const responses = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(await callSwitch());
    }

    expect(responses.slice(0, 5).map(({ status }) => status)).toEqual([
      403, 403, 403, 403, 403,
    ]);
    expect(responses[5].status).toBe(429);
    expect(await responses[5].json()).toMatchObject({
      error: { code: "rate_limited", retryable: false },
    });
    expect(profiles.switchPlexHomeUser).toHaveBeenCalledTimes(5);
  });

  it("serializes concurrent PIN attempts and blocks those beyond the limit", async () => {
    profiles.switchPlexHomeUser.mockRejectedValue(
      new NativeError(403, "invalid_pin", "The profile PIN is incorrect."),
    );

    const responses = await Promise.all(
      Array.from({ length: 8 }, () => callSwitch()),
    );

    expect(responses.filter(({ status }) => status === 403)).toHaveLength(5);
    expect(responses.filter(({ status }) => status === 429)).toHaveLength(3);
    expect(profiles.switchPlexHomeUser).toHaveBeenCalledTimes(5);
  });

  it("clears failed PIN attempts only after a successful switch", async () => {
    profiles.switchPlexHomeUser
      .mockRejectedValueOnce(
        new NativeError(403, "invalid_pin", "The profile PIN is incorrect."),
      )
      .mockRejectedValueOnce(
        new NativeError(403, "invalid_pin", "The profile PIN is incorrect."),
      )
      .mockResolvedValue({
        authToken: "plex-token-20",
        profile: { ...nativePrincipal.profile, userId: "20", title: "Home User" },
      });

    expect((await callSwitch()).status).toBe(403);
    expect((await callSwitch()).status).toBe(403);
    expect((await callSwitch("1234")).status).toBe(200);

    profiles.switchPlexHomeUser.mockRejectedValue(
      new NativeError(403, "invalid_pin", "The profile PIN is incorrect."),
    );
    const responses = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      responses.push(await callSwitch());
    }

    expect(responses.map(({ status }) => status)).toEqual([
      403, 403, 403, 403, 403,
    ]);
    expect(profiles.switchPlexHomeUser).toHaveBeenCalledTimes(8);
  });
});