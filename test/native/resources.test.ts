import { afterEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  getIntegrations: vi.fn(),
  getUserSettings: vi.fn(),
}));

vi.mock("~/lib/integrations/storage.server", () => ({
  getIntegrations: dependencies.getIntegrations,
}));
vi.mock("~/lib/settings/storage.server", () => ({
  DEFAULT_PREFERENCES: { discoveryDisabled: false },
  getUserSettings: dependencies.getUserSettings,
}));

import { meResponse } from "~/lib/native/resources.server";

afterEach(() => {
  delete process.env.WATCHTOWER_PLEX_HOME_PROFILES;
  vi.clearAllMocks();
});

describe("native me response", () => {
  it("derives feature flags from shared settings and integration state", async () => {
    process.env.WATCHTOWER_PLEX_HOME_PROFILES = "1";
    dependencies.getIntegrations.mockResolvedValue({
      version: 1,
      seerr: { url: "https://seerr.test", apiKey: "fake" },
    });
    dependencies.getUserSettings.mockResolvedValue({
      preferences: { discoveryDisabled: true },
    });
    const principal = {
      deviceSessionId: "device-1",
      identityVersion: 2,
      serverMachineId: "machine",
      userId: "10",
      profile: {
        userId: "10",
        title: "Profile",
        restricted: false,
        owner: false,
        protected: false,
      },
    };
    const record = {
      expiresAtMs: 123,
      serverName: "PMS",
      account: { userId: "10", title: "Owner" },
    };

    await expect(meResponse(principal, record as never)).resolves.toMatchObject({
      features: {
        profiles: true,
        requests: true,
        discovery: false,
        rooms: false,
      },
    });

  });
});