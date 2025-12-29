import { Play, Info } from "lucide-react";
import { Typography, Button } from "~/components/ui";

interface BillboardProps {
  backdropUrl: string;
  title: string;
  description?: string;
  year?: string;
  rating?: string;
  duration?: string;
  logoUrl?: string;
  onPlay?: () => void;
  onMoreInfo?: () => void;
  /** Handler when mouse enters billboard (for pausing transitions) */
  onMouseEnter?: () => void;
  /** Handler when mouse leaves billboard (for resuming transitions) */
  onMouseLeave?: () => void;
}

export function Billboard({
  backdropUrl,
  title,
  description,
  year,
  rating,
  duration,
  logoUrl,
  onPlay,
  onMoreInfo,
  onMouseEnter,
  onMouseLeave,
}: BillboardProps) {
  const hasMetadata = year || rating || duration;

  return (
    <div
      className="relative h-[70vh] min-h-[500px] w-full overflow-hidden"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Backdrop image */}
      <div className="absolute inset-0 animate-fadeIn">
        <img
          src={backdropUrl}
          alt={title}
          className="h-full w-full object-cover object-center"
        />
      </div>

      {/* Gradient overlays for cinematic effect */}
      {/* Overall darkening */}
      <div className="absolute inset-0 bg-black/20" />
      {/* Left vignette for text readability */}
      <div className="absolute inset-0 bg-gradient-to-r from-background-primary/80 via-transparent to-transparent" />
      {/* Bottom fade to background */}
      <div className="absolute inset-0 bg-gradient-to-t from-background-primary via-background-primary/40 to-transparent" />

      {/* Content container - matches Container component centering on ultrawide */}
      <div className="absolute inset-x-0 bottom-24">
        <div className="mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl animate-slideUp">
        {/* Logo or title */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={title}
            className="mb-4 h-auto max-w-[400px]"
          />
        ) : (
          <Typography variant="hero" className="mb-4">
            {title}
          </Typography>
        )}

        {/* Metadata row */}
        {hasMetadata && (
          <div className="mb-4 flex items-center gap-3">
            {year && (
              <Typography variant="caption" as="span">
                {year}
              </Typography>
            )}
            {rating && (
              <span className="rounded bg-white/10 px-2 py-0.5 text-sm text-foreground-secondary">
                {rating}
              </span>
            )}
            {duration && (
              <Typography variant="caption" as="span">
                {duration}
              </Typography>
            )}
          </div>
        )}

        {/* Description */}
        {description && (
          <Typography variant="body" className="mb-6 line-clamp-3">
            {description}
          </Typography>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <Button variant="primary" size="lg" onClick={onPlay}>
            <Play className="mr-2 h-5 w-5 fill-current" />
            Play
          </Button>
          <Button variant="secondary-light" size="lg" onClick={onMoreInfo}>
            <Info className="mr-2 h-5 w-5" />
            More Info
          </Button>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}
