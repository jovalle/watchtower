/**
 * Server-side environment configuration with typed access and validation.
 * The .server.ts suffix ensures this file is never bundled for the client.
 */

import {
  getDataPath,
  getSessionSecret,
  requireServerConfig,
} from "~/lib/config/server-config.server";

function getEnvVarWithDefault(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

/**
 * Typed environment configuration.
 * Access via: import { env } from "~/lib/env.server";
 */
export const env = {
  /**
   * Plex server URL from the saved server config (set via /setup).
   * Throws if no server is configured.
   */
  get PLEX_SERVER_URL(): string {
    return requireServerConfig().serverUrl;
  },

  /**
   * Server owner token from the saved server config (set via /setup).
   *
   * SECURITY: This token has full access to the Plex server and should
   * NEVER be used for user-facing operations. It is only used for:
   * - Server health checks (api.plex.health.ts)
   *
   * All authenticated user operations MUST use the user's own token
   * obtained via OAuth (from requirePlexToken). Using this token for
   * user operations would bypass per-user access controls.
   */
  get PLEX_TOKEN(): string {
    return requireServerConfig().token;
  },

  /**
   * Unique client identifier for Plex API headers
   */
  get PLEX_CLIENT_ID(): string {
    return getEnvVarWithDefault("PLEX_CLIENT_ID", "watchtower-001");
  },

  /**
   * Session secret for cookie signing: SESSION_SECRET env or a generated, persisted secret
   */
  get SESSION_SECRET(): string {
    return getSessionSecret();
  },

  /**
   * Current environment (development, production, test)
   */
  get NODE_ENV(): string {
    return getEnvVarWithDefault("NODE_ENV", "development");
  },

  /**
   * Whether we're in production mode
   */
  get isProduction(): boolean {
    return this.NODE_ENV === "production";
  },

  /**
   * Whether we're in development mode
   */
  get isDevelopment(): boolean {
    return this.NODE_ENV === "development";
  },

  /**
   * Whether to use secure cookies (requires HTTPS).
   * Defaults to true in production, false in development.
   * Set to "false" for LAN deployments without HTTPS.
   */
  get SECURE_COOKIES(): boolean {
    const value = process.env.SECURE_COOKIES;
    if (value !== undefined) {
      return value.toLowerCase() === "true";
    }
    return this.isProduction;
  },

  /**
   * Data directory path for caching (logos, metadata, etc.)
   * Defaults to ./data in dev, /data in Docker/production
   */
  get DATA_PATH(): string {
    return getDataPath();
  },

  /**
   * Trakt API client ID (required for Trakt integration)
   * Get a client ID at: https://trakt.tv/oauth/applications
   */
  get TRAKT_CLIENT_ID(): string | null {
    const value = process.env.TRAKT_CLIENT_ID;
    return value && value.trim() ? value.trim() : null;
  },
} as const;

export type Env = typeof env;
