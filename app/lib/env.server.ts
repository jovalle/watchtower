/**
 * Server-side environment configuration with typed access and validation.
 * The .server.ts suffix ensures this file is never bundled for the client.
 */

function getEnvVar(name: string, required = true): string {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Check .env.example for documentation.`
    );
  }
  return value ?? "";
}

function getEnvVarWithDefault(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

/**
 * Typed environment configuration.
 * Access via: import { env } from "~/lib/env.server";
 */
export const env = {
  /**
   * Plex server URL (e.g., http://192.168.1.100:32400)
   * Defaults to http://plex:32400 for Docker deployments
   */
  get PLEX_SERVER_URL(): string {
    return getEnvVarWithDefault("PLEX_SERVER_URL", "http://plex:32400");
  },

  /**
   * Plex server admin token for LIMITED operations only.
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
    return getEnvVar("PLEX_TOKEN");
  },

  /**
   * Unique client identifier for Plex API headers
   */
  get PLEX_CLIENT_ID(): string {
    return getEnvVarWithDefault("PLEX_CLIENT_ID", "flixor-001");
  },

  /**
   * Session secret for cookie signing
   */
  get SESSION_SECRET(): string {
    return getEnvVar("SESSION_SECRET");
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
    return getEnvVarWithDefault(
      "DATA_PATH",
      this.isProduction ? "/data" : "./data"
    );
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
