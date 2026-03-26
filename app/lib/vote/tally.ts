/**
 * Movie Night Voting — Tally helpers.
 *
 * Computes Borda-count scores from ranked-choice votes,
 * operating only on the current set of unwatched movies.
 */

import type { RankedVote, ShowingMovie, VoterIdentity } from "./types";

export interface BordaResult {
  ratingKey: string;
  title: string;
  score: number;
}

export interface VoterBreakdown {
  voter: VoterIdentity;
  rankings: Array<{ ratingKey: string; title: string; rank: number }>;
}

/**
 * Calculate Borda-count scores for all unwatched movies.
 *
 * Scoring: 1st place = N points, 2nd = N-1, … last = 1, unranked = 0.
 * Where N = number of unwatched movies.
 */
export function calculateBordaScores(
  votes: RankedVote[],
  movies: ShowingMovie[],
): BordaResult[] {
  const unwatched = movies.filter((m) => !m.watched);
  const n = unwatched.length;
  const titleMap = new Map(unwatched.map((m) => [m.ratingKey, m.title]));

  // Initialize scores
  const scores = new Map<string, number>();
  for (const m of unwatched) {
    scores.set(m.ratingKey, 0);
  }

  // Sum Borda points from each voter
  for (const vote of votes) {
    // Only include ratingKeys that are still unwatched
    const effective = vote.rankings.filter((k) => titleMap.has(k));
    for (let i = 0; i < effective.length; i++) {
      const key = effective[i];
      const points = n - i; // 1st = N, 2nd = N-1, …
      scores.set(key, (scores.get(key) ?? 0) + points);
    }
  }

  // Sort descending by score, then alphabetically by title
  return Array.from(scores.entries())
    .map(([ratingKey, score]) => ({
      ratingKey,
      title: titleMap.get(ratingKey) ?? ratingKey,
      score,
    }))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

/**
 * Get per-voter breakdown of effective rankings (unwatched only).
 */
export function getVoterBreakdowns(
  votes: RankedVote[],
  movies: ShowingMovie[],
): VoterBreakdown[] {
  const unwatchedKeys = new Set(
    movies.filter((m) => !m.watched).map((m) => m.ratingKey),
  );
  const titleMap = new Map(movies.map((m) => [m.ratingKey, m.title]));

  return votes.map((vote) => {
    const effective = vote.rankings.filter((k) => unwatchedKeys.has(k));
    return {
      voter: vote.voter,
      rankings: effective.map((key, i) => ({
        ratingKey: key,
        title: titleMap.get(key) ?? key,
        rank: i + 1,
      })),
    };
  });
}
