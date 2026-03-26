/**
 * API: Movie management within a showing.
 * POST   /api/vote/movies — Add movie (requires auth, enforces 5-pick limit)
 * DELETE /api/vote/movies — Remove movie (requires auth, creator/owner/adder)
 * PATCH  /api/vote/movies — Toggle watched (requires auth)
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requirePlexToken, getSession } from "~/lib/auth/session.server";
import { getPlexUser } from "~/lib/auth/plex.server";
import {
  addMovie,
  removeMovie,
  toggleWatched,
  getShowing,
} from "~/lib/vote/storage.server";
import type { VoterIdentity } from "~/lib/vote/types";

export async function action({ request }: ActionFunctionArgs) {
  const token = await requirePlexToken(request);
  const user = await getPlexUser(token);
  if (!user) return json({ error: "Invalid session" }, { status: 401 });

  const session = await getSession(request);
  const isOwner = session.get("isOwner") === true;

  const actor: VoterIdentity = { plexUserId: user.id, name: user.username };
  const body = await request.json();
  const { showingId } = body;

  if (!showingId)
    return json({ error: "showingId is required" }, { status: 400 });

  if (request.method === "POST") {
    const { ratingKey, title, year, posterUrl, summary } = body;
    if (!ratingKey || !title) {
      return json(
        { error: "ratingKey and title are required" },
        { status: 400 },
      );
    }

    const result = await addMovie(
      showingId,
      {
        ratingKey,
        title,
        year,
        posterUrl: posterUrl ?? "",
        summary,
        addedBy: actor,
      },
      actor,
      { skipLimit: isOwner },
    );

    if (!result.success) return json({ error: result.error }, { status: 400 });
    return json({ success: true, showing: result.showing });
  }

  if (request.method === "DELETE") {
    const { ratingKey } = body;
    if (!ratingKey)
      return json({ error: "ratingKey is required" }, { status: 400 });

    // Check authorization: creator, owner, or the user who added the movie
    const showing = await getShowing(showingId);
    if (!showing) return json({ error: "Showing not found" }, { status: 404 });

    const movie = showing.movies.find((m) => m.ratingKey === ratingKey);
    if (!movie)
      return json({ error: "Movie not found in showing" }, { status: 404 });

    const isCreator = showing.createdBy.plexUserId === user.id;
    const isAdder = movie.addedBy.plexUserId === user.id;
    if (!isCreator && !isOwner && !isAdder) {
      return json(
        { error: "Not authorized to remove this movie" },
        { status: 403 },
      );
    }

    const result = await removeMovie(showingId, ratingKey, actor);
    if (!result.success) return json({ error: result.error }, { status: 400 });
    return json({ success: true, showing: result.showing });
  }

  if (request.method === "PATCH") {
    const { ratingKey } = body;
    if (!ratingKey)
      return json({ error: "ratingKey is required" }, { status: 400 });

    const result = await toggleWatched(showingId, ratingKey, actor);
    if (!result.success) return json({ error: result.error }, { status: 400 });
    return json({ success: true, showing: result.showing });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
