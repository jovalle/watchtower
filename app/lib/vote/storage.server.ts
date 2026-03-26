/**
 * Movie Night Voting — File-based storage layer.
 *
 * Persists showings as JSON files in data/vote/.
 * Follows the same patterns as settings/storage.server.ts.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import { env } from "~/lib/env.server";
import type {
  Showing,
  ShowingIndex,
  ShowingMovie,
  ShowingSummary,
  ShowingStatus,
  VoterIdentity,
} from "./types";
import { MAX_PICKS_PER_USER, SHOWING_STATUS_SORT_ORDER } from "./types";
import { calculateBordaScores } from "./tally";

const VOTE_DIR = "vote";

function getVoteDir(): string {
  return path.join(env.DATA_PATH, VOTE_DIR);
}

function getIndexPath(): string {
  return path.join(getVoteDir(), "index.json");
}

function getShowingPath(id: string): string {
  return path.join(getVoteDir(), `showing-${id}.json`);
}

async function ensureVoteDir(): Promise<void> {
  await fs.mkdir(getVoteDir(), { recursive: true });
}

// ---------------------------------------------------------------------------
// Index helpers
// ---------------------------------------------------------------------------

async function readIndex(): Promise<ShowingIndex> {
  try {
    const data = await fs.readFile(getIndexPath(), "utf-8");
    return JSON.parse(data) as ShowingIndex;
  } catch {
    return { version: 1, showings: [] };
  }
}

async function writeIndex(index: ShowingIndex): Promise<void> {
  await ensureVoteDir();
  await fs.writeFile(getIndexPath(), JSON.stringify(index, null, 2));
}

async function readShowing(id: string): Promise<Showing | null> {
  try {
    const data = await fs.readFile(getShowingPath(id), "utf-8");
    return JSON.parse(data) as Showing;
  } catch {
    return null;
  }
}

async function writeShowing(showing: Showing): Promise<void> {
  await ensureVoteDir();
  await fs.writeFile(
    getShowingPath(showing.id),
    JSON.stringify(showing, null, 2)
  );
}

/**
 * Rebuild the index summary entry for a showing.
 */
function toSummary(showing: Showing): ShowingSummary {
  const unwatched = showing.movies.filter((m) => !m.watched);

  // Order previews by Borda score when votes exist, otherwise by add order
  let orderedPreviews: Array<{
    ratingKey: string;
    title: string;
    posterUrl: string;
  }>;
  if (showing.votes.length > 0) {
    const scores = calculateBordaScores(showing.votes, showing.movies);
    const scoreOrder = new Map(scores.map((s, i) => [s.ratingKey, i]));
    orderedPreviews = [...unwatched]
      .sort(
        (a, b) =>
          (scoreOrder.get(a.ratingKey) ?? 999) -
          (scoreOrder.get(b.ratingKey) ?? 999)
      )
      .map((m) => ({
        ratingKey: m.ratingKey,
        title: m.title,
        posterUrl: m.posterUrl,
      }));
  } else {
    orderedPreviews = unwatched.map((m) => ({
      ratingKey: m.ratingKey,
      title: m.title,
      posterUrl: m.posterUrl,
    }));
  }

  return {
    id: showing.id,
    name: showing.name,
    status: showing.status ?? "work_in_progress",
    createdBy: showing.createdBy,
    createdAt: showing.createdAt,
    updatedAt: showing.updatedAt,
    movieCount: unwatched.length,
    voterCount: showing.votes.length,
    moviePreviews: orderedPreviews,
  };
}

// ---------------------------------------------------------------------------
// Identity matching
// ---------------------------------------------------------------------------

