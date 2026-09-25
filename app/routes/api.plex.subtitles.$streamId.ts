/**
 * Serves an external Plex subtitle file as WebVTT for the player's sidecar track.
 * GET /api/plex/subtitles/:streamId
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { requireServerToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";
import { toWebVtt } from "~/lib/plex/tracks";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const token = await requireServerToken(request);
  const streamId = Number(params.streamId);
  if (!Number.isInteger(streamId) || streamId <= 0) {
    return new Response("Invalid stream ID", { status: 400 });
  }

  try {
    const upstream = await fetch(
      `${env.PLEX_SERVER_URL}/library/streams/${streamId}`,
      {
        headers: { "X-Plex-Token": token },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!upstream.ok) {
      return new Response("Subtitle unavailable", {
        status: upstream.status === 404 ? 404 : 502,
      });
    }
    return new Response(toWebVtt(await upstream.text()), {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Subtitle unavailable", { status: 502 });
  }
}
