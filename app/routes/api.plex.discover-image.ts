/**
 * Plex Discover image proxy - keeps the user's plex.tv token server-side.
 * GET /api/plex/discover-image?path=<relative discover path>&width=&height=
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { requirePlexToken } from "~/lib/auth/session.server";
import { resolveDiscoverImageUrl } from "~/lib/plex/image-proxy.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const plexToken = await requirePlexToken(request);
  const params = new URL(request.url).searchParams;
  const imageUrl = resolveDiscoverImageUrl(
    params.get("path") ?? "",
    params.get("width"),
    params.get("height")
  );
  if (!imageUrl) {
    return new Response("Image path not allowed", { status: 400 });
  }

  const upstreamUrl = new URL(imageUrl);
  // Discover only accepts the token as a query parameter.
  upstreamUrl.searchParams.set("X-Plex-Token", plexToken);
  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(10000),
    });
    const contentType = upstream.headers.get("Content-Type") || "";
    if (!upstream.ok || !contentType.startsWith("image/")) {
      return new Response("Image unavailable", {
        status: upstream.status === 404 ? 404 : 502,
      });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
