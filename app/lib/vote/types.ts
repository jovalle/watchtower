/**
 * Movie Night Voting — Type definitions.
 *
 * A "showing" is a shareable bucket of movies that users can add to,
 * vote on (ranked choice), and mark as watched.
 */

/** Maximum number of unwatched movies a single user can have in a showing. */
export const MAX_PICKS_PER_USER = 5;

/**
 * Status of a showing — determines the header label and color.
 */
export type ShowingStatus =
  | "now_playing"
  | "coming_soon"
  | "work_in_progress"
  | "completed";

export const SHOWING_STATUSES: ShowingStatus[] = [
  "work_in_progress",
  "now_playing",
  "coming_soon",
  "completed",
];

export const SHOWING_STATUS_LABELS: Record<ShowingStatus, string> = {
  work_in_progress: "Work in Progress",
  now_playing: "Now Playing",
  coming_soon: "Coming Soon",
  completed: "Completed",
};

export const SHOWING_STATUS_COLORS: Record<
  ShowingStatus,
  { text: string; line: string }
> = {
  work_in_progress: { text: "text-zinc-400", line: "to-zinc-500/40" },
  now_playing: { text: "text-amber-400", line: "to-amber-500/40" },
  coming_soon: { text: "text-white/80", line: "to-white/30" },
  completed: { text: "text-amber-600/60", line: "to-amber-700/30" },
};

/** Sort priority — lower number sorts first. */
export const SHOWING_STATUS_SORT_ORDER: Record<ShowingStatus, number> = {
  now_playing: 0,
  coming_soon: 1,
  work_in_progress: 2,
  completed: 3,
};

/**
 * Identity for any participant — authenticated Plex user or guest.
 */
export interface VoterIdentity {
  /** Plex user ID (present for authenticated users). */
  plexUserId?: number;
  /** Display name — Plex username for authed users, self-declared for guests. */
  name: string;
}

/**
 * A movie within a showing bucket.
 */
export interface ShowingMovie {
  ratingKey: string;
  title: string;
  year?: number;
  posterUrl: string;
  summary?: string;
  addedBy: VoterIdentity;
  addedAt: number; // Unix ms
  watched: boolean;
  watchedAt?: number; // Unix ms
  watchedBy?: VoterIdentity;
}

/**
 * A voter's ranked-choice ballot.
 * `rankings` stores ratingKeys in preference order (index 0 = 1st choice).
 * When a movie is marked watched, its ratingKey is removed from all rankings
 * and the remaining entries shift up.
 */
export interface RankedVote {
  voter: VoterIdentity;
  /** Ordered ratingKeys — most preferred first. */
  rankings: string[];
  votedAt: number; // Unix ms — first vote
  updatedAt: number; // Unix ms — last update
}

/**
 * Action types tracked in the history log.
 */
export type HistoryAction =
  | "showing_created"
  | "showing_renamed"
  | "movie_added"
  | "movie_removed"
  | "movie_watched"
  | "movie_unwatched"
  | "vote_submitted"
  | "vote_updated";

/**
 * A single entry in the showing's activity history.
 */
export interface HistoryEntry {
  action: HistoryAction;
  actor: VoterIdentity;
  /** Human-readable target (e.g. movie title). */
  target?: string;
  timestamp: number; // Unix ms
}

/**
 * Full showing data — stored as a single JSON file per showing.
 */
export interface Showing {
  id: string;
  name: string;
  status: ShowingStatus;
  createdBy: VoterIdentity;
  createdAt: number; // Unix ms
  updatedAt: number; // Unix ms
  movies: ShowingMovie[];
  votes: RankedVote[];
  history: HistoryEntry[];
}

/**
 * Lightweight showing summary for the index listing.
 */
export interface ShowingSummary {
  id: string;
  name: string;
  status: ShowingStatus;
  createdBy: VoterIdentity;
  createdAt: number;
  updatedAt: number;
  movieCount: number;
  voterCount: number;
  /** Preview posters for the dashboard carousel (unwatched movies). */
  moviePreviews: Array<{ ratingKey: string; title: string; posterUrl: string }>;
}

/**
 * Index file structure that lists all showings.
 */
export interface ShowingIndex {
  version: 1;
  showings: ShowingSummary[];
}
