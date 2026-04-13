/**
 * Vote Dashboard — /vote
 *
 * Lists all showings the user can see in a movie-theater marquee style.
 * Movie posters scroll horizontally in a carousel.
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useFetcher,
  useRevalidator,
 useOutletContext } from "@remix-run/react";
import { useState, useEffect, useRef, useCallback } from "react";
import { getPlexToken, getSession } from "~/lib/auth/session.server";
import { getPlexUser } from "~/lib/auth/plex.server";
import { listShowings, getGuestShowings } from "~/lib/vote/storage.server";
import type { ShowingSummary , ShowingStatus } from "~/lib/vote/types";
import {
  SHOWING_STATUS_LABELS,
  SHOWING_STATUS_COLORS,
  SHOWING_STATUS_SORT_ORDER,
} from "~/lib/vote/types";
import type { VoteContext } from "~/routes/private";

export const meta: MetaFunction = () => {
  return [
    { title: "Private Cinema - Watchtower" },
    { name: "description", content: "Your Private Cinema dashboard" },
  ];
};

function relativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const allShowings = await listShowings();
  const url = new URL(request.url);
  const guestNameParam = url.searchParams.get("guest");

  const token = await getPlexToken(request);
  let userId: number | null = null;
  let isOwner = false;

  if (token) {
    const user = await getPlexUser(token);
    if (user) userId = user.id;
    const session = await getSession(request);
    isOwner = session.get("isOwner") === true;
  }

  let showings: ShowingSummary[];
  if (isOwner) {
    showings = allShowings;
  } else if (userId) {
    showings = allShowings.filter((s) => s.createdBy.plexUserId === userId);
  } else if (guestNameParam) {
    showings = await getGuestShowings(guestNameParam);
  } else {
    showings = [];
  }

  return json({ showings, isAuthenticated: !!userId, isOwner });
}

/** Horizontal poster carousel with mouse wheel, touch swipe, and arrow buttons. */
function PosterCarousel({
  movies,
}: {
  movies: Array<{ ratingKey: string; title: string; posterUrl: string }>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      // Only convert vertical wheel to horizontal on mouse/trackpad devices.
      // On touch devices, let the browser handle native vertical scrolling.
      const isTouch = window.matchMedia("(pointer: coarse)").matches;
      if (!isTouch && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    el.addEventListener("scroll", checkScroll, { passive: true });
    // Initial check after layout
    const raf = requestAnimationFrame(checkScroll);
    return () => {
      el.removeEventListener("wheel", handler);
      el.removeEventListener("scroll", checkScroll);
      cancelAnimationFrame(raf);
    };
  }, [checkScroll]);

  const scrollBy = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    // Scroll by ~3 poster widths
    el.scrollBy({ left: dir * 360, behavior: "smooth" });
  }, []);

  if (movies.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-amber-200/40 italic">
        No movies yet — be the first to add one
      </div>
    );
  }

  return (
    <div className="relative group/carousel">
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={(e) => {
            e.preventDefault();
            scrollBy(-1);
          }}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 flex items-center justify-center rounded-full bg-black/70 border border-amber-500/20 text-amber-300 opacity-0 group-hover/carousel:opacity-100 transition-opacity hover:bg-black/90 hover:border-amber-500/40 shadow-lg"
          aria-label="Scroll left"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}

      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={(e) => {
            e.preventDefault();
            scrollBy(1);
          }}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 flex items-center justify-center rounded-full bg-black/70 border border-amber-500/20 text-amber-300 opacity-0 group-hover/carousel:opacity-100 transition-opacity hover:bg-black/90 hover:border-amber-500/40 shadow-lg"
          aria-label="Scroll right"
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
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      )}

      {/* Edge fade indicators */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-background-primary to-transparent z-[5] pointer-events-none" />
      )}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background-primary to-transparent z-[5] pointer-events-none" />
      )}

      <div
        ref={scrollRef}
        className="flex justify-center gap-3 overflow-x-auto scrollbar-hide py-2 px-1 scroll-smooth snap-x snap-mandatory"
      >
        {movies.map((m) => (
          <div key={m.ratingKey} className="shrink-0 snap-start">
            <div className="w-[120px] aspect-[2/3] rounded-md overflow-hidden bg-black/40 ring-1 ring-amber-400/10 shadow-lg shadow-black/40">
              {m.posterUrl ? (
                <img
                  src={m.posterUrl}
                  alt={m.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-amber-200/50 p-2 text-center leading-tight">
                  {m.title}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VoteDashboard() {
  const { showings: serverShowings, isAuthenticated } =
    useLoaderData<typeof loader>();
  const { guestName } = useOutletContext<VoteContext>();
  const guestFetcher = useFetcher<{ showings: ShowingSummary[] }>();
  const revalidator = useRevalidator();

  // Poll for live updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthenticated && guestName) {
      guestFetcher.load(
        `/private?index&guest=${encodeURIComponent(guestName)}`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, guestName]);

  const showings = isAuthenticated
    ? serverShowings
    : (guestFetcher.data?.showings ?? serverShowings);

  const sortedShowings = [...showings].sort((a, b) => {
    const statusA =
      SHOWING_STATUS_SORT_ORDER[
        (a.status as ShowingStatus) ?? "work_in_progress"
      ];
    const statusB =
      SHOWING_STATUS_SORT_ORDER[
        (b.status as ShowingStatus) ?? "work_in_progress"
      ];
    if (statusA !== statusB) return statusA - statusB;
    return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
  });

  // Guest with no identity
  if (!isAuthenticated && !guestName) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="text-5xl mb-4">🎬</div>
        <h2 className="text-2xl font-bold text-amber-100 tracking-wide uppercase">
          Private Cinema
        </h2>
        <p className="mt-3 max-w-sm text-amber-200/60">
          Got a link to a showing? <br /> Open it directly to join and vote.
        </p>
        <Link
          to="/auth/redirect?redirectTo=/private"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-amber-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-amber-400 transition-colors uppercase tracking-wide"
        >
          Sign in
        </Link>
      </div>
    );
  }

  // Guest with name but no participated showings
  if (!isAuthenticated && guestName && showings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="text-5xl mb-4">🎟️</div>
        <h2 className="text-2xl font-bold text-amber-100 tracking-wide uppercase">
          No Showings Yet
        </h2>
        <p className="mt-3 max-w-sm text-amber-200/60">
          Ask for a showing link to start voting on movies.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full">
      {/* Showings */}
      {sortedShowings.length > 0 ? (
        <div className="w-full max-w-2xl flex flex-col gap-12 items-center">
          {sortedShowings.map((s: ShowingSummary) => {
            const status: ShowingStatus = s.status ?? "work_in_progress";
            const statusLabel = SHOWING_STATUS_LABELS[status];
            const colors = SHOWING_STATUS_COLORS[status];

            return (
              <Link
                key={s.id}
                to={`/private/${s.id}`}
                className="group w-full block text-center"
              >
                {/* Status label */}
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div
                    className={`h-px flex-1 max-w-16 bg-gradient-to-r from-transparent ${colors.line}`}
                  />
                  <span
                    className={`${colors.text} text-xs tracking-[0.25em] uppercase font-medium`}
                  >
                    {statusLabel}
                  </span>
                  <div
                    className={`h-px flex-1 max-w-16 bg-gradient-to-l from-transparent ${colors.line}`}
                  />
                </div>

                {/* Showing name as the headline */}
                <h2 className="text-3xl sm:text-4xl font-bold text-amber-50 tracking-wide uppercase group-hover:text-amber-300 transition-colors">
                  {s.name}
                </h2>

                {/* Poster carousel */}
                <div className="mt-5">
                  <PosterCarousel movies={s.moviePreviews ?? []} />
                </div>

                {/* Details */}
                <div className="mt-4 flex items-center justify-center gap-3 text-xs text-amber-200/40">
                  <span>
                    {s.movieCount} {s.movieCount === 1 ? "movie" : "movies"}
                  </span>
                  <span className="text-amber-500/30">·</span>
                  <span>
                    {s.voterCount} {s.voterCount === 1 ? "voter" : "voters"}
                  </span>
                  <span className="text-amber-500/30">·</span>
                  <span>by {s.createdBy.name}</span>
                  <span className="text-amber-500/30">·</span>
                  <span>{relativeTime(s.updatedAt ?? s.createdAt)}</span>
                </div>

                {/* Subtle divider at bottom */}
                <div className="mt-8 h-px bg-gradient-to-r from-transparent via-amber-500/15 to-transparent" />
              </Link>
            );
          })}
        </div>
      ) : isAuthenticated ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">🎬</div>
          <h2 className="text-xl font-bold text-amber-100 tracking-wide uppercase">
            No Showings Yet
          </h2>
          <p className="mt-2 max-w-sm text-amber-200/50">
            Create your first showing to start picking and voting on movies with
            friends.
          </p>
        </div>
      ) : null}
    </div>
  );
}
