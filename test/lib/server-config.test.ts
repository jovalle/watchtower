import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const ADMIN = {
  serverUrl: "https://10-0-0-5.abc123.plex.direct:32400",
  machineIdentifier: "machine-abc",
  serverName: "Basement",
  token: "synthetic-server-token",
  adminUserId: 42,
  adminUsername: "owner",
};

let dataDir: string;
const originalEnv = { ...process.env };

// A fresh import stands in for a server restart: module-level caches are dropped.
async function loadModules() {
  vi.resetModules();
  const config = await import("~/lib/config/server-config.server");
  const setup = await import("~/lib/config/setup.server");
  return { ...config, ...setup };
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "watchtower-config-"));
  process.env.DATA_PATH = dataDir;
  delete process.env.SESSION_SECRET;
});

afterEach(() => {
  process.env = { ...originalEnv };
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("server config store", () => {
  it("reports no server before setup", async () => {
    const { getServerConfig, requireServerConfig } = await loadModules();

    expect(getServerConfig()).toBeNull();
    expect(() => requireServerConfig()).toThrow(/complete setup at \/setup/);
  });

  it("keeps the saved server after a restart", async () => {
    const first = await loadModules();
    first.saveServerConfig(ADMIN);

    const { getServerConfig } = await loadModules();
    expect(getServerConfig()).toMatchObject({ version: 1, ...ADMIN });
  });

  it("writes the server token file readable only by its owner", async () => {
    const { saveServerConfig } = await loadModules();
    saveServerConfig(ADMIN);

    const mode =
      fs.statSync(path.join(dataDir, "config", "server.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("ignores a config file from an unknown version", async () => {
    fs.mkdirSync(path.join(dataDir, "config"));
    fs.writeFileSync(
      path.join(dataDir, "config", "server.json"),
      JSON.stringify({ ...ADMIN, version: 2 })
    );

    const { getServerConfig } = await loadModules();
    expect(getServerConfig()).toBeNull();
  });
});

describe("session secret", () => {
  it("uses SESSION_SECRET from the environment without writing a file", async () => {
    process.env.SESSION_SECRET = "from-env";
    const { getSessionSecret } = await loadModules();

    expect(getSessionSecret()).toBe("from-env");
    expect(fs.existsSync(path.join(dataDir, "config", "session-secret"))).toBe(
      false
    );
  });

  it("generates a 32-byte secret once and reuses it after a restart", async () => {
    const first = (await loadModules()).getSessionSecret();
    const second = (await loadModules()).getSessionSecret();

    expect(Buffer.from(first, "base64")).toHaveLength(32);
    expect(second).toBe(first);
  });
});

describe("setup code", () => {
  it("accepts the code regardless of case and dashes", async () => {
    const { getSetupCode, formatSetupCode, verifySetupCode } =
      await loadModules();

    expect(verifySetupCode(formatSetupCode(getSetupCode()).toLowerCase())).toBe(
      true
    );
  });

  it.each(["", "AAAA-AAAA-AAAA", "short"])("rejects %j", async (input) => {
    const { verifySetupCode } = await loadModules();

    expect(verifySetupCode(input)).toBe(false);
  });

  it("stops accepting a code once it has been rotated", async () => {
    const { getSetupCode, rotateSetupCode, verifySetupCode } =
      await loadModules();
    const oldCode = getSetupCode();

    rotateSetupCode();
    expect(verifySetupCode(oldCode)).toBe(false);
  });
});

describe("canManageServer", () => {
  it("before setup, allows only the user who entered the setup code", async () => {
    const { canManageServer } = await loadModules();

    expect(canManageServer(7, 7)).toBe(true);
    expect(canManageServer(8, 7)).toBe(false);
    expect(canManageServer(7, undefined)).toBe(false);
  });

  it("after setup, allows only the saved admin even if another user holds a claim", async () => {
    const { saveServerConfig, canManageServer } = await loadModules();
    saveServerConfig(ADMIN);

    expect(canManageServer(ADMIN.adminUserId, undefined)).toBe(true);
    expect(canManageServer(7, 7)).toBe(false);
  });
});
