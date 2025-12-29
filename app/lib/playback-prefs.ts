/**
 * Playback preferences management using cookies.
 * Stores per-media preferences (transcode vs direct play) in a cookie
 * that's accessible both server-side and client-side.
 *
 * Cookie format: JSON object mapping ratingKey -> PlaybackMethod
 * Example: {"274036":"transcode","123456":"direct_play"}
 */

import type { PlaybackMethod } from "~/lib/plex/types";

const COOKIE_NAME = "playback_prefs";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface PlaybackPrefs {
  [ratingKey: string]: PlaybackMethod;
}

/**
 * Parse playback preferences from cookie string (server-side).
 */
export function parsePlaybackPrefs(cookieHeader: string | null): PlaybackPrefs {
  if (!cookieHeader) return {};

  const cookies = cookieHeader.split(";").map(c => c.trim());
  const prefCookie = cookies.find(c => c.startsWith(`${COOKIE_NAME}=`));

  if (!prefCookie) return {};

  try {
    const value = decodeURIComponent(prefCookie.split("=")[1]);
    return JSON.parse(value) as PlaybackPrefs;
  } catch {
    return {};
  }
}

/**
 * Get playback preference for a specific media item (server-side).
 */
export function getPlaybackPref(
  cookieHeader: string | null,
  ratingKey: string
): PlaybackMethod | null {
  const prefs = parsePlaybackPrefs(cookieHeader);
  return prefs[ratingKey] || null;
}

/**
 * Build Set-Cookie header for updated preferences (server-side).
 */
export function buildPlaybackPrefsCookie(prefs: PlaybackPrefs): string {
  const value = encodeURIComponent(JSON.stringify(prefs));
  return `${COOKIE_NAME}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

// =============================================================================
// Client-side utilities (only available in browser)
// =============================================================================

/**
 * Get all playback preferences from cookie (client-side).
 */
export function getClientPlaybackPrefs(): PlaybackPrefs {
  if (typeof document === "undefined") return {};
  return parsePlaybackPrefs(document.cookie);
}

/**
 * Get playback preference for a specific media item (client-side).
 */
export function getClientPlaybackPref(ratingKey: string): PlaybackMethod | null {
  const prefs = getClientPlaybackPrefs();
  return prefs[ratingKey] || null;
}

/**
 * Save playback preference for a media item (client-side).
 * Limits stored preferences to 100 most recent to prevent cookie bloat.
 */
export function setClientPlaybackPref(
  ratingKey: string,
  method: PlaybackMethod
): void {
  if (typeof document === "undefined") return;

  const prefs = getClientPlaybackPrefs();
  prefs[ratingKey] = method;

  // Limit to 100 most recent entries to prevent cookie bloat
  const keys = Object.keys(prefs);
  if (keys.length > 100) {
    const keysToRemove = keys.slice(0, keys.length - 100);
    for (const key of keysToRemove) {
      delete prefs[key];
    }
  }

  const value = encodeURIComponent(JSON.stringify(prefs));
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

/**
 * Clear playback preference for a media item (client-side).
 */
export function clearClientPlaybackPref(ratingKey: string): void {
  if (typeof document === "undefined") return;

  const prefs = getClientPlaybackPrefs();
  delete prefs[ratingKey];

  const value = encodeURIComponent(JSON.stringify(prefs));
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}
