import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

let dataPath: string;

beforeEach(async () => {
  vi.resetModules();
  dataPath = await fs.mkdtemp(path.join(os.tmpdir(), "watchtower-integrations-"));
  vi.stubEnv("DATA_PATH", dataPath);
  vi.stubEnv("SEERR_URL", "");
  vi.stubEnv("SEERR_API_KEY", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dataPath, { recursive: true, force: true });
});

describe("integration environment configuration", () => {
  it("loads Seerr from the environment without saving or exposing its key", async () => {
    vi.stubEnv("SEERR_URL", " https://seerr.test/requests/ ");
    vi.stubEnv("SEERR_API_KEY", " fixture-env-key ");
    const { getIntegrations, toPublicIntegrations } = await import("~/lib/integrations/storage.server");

    const config = await getIntegrations();
    expect(config.seerr).toEqual({ url: "https://seerr.test/requests", apiKey: "fixture-env-key" });
    expect(toPublicIntegrations(config).seerr).toEqual({ url: "https://seerr.test/requests", hasApiKey: true });
    expect(await fs.readdir(dataPath)).toEqual([]);
  });

  it.each([
    ["https://seerr.test", ""],
    ["", "key"],
    ["file:///etc/passwd", "key"],
    ["invalid", "key"],
    ["https://seerr.test", "   "],
  ])("does not enable incomplete or invalid configuration (%s)", async (url, apiKey) => {
    vi.stubEnv("SEERR_URL", url);
    vi.stubEnv("SEERR_API_KEY", apiKey);
    const { getIntegrations } = await import("~/lib/integrations/storage.server");
    expect((await getIntegrations()).seerr).toBeUndefined();
  });

  it("prefers the complete env pair without changing saved Seerr settings", async () => {
    vi.stubEnv("SEERR_URL", "https://env.test");
    vi.stubEnv("SEERR_API_KEY", "env-key");
    const { getIntegrations, saveIntegrations } = await import("~/lib/integrations/storage.server");
    const saved = { url: "https://saved.test", apiKey: "saved-key" };

    await saveIntegrations({ seerr: saved });
    expect((await getIntegrations()).seerr).toEqual({ url: "https://env.test", apiKey: "env-key" });
    expect(JSON.parse(await fs.readFile(path.join(dataPath, "integrations.json"), "utf-8"))).toEqual({ version: 1, seerr: saved });
    vi.stubEnv("SEERR_API_KEY", "");
    expect((await getIntegrations()).seerr).toEqual(saved);
  });

  it("does not copy the environment key to disk when saving another integration", async () => {
    vi.stubEnv("SEERR_URL", "https://seerr.test");
    vi.stubEnv("SEERR_API_KEY", "env-key");
    const { getIntegrations, saveIntegrations } = await import("~/lib/integrations/storage.server");

    await saveIntegrations({ trakt: { clientId: "id", clientSecret: "secret" } });
    expect((await getIntegrations()).seerr?.apiKey).toBe("env-key");
    const file = path.join(dataPath, "integrations.json");
    expect(JSON.parse(await fs.readFile(file, "utf-8"))).toEqual({ version: 1, trakt: { clientId: "id", clientSecret: "secret" } });
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
  });
});
