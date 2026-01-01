import { useState, useRef, useEffect } from "react";
import { Play, Plus, Check, Star, List, ExternalLink } from "lucide-react";
import type { WatchlistSource } from "~/lib/watchlist/types";
import { SourceBadge } from "./SourceBadge";
import { ListSelectorModal } from "./ListSelectorModal";
import { ProxiedImage } from "~/components/ui";

/**
 * Format a timestamp as MM/DD/YYYY date
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000); // Convert unix seconds to ms
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Abbreviate content ratings to prevent word wrap in tooltip
 */
function abbreviateRating(rating: string): string {
  const abbreviations: Record<string, string> = {
    "Not Rated": "NR",
    "Unrated": "NR",
    "TV-Y": "TV-Y",
    "TV-Y7": "TV-Y7",
    "TV-G": "TV-G",
    "TV-PG": "TV-PG",
    "TV-14": "TV-14",
    "TV-MA": "TV-MA",
    "Approved": "App",
    "Passed": "P",
  };
  return abbreviations[rating] || rating;
}

interface PosterCardProps {
  /** Poster image URL - should be vertical 2:3 aspect ratio */
  posterUrl: string;
  /** Optional logo image URL for TV shows */
  logoUrl?: string;
  title: string;
  year?: string;
  onClick?: () => void;
  onPlay?: () => void;
  /** Watch progress percentage (0-100) - renders progress bar when > 0 */
  progress?: number;
  /** Details for hover tooltip */
  details?: {
    backdropUrl?: string;
    releaseDate?: string;
    runtime?: string; // For movies: "2h 15m"
    seasons?: number; // For TV shows
    episodes?: number; // For TV shows
    rating?: string; // Content rating (e.g., "TV-MA", "PG-13")
    audienceRating?: string; // Audience score (e.g., "8.5")
    userRating?: string; // User's personal rating (e.g., "9.0")
    genres?: string[];
    directors?: string[];
    cast?: string[];
    summary?: string;
  };
  /** Handler when More Info is clicked in tooltip */
  onMoreInfo?: () => void;
  /** Hide the hover play button overlay (tooltip has its own play button) */
  hideHoverPlay?: boolean;
  /** Handler when Add to Watchlist is clicked */
  onAddToWatchlist?: () => void;
  /** Whether item is already in watchlist */
  isInWatchlist?: boolean;
  /** Number of times watched (viewCount > 0 = watched for movies) */
  viewCount?: number;
  /** Total episodes (TV shows only - used for watched calculation) */
  leafCount?: number;
  /** Watched episodes (TV shows only - used for watched calculation) */
  viewedLeafCount?: number;
  /** Context menu handler - called with mouse event position */
  onContextMenu?: (position: { x: number; y: number }) => void;
  /** User's Plex rating (0-10 scale) - used for interactive star display */
  rating?: number;
  /** TMDB/IMDB score (0-10 scale) - displayed as ★ 7.3 when sorting by score */
  score?: number;
  /** Watchlist sources this item belongs to (renders source badges) */
  watchlistSources?: WatchlistSource[];
  /** Unix timestamp (seconds) when item was added to watchlist */
  addedAt?: number;
  /** Whether item is available in local library (for watchlist availability indicator) */
  isAvailable?: boolean;
  /** Sort indicator shown on right side of subtitle (e.g., date, runtime) */
  sortIndicator?: string;
  /** Whether to show the interactive star rating (My Rating - only when sorting by userRating) */
  showRating?: boolean;
  /** Whether to show the score badge (★ 7.3 - only when sorting by score) */
  showScore?: boolean;
  /** Handler for rating change (makes stars interactive) */
  onRatingChange?: (rating: number) => void;
  /** Rating key for list operations (required for add to list functionality) */
  ratingKey?: string;
}

type TooltipPosition = "center" | "left" | "right";

/**
 * Vertical poster card with Netflix-style hover effects.
 *
 * Uses 2:3 aspect ratio (standard movie poster) with:
 * - Optional logo overlay for TV shows
 * - Hover tooltip with detailed information
 * - Scale and lift on hover
 */
