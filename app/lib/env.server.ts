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
   * Plex authentication token for API access
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

  /**
   * Trakt username for fetching public watchlist (optional)
   * Leave empty to disable Trakt integration
   */
  get TRAKT_USERNAME(): string | null {
    const value = process.env.TRAKT_USERNAME;
    return value && value.trim() ? value.trim() : null;
  },

  /**
   * IMDB user watchlist IDs (comma-separated, optional)
   * Format: ur12345678 or ls12345678
   * Example: IMDB_WATCHLISTS=ur65830902,ls012345678
   */
  get IMDB_WATCHLISTS(): string[] {
    const value = process.env.IMDB_WATCHLISTS;
    if (!value || !value.trim()) return [];
    return value
      .split(",")
      .map((id) => id.trim())
      .filter((id) => /^(ur|ls)\d+$/.test(id));
  },
} as const;

export type Env = typeof env;
