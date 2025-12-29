/**
 * Plex OAuth authentication using plex-oauth library.
 * Handles PIN-based authentication flow with plex.tv.
 */

import { PlexOauth, type IPlexClientDetails } from "plex-oauth";
import { createHash } from "crypto";
import { env } from "~/lib/env.server";
import { PLEX_HEADERS, PLEX_TV_URL } from "~/lib/plex/constants";

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
export async function initiateLogin(forwardUrl: string): Promise<{ hostedUrl: string; pinId: number }> {
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
