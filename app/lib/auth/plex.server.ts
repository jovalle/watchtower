/**
 * Plex OAuth authentication using plex-oauth library.
 * Handles PIN-based authentication flow with plex.tv.
 */

import { PlexOauth, type IPlexClientDetails } from "plex-oauth";
import { createHash } from "crypto";
import { env } from "~/lib/env.server";
import { getServerConfig } from "~/lib/config/server-config.server";
import {
  PLEX_HEADERS,
  PLEX_TV_URL,
  PLEX_REQUEST_TIMEOUT,
} from "~/lib/plex/constants";

/**
 * Generate a stable client ID from SESSION_SECRET.
 * This ensures the same client ID is used across restarts.
 */
function getClientId(): string {
  const hash = createHash("sha256").update(env.SESSION_SECRET).digest("hex");
  // Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

/**
 * Create a PlexOauth instance with consistent device identification.
 */
function createPlexOauth(forwardUrl?: string): PlexOauth {
  const clientDetails: IPlexClientDetails = {
    clientIdentifier: getClientId(),
    product: PLEX_HEADERS["X-Plex-Product"],
    device: PLEX_HEADERS["X-Plex-Device"],
    version: PLEX_HEADERS["X-Plex-Version"],
    forwardUrl,
  };

  return new PlexOauth(clientDetails);
}

/**
 * Initiate Plex OAuth login flow.
 * Returns the hosted UI URL and PIN ID for tracking.
 */
export async function initiateLogin(
  forwardUrl: string
): Promise<{ hostedUrl: string; pinId: number }> {
  const plexOauth = createPlexOauth(forwardUrl);

  const [hostedUrl, pinId] = await plexOauth.requestHostedLoginURL();

  if (!hostedUrl || !pinId) {
    throw new Error("Failed to initiate Plex OAuth login");
  }

  return {
    hostedUrl,
    pinId,
  };
}

/**
 * Complete Plex OAuth login by checking the PIN status.
 * Returns the auth token if successful, null if pending/cancelled.
 */
export async function completeLogin(pinId: number): Promise<string | null> {
  const plexOauth = createPlexOauth();

  try {
    const authToken = await plexOauth.checkForAuthToken(pinId);
    return authToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Plex user information from the API.
 */
export interface PlexUser {
  id: number;
  uuid: string;
  username: string;
  email: string;
  thumb: string;
  title: string;
}

/**
 * Validate a Plex token by fetching user information.
 * Returns user info if valid, null if invalid.
 */
export async function getPlexUser(token: string): Promise<PlexUser | null> {
  try {
    const response = await fetch(`${PLEX_TV_URL}/api/v2/user`, {
      headers: {
        Accept: "application/json",
        "X-Plex-Token": token,
        "X-Plex-Client-Identifier": getClientId(),
        "X-Plex-Product": PLEX_HEADERS["X-Plex-Product"],
        "X-Plex-Version": PLEX_HEADERS["X-Plex-Version"],
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return {
      id: data.id,
      uuid: data.uuid,
      username: data.username,
      email: data.email,
      thumb: data.thumb,
      title: data.title,
    };
  } catch {
    return null;
  }
}

/**
 * Result of server access verification.
 */
export interface ServerAccessResult {
  hasAccess: boolean;
  serverName?: string;
  serverToken?: string; // Server-specific token for API calls (may differ from user's OAuth token)
  isOwner?: boolean; // Whether the user owns this server (vs. shared access)
  error?: string;
}

/**
 * A Plex server the user owns, as advertised by plex.tv.
 */
export interface OwnedServer {
  machineIdentifier: string;
  name: string;
  accessToken: string;
  connections: ServerConnection[];
}

type ServerConnection = { uri: string; local: boolean; relay: boolean };

/**
 * List servers owned by the user, with connection candidates ordered local, remote, relay.
 */
export async function listOwnedServers(token: string): Promise<OwnedServer[]> {
  const response = await fetch(
    `${PLEX_TV_URL}/api/v2/resources?includeHttps=1&includeRelay=1`,
    {
      headers: {
        Accept: "application/json",
        "X-Plex-Token": token,
        "X-Plex-Client-Identifier": getClientId(),
      },
      signal: AbortSignal.timeout(PLEX_REQUEST_TIMEOUT),
    }
  );
  if (!response.ok) {
    throw new Error(`plex.tv resources request failed: ${response.status}`);
  }

  const resources = await response.json();
  const rank = (c: ServerConnection) => (c.relay ? 2 : c.local ? 0 : 1);

  return (Array.isArray(resources) ? resources : [])
    .filter(
      (r) =>
        r.owned &&
        String(r.provides).split(",").includes("server") &&
        r.accessToken
    )
    .map((r) => ({
      machineIdentifier: r.clientIdentifier,
      name: r.name,
      accessToken: r.accessToken,
      connections: (r.connections ?? [])
        .map((c: ServerConnection) => ({
          uri: c.uri,
          local: Boolean(c.local),
          relay: Boolean(c.relay),
        }))
        .sort((a: ServerConnection, b: ServerConnection) => rank(a) - rank(b)),
    }));
}

/**
 * Result from checking user's server access via plex.tv resources.
 */
interface UserServerAccessResult {
  hasAccess: boolean;
  serverName?: string;
  accessToken?: string; // Server-specific token for shared users
  isOwner?: boolean; // Whether this user owns the server
}

/**
 * Check if a user has access to a specific server via plex.tv resources API.
 * This works for both server owners and shared users.
 * Returns the server-specific access token which is needed for API calls.
 */
async function checkUserServerAccess(
  token: string,
  targetMachineId: string
): Promise<UserServerAccessResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      PLEX_REQUEST_TIMEOUT
    );

    // Query plex.tv for user's available resources (servers)
    const response = await fetch(
      `${PLEX_TV_URL}/api/v2/resources?includeHttps=1&includeRelay=1`,
      {
        headers: {
          Accept: "application/json",
          "X-Plex-Token": token,
          "X-Plex-Client-Identifier": getClientId(),
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(
        `[Server Access] Failed to get user resources: ${response.status}`
      );
      return { hasAccess: false };
    }

    const resources = await response.json();

    // Find if user has access to the target server
    for (const resource of resources) {
      if (
        resource.provides === "server" &&
        resource.clientIdentifier === targetMachineId
      ) {
        console.log(
          `[Server Access] Found server: ${resource.name} (owned: ${resource.owned})`
        );
        return {
          hasAccess: true,
          serverName: resource.name,
          accessToken: resource.accessToken || token, // Use server token if available, else user token
          isOwner: Boolean(resource.owned),
        };
      }
    }

    return { hasAccess: false };
  } catch (error) {
    console.error(`[Server Access] Error checking user resources:`, error);
    return { hasAccess: false };
  }
}

/**
 * Verify that a user's token has access to the configured Plex server.
 * This is a CRITICAL security check - it ensures the user is authorized
 * to access THIS specific server, not just any Plex account holder.
 *
 * Uses plex.tv resources API to check access, which works for both
 * server owners and shared users.
 *
 * @param token - The user's Plex authentication token
 * @returns Object indicating whether user has access and server info
 */
export async function verifyServerAccess(
  token: string
): Promise<ServerAccessResult> {
  // Get the machine identifier of our configured server
  const machineId = getServerConfig()?.machineIdentifier;
  if (!machineId) {
    return {
      hasAccess: false,
      error:
        "No Plex server is configured yet. The server owner must complete setup.",
    };
  }
  console.log(`[Server Access] Target server machine ID: ${machineId}`);

  // Check if user has this server in their plex.tv resources
  const accessCheck = await checkUserServerAccess(token, machineId);

  if (!accessCheck.hasAccess) {
    console.log(
      `[Server Access] DENIED - User does not have access to this server`
    );
    return {
      hasAccess: false,
      error: "You do not have access to this Plex server.",
    };
  }

  console.log(
    `[Server Access] GRANTED - ${accessCheck.serverName} (owner: ${accessCheck.isOwner})`
  );
  return {
    hasAccess: true,
    serverName: accessCheck.serverName,
    serverToken: accessCheck.accessToken,
    isOwner: accessCheck.isOwner,
  };
}