function isSameVoter(a: VoterIdentity, b: VoterIdentity): boolean {
  if (a.plexUserId && b.plexUserId) {
    return a.plexUserId === b.plexUserId;
  }
  return a.name.toLowerCase() === b.name.toLowerCase();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all showings (summaries).
 */
export async function listShowings(): Promise<ShowingSummary[]> {
  const index = await readIndex();
  // Rebuild summaries from full showing data to ensure moviePreviews is populated
  const results: ShowingSummary[] = [];
  for (const entry of index.showings) {
    if (entry.moviePreviews) {
      results.push(entry);
    } else {
      const showing = await readShowing(entry.id);
      results.push(
        showing ? toSummary(showing) : { ...entry, moviePreviews: [] }
      );
    }
  }

  // Sort: primary by status priority, secondary by updatedAt descending
  results.sort((a, b) => {
    const sa = SHOWING_STATUS_SORT_ORDER[a.status ?? "work_in_progress"];
    const sb = SHOWING_STATUS_SORT_ORDER[b.status ?? "work_in_progress"];
    if (sa !== sb) return sa - sb;
    return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
  });

  return results;
}

/**
 * Get full showing data by ID.
 */
export async function getShowing(id: string): Promise<Showing | null> {
  return readShowing(id);
}

/**
 * Create a new showing.
 */
export async function createShowing(
  name: string,
  createdBy: VoterIdentity,
  status: ShowingStatus = "work_in_progress"
): Promise<Showing> {
  const now = Date.now();
  const showing: Showing = {
    id: randomUUID().slice(0, 8),
    name,
    status,
    createdBy,
    createdAt: now,
    updatedAt: now,
    movies: [],
    votes: [],
    history: [
      {
        action: "showing_created",
        actor: createdBy,
        target: name,
        timestamp: now,
      },
    ],
  };

  await writeShowing(showing);

  const index = await readIndex();
  index.showings.push(toSummary(showing));
  await writeIndex(index);

  return showing;
}

/**
 * Rename a showing.
 */
export async function renameShowing(
  id: string,
  newName: string,
  actor: VoterIdentity
): Promise<
  { success: true; showing: Showing } | { success: false; error: string }
> {
  const showing = await readShowing(id);
  if (!showing) return { success: false, error: "Showing not found" };

  const now = Date.now();
  const oldName = showing.name;
  showing.name = newName;
  showing.updatedAt = now;

  showing.history.push({
    action: "showing_renamed",
    actor,
    target: `${oldName} → ${newName}`,
    timestamp: now,
  });

  await writeShowing(showing);
  await syncIndex(showing);

  return { success: true, showing };
}

/**
 * Update the status of a showing.
 */
export async function updateShowingStatus(
  id: string,
  status: ShowingStatus,
  _actor: VoterIdentity
): Promise<
  { success: true; showing: Showing } | { success: false; error: string }
> {
  const showing = await readShowing(id);
  if (!showing) return { success: false, error: "Showing not found" };

  showing.status = status;
  showing.updatedAt = Date.now();

  await writeShowing(showing);
  await syncIndex(showing);

  return { success: true, showing };
}

/**
 * Delete a showing.
 */
export async function deleteShowing(id: string): Promise<boolean> {
  try {
    await fs.unlink(getShowingPath(id));
  } catch {
    return false;
  }

  const index = await readIndex();
  index.showings = index.showings.filter((s) => s.id !== id);
  await writeIndex(index);

  return true;
}

/**
 * Count how many unwatched movies a voter has in a showing.
 */
export function getUserPickCount(
  showing: Showing,
  voter: VoterIdentity
): number {
  return showing.movies.filter(
    (m) => !m.watched && isSameVoter(m.addedBy, voter)
  ).length;
}

/**
 * Add a movie to a showing. Enforces the per-user pick limit.
 */
export async function addMovie(
  showingId: string,
  movie: Omit<ShowingMovie, "addedAt" | "watched">,
  actor: VoterIdentity,
  { skipLimit = false }: { skipLimit?: boolean } = {}
): Promise<
  { success: true; showing: Showing } | { success: false; error: string }
> {
  const showing = await readShowing(showingId);
  if (!showing) return { success: false, error: "Showing not found" };

  // Check for duplicates
  if (
    showing.movies.some((m) => m.ratingKey === movie.ratingKey && !m.watched)
  ) {
    return { success: false, error: "Movie already in this showing" };
  }

  // Enforce per-user pick limit (owners bypass)
  if (!skipLimit) {
    const currentPicks = getUserPickCount(showing, actor);
    if (currentPicks >= MAX_PICKS_PER_USER) {
      return {
        success: false,
        error: `You already have ${MAX_PICKS_PER_USER} movie picks. Watch or remove one first.`,
      };
    }
  }

  const now = Date.now();
  showing.movies.push({
    ...movie,
    addedBy: actor,
    addedAt: now,
    watched: false,
  });

  showing.history.push({
    action: "movie_added",
    actor,
    target: movie.title,
    timestamp: now,
  });
  showing.updatedAt = now;

  await writeShowing(showing);
  await syncIndex(showing);

  return { success: true, showing };
}

/**
 * Remove a movie from a showing. Also strips it from all votes.
 */
export async function removeMovie(
  showingId: string,
  ratingKey: string,
  actor: VoterIdentity
): Promise<
  { success: true; showing: Showing } | { success: false; error: string }
> {
  const showing = await readShowing(showingId);
  if (!showing) return { success: false, error: "Showing not found" };

  const movieIdx = showing.movies.findIndex((m) => m.ratingKey === ratingKey);
  if (movieIdx === -1)
    return { success: false, error: "Movie not in this showing" };

  const movie = showing.movies[movieIdx];
  const now = Date.now();

  // Remove from movies array
  showing.movies.splice(movieIdx, 1);

  // Strip from all vote rankings
  for (const vote of showing.votes) {
    vote.rankings = vote.rankings.filter((k) => k !== ratingKey);
  }

  showing.history.push({
    action: "movie_removed",
    actor,
    target: movie.title,
    timestamp: now,
  });
  showing.updatedAt = now;

  await writeShowing(showing);
  await syncIndex(showing);

  return { success: true, showing };
}

/**
 * Toggle a movie's watched status.
 * When marking as watched: strips the ratingKey from all voter rankings so
 * their preferences automatically shift up.
 */
export async function toggleWatched(
  showingId: string,
  ratingKey: string,
  actor: VoterIdentity
): Promise<
  { success: true; showing: Showing } | { success: false; error: string }
> {
  const showing = await readShowing(showingId);
  if (!showing) return { success: false, error: "Showing not found" };

  const movie = showing.movies.find((m) => m.ratingKey === ratingKey);
  if (!movie) return { success: false, error: "Movie not in this showing" };

  const now = Date.now();

  if (!movie.watched) {
    // Marking as watched
    movie.watched = true;
    movie.watchedAt = now;
    movie.watchedBy = actor;

    // Auto-adjust all votes: strip the watched movie from every voter's rankings
    for (const vote of showing.votes) {
      vote.rankings = vote.rankings.filter((k) => k !== ratingKey);
    }

    showing.history.push({
      action: "movie_watched",
      actor,
      target: movie.title,
      timestamp: now,
    });
  } else {
    // Un-marking as watched
    movie.watched = false;
    movie.watchedAt = undefined;
    movie.watchedBy = undefined;

    showing.history.push({
      action: "movie_unwatched",
      actor,
      target: movie.title,
      timestamp: now,
    });
  }

  showing.updatedAt = now;
  await writeShowing(showing);
  await syncIndex(showing);

  return { success: true, showing };
}

/**
 * Submit or update a ranked-choice vote.
 * Rankings should include ratingKeys of ALL unwatched movies in the showing.
 */
export async function submitVote(
  showingId: string,
  voter: VoterIdentity,
  rankings: string[]
): Promise<
  { success: true; showing: Showing } | { success: false; error: string }
> {
  const showing = await readShowing(showingId);
  if (!showing) return { success: false, error: "Showing not found" };

  // Validate: rankings should only contain unwatched movie ratingKeys
  const unwatchedKeys = new Set(
    showing.movies.filter((m) => !m.watched).map((m) => m.ratingKey)
  );
  const invalidKeys = rankings.filter((k) => !unwatchedKeys.has(k));
  if (invalidKeys.length > 0) {
    return {
      success: false,
      error: `Invalid movie keys in rankings: ${invalidKeys.join(", ")}`,
    };
  }

  const now = Date.now();
  const existingIdx = showing.votes.findIndex((v) =>
    isSameVoter(v.voter, voter)
  );

  if (existingIdx >= 0) {
    // Update existing vote
    showing.votes[existingIdx].rankings = rankings;
    showing.votes[existingIdx].updatedAt = now;

    showing.history.push({
      action: "vote_updated",
      actor: voter,
      timestamp: now,
    });
  } else {
    // New vote
    showing.votes.push({
      voter,
      rankings,
      votedAt: now,
      updatedAt: now,
    });

    showing.history.push({
      action: "vote_submitted",
      actor: voter,
      timestamp: now,
    });
  }

  showing.updatedAt = now;
  await writeShowing(showing);
  await syncIndex(showing);

  return { success: true, showing };
}

/**
 * Sync the index file with the current showing state.
 */
async function syncIndex(showing: Showing): Promise<void> {
  const index = await readIndex();
  const idx = index.showings.findIndex((s) => s.id === showing.id);
  const summary = toSummary(showing);

  if (idx >= 0) {
    index.showings[idx] = summary;
  } else {
    index.showings.push(summary);
  }

  await writeIndex(index);
}

// ---------------------------------------------------------------------------
// Guest showing lookup — find showings a guest has participated in
// ---------------------------------------------------------------------------

/**
 * Return summaries of showings where a guest (by name) has voted or added movies.
 */
export async function getGuestShowings(
  guestName: string
): Promise<ShowingSummary[]> {
  const index = await readIndex();
  const results: ShowingSummary[] = [];
  const lower = guestName.toLowerCase();

  for (const summary of index.showings) {
    const showing = await readShowing(summary.id);
    if (!showing) continue;

    const participated =
      showing.votes.some(
        (v) => !v.voter.plexUserId && v.voter.name.toLowerCase() === lower
      ) ||
      showing.movies.some(
        (m) => !m.addedBy.plexUserId && m.addedBy.name.toLowerCase() === lower
      );

    if (participated) results.push(summary);
  }

  // Sort: primary by status priority, secondary by updatedAt descending
  results.sort((a, b) => {
    const sa = SHOWING_STATUS_SORT_ORDER[a.status ?? "work_in_progress"];
    const sb = SHOWING_STATUS_SORT_ORDER[b.status ?? "work_in_progress"];
    if (sa !== sb) return sa - sb;
    return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
  });

  return results;
}

// ---------------------------------------------------------------------------
// Guest name conflict management
// ---------------------------------------------------------------------------

interface GuestSession {
  /** Display-case name */
  name: string;
  /** Random token proving ownership of this name */
  token: string;
  /** Last heartbeat timestamp (Unix ms) */
  lastSeenAt: number;
}

/** How long until an idle guest session expires. */
const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getGuestSessionsPath(): string {
  return path.join(getVoteDir(), "guest-sessions.json");
}

async function readGuestSessions(): Promise<GuestSession[]> {
  try {
    const data = await fs.readFile(getGuestSessionsPath(), "utf-8");
    return JSON.parse(data) as GuestSession[];
  } catch {
    return [];
  }
}

async function writeGuestSessions(sessions: GuestSession[]): Promise<void> {
  await ensureVoteDir();
  await fs.writeFile(getGuestSessionsPath(), JSON.stringify(sessions, null, 2));
}

/** Remove sessions that have expired. */
function pruneExpired(sessions: GuestSession[]): GuestSession[] {
  const cutoff = Date.now() - GUEST_SESSION_TTL_MS;
  return sessions.filter((s) => s.lastSeenAt > cutoff);
}

/**
 * Collect all authenticated (Plex) user names that have participated in any showing.
 */
async function getPlexUserNames(): Promise<Set<string>> {
  const index = await readIndex();
  const names = new Set<string>();

  for (const summary of index.showings) {
    const showing = await readShowing(summary.id);
    if (!showing) continue;

    // Creator
    if (showing.createdBy.plexUserId) {
      names.add(showing.createdBy.name.toLowerCase());
    }
    // Voters
    for (const v of showing.votes) {
      if (v.voter.plexUserId) names.add(v.voter.name.toLowerCase());
    }
    // Movie adders
    for (const m of showing.movies) {
      if (m.addedBy.plexUserId) names.add(m.addedBy.name.toLowerCase());
    }
  }

  return names;
}

/**
 * Attempt to claim a guest name.
 *
 * - Rejects names matching any authenticated Plex user.
 * - Rejects names held by another active guest session (different token).
 * - Returns an opaque token the client stores to prove ownership.
 */
export async function claimGuestName(
  name: string,
  existingToken?: string
): Promise<
  { success: true; token: string } | { success: false; error: string }
> {
  const lower = name.toLowerCase();

  // Block names that match Plex users
  const plexNames = await getPlexUserNames();
  if (plexNames.has(lower)) {
    return {
      success: false,
      error:
        "This name belongs to a registered user. Please choose a different name.",
    };
  }

  const sessions = pruneExpired(await readGuestSessions());

  const existing = sessions.find((s) => s.name.toLowerCase() === lower);

  if (existing) {
    // Same person reclaiming?
    if (existingToken && existing.token === existingToken) {
      existing.lastSeenAt = Date.now();
      await writeGuestSessions(sessions);
      return { success: true, token: existing.token };
    }
    // Different person — conflict
    return {
      success: false,
      error:
        "This name is already taken by another guest. Please choose a different name.",
    };
  }

  // New claim
  const token = randomUUID();
  sessions.push({ name, token, lastSeenAt: Date.now() });
  await writeGuestSessions(sessions);

  return { success: true, token };
}

/**
 * Release a guest name by token.
 */
export async function releaseGuestName(token: string): Promise<void> {
  let sessions = pruneExpired(await readGuestSessions());
  sessions = sessions.filter((s) => s.token !== token);
  await writeGuestSessions(sessions);
}

/**
 * Touch a guest session to keep it alive.
 */
export async function touchGuestSession(token: string): Promise<void> {
  const sessions = pruneExpired(await readGuestSessions());
  const session = sessions.find((s) => s.token === token);
  if (session) {
    session.lastSeenAt = Date.now();
    await writeGuestSessions(sessions);
  }
}
