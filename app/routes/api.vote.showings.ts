/**
 * API: Showing CRUD
 * POST   /api/vote/showings — Create a new showing (requires auth)
 * DELETE /api/vote/showings — Delete a showing (requires auth, creator or owner)
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requirePlexToken, getSession } from "~/lib/auth/session.server";
import { getPlexUser } from "~/lib/auth/plex.server";
import {
  createShowing,
  deleteShowing,
  renameShowing,
  getShowing,
  listShowings,
  updateShowingStatus,
} from "~/lib/vote/storage.server";
import type { VoterIdentity , ShowingStatus } from "~/lib/vote/types";
import { SHOWING_STATUSES } from "~/lib/vote/types";

export async function action({ request }: ActionFunctionArgs) {
  const token = await requirePlexToken(request);
  const user = await getPlexUser(token);
  if (!user) return json({ error: "Invalid session" }, { status: 401 });

  const session = await getSession(request);
  const isOwner = session.get("isOwner") === true;

  const actor: VoterIdentity = { plexUserId: user.id, name: user.username };

  if (request.method === "POST") {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name)
      return json({ error: "Showing name is required" }, { status: 400 });
    if (name.length < 3)
      return json(
        { error: "Name must be at least 3 characters" },
        { status: 400 },
      );

    // Check for duplicate names (case-insensitive)
    const existing = await listShowings();
    if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase()))
      return json(
        { error: "A showing with that name already exists" },
        { status: 409 },
      );

    const status: ShowingStatus = SHOWING_STATUSES.includes(body.status)
      ? body.status
      : "work_in_progress";

    const showing = await createShowing(name, actor, status);
    return json({ success: true, showing });
  }

  if (request.method === "PATCH") {
    const body = await request.json();
    const { showingId } = body;
    if (!showingId)
      return json({ error: "showingId is required" }, { status: 400 });

    const showing = await getShowing(showingId);
    if (!showing) return json({ error: "Showing not found" }, { status: 404 });

    const isCreator = showing.createdBy.plexUserId === user.id;
    if (!isCreator && !isOwner) {
      return json(
        { error: "Not authorized to modify this showing" },
        { status: 403 },
      );
    }

    // Status update
    if (body.status && SHOWING_STATUSES.includes(body.status)) {
      const result = await updateShowingStatus(showingId, body.status, actor);
      if (!result.success)
        return json({ error: result.error }, { status: 400 });
      return json({ success: true, showing: result.showing });
    }

    // Name update
    const newName = typeof body.name === "string" ? body.name.trim() : "";
    if (!newName)
      return json({ error: "Name or status is required" }, { status: 400 });

    const result = await renameShowing(showingId, newName, actor);
    if (!result.success) return json({ error: result.error }, { status: 400 });
    return json({ success: true, showing: result.showing });
  }

  if (request.method === "DELETE") {
    const body = await request.json();
    const { showingId } = body;
    if (!showingId)
      return json({ error: "showingId is required" }, { status: 400 });

    const showing = await getShowing(showingId);
    if (!showing) return json({ error: "Showing not found" }, { status: 404 });

    // Only creator or server owner can delete
    const isCreator = showing.createdBy.plexUserId === user.id;
    if (!isCreator && !isOwner) {
      return json(
        { error: "Not authorized to delete this showing" },
        { status: 403 },
      );
    }

    await deleteShowing(showingId);
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
