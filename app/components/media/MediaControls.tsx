import { Play, Bookmark, Check, Pencil, MoreHorizontal, Star } from "lucide-react";

interface MediaControlsProps {
  /** Primary action - Play/Resume */
  onPlay: () => void;
  /** Label for primary button */
  playLabel?: string;
  /** Whether to show the bookmark (watchlist) button */
  showBookmark?: boolean;
  /** Whether item is bookmarked */
  isBookmarked?: boolean;
  /** Handler for bookmark toggle */
  onBookmarkToggle?: () => void;
  /** Whether to show the watched button */
  showWatched?: boolean;
  /** Whether item is watched */
  isWatched?: boolean;
  /** Handler for watched toggle */
  onWatchedToggle?: () => void;
  /** Whether to show the edit button */
  showEdit?: boolean;
  /** Handler for edit */
  onEdit?: () => void;
  /** Whether to show more options */
  showMore?: boolean;
  /** Handler for more options */
  onMore?: () => void;
  /** User rating (0-10 scale) for star display */
  userRating?: number;
  /** Handler for rating change */
  onRatingChange?: (rating: number) => void;
}

/**
 * Plex-style media controls with icon buttons.
 * Shows primary play button and secondary icon actions.
 */
export function MediaControls({
  onPlay,
  playLabel = "Play",
  showBookmark = true,
  isBookmarked = false,
  onBookmarkToggle,
  showWatched = true,
  isWatched = false,
  onWatchedToggle,
  showEdit = false,
  onEdit,
  showMore = true,
  onMore,
  userRating,
  onRatingChange,
}: MediaControlsProps) {
  // Icon button base styles
  const iconButtonClass =
    "flex h-10 w-10 items-center justify-center rounded-full border border-foreground-muted/30 text-foreground-secondary transition-colors hover:border-foreground-muted hover:text-foreground-primary";
  const iconButtonActiveClass =
    "flex h-10 w-10 items-center justify-center rounded-full bg-foreground-primary text-background-base transition-colors hover:bg-foreground-primary/90";

  return (
    <div className="flex flex-col gap-4">
      {/* Star rating (editable) */}
      {onRatingChange !== undefined && (
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => {
            const ratingValue = star * 2;
            const filled = userRating !== undefined && userRating >= ratingValue;
            const halfFilled = !filled && userRating !== undefined && userRating >= ratingValue - 1;
            return (
              <button
                key={star}
                onClick={() => onRatingChange(ratingValue)}
                className="group p-0.5 transition-transform hover:scale-110"
                aria-label={`Rate ${star} stars`}
              >
                <Star
                  className={`h-5 w-5 transition-colors ${
                    filled
                      ? "fill-mango text-mango"
                      : halfFilled
                      ? "fill-mango/50 text-mango"
                      : "text-foreground-muted/50 group-hover:text-mango/50"
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Control buttons */}
      <div className="flex items-center gap-3">
        {/* Primary play button */}
        <button
          onClick={onPlay}
          className="flex items-center gap-2 rounded-full bg-mango px-6 py-2.5 font-medium text-black transition-colors hover:bg-mango-hover"
        >
          <Play className="h-5 w-5 fill-current" />
          {playLabel}
        </button>

        {/* Bookmark/Watchlist button */}
        {showBookmark && onBookmarkToggle && (
          <button
            onClick={onBookmarkToggle}
            className={isBookmarked ? iconButtonActiveClass : iconButtonClass}
            aria-label={isBookmarked ? "Remove from Watchlist" : "Add to Watchlist"}
            title={isBookmarked ? "Remove from Watchlist" : "Add to Watchlist"}
          >
            <Bookmark className={`h-5 w-5 ${isBookmarked ? "fill-current" : ""}`} />
          </button>
        )}

        {/* Watched toggle button */}
        {showWatched && onWatchedToggle && (
          <button
            onClick={onWatchedToggle}
            className={isWatched ? iconButtonActiveClass : iconButtonClass}
            aria-label={isWatched ? "Mark as Unwatched" : "Mark as Watched"}
            title={isWatched ? "Mark as Unwatched" : "Mark as Watched"}
          >
            <Check className="h-5 w-5" />
          </button>
        )}

        {/* Edit button */}
        {showEdit && onEdit && (
          <button
            onClick={onEdit}
            className={iconButtonClass}
            aria-label="Edit"
            title="Edit"
          >
            <Pencil className="h-5 w-5" />
          </button>
        )}

        {/* More options button */}
        {showMore && onMore && (
          <button
            onClick={onMore}
            className={iconButtonClass}
            aria-label="More options"
            title="More options"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
