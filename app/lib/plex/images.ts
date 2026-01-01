/**
 * Utility functions for building Plex image URLs.
 * Images are proxied through /api/plex/image to handle CORS and token security.
 */

/**
 * Build a proxied image URL for a Plex image path.
 *
 * @param path - The Plex image path (e.g., "/library/metadata/12345/thumb/1234567890")
 * @returns The proxied image URL, or empty string if no path provided
 */
export function buildPlexImageUrl(path: string | undefined | null): string {
  if (!path) return "";
  return `/api/plex/image?path=${encodeURIComponent(path)}`;
}

/**
 * Default placeholder image for when no poster is available.
 */
export const PLACEHOLDER_IMAGE = "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&h=600&fit=crop";

/**
 * Build a proxied image URL with a fallback placeholder.
 *
 * @param path - The Plex image path
 * @returns The proxied image URL, or placeholder if no path provided
 */
export function buildPlexImageUrlWithFallback(path: string | undefined | null): string {
  if (!path) return PLACEHOLDER_IMAGE;
  return `/api/plex/image?path=${encodeURIComponent(path)}`;
}
