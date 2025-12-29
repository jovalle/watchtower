import { useState, useEffect } from "react";
import { Play, Plus, Check, Star, X } from "lucide-react";

interface MediaCardProps {
  /** Thumbnail URL - should be landscape/backdrop image for horizontal cards */
  imageUrl: string;
  title: string;
  year?: string;
  badge?: string;
  progress?: number; // 0-100, optional watch progress
  onClick?: () => void;
  onPlay?: () => void;
  /** If true, card fills its container width (for grid layouts) */
  fullWidth?: boolean;
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
  /** Optional logo URL to display instead of text title */
  logoUrl?: string;
  /** Plex audience rating (0-10 scale) */
  rating?: number;
  /** Handler for removing from Continue Watching */
  onRemove?: () => void;
  /** If true, always show progress bar even when progress is 0 */
  showProgressBar?: boolean;
}

/**
 * Horizontal media card with Netflix-style hover effects.
 *
 * Uses 2:1 aspect ratio (landscape) with:
 * - Ring border that intensifies on hover
 * - Subtle scale and lift on hover
 * - Gradient overlay with title reveal
 * - Optional progress bar for continue watching
 */
export function MediaCard({
  imageUrl,
  title,
  year,
  badge,
  progress,
  onClick,
  onPlay,
  fullWidth = false,
  onAddToWatchlist,
  isInWatchlist = false,
  viewCount = 0,
  leafCount,
  viewedLeafCount,
  onContextMenu,
  logoUrl,
  rating,
  onRemove,
  showProgressBar = false,
}: MediaCardProps) {
  // For TV shows (leafCount defined), watched = all episodes watched
  // For movies (no leafCount), watched = viewCount > 0
  const isWatched = leafCount !== undefined && viewedLeafCount !== undefined
    ? (leafCount > 0 && viewedLeafCount >= leafCount)
    : viewCount > 0;

  // State for remove confirmation
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  // State for logo loading - only show logo if it loads successfully
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Reset logo state when logoUrl changes
  useEffect(() => {
    if (logoUrl) {
      setLogoLoaded(false);
      setLogoError(false);
    }
  }, [logoUrl]);

  // Reset confirmation when mouse leaves the card
  useEffect(() => {
    if (showRemoveConfirm) {
      const timeout = setTimeout(() => setShowRemoveConfirm(false), 3000);
      return () => clearTimeout(timeout);
    }
  }, [showRemoveConfirm]);

  // Determine if we should show the logo (has URL, loaded successfully, no error)
  const showLogo = logoUrl && logoLoaded && !logoError;

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

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${title}${year ? `, ${year}` : ""}${isWatched ? " (watched)" : ""}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
      onMouseLeave={() => setShowRemoveConfirm(false)}
      className={`group relative cursor-pointer origin-center will-change-transform transition-transform duration-200 ease-out hover:z-10 hover:scale-105 focus:z-10 focus:scale-105 ${
        fullWidth
          ? "w-full"
          : "w-[280px] flex-shrink-0 md:w-[340px] lg:w-[400px]"
      }`}
    >
      {/* Card container with aspect ratio */}
      <div
        className="relative aspect-[2/1] overflow-hidden rounded-xl bg-background-elevated shadow-lg transition-[box-shadow,ring-color] duration-200 ease-out group-hover:shadow-2xl group-hover:ring-2 group-hover:ring-white/50 group-focus:shadow-2xl group-focus:ring-2 group-focus:ring-accent-primary"
      >
        {/* Thumbnail image */}
        <img
          src={imageUrl}
          alt={title}
          className="h-full w-full object-cover"
          loading="lazy"
        />

        {/* Season/Episode badge (top-left corner, large - e.g., "S2 E5") */}
        {badge && (
          <div className="absolute left-0 top-0 z-10 flex h-8 min-w-16 items-center justify-center rounded-br-lg bg-black/70 px-2">
            <span className="text-sm font-semibold text-white">{badge}</span>
          </div>
        )}

        {/* Score badge (hidden when logo is present to avoid overlap) */}
        {rating !== undefined && rating > 0 && !showLogo && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5">
            <Star className="h-3 w-3 fill-white text-white" />
            <span className="text-xs font-medium text-white">{rating.toFixed(1)}</span>
          </div>
        )}

        {/* Badge (top-right corner) - checkmark for watched, count for unwatched TV */}
        {/* Don't show on Continue Watching cards (when badge prop is set) */}
        {!badge && (isWatched ? (
          <div className="absolute right-0 top-0 z-10 flex h-7 w-7 items-center justify-center rounded-bl-lg bg-black/70">
            <Check className="h-4 w-4 text-white" />
          </div>
        ) : leafCount !== undefined && leafCount > 0 ? (
          <div className="absolute right-0 top-0 z-10 flex h-7 min-w-7 items-center justify-center rounded-bl-lg bg-black/70 px-1.5">
            <span className="text-sm font-semibold text-white">{leafCount}</span>
          </div>
        ) : null)}

        {/* Gradient overlay - always visible when no logo, hover-only when logo present */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity duration-300 ${
          showLogo ? "opacity-0 group-hover:opacity-100 group-focus:opacity-100" : "opacity-100"
        }`} />

        {/* Hidden image to preload logo and detect errors */}
        {logoUrl && !logoLoaded && !logoError && (
          <img
            src={logoUrl}
            alt=""
            className="hidden"
            onLoad={() => setLogoLoaded(true)}
            onError={() => setLogoError(true)}
          />
        )}

        {/* Logo overlay with gradient backdrop (bottom-left, Flixor style) */}
        {showLogo && (
          <>
            {/* Gradient for logo readability */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />
            <div className={`absolute left-3 max-w-[70%] pointer-events-none ${progress ? "bottom-5" : "bottom-3"}`}>
              <img
                src={logoUrl}
                alt={`${title} logo`}
                className="h-auto max-h-12 w-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                loading="lazy"
              />
            </div>
          </>
        )}

        {/* Always-visible text title when no logo (Netflix style) */}
        {!showLogo && (
          <div className={`absolute left-3 right-3 pointer-events-none ${progress ? "bottom-5" : "bottom-3"}`}>
            <h3 className="line-clamp-2 text-base font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {title}
            </h3>
            {year && (
              <span className="text-sm text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{year}</span>
            )}
          </div>
        )}

        {/* Hover content - action buttons only (title now always visible) */}
        <div className="absolute inset-0 flex items-end justify-end p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus:opacity-100">

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Remove from Continue Watching button with confirmation */}
            {onRemove && (
              <div
                className={`pointer-events-auto flex items-center overflow-hidden rounded-full transition-all duration-200 ${
                  showRemoveConfirm
                    ? "bg-red-600 pl-3 pr-1"
                    : "bg-red-600/90 hover:bg-red-500"
                }`}
              >
                {showRemoveConfirm ? (
                  <>
                    <span className="mr-2 whitespace-nowrap text-xs font-medium text-white">
                      Remove?
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                        setShowRemoveConfirm(false);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-red-600 transition-transform duration-200 hover:scale-110"
                      aria-label="Confirm removal"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowRemoveConfirm(true);
                    }}
                    className="flex h-9 w-9 items-center justify-center text-white transition-transform duration-200 hover:scale-110"
                    aria-label="Remove from Continue Watching"
                    title="Remove from Continue Watching"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {/* Add to Watchlist button */}
            {onAddToWatchlist && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToWatchlist();
                }}
                className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full transition-transform duration-200 hover:scale-110 ${
                  isInWatchlist
                    ? "bg-accent-primary text-black"
                    : "bg-mango-hover text-black hover:bg-mango-hover"
                }`}
                aria-label={isInWatchlist ? "In Watchlist" : "Add to Watchlist"}
                title={isInWatchlist ? "In Watchlist" : "Add to Watchlist"}
              >
                {isInWatchlist ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </button>
            )}

            {/* Play button */}
            <button
              onClick={handlePlayClick}
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-transform duration-200 hover:scale-110"
              aria-label={`Play ${title}`}
            >
              <Play className="h-4 w-4 fill-current" />
            </button>
          </div>
        </div>

        {/* Progress bar (for continue watching) - always show when showProgressBar is true */}
        {/* Minimum 2% fill ensures the bar is visible even at 0% to account for rounded corners */}
        {(showProgressBar || (progress !== undefined && progress > 0)) && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/50 rounded-b-lg overflow-hidden">
            <div
              className="h-full bg-accent-primary transition-all duration-300 rounded-bl-lg"
              style={{ width: `${Math.min(100, Math.max(2, progress ?? 0))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
