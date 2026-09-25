/**
 * Trakt OAuth (device flow) and per-user token storage.
 * Tokens live in their own file per user so they never reach the browser with regular settings.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { LRUCache } from "lru-cache";
import { env } from "~/lib/env.server";
import { getIntegrations } from "~/lib/integrations/storage.server";
import type { TraktConnectionStatus } from "./types";
import { version } from "../../../package.json";

const TRAKT_API = "https://api.trakt.tv";
const TRAKT_AUTH = "https://auth.trakt.tv";
const REFRESH_MARGIN_MS = 60 * 60 * 1000;

export interface TraktApp {
  clientId: string;
  clientSecret: string;
}

export interface TraktAccount {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch
  username: string;
  scrobble: boolean;
}

export async function getTraktApp(): Promise<TraktApp | null> {
  const { trakt } = await getIntegrations();
  return trakt?.clientId && trakt.clientSecret ? trakt : null;
}

export async function traktFetch(
  pathname: string,
  clientId: string,
  init: { method?: string; body?: unknown; accessToken?: string } = {}
): Promise<Response> {
  return fetch(
    `${pathname.startsWith("/oauth/") ? TRAKT_AUTH : TRAKT_API}${pathname}`,
    {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `Watchtower/${version}`,
        "trakt-api-version": "2",
        "trakt-api-key": clientId,
        ...(init.accessToken
          ? { Authorization: `Bearer ${init.accessToken}` }
          : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(10000),
    }
  );
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

function accountPath(userId: number): string {
  return path.join(env.DATA_PATH, "settings", `trakt-${userId}.json`);
}

export async function getTraktAccount(
  userId: number
): Promise<TraktAccount | null> {
  try {
    return JSON.parse(
      await fs.readFile(accountPath(userId), "utf-8")
    ) as TraktAccount;
  } catch {
    return null;
  }
}

export async function saveTraktAccount(
  userId: number,
  account: TraktAccount
): Promise<void> {
  const file = accountPath(userId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(account, null, 2), { mode: 0o600 });
  await fs.chmod(file, 0o600);
}

async function deleteTraktAccount(userId: number): Promise<void> {
  await fs.unlink(accountPath(userId)).catch(() => {});
}

export async function getTraktConnectionStatus(
  userId: number
): Promise<TraktConnectionStatus> {
  const [app, account] = await Promise.all([
    getTraktApp(),
    getTraktAccount(userId),
  ]);
  return {
    available: app !== null,
    connected: account !== null,
    username: account?.username || null,
    scrobble: account?.scrobble ?? false,
  };
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  created_at: number;
}

function tokensToAccount(
  tokens: TokenResponse,
  username: string,
  scrobble: boolean
): TraktAccount {
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: (tokens.created_at + tokens.expires_in) * 1000,
    username,
    scrobble,
  };
}

// Refresh tokens are single-use, so concurrent lookups for one user share a single read-or-refresh.
const tokenRequests = new Map<number, Promise<string | null>>();

/** Returns a valid access token for the user, refreshing it if it is about to expire. */
export function getTraktAccessToken(
  userId: number,
  app: TraktApp
): Promise<string | null> {
  let pending = tokenRequests.get(userId);
  if (!pending) {
    pending = readOrRefreshToken(userId, app).finally(() =>
      tokenRequests.delete(userId)
    );
    tokenRequests.set(userId, pending);
  }
  return pending;
}

async function readOrRefreshToken(
  userId: number,
  app: TraktApp
): Promise<string | null> {
  const account = await getTraktAccount(userId);
  if (!account) return null;
  if (account.expiresAt - Date.now() > REFRESH_MARGIN_MS)
    return account.accessToken;

  const response = await traktFetch("/oauth/token", app.clientId, {
    body: {
      refresh_token: account.refreshToken,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
      grant_type: "refresh_token",
    },
  });
  if (!response.ok) {
    console.error(
      `[Trakt] Token refresh failed for user ${userId}: HTTP ${response.status}`
    );
    return null;
  }
  const refreshed = tokensToAccount(
    (await response.json()) as TokenResponse,
    account.username,
    account.scrobble
  );
  await saveTraktAccount(userId, refreshed);
  return refreshed.accessToken;
}

// ---------------------------------------------------------------------------
// Device flow
// ---------------------------------------------------------------------------

// Device codes stay server-side; the browser only sees the user code.
const pendingDeviceCodes = new LRUCache<number, string>({
  max: 500,
  ttl: 15 * 60 * 1000,
});

export interface DeviceCodeInfo {
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

export async function startDeviceAuth(
  userId: number,
  app: TraktApp
): Promise<DeviceCodeInfo> {
  const response = await traktFetch("/oauth/device/code", app.clientId, {
    body: { client_id: app.clientId },
  });
  if (!response.ok)
    throw new Error(`Trakt rejected the client ID (HTTP ${response.status})`);
  const data = (await response.json()) as {
    device_code: string;
    user_code: string;
    verification_url: string;
    expires_in: number;
    interval: number;
  };
  pendingDeviceCodes.set(userId, data.device_code, {
    ttl: data.expires_in * 1000,
  });
  return {
    userCode: data.user_code,
    verificationUrl: data.verification_url,
    expiresIn: data.expires_in,
    interval: data.interval,
  };
}

export type PollResult =
  | { status: "pending" | "slow_down" }
  | { status: "connected"; username: string }
  | { status: "failed"; error: string };

const POLL_ERRORS: Record<number, string> = {
  404: "Invalid code; start again",
  409: "Code already used; start again",
  410: "Code expired; start again",
  418: "Access was denied on Trakt",
};

export async function pollDeviceAuth(
  userId: number,
  app: TraktApp
): Promise<PollResult> {
  const deviceCode = pendingDeviceCodes.get(userId);
  if (!deviceCode)
    return { status: "failed", error: "No sign-in in progress; start again" };

  const response = await traktFetch("/oauth/device/token", app.clientId, {
    body: {
      code: deviceCode,
      client_id: app.clientId,
      client_secret: app.clientSecret,
    },
  });
  if (response.status === 400) return { status: "pending" };
  if (response.status === 429) return { status: "slow_down" };
  if (!response.ok) {
    pendingDeviceCodes.delete(userId);
    return {
      status: "failed",
      error:
        POLL_ERRORS[response.status] ??
        `Trakt returned HTTP ${response.status}`,
    };
  }

  pendingDeviceCodes.delete(userId);
  const tokens = (await response.json()) as TokenResponse;
  const settings = await traktFetch("/users/settings", app.clientId, {
    accessToken: tokens.access_token,
  });
  const username = settings.ok
    ? ((await settings.json()) as { user?: { username?: string } }).user
        ?.username ?? ""
    : "";
  await saveTraktAccount(userId, tokensToAccount(tokens, username, true));
  return { status: "connected", username };
}

export async function disconnectTrakt(
  userId: number,
  app: TraktApp | null
): Promise<void> {
  const account = await getTraktAccount(userId);
  if (account && app) {
    await traktFetch("/oauth/revoke", app.clientId, {
      body: {
        token: account.accessToken,
        client_id: app.clientId,
        client_secret: app.clientSecret,
      },
    }).catch(() => {});
  }
  await deleteTraktAccount(userId);
}
