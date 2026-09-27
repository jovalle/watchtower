/**
 * Plex server health check endpoint.
 * GET /api/plex/health
 *
 * Returns connection status and server info if connected.
 */

import { json } from "@remix-run/node";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";
import { getServerConfig } from "~/lib/config/server-config.server";

interface HealthResponse {
  connected: boolean;
  configured: boolean;
  serverName?: string;
  serverVersion?: string;
  error?: string;
}

export async function loader(): Promise<Response> {
  if (!getServerConfig()) {
    const response: HealthResponse = {
      connected: false,
      configured: false,
      error: "No Plex server configured",
    };
    return json(response, { status: 503 });
  }

  try {
    const client = new PlexClient({
      serverUrl: env.PLEX_SERVER_URL,
      token: env.PLEX_TOKEN,
      clientId: env.PLEX_CLIENT_ID,
    });

    const result = await client.getServerIdentity();

    if (result.success) {
      const response: HealthResponse = {
        connected: true,
        configured: true,
        serverName: result.data.friendlyName,
        serverVersion: result.data.version,
      };
      return json(response);
    }

    const response: HealthResponse = {
      connected: false,
      configured: true,
      error: result.error.message,
    };
    return json(response, { status: 503 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";

    const response: HealthResponse = {
      connected: false,
      configured: true,
      error: message,
    };
    return json(response, { status: 500 });
  }
}
