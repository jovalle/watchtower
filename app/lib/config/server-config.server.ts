/**
 * Persisted Plex server configuration and session secret, stored under DATA_PATH/config.
 * Written by the admin onboarding flow at /setup; there is no env var fallback.
 */

import * as fs from "fs";
import * as path from "path";
import { randomBytes } from "crypto";

export interface ServerConfig {
  version: 1;
  serverUrl: string;
  machineIdentifier: string;
  serverName: string;
  /** Owner access token for the server, obtained from plex.tv during setup. */
  token: string;
  adminUserId: number;
  adminUsername: string;
  configuredAt: number;
}

export type NewServerConfig = Omit<ServerConfig, "version" | "configuredAt">;

let cachedConfig: ServerConfig | null | undefined;
let cachedSecret: string | undefined;

/**
 * Data directory for caches and config. Defaults to /data in production, ./data otherwise.
 */
export function getDataPath(): string {
  return (
    process.env.DATA_PATH ??
    (process.env.NODE_ENV === "production" ? "/data" : "./data")
  );
}

function configDir(): string {
  return path.join(getDataPath(), "config");
}

function writePrivateFile(file: string, contents: string): void {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, contents, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function getServerConfig(): ServerConfig | null {
  if (cachedConfig === undefined) {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(configDir(), "server.json"), "utf-8")
      );
      cachedConfig = parsed?.version === 1 ? (parsed as ServerConfig) : null;
    } catch {
      cachedConfig = null;
    }
  }
  return cachedConfig;
}

export function requireServerConfig(): ServerConfig {
  const config = getServerConfig();
  if (!config) {
    throw new Error(
      "No Plex server configured. The server owner must complete setup at /setup."
    );
  }
  return config;
}

export function saveServerConfig(config: NewServerConfig): ServerConfig {
  const full: ServerConfig = {
    version: 1,
    ...config,
    configuredAt: Date.now(),
  };
  writePrivateFile(
    path.join(configDir(), "server.json"),
    JSON.stringify(full, null, 2)
  );
  cachedConfig = full;
  return full;
}

/**
 * SESSION_SECRET from env if set, otherwise a generated secret persisted to disk.
 */
export function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;

  const file = path.join(configDir(), "session-secret");
  try {
    cachedSecret = fs.readFileSync(file, "utf-8").trim() || undefined;
  } catch {
    cachedSecret = undefined;
  }
  if (!cachedSecret) {
    cachedSecret = randomBytes(32).toString("base64");
    writePrivateFile(file, cachedSecret);
  }
  return cachedSecret;
}
