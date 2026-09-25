import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";

export interface NextEpisode {
  ratingKey: string;
  title: string;
  label: string;
  thumbUrl?: string;
}

interface NextEpisodeCardProps {
  episode: NextEpisode;
  seconds?: number;
  autoPlay?: boolean;
  onPlay: () => void;
  onCancel: () => void;
}

export function NextEpisodeCard({
  episode,
  seconds = 10,
  autoPlay = true,
  onPlay,
  onCancel,
}: NextEpisodeCardProps) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (!autoPlay) return;
    if (remaining <= 0) {
      onPlay();
      return;
    }
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onPlay, autoPlay]);

  return (
    <div className="absolute bottom-28 right-4 z-40 w-80 overflow-hidden rounded-lg bg-black/90 shadow-2xl ring-1 ring-white/20">
      <div className="relative aspect-video bg-white/5">
        {episode.thumbUrl && (
          <img
            src={episode.thumbUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
        <button
          onClick={onCancel}
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
          aria-label="Cancel next episode"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3">
        <p className="text-xs uppercase tracking-wide text-white/50">
          Next episode · {episode.label}
        </p>
        <p className="mt-0.5 truncate text-sm font-medium text-white">
          {episode.title}
        </p>
        <button
          onClick={onPlay}
          className="relative mt-3 flex min-h-11 w-full items-center justify-center gap-2 overflow-hidden rounded bg-white/20 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/30"
        >
          <span
            className="absolute inset-y-0 left-0 bg-mango/60 transition-[width] duration-1000 ease-linear"
            style={{ width: `${autoPlay && seconds > 0 ? ((seconds - remaining) / seconds) * 100 : 0}%` }}
          />
          <Play className="relative h-4 w-4" fill="currentColor" />
          <span className="relative">{autoPlay ? `Play in ${remaining}s` : "Play next episode"}</span>
        </button>
      </div>
    </div>
  );
}
