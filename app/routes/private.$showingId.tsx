/**
 * Showing Detail — /vote/:showingId
 *
 * Full view of a movie night showing with:
 * - Movie grid (unwatched + watched sections)
 * - Pick counter per user
 * - Ranked-choice voting panel
 * - Borda score results + per-voter breakdown
 * - Activity history feed
 * - Shareable link
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useOutletContext,
  useRevalidator,
  useFetcher,
  useNavigate,
} from "@remix-run/react";
import { useState, useCallback, useEffect, useRef } from "react";
import { getPlexToken, getSession } from "~/lib/auth/session.server";
import { getPlexUser, type PlexUser } from "~/lib/auth/plex.server";
import { getShowing, getUserPickCount } from "~/lib/vote/storage.server";
import { calculateBordaScores } from "~/lib/vote/tally";
import { MAX_PICKS_PER_USER ,
  SHOWING_STATUS_LABELS,
  SHOWING_STATUS_COLORS,
  SHOWING_STATUSES,
} from "~/lib/vote/types";
import type { Showing, ShowingStatus, VoterIdentity } from "~/lib/vote/types";
import { MovieSelector } from "~/components/vote/MovieSelector";
import { RankedChoiceVoter } from "~/components/vote/RankedChoiceVoter";
import { GuestIdentity } from "~/components/vote/GuestIdentity";
import type { VoteContext } from "~/routes/private";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const showingName = data?.showing?.name?.trim();
  const title = showingName
    ? `${showingName} - Private Cinema | Watchtower`
    : "Private Cinema - Watchtower";

  return [
    { title },
    {
      name: "description",
      content: "Join and manage your Private Cinema showing",
    },
  ];
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const showingId = params.showingId;
  if (!showingId) throw new Response("Not Found", { status: 404 });

  const showing = await getShowing(showingId);
  if (!showing) throw new Response("Showing not found", { status: 404 });

  // Optional auth
  let user: PlexUser | null = null;
  let isOwner = false;

  const token = await getPlexToken(request);
  if (token) {
    user = await getPlexUser(token);
    const session = await getSession(request);
    isOwner = session.get("isOwner") === true;
  }

  // Compute tally results on the server
  const bordaScores = calculateBordaScores(showing.votes, showing.movies);
  // Compute pick counts per user
  const pickCounts: Record<string, number> = {};
  for (const movie of showing.movies) {
    if (!movie.watched) {
      const key = movie.addedBy.plexUserId?.toString() ?? movie.addedBy.name;
      pickCounts[key] = (pickCounts[key] ?? 0) + 1;
    }
  }

  let currentUserPicks = 0;
  if (user) {
    currentUserPicks = getUserPickCount(showing, {
      plexUserId: user.id,
      name: user.username,
    });
  }

  return json({
    showing,
    bordaScores,
    currentUserPicks,
    isOwner,
    userId: user?.id ?? null,
  });
}

export default function ShowingDetail() {
  const { showing, bordaScores, currentUserPicks, isOwner, userId } =
    useLoaderData<typeof loader>();
  const { user, guestName, guestToken, setGuestIdentity } =
    useOutletContext<VoteContext>();
  const revalidator = useRevalidator();
  const navigate = useNavigate();

  const [showMovieSelector, setShowMovieSelector] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(showing.name);

  // Determine if user has already voted to show results tab first
  const hasExistingVote = (() => {
    const voter = user
      ? { plexUserId: user.id, name: user.username }
      : guestName
      ? { name: guestName }
      : null;
    if (!voter) return false;
    return showing.votes.some((v: { voter: VoterIdentity }) =>
      voter.plexUserId && v.voter.plexUserId
        ? v.voter.plexUserId === voter.plexUserId
        : v.voter.name.toLowerCase() === voter.name.toLowerCase()
    );
  })();

  const [activeTab, setActiveTab] = useState<"vote" | "results" | "history">(
    hasExistingVote ? "results" : "vote"
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [voteJustSubmitted, setVoteJustSubmitted] = useState(false);

  const movieFetcher = useFetcher();
  const voteFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const renameFetcher = useFetcher();
  const statusFetcher = useFetcher();
  const tabsRef = useRef<HTMLDivElement>(null);

  // SSE live updates — connect to event stream for this showing
  useEffect(() => {
    const es = new EventSource(`/api/vote/events/${showing.id}`);

    // Skip the first event (initial state)
    let initialized = false;
    es.onmessage = (event) => {
      if (!initialized) {
        initialized = true;
        return;
      }
      try {
        const data = JSON.parse(event.data);
        if (data.deleted) {
          es.close();
          return;
        }
        // Revalidate when the server has a newer version
        if (revalidator.state === "idle") {
          revalidator.revalidate();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource reconnects automatically
    };

    return () => es.close();
    // Only reconnect if the showing ID changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing.id]);

  const unwatched = showing.movies.filter(
    (m: Showing["movies"][0]) => !m.watched
  );
  const watched = showing.movies.filter((m: Showing["movies"][0]) => m.watched);

  // Sort unwatched movies by Borda score (ranked results)
  const scoreMap = new Map(
    bordaScores.map((s: { ratingKey: string; score: number }, i: number) => [
      s.ratingKey,
      { score: s.score, rank: i + 1 },
    ])
  );
  const sortedUnwatched = [...unwatched].sort((a, b) => {
    const aInfo = scoreMap.get(a.ratingKey);
    const bInfo = scoreMap.get(b.ratingKey);
    // Movies with scores come first, sorted by rank
    if (aInfo && bInfo) return aInfo.rank - bInfo.rank;
    if (aInfo) return -1;
    if (bInfo) return 1;
    return 0; // preserve original order for unranked
  });

  const isCreator = userId != null && showing.createdBy.plexUserId === userId;
  const canManage = isCreator || isOwner;

  // Get current user's existing vote
  const currentVoter: VoterIdentity | null = user
    ? { plexUserId: user.id, name: user.username }
    : guestName
    ? { name: guestName }
    : null;

  const existingVote = currentVoter
    ? showing.votes.find((v: { voter: VoterIdentity }) =>
        currentVoter.plexUserId && v.voter.plexUserId
          ? v.voter.plexUserId === currentVoter.plexUserId
          : v.voter.name.toLowerCase() === currentVoter.name.toLowerCase()
      )
    : null;

  const copyLink = useCallback(() => {
    const url = `${window.location.origin}/private/${showing.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [showing.id]);

  const handleToggleWatched = (ratingKey: string) => {
    movieFetcher.submit(JSON.stringify({ showingId: showing.id, ratingKey }), {
      method: "PATCH",
      action: "/api/vote/movies",
      encType: "application/json",
    });
    setTimeout(() => revalidator.revalidate(), 300);
  };

  const handleRemoveMovie = (ratingKey: string) => {
    movieFetcher.submit(JSON.stringify({ showingId: showing.id, ratingKey }), {
      method: "DELETE",
      action: "/api/vote/movies",
      encType: "application/json",
    });
    setTimeout(() => revalidator.revalidate(), 300);
  };

  const handleVoteSubmit = (rankings: string[]) => {
    voteFetcher.submit(
      JSON.stringify({
        showingId: showing.id,
        rankings,
        ...(user ? {} : { guestName }),
      }),
      {
        method: "POST",
        action: "/api/vote/votes",
        encType: "application/json",
      }
    );
    // Animate to results tab after a short delay
    setVoteJustSubmitted(true);
    setTimeout(() => {
      revalidator.revalidate();
      setActiveTab("results");
      setTimeout(() => setVoteJustSubmitted(false), 600);
    }, 400);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const handleRename = () => {
    const trimmed = editedName.trim();
    if (!trimmed || trimmed === showing.name) {
      setEditedName(showing.name);
      setIsEditingName(false);
      return;
    }
    renameFetcher.submit(
      JSON.stringify({ showingId: showing.id, name: trimmed }),
      {
        method: "PATCH",
        action: "/api/vote/showings",
        encType: "application/json",
      }
    );
    setIsEditingName(false);
    setTimeout(() => revalidator.revalidate(), 300);
  };

  const confirmDelete = () => {
    deleteFetcher.submit(JSON.stringify({ showingId: showing.id }), {
      method: "DELETE",
      action: "/api/vote/showings",
      encType: "application/json",
    });
    setShowDeleteConfirm(false);
    navigate("/private");
  };

  const existingKeys = new Set(
    showing.movies.map((m: Showing["movies"][0]) => m.ratingKey)
  );

  return (
    <div className="space-y-8">
      {/* Header — centered */}
      <div className="text-center">
        {isEditingName ? (
          <div>
            <div className="flex items-center justify-center gap-2">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") {
                    setEditedName(showing.name);
                    setIsEditingName(false);
                  }
                }}
                className="text-2xl sm:text-3xl font-bold text-foreground-primary bg-transparent border-b-2 border-accent-primary outline-none max-w-md"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
              <button
                onClick={handleRename}
                className="rounded-md p-1.5 text-green-400 hover:bg-green-500/10 transition-colors"
                title="Save"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              </button>
              <button
                onClick={() => {
                  setEditedName(showing.name);
                  setIsEditingName(false);
                }}
                className="rounded-md p-1.5 text-foreground-muted hover:bg-white/5 transition-colors"
                title="Cancel"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            {/* Delete button — shown only while editing */}
            {canManage && (
              <button
                onClick={handleDelete}
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                  />
                </svg>
                Delete Showing
              </button>
            )}
          </div>
        ) : (
          <div>
            <ShowingStatusHeader
              status={(showing.status as ShowingStatus) ?? "work_in_progress"}
              canManage={canManage}
              onStatusChange={(newStatus) => {
                statusFetcher.submit(
                  JSON.stringify({ showingId: showing.id, status: newStatus }),
                  {
                    method: "PATCH",
                    action: "/api/vote/showings",
                    encType: "application/json",
                  }
                );
                setTimeout(() => revalidator.revalidate(), 300);
              }}
            />
            <div className="relative">
              {canManage ? (
                <button
                  type="button"
                  className="text-3xl sm:text-4xl font-bold text-amber-50 text-center uppercase tracking-wide cursor-pointer hover:text-amber-300 transition-colors bg-transparent border-none w-full"
                  onClick={() => {
                    setEditedName(showing.name);
                    setIsEditingName(true);
                  }}
                  title="Click to edit"
                >
                  {showing.name}
                </button>
              ) : (
                <h1 className="text-3xl sm:text-4xl font-bold text-amber-50 text-center uppercase tracking-wide">
                  {showing.name}
                </h1>
              )}
              <button
                onClick={copyLink}
                className="absolute -right-8 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-foreground-muted hover:text-foreground-primary hover:bg-white/5 transition-colors"
                title={copied ? "Copied!" : "Share link"}
              >
                {copied ? (
                  <svg
                    className="h-4 w-4 text-green-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Movie Grid — Unwatched */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground-primary">
            Movies ({unwatched.length})
          </h2>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-xs text-foreground-muted">
                {isOwner ? (
                  <>{currentUserPicks} picks</>
                ) : (
                  <span
                    className={
                      currentUserPicks >= MAX_PICKS_PER_USER
                        ? "text-amber-400"
                        : ""
                    }
                  >
                    {currentUserPicks}/{MAX_PICKS_PER_USER}
                  </span>
                )}
              </span>
            )}
            {user && (isOwner || currentUserPicks < MAX_PICKS_PER_USER) && (
              <button
                onClick={() => setShowMovieSelector(true)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-amber-500/40 text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 transition-colors"
                title="Add movie"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
        {sortedUnwatched.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {sortedUnwatched.map((movie: Showing["movies"][0]) => (
              <MovieCard
                key={movie.ratingKey}
                movie={movie}
                rank={scoreMap.get(movie.ratingKey)?.rank}
                canManage={canManage}
                onToggleWatched={handleToggleWatched}
                onRemove={handleRemoveMovie}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-foreground-muted py-6 text-center">
            No movies yet.{" "}
            {user ? "Add some from the catalog!" : "Sign in to add movies."}
          </p>
        )}
      </section>

      {/* Tabs: Vote | Results | History */}
      <div
        ref={tabsRef}
        className="border-b border-white/10"
        style={{ scrollMarginTop: "4rem" }}
      >
        <div className="flex gap-6">
          {(["vote", "results", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setActiveTab(t);
                // Scroll tabs into view so content is maximally visible
                setTimeout(() => {
                  tabsRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }, 50);
              }}
              className={`pb-3 text-sm font-medium capitalize transition-colors ${
                activeTab === t
                  ? "text-accent-primary border-b-2 border-accent-primary"
                  : "text-foreground-muted hover:text-foreground-primary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Vote Tab */}
      {activeTab === "vote" && (
        <section
          className={`transition-all duration-300 ${
            voteJustSubmitted
              ? "opacity-0 translate-y-4"
              : "opacity-100 translate-y-0"
          }`}
        >
          {!user && !guestName && (
            <div className="mb-6">
              <GuestIdentity
                guestName={guestName}
                guestToken={guestToken}
                onNameConfirmed={(name, token) => setGuestIdentity(name, token)}
              />
            </div>
          )}

          {user || guestName ? (
            <RankedChoiceVoter
              movies={unwatched.map((m: Showing["movies"][0]) => ({
                ratingKey: m.ratingKey,
                title: m.title,
                year: m.year,
                posterUrl: m.posterUrl,
              }))}
              existingRankings={existingVote?.rankings ?? []}
              onSubmit={handleVoteSubmit}
              isSubmitting={voteFetcher.state === "submitting"}
            />
          ) : (
            <p className="text-sm text-foreground-muted py-4">
              Enter your name above to vote.
            </p>
          )}
        </section>
      )}

      {/* Results Tab */}
      {activeTab === "results" && (
        <section
          className="space-y-6"
          style={{ animation: "fadeSlideIn 0.3s ease-out" }}
        >
          {/* Borda scores with per-voter colored segments */}
          <div>
            <h3 className="text-base font-semibold text-foreground-primary mb-3">
              Rankings
            </h3>
            {bordaScores.length > 0 ? (
              (() => {
                const n = unwatched.length;
                const unwatchedKeys = new Set(
                  unwatched.map((m: Showing["movies"][0]) => m.ratingKey)
                );

                // Assign a stable color to each voter
                const voterColors = [
                  "#FDBE02", // pure mango (bright)
                  "#7B5E1E", // dark bronze
                  "#FDE68A", // pale butter
                  "#9B9580", // yellowish gray
                  "#F5A623", // vivid amber
                  "#A68A2E", // olive gold
                  "#FFD54F", // light gold
                  "#8C7530", // dark khaki
                  "#FBC740", // warm dandelion
                  "#B89E50", // dusty bronze
                ];
                const voters = showing.votes.map(
                  (v: { voter: VoterIdentity }) => v.voter
                );
                const voterColorMap = new Map<string, string>();
                // Determine current user's key for stable ordering
                const currentKey = currentVoter
                  ? currentVoter.plexUserId?.toString() ?? currentVoter.name
                  : null;
                // Build stable order: others first, current user last
                const voterOrder = new Map<string, number>();
                let orderIdx = 0;
                voters.forEach((v: VoterIdentity) => {
                  const key = v.plexUserId?.toString() ?? v.name;
                  if (!voterOrder.has(key) && key !== currentKey) {
                    voterOrder.set(key, orderIdx++);
                  }
                });
                if (currentKey) {
                  voterOrder.set(currentKey, orderIdx);
                }
                voters.forEach((v: VoterIdentity, i: number) => {
                  const key = v.plexUserId?.toString() ?? v.name;
                  voterColorMap.set(key, voterColors[i % voterColors.length]);
                });

                // Pre-compute per-voter Borda points for each movie
                type VoterSegment = {
                  voterKey: string;
                  voterName: string;
                  points: number;
                  rank: number;
                  color: string;
                };
                const movieContribs = new Map<string, VoterSegment[]>();
                for (const vote of showing.votes as Array<{
                  voter: VoterIdentity;
                  rankings: string[];
                }>) {
                  const vKey =
                    vote.voter.plexUserId?.toString() ?? vote.voter.name;
                  const effective = vote.rankings.filter((k: string) =>
                    unwatchedKeys.has(k)
                  );
                  for (let i = 0; i < effective.length; i++) {
                    const rk = effective[i];
                    const pts = n - i;
                    if (!movieContribs.has(rk)) movieContribs.set(rk, []);
                    movieContribs.get(rk)!.push({
                      voterKey: vKey,
                      voterName: vote.voter.name,
                      points: pts,
                      rank: i + 1,
                      color: voterColorMap.get(vKey) ?? "#888",
                    });
                  }
                }

                const maxScore = bordaScores[0]?.score ?? 1;

                return (
                  <div className="space-y-2">
                    {bordaScores.map(
                      (
                        result: {
                          ratingKey: string;
                          title: string;
                          score: number;
                        },
                        idx: number
                      ) => {
                        const segments =
                          movieContribs.get(result.ratingKey) ?? [];
                        // Stable order: same across all movies, current user last
                        const sorted = [...segments].sort(
                          (a, b) =>
                            (voterOrder.get(a.voterKey) ?? 0) -
                            (voterOrder.get(b.voterKey) ?? 0)
                        );
                        return (
                          <div
                            key={result.ratingKey}
                            className="flex items-center gap-3"
                          >
                            <span
                              className={`w-7 text-center text-sm font-bold ${
                                idx === 0
                                  ? "text-yellow-400"
                                  : idx === 1
                                  ? "text-gray-300"
                                  : idx === 2
                                  ? "text-amber-500"
                                  : "text-foreground-muted"
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-foreground-primary truncate">
                                  {result.title}
                                </span>
                                <span className="text-xs text-foreground-muted ml-2 shrink-0">
                                  {result.score} pts
                                </span>
                              </div>
                              <div className="group relative h-2 rounded-full bg-white/10 overflow-hidden flex">
                                {sorted.map((seg) => (
                                  <div
                                    key={seg.voterKey}
                                    className="h-full transition-all"
                                    style={{
                                      width: `${
                                        maxScore > 0
                                          ? (seg.points / maxScore) * 100
                                          : 0
                                      }%`,
                                      backgroundColor: seg.color,
                                    }}
                                  />
                                ))}
                                {/* Tooltip on hover */}
                                {sorted.length > 0 && (
                                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
                                    <div className="rounded-lg border border-white/10 bg-background-primary px-3 py-2 shadow-xl whitespace-nowrap">
                                      {sorted.map((seg) => (
                                        <div
                                          key={seg.voterKey}
                                          className="flex items-center gap-2 text-xs py-0.5"
                                        >
                                          <span
                                            className="inline-block h-2 w-2 rounded-full shrink-0"
                                            style={{
                                              backgroundColor: seg.color,
                                            }}
                                          />
                                          <span className="text-foreground-primary font-medium">
                                            {seg.voterName}
                                          </span>
                                          <span className="text-foreground-muted">
                                            ranked #{seg.rank} · {seg.points}{" "}
                                            pts
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}

                    {/* Voter color legend */}
                    {voters.length > 0 && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                        {voters.map((v: VoterIdentity) => {
                          const key = v.plexUserId?.toString() ?? v.name;
                          return (
                            <span
                              key={key}
                              className="flex items-center gap-1.5 text-xs text-foreground-muted"
                            >
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{
                                  backgroundColor:
                                    voterColorMap.get(key) ?? "#888",
                                }}
                              />
                              {v.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <p className="text-sm text-foreground-muted">No votes yet.</p>
            )}
          </div>
        </section>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <section className="space-y-6">
          {/* Watched movies */}
          {watched.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-foreground-primary mb-3">
                Watched ({watched.length})
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                {watched.map((movie: Showing["movies"][0]) => (
                  <MovieCard
                    key={movie.ratingKey}
                    movie={movie}
                    canManage={canManage}
                    onToggleWatched={handleToggleWatched}
                    onRemove={handleRemoveMovie}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Activity feed */}
          <div>
            <h3 className="text-base font-semibold text-foreground-primary mb-3">
              Activity
            </h3>
            {showing.history.length > 0 ? (
              <div className="space-y-2">
                {[...showing.history]
                  .reverse()
                  .map((entry: Showing["history"][0], idx: number) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 text-sm py-2 border-b border-white/5 last:border-0"
                    >
                      <HistoryIcon action={entry.action} />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground-secondary">
                          <span className="font-medium text-foreground-primary">
                            {entry.actor.name}
                          </span>{" "}
                          {historyActionLabel(entry.action)}
                          {entry.target && (
                            <>
                              {" "}
                              <span className="font-medium text-foreground-primary">
                                {entry.target}
                              </span>
                            </>
                          )}
                        </p>
                        <p className="text-xs text-foreground-muted mt-0.5">
                          {new Date(entry.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">No activity yet.</p>
            )}
          </div>
        </section>
      )}

      {/* Movie Selector Modal */}
      {showMovieSelector && (
        <MovieSelector
          showingId={showing.id}
          currentPicks={currentUserPicks}
          maxPicks={isOwner ? Infinity : MAX_PICKS_PER_USER}
          existingKeys={existingKeys}
          onClose={() => {
            setShowMovieSelector(false);
            revalidator.revalidate();
          }}
          onMovieAdded={() => {}}
        />
      )}

      {/* Created by — at page bottom */}
      <div className="mt-12 pt-6 border-t border-white/5 text-center">
        <p className="text-sm text-foreground-muted">
          Created by {showing.createdBy.name} &middot;{" "}
          {new Date(showing.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-background-primary p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-foreground-primary">
              Delete Showing
            </h3>
            <p className="mt-2 text-sm text-foreground-muted">
              Are you sure you want to delete &ldquo;{showing.name}&rdquo;? All
              movies, votes, and history will be permanently removed.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-md px-4 py-2 text-sm text-foreground-secondary hover:text-foreground-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MovieCard({
  movie,
  rank,
  canManage,
  onToggleWatched,
  onRemove,
}: {
  movie: Showing["movies"][0];
  rank?: number;
  canManage: boolean;
  onToggleWatched: (ratingKey: string) => void;
  onRemove: (ratingKey: string) => void;
}) {
  return (
    <div className="group relative">
      <div
        className={`aspect-[2/3] overflow-hidden rounded-md bg-white/5 ${
          movie.watched ? "opacity-60" : ""
        }`}
      >
        {movie.posterUrl ? (
          <img
            src={movie.posterUrl}
            alt={movie.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-foreground-muted p-2 text-center">
            {movie.title}
          </div>
        )}

        {/* Watched badge */}
        {movie.watched && (
          <div className="absolute top-1 right-1 rounded-full bg-green-500/90 p-1">
            <svg
              className="h-3 w-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
        )}

        {/* Hover actions — icon-only, confined to poster */}
        {canManage && (
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button
              onClick={() => onToggleWatched(movie.ratingKey)}
              className={`rounded-full bg-white/20 p-2 transition-colors ${
                movie.watched
                  ? "text-yellow-400 hover:bg-yellow-500/30 hover:text-yellow-300"
                  : "text-green-400 hover:bg-green-500/30 hover:text-green-300"
              }`}
              title={movie.watched ? "Mark unwatched" : "Mark watched"}
            >
              {movie.watched ? (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
              )}
            </button>
            <button
              onClick={() => onRemove(movie.ratingKey)}
              className="rounded-full bg-white/20 p-2 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-colors"
              title="Remove"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground-primary truncate">
            {movie.title}
          </p>
          <p className="text-xs text-foreground-muted">
            {movie.year && `${movie.year} · `}
            {movie.addedBy.name}
          </p>
        </div>
        {rank != null && !movie.watched && (
          <span
            className={`shrink-0 text-xs font-bold ${
              rank === 1
                ? "text-yellow-400"
                : rank === 2
                ? "text-gray-300"
                : rank === 3
                ? "text-amber-600"
                : "text-foreground-muted"
            }`}
          >
            #{rank}
          </span>
        )}
      </div>
    </div>
  );
}

function historyActionLabel(action: Showing["history"][0]["action"]): string {
  switch (action) {
    case "showing_renamed":
      return "renamed the showing";
    case "showing_created":
      return "created the showing";
    case "movie_added":
      return "added";
    case "movie_removed":
      return "removed";
    case "movie_watched":
      return "marked as watched";
    case "movie_unwatched":
      return "marked as unwatched";
    case "vote_submitted":
      return "submitted their vote";
    case "vote_updated":
      return "updated their vote";
    default:
      return action;
  }
}

function HistoryIcon({ action }: { action: string }) {
  const className = "h-4 w-4 shrink-0 mt-0.5";

  switch (action) {
    case "showing_renamed":
      return (
        <svg
          className={`${className} text-blue-400`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
          />
        </svg>
      );
    case "movie_added":
      return (
        <svg
          className={`${className} text-green-400`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v16m8-8H4"
          />
        </svg>
      );
    case "movie_removed":
      return (
        <svg
          className={`${className} text-red-400`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      );
    case "movie_watched":
      return (
        <svg
          className={`${className} text-green-400`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      );
    case "vote_submitted":
    case "vote_updated":
      return (
        <svg
          className={`${className} text-blue-400`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      );
    default:
      return (
        <svg
          className={`${className} text-foreground-muted`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      );
  }
}

function ShowingStatusHeader({
  status,
  canManage,
  onStatusChange,
}: {
  status: ShowingStatus;
  canManage: boolean;
  onStatusChange: (status: ShowingStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const colors = SHOWING_STATUS_COLORS[status];
  const label = SHOWING_STATUS_LABELS[status];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div
      className="relative flex items-center justify-center gap-3 mb-3"
      ref={ref}
    >
      <div
        className={`h-px flex-1 max-w-16 bg-gradient-to-r from-transparent ${colors.line}`}
      />
      {canManage ? (
        <button
          onClick={() => setOpen(!open)}
          className={`${colors.text} text-xs tracking-[0.25em] uppercase font-medium flex items-center gap-1.5 hover:opacity-80 transition-opacity`}
        >
          {label}
          <svg
            className={`h-3 w-3 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m19.5 8.25-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>
      ) : (
        <span
          className={`${colors.text} text-xs tracking-[0.25em] uppercase font-medium`}
        >
          {label}
        </span>
      )}
      <div
        className={`h-px flex-1 max-w-16 bg-gradient-to-l from-transparent ${colors.line}`}
      />

      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-44 rounded-lg border border-white/10 bg-background-primary py-1 shadow-xl">
          {SHOWING_STATUSES.map((s) => {
            const sc = SHOWING_STATUS_COLORS[s];
            const isActive = s === status;
            return (
              <button
                key={s}
                onClick={() => {
                  onStatusChange(s);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  isActive ? "bg-white/5 font-medium" : "hover:bg-white/5"
                } ${sc.text}`}
              >
                {SHOWING_STATUS_LABELS[s]}
                {isActive && (
                  <svg
                    className="ml-auto h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
