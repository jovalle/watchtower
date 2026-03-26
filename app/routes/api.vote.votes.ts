/**
 * API: Voting
 * POST /api/vote/votes — Submit or update a ranked-choice vote.
 *
 * Auth is optional: authenticated users are auto-identified;
 * unauthenticated guests must provide a `guestName`.
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getPlexToken } from "~/lib/auth/session.server";
import { getPlexUser } from "~/lib/auth/plex.server";
import { submitVote } from "~/lib/vote/storage.server";
import type { VoterIdentity } from "~/lib/vote/types";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const { showingId, rankings, guestName } = body;

  if (!showingId)
    return json({ error: "showingId is required" }, { status: 400 });
  if (!Array.isArray(rankings))
    return json({ error: "rankings must be an array" }, { status: 400 });

  // Resolve voter identity
  let voter: VoterIdentity;

  const token = await getPlexToken(request);
  if (token) {
    const user = await getPlexUser(token);
    if (user) {
      voter = { plexUserId: user.id, name: user.username };
    } else {
      return json({ error: "Invalid session" }, { status: 401 });
    }
  } else {
    // Guest user
    const name = typeof guestName === "string" ? guestName.trim() : "";
    if (!name)
      return json({ error: "Guest name is required" }, { status: 400 });
    voter = { name };
  }

  const result = await submitVote(showingId, voter, rankings);

  if (!result.success) return json({ error: result.error }, { status: 400 });
  return json({ success: true, showing: result.showing });
}
