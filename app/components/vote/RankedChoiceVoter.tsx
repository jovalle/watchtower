/**
 * RankedChoiceVoter — Drag-to-rank interface for voting on movies.
 *
 * Users manually reorder movies to express their preferences.
 * Index 0 = most preferred (1st choice).
 */

import { useState, useCallback, useEffect, useRef } from "react";

interface RankableMovie {
  ratingKey: string;
  title: string;
  year?: number;
  posterUrl: string;
}

interface RankedChoiceVoterProps {
  movies: RankableMovie[];
  /** Current vote rankings (ratingKeys in order). Empty if no existing vote. */
  existingRankings: string[];
  onSubmit: (rankings: string[]) => void;
  isSubmitting: boolean;
}

export function RankedChoiceVoter({
  movies,
  existingRankings,
  onSubmit,
  isSubmitting,
}: RankedChoiceVoterProps) {
  // Initialize order from existing rankings, appending any new movies at end
  const initOrder = (): string[] => {
    const movieKeys = new Set(movies.map((m) => m.ratingKey));
    const ordered: string[] = [];

    // First: existing rankings that are still valid
    for (const key of existingRankings) {
      if (movieKeys.has(key)) {
        ordered.push(key);
        movieKeys.delete(key);
      }
    }

    // Then: any new movies not in existing rankings
    for (const key of movieKeys) {
      ordered.push(key);
    }

    return ordered;
  };

  const [order, setOrder] = useState<string[]>(initOrder);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const dragIdxRef = useRef<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Sync order when movies change (e.g. a movie is deleted or added externally)
  useEffect(() => {
    // Don't reset order during an active drag
    if (dragIdxRef.current !== null) return;

    setOrder((prev) => {
      const validKeys = new Set(movies.map((m) => m.ratingKey));
      // Remove keys no longer in movies
      const filtered = prev.filter((k) => validKeys.has(k));
      // Add any new keys not already in order
      const existing = new Set(filtered);
      for (const m of movies) {
        if (!existing.has(m.ratingKey)) {
          filtered.push(m.ratingKey);
        }
      }
      // Skip update if nothing actually changed
      if (
        filtered.length === prev.length &&
        filtered.every((k, i) => k === prev[i])
      ) {
        return prev;
      }
      return filtered;
    });
  }, [movies]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingIdx !== null) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingIdx]);

  const movieMap = new Map(movies.map((m) => [m.ratingKey, m]));
  const hasExistingVote = existingRankings.length > 0;

  const moveUp = useCallback((idx: number) => {
    if (idx <= 0) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((idx: number) => {
    setOrder((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const moveToPosition = useCallback(
    (fromIdx: number, toPosition: number) => {
      // toPosition is 1-based user input
      const targetIdx = Math.max(0, Math.min(toPosition - 1, order.length - 1));
      if (targetIdx === fromIdx) return;

      setOrder((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(targetIdx, 0, moved);
        return next;
      });
    },
    [order.length],
  );

  const handleRankClick = (idx: number) => {
    setEditingIdx(idx);
    setEditValue(String(idx + 1));
  };

  const handleRankCommit = (fromIdx: number) => {
    const num = parseInt(editValue, 10);
    if (!isNaN(num) && num >= 1) {
      moveToPosition(fromIdx, num);
    }
    setEditingIdx(null);
  };

  // Drag-and-drop handlers — use a ref for dragIdx to avoid stale closure
  // bugs when multiple dragOver events fire before React re-renders.
  const handleDragStart = (idx: number) => {
    dragIdxRef.current = idx;
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    const fromIdx = dragIdxRef.current;
    if (fromIdx === null || fromIdx === targetIdx) return;

    dragIdxRef.current = targetIdx;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setDragIdx(targetIdx);
  };

  const handleDragEnd = () => {
    dragIdxRef.current = null;
    setDragIdx(null);
  };

  if (movies.length === 0) {
    return (
      <p className="text-sm text-foreground-muted py-4">
        No movies to vote on yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-muted">
        Drag or use arrows to rank movies. #1 is your top pick.
      </p>

      <div className="space-y-2">
        {order.map((key, idx) => {
          const movie = movieMap.get(key);
          if (!movie) return null;

          return (
            <div
              key={key}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 rounded-lg border p-3 cursor-grab active:cursor-grabbing transition-all ${
                dragIdx === idx
                  ? "border-accent-primary bg-accent-primary/10 scale-[1.02]"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              }`}
            >
              {/* Rank badge — click to set position */}
              {editingIdx === idx ? (
                <input
                  ref={editInputRef}
                  type="number"
                  min={1}
                  max={order.length}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleRankCommit(idx)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRankCommit(idx);
                    if (e.key === "Escape") setEditingIdx(null);
                  }}
                  className="h-8 w-8 shrink-0 rounded-full bg-white/10 text-center text-sm font-bold text-foreground-primary focus:outline-none focus:ring-2 focus:ring-accent-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              ) : (
                <button
                  onClick={() => handleRankClick(idx)}
                  title="Click to set position"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors hover:ring-2 hover:ring-accent-primary/50 ${
                    idx === 0
                      ? "bg-yellow-500/20 text-yellow-400"
                      : idx === 1
                        ? "bg-gray-300/20 text-gray-300"
                        : idx === 2
                          ? "bg-amber-600/20 text-amber-500"
                          : "bg-white/10 text-foreground-muted"
                  }`}
                >
                  {idx + 1}
                </button>
              )}

              {/* Poster */}
              <div className="h-12 w-8 shrink-0 overflow-hidden rounded bg-white/5">
                {movie.posterUrl ? (
                  <img
                    src={movie.posterUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground-primary truncate">
                  {movie.title}
                </p>
                {movie.year && (
                  <p className="text-xs text-foreground-muted">{movie.year}</p>
                )}
              </div>

              {/* Move buttons */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="rounded p-0.5 text-foreground-muted hover:text-foreground-primary disabled:opacity-20 transition-colors"
                  aria-label="Move up"
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
                      d="M4.5 15.75l7.5-7.5 7.5 7.5"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => moveDown(idx)}
                  disabled={idx === order.length - 1}
                  className="rounded p-0.5 text-foreground-muted hover:text-foreground-primary disabled:opacity-20 transition-colors"
                  aria-label="Move down"
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
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </button>
              </div>

              {/* Grip handle */}
              <svg
                className="h-5 w-5 shrink-0 text-foreground-muted/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => onSubmit(order)}
        disabled={isSubmitting || movies.length === 0}
        className="w-full rounded-md bg-accent-primary px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting
          ? "Submitting..."
          : hasExistingVote
            ? "Update Vote"
            : "Submit Vote"}
      </button>
    </div>
  );
}
