/**
 * Plex API constants and header configuration.
 */

/**
 * Application identification headers required by Plex API.
 * These identify the client application making requests.
 */
export const PLEX_HEADERS = {
  "X-Plex-Product": "Watchtower",
  "X-Plex-Version": "1.0.0",
  "X-Plex-Platform": "Web",
  "X-Plex-Platform-Version": "1.0.0",
  "X-Plex-Device": "Browser",
  "X-Plex-Device-Name": "Watchtower Web",
  "Accept": "application/json",
} as const;

/**
 * Plex.tv base URL for authentication and server discovery.
 */
export const PLEX_TV_URL = "https://plex.tv";

/**
 * Plex discover API URL for watchlist and metadata operations.
 */
export const PLEX_DISCOVER_URL = "https://discover.provider.plex.tv";

/**
 * Default request timeout in milliseconds.
 */
export const PLEX_REQUEST_TIMEOUT = 10000;
