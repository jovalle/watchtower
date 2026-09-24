const PLEX_IMAGE_PATH = /^\/(library|playlists|photo\/:\/transcode)[/?]/;

function isAllowedExternalHost(hostname: string): boolean {
  return hostname === "plex.tv" || hostname.endsWith(".plex.tv") || hostname === "image.tmdb.org";
}

/** Returns the upstream URL for an allowed image path, or null if the path is not allowed. */
export function resolveImageUrl(path: string, token: string, plexServerUrl: string): string | null {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(path);
    } catch {
      return null;
    }
    // External metadata images are public; never forward a Plex token off-server.
    if (url.protocol !== "https:" || !isAllowedExternalHost(url.hostname)) return null;
    url.searchParams.delete("X-Plex-Token");
    return url.toString();
  }

  if (!PLEX_IMAGE_PATH.test(path) || path.includes("..") || /x-plex-token/i.test(path)) {
    return null;
  }
  const separator = path.includes("?") ? "&" : "?";
  return `${plexServerUrl}${path}${separator}X-Plex-Token=${encodeURIComponent(token)}`;
}
