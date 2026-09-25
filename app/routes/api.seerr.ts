/**
 * Seerr requests on behalf of the signed-in Plex user.
 * GET  /api/seerr?type=movie|tv&tmdbId=123 - request status
 * POST /api/seerr { type, tmdbId }          - create a request
 */

import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { titleRequestStates } from "~/lib/integrations/request-state";
import { requireUser } from "~/lib/auth/user.server";
import {
  createSeerrClient,
  seerrMediaStatus,
  type SeerrMediaType,
  type SeerrClient,
} from "~/lib/integrations/seerr.server";

function parseTarget(
  type: unknown,
  tmdbId: unknown
): { type: SeerrMediaType; tmdbId: number } | null {
  const id = typeof tmdbId === "number" ? tmdbId : typeof tmdbId === "string" && /^\d+$/.test(tmdbId) ? Number(tmdbId) : NaN;
  if ((type !== "movie" && type !== "tv") || !Number.isSafeInteger(id) || id <= 0)
    return null;
  return { type, tmdbId: id };
}

async function availability(seerr: SeerrClient, target: { type: SeerrMediaType; tmdbId: number }, userId: number) {
  const title = await seerr.getTitle(target.type, target.tmdbId, userId);
  return { requests: titleRequestStates(title.mediaInfo, userId), status: seerrMediaStatus(title.mediaInfo?.status), status4k: seerrMediaStatus(title.mediaInfo?.status4k), seasons: title.mediaInfo?.seasons?.map((season) => ({ number: season.seasonNumber, status: seerrMediaStatus(season.status), status4k: seerrMediaStatus(season.status4k) })) ?? [] };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const target = parseTarget(
    url.searchParams.get("type"),
    url.searchParams.get("tmdbId")
  );
  if (!target)
    return json({ error: "Invalid type or tmdbId" }, { status: 400 });

  const seerr = await createSeerrClient();
  if (!seerr)
    return json({ error: "Seerr is not configured" }, { status: 404 });

  try {
    const userId = await seerr.findUserIdByPlexId(user.id);
    if (userId === null) return json({ error: "Your Plex account hasn't been imported into Seerr yet" }, { status: 403 });
    return json(await availability(seerr, target, userId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Seerr request failed",
      },
      { status: 502 }
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const user = await requireUser(request);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const target = parseTarget(body?.type, body?.tmdbId);
  if (!target)
    return json({ error: "Invalid type or tmdbId" }, { status: 400 });

  const seerr = await createSeerrClient();
  if (!seerr)
    return json({ error: "Seerr is not configured" }, { status: 404 });

  try {
    // Requests are always attributed to the matching Seerr user so Seerr's own permissions and quotas apply.
    const seerrUserId = await seerr.findUserIdByPlexId(user.id);
    if (seerrUserId === null) {
      return json(
        { error: "Your Plex account hasn't been imported into Seerr yet" },
        { status: 403 }
      );
    }
    await seerr.createRequest(target.type, target.tmdbId, seerrUserId);
    const current = await availability(seerr, target, seerrUserId).catch(() => ({ status: null, statusError: "Request created, but availability could not be refreshed. Check Your requests before trying again." }));
    return json({
      ok: true,
      ...current,
    });
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : "Seerr request failed",
      },
      { status: 502 }
    );
  }
}