export function PosterCard({
  posterUrl,
  logoUrl,
  title,
  year,
  onClick,
  onPlay,
  progress,
  details,
  hideHoverPlay = false,
  onAddToWatchlist,
  isInWatchlist = false,
  viewCount = 0,
  leafCount,
  viewedLeafCount,
  onContextMenu,
  rating,
  score,
  watchlistSources,
  addedAt,
  isAvailable,
  sortIndicator,
  showRating = false,
  showScore = false,
  onRatingChange,
  ratingKey,
}: PosterCardProps) {
  // For TV shows (leafCount defined), watched = all episodes watched
  // For movies (no leafCount), watched = viewCount > 0
  const isWatched = leafCount !== undefined && viewedLeafCount !== undefined
    ? (leafCount > 0 && viewedLeafCount >= leafCount)
    : viewCount > 0;
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>("center");
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [listSelectorPosition, setListSelectorPosition] = useState<{ x: number; y: number } | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Calculate tooltip position based on card position in viewport
  useEffect(() => {
    if (showTooltip && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const tooltipWidth = 320; // w-80 = 20rem = 320px
      const padding = 16;

      // Check if tooltip would overflow left edge
      if (rect.left < tooltipWidth / 2 + padding) {
        setTooltipPosition("left");
      }
      // Check if tooltip would overflow right edge
      else if (rect.right + tooltipWidth / 2 + padding > window.innerWidth) {
        setTooltipPosition("right");
      } else {
        setTooltipPosition("center");
      }
    }
  }, [showTooltip]);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 200); // Reduced to 200ms
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowTooltip(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.();
    }
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPlay?.();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onContextMenu) {
      e.preventDefault();
      onContextMenu({ x: e.clientX, y: e.clientY });
    }
  };

  const handleOpenListSelector = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (ratingKey) {
      setListSelectorPosition({ x: e.clientX, y: e.clientY });
    }
  };

  const handleCloseListSelector = () => {
    setListSelectorPosition(null);
  };

  // Tooltip positioning classes
  const tooltipPositionClasses = {
    center: "left-1/2 -translate-x-1/2",
    left: "left-0",
    right: "right-0",
  };

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      aria-label={`${title}${year ? `, ${year}` : ""}${isWatched ? " (watched)" : ""}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      className="group relative w-full cursor-pointer"
    >
      {/* Card container with poster aspect ratio - tooltip only triggers on poster hover */}
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-lg bg-background-elevated shadow-lg transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-[1.02] group-hover:shadow-xl group-hover:ring-2 group-hover:ring-white/30"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Poster image */}
        <ProxiedImage
          src={posterUrl}
          alt={title}
          className="h-full w-full"
          loading="lazy"
        />

        {/* Source badges (top-left corner, Plex-style) */}
        {watchlistSources && watchlistSources.length > 0 && (
          <SourceBadge sources={watchlistSources} className="absolute left-0 top-0 z-10" />
        )}

        {/* Badge (top-right corner) - checkmark for watched, count for unwatched */}
        {isWatched ? (
          <div className="absolute right-0 top-0 z-10 flex h-7 w-7 items-center justify-center rounded-bl-lg bg-black/70">
            <Check className="h-4 w-4 text-white" />
          </div>
        ) : leafCount !== undefined && leafCount > 0 ? (
          <div className="absolute right-0 top-0 z-10 flex h-7 min-w-7 items-center justify-center rounded-bl-lg bg-black/70 px-1.5">
            <span className="text-sm font-semibold text-white">{leafCount}</span>
          </div>
        ) : null}

        {/* Availability indicator (small dot with pulse animation, bottom-right on poster) */}
        {isAvailable !== undefined && (
          <div
            className={`absolute bottom-2 right-2 z-10 h-2.5 w-2.5 animate-pulse rounded-full shadow-sm ${
              isAvailable ? "bg-green-500" : "bg-red-500"
            }`}
            title={isAvailable ? "Available in library" : "Not in library"}
          />
        )}

        {/* Logo overlay for TV shows (bottom of poster) */}
        {logoUrl && (
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-16">
            <img
              src={logoUrl}
              alt={`${title} logo`}
              className="max-h-12 max-w-[80%] object-contain drop-shadow-lg"
              loading="lazy"
            />
          </div>
        )}

        {/* Progress bar for partially watched content */}
        {progress !== undefined && progress > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <div
              className="h-full bg-accent-primary transition-all duration-300"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        )}

        {/* Hover overlay with play button - hidden when tooltip has its own play */}
        {!hideHoverPlay && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <button
              onClick={handlePlayClick}
              className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition-transform duration-200 hover:scale-110"
              aria-label={`Play ${title}`}
            >
              <Play className="h-6 w-6 fill-current" />
            </button>
          </div>
        )}

        {/* External link overlay for items not in library (e.g., watchlist items) */}
        {hideHoverPlay && isAvailable === false && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
              <ExternalLink className="h-6 w-6" />
            </div>
          </div>
        )}
      </div>

      {/* Title and metadata below poster (no logo case) */}
      {!logoUrl && (
        <div className="mt-2 px-1">
          <h3 className="truncate text-sm font-medium text-foreground-primary">
            {title}
          </h3>
          {/* Plex-style subtitle: year + score (on same line) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-foreground-muted">
              <span>
                {addedAt
                  ? `Added ${formatDate(addedAt)}`
                  : year ?? ""}
              </span>
              {/* Score display inline with year when sorting by score */}
              {showScore && score !== undefined && score > 0 && (
                <span className="flex items-center gap-0.5 text-white">
                  <Star className="h-3 w-3 fill-white" />
                  {score.toFixed(1)}
                </span>
              )}
            </div>
            {sortIndicator && (
              <span className="text-xs text-foreground-secondary">{sortIndicator}</span>
            )}
          </div>
          {/* Star rating display (Plex-style with half-star support) - only show when showRating is true */}
          {showRating && (
            <div
              className="mt-1 flex items-center gap-0.5"
              onMouseLeave={() => setHoveredRating(null)}
            >
              {[1, 2, 3, 4, 5].map((star) => {
                const fullRatingValue = star * 2;
                const halfRatingValue = star * 2 - 1;
                const displayRating = hoveredRating ?? rating ?? 0;
                const filled = displayRating >= fullRatingValue;
                const halfFilled = !filled && displayRating >= halfRatingValue;
                const isHoveredFull = hoveredRating !== null && fullRatingValue <= hoveredRating;
                const isHoveredHalf = hoveredRating !== null && halfRatingValue <= hoveredRating && !isHoveredFull;
                const useMangoColor = displayRating >= 6;
                return (
                  <div key={star} className="relative h-3.5 w-3.5">
                    {/* Half-star click zone (left half) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRatingChange?.(halfRatingValue);
                      }}
                      onMouseEnter={() => setHoveredRating(halfRatingValue)}
                      className="absolute left-0 top-0 z-10 h-full w-1/2 cursor-pointer"
                      aria-label={`Rate ${star - 0.5} stars`}
                    />
                    {/* Full-star click zone (right half) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRatingChange?.(fullRatingValue);
                      }}
                      onMouseEnter={() => setHoveredRating(fullRatingValue)}
                      className="absolute right-0 top-0 z-10 h-full w-1/2 cursor-pointer"
                      aria-label={`Rate ${star} stars`}
                    />
                    {/* Star icon */}
                    <Star
                      className={`h-3.5 w-3.5 transition-colors ${
                        isHoveredFull || filled
                          ? useMangoColor || isHoveredFull
                            ? "fill-mango text-mango"
                            : "fill-foreground-muted text-foreground-muted"
                          : isHoveredHalf || halfFilled
                          ? useMangoColor || isHoveredHalf
                            ? "fill-mango/50 text-mango"
                            : "fill-foreground-muted/50 text-foreground-muted"
                          : "text-foreground-muted/30"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Hover Tooltip */}
      {showTooltip && details && (
        <div
          className={`absolute top-0 z-50 w-80 -translate-y-2 animate-fadeIn ${tooltipPositionClasses[tooltipPosition]}`}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={handleMouseLeave}
        >
          <div className="overflow-hidden rounded-xl bg-background-elevated shadow-2xl ring-1 ring-white/20">
            {/* Backdrop image */}
            {details.backdropUrl && (
              <div className="relative h-40 overflow-hidden">
                <img
                  src={details.backdropUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background-elevated via-background-elevated/60 to-transparent" />

                {/* Logo on backdrop */}
                {logoUrl && (
                  <div className="absolute bottom-4 left-4">
                    <img
                      src={logoUrl}
                      alt={title}
                      className="max-h-10 max-w-[60%] object-contain drop-shadow-lg"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Content */}
            <div className="p-4">
              {/* Title (if no logo) */}
              {!logoUrl && (
                <h4 className="mb-2 text-lg font-semibold text-foreground-primary">
                  {title}
                </h4>
              )}

              {/* Action buttons */}
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={handlePlayClick}
                  className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Play
                </button>
                {/* Spacer to push buttons to right */}
                <div className="ml-auto flex items-center gap-2">
                  {/* Add to Playlist button */}
                  {ratingKey && (
                    <button
                      onClick={handleOpenListSelector}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
                      aria-label="Add to Playlist"
                      title="Add to Playlist"
                    >
                      <List className="h-5 w-5" />
                    </button>
                  )}
                  {/* Watchlist toggle button */}
                  {onAddToWatchlist && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToWatchlist();
                      }}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                        isInWatchlist
                          ? "bg-accent-primary text-black"
                          : "bg-mango text-black hover:bg-mango-hover"
                      }`}
                      aria-label={isInWatchlist ? "In Watchlist" : "Add to Watchlist"}
                      title={isInWatchlist ? "In Watchlist" : "Add to Watchlist"}
                    >
                      {isInWatchlist ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <Plus className="h-5 w-5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Metadata row - release date, runtime, content rating */}
              <div className="mb-1 flex items-center gap-x-1.5 text-sm text-foreground-secondary">
                {details.releaseDate && (
                  <span className="whitespace-nowrap">{details.releaseDate}</span>
                )}
                {details.runtime && (
                  <>
                    <span className="text-foreground-muted">•</span>
                    <span className="whitespace-nowrap">{details.runtime}</span>
                  </>
                )}
                {details.rating && (
                  <>
                    <span className="text-foreground-muted">•</span>
                    <span className="whitespace-nowrap rounded bg-white/10 px-1 py-0.5 text-xs">
                      {abbreviateRating(details.rating)}
                    </span>
                  </>
                )}
              </div>

              {/* Ratings row - Score (IMDb) and Rating (user's Plex rating) */}
              {(details.audienceRating || details.userRating) && (
                <div className="mb-2 flex items-center gap-x-4 text-sm">
                  {details.audienceRating && (
                    <span className="flex items-center gap-1.5 text-white">
                      <Star className="h-3.5 w-3.5 fill-white text-white" />
                      <span>{details.audienceRating}</span>
                      <span className="text-foreground-muted text-xs">Score</span>
                    </span>
                  )}
                  {details.userRating && (
                    <span className="flex items-center gap-1.5 text-mango">
                      <Star className="h-3.5 w-3.5 fill-mango text-mango" />
                      <span>{details.userRating}</span>
                      <span className="text-foreground-muted text-xs">Rating</span>
                    </span>
                  )}
                </div>
              )}

              {/* Genres */}
              {details.genres && details.genres.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {details.genres.slice(0, 3).map((genre) => (
                    <span
                      key={genre}
                      className="rounded bg-white/10 px-2 py-0.5 text-xs text-foreground-secondary"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {/* Directors/Creators */}
              {details.directors && details.directors.length > 0 && (
                <p className="mb-1 text-xs text-foreground-muted">
                  <span className="text-foreground-secondary">Director: </span>
                  {details.directors.slice(0, 2).join(", ")}
                </p>
              )}

              {/* Cast */}
              {details.cast && details.cast.length > 0 && (
                <p className="mb-2 text-xs text-foreground-muted">
                  <span className="text-foreground-secondary">Starring: </span>
                  {details.cast.slice(0, 3).join(", ")}
                </p>
              )}

              {/* Summary - show full text unless excessively long */}
              {details.summary && (
                <p className="max-h-32 overflow-y-auto text-xs text-foreground-secondary">
                  {details.summary}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* List Selector Modal */}
      {listSelectorPosition && ratingKey && (
        <ListSelectorModal
          itemRatingKey={ratingKey}
          itemTitle={title}
          position={listSelectorPosition}
          onClose={handleCloseListSelector}
        />
      )}
    </div>
  );
}
