/**
 * Saves the user's audio or subtitle track for a media part on the Plex server.
 * POST /api/plex/streams - { partId, audioStreamID? , subtitleStreamID? } (subtitleStreamID 0 = off)
 */

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { PlexClient } from "~/lib/plex/client.server";
import { requireServerToken } from "~/lib/auth/session.server";
import { env } from "~/lib/env.server";

const isId = (value: unknown, min: number): value is number =>
  Number.isInteger(value) && (value as number) >= min;

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const token = await requireServerToken(request);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const { partId, audioStreamID, subtitleStreamID } = body ?? {};
  const hasAudio = audioStreamID !== undefined;
  const hasSubtitle = subtitleStreamID !== undefined;

  if (
    !isId(partId, 1) ||
    hasAudio === hasSubtitle ||
    (hasAudio && !isId(audioStreamID, 1)) ||
    (hasSubtitle && !isId(subtitleStreamID, 0))
  ) {
    return json(
      {
        error:
          "Send a partId and exactly one audioStreamID or subtitleStreamID",
      },
      { status: 400 }
    );
  }

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });
  const result = await client.setStreamSelection(
    partId,
    hasAudio ? { audioStreamID } : { subtitleStreamID }
  );
  if (!result.success) {
    return json(
      { error: result.error.message },
      { status: result.error.status || 502 }
    );
  }
  return json({ ok: true });
}
