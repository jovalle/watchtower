/**
 * Server-wide integration settings (Seerr, Trakt app credentials) managed by the server owner in the UI.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { env } from "~/lib/env.server";
import type { PublicIntegrationsConfig } from "./types";

export interface IntegrationsConfig {
  version: 1;
  seerr?: { url: string; apiKey: string };
  trakt?: { clientId: string; clientSecret: string };
}

let cached: IntegrationsConfig | null = null;

function getConfigPath(): string {
  return path.join(env.DATA_PATH, "integrations.json");
}

export async function getIntegrations(): Promise<IntegrationsConfig> {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(await fs.readFile(getConfigPath(), "utf-8")) as IntegrationsConfig;
    cached = parsed.version === 1 ? parsed : { version: 1 };
  } catch {
    cached = { version: 1 };
  }
  return cached;
}

export async function saveIntegrations(update: Partial<Omit<IntegrationsConfig, "version">>): Promise<IntegrationsConfig> {
  const next: IntegrationsConfig = { ...(await getIntegrations()), ...update, version: 1 };
  for (const key of ["seerr", "trakt"] as const) {
    if (next[key] === undefined) delete next[key];
  }
  await fs.mkdir(env.DATA_PATH, { recursive: true });
  await fs.writeFile(getConfigPath(), JSON.stringify(next, null, 2), { mode: 0o600 });
  await fs.chmod(getConfigPath(), 0o600);
  cached = next;
  return next;
}

export function toPublicIntegrations(config: IntegrationsConfig): PublicIntegrationsConfig {
  return {
    seerr: config.seerr ? { url: config.seerr.url, hasApiKey: Boolean(config.seerr.apiKey) } : null,
    trakt: config.trakt
      ? { clientId: config.trakt.clientId, hasClientSecret: Boolean(config.trakt.clientSecret) }
      : null,
  };
}

/** Normalizes an owner-entered base URL, or returns null if it isn't http(s). */
export function normalizeServiceUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}
