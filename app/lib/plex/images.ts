/**
 * Utility functions for building Plex image URLs.
 * Images are proxied through /api/plex/image to handle CORS and token security.
 */

interface ImageDimensions {
  width?: number;
  height?: number;
}

/**
 * Build a proxied image URL for a Plex image path.
 *
 * @param path - The Plex image path (e.g., "/library/metadata/12345/thumb/1234567890")
 * @param dimensions - Optional width/height to request a specific size from Plex
 * @returns The proxied image URL, or empty string if no path provided
 */
export function buildPlexImageUrl(
  path: string | undefined | null,
  dimensions?: ImageDimensions
): string {
  if (!path) return "";

  // If dimensions specified, append to the Plex path so Plex resizes server-side
  let plexPath = path;
  if (dimensions?.width || dimensions?.height) {
    const separator = path.includes("?") ? "&" : "?";
    const params = new URLSearchParams();
    if (dimensions.width) params.set("width", dimensions.width.toString());
    if (dimensions.height) params.set("height", dimensions.height.toString());
    plexPath = `${path}${separator}${params.toString()}`;
  }

  return `/api/plex/image?path=${encodeURIComponent(plexPath)}`;
}

/**
 * Standard poster dimensions for vertical 2:3 cards.
 * 400x600 provides good quality without excessive bandwidth.
 */
export const POSTER_DIMENSIONS: ImageDimensions = { width: 400, height: 600 };

/**
 * Standard backdrop dimensions for horizontal 16:9 images.
 * 1280x720 provides crisp quality on retina displays.
 */
export const BACKDROP_DIMENSIONS: ImageDimensions = { width: 1280, height: 720 };

/**
 * Build a proxied image URL for a poster (vertical 2:3 aspect ratio).
 * Requests 400x600 resolution for crisp display on most screens.
 *
 * @param path - The Plex image path
 * @returns The proxied image URL with appropriate dimensions
 */
export function buildPosterUrl(path: string | undefined | null): string {
  return buildPlexImageUrl(path, POSTER_DIMENSIONS);
}

/**
 * Build a proxied image URL for a backdrop (horizontal 16:9 aspect ratio).
 * Requests 800x450 resolution for crisp display in tooltips.
 *
 * @param path - The Plex image path
 * @returns The proxied image URL with appropriate dimensions
 */
export function buildBackdropUrl(path: string | undefined | null): string {
  return buildPlexImageUrl(path, BACKDROP_DIMENSIONS);
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
