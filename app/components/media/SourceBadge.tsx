/**
 * Source badge component for watchlist items.
 * Shows which watchlist sources an item belongs to using Plex-style badges.
 */

import type { WatchlistSource } from "~/lib/watchlist/types";

interface SourceBadgeProps {
  sources: WatchlistSource[];
  className?: string;
}

const SOURCE_CONFIG: Record<
  WatchlistSource,
  { textColor: string; label: string; title: string }
> = {
  plex: {
    textColor: "text-mango",
    label: "P",
    title: "Plex Watchlist",
  },
  trakt: {
    textColor: "text-red-500",
    label: "T",
    title: "Trakt Watchlist",
  },
  imdb: {
    textColor: "text-yellow-400",
    label: "I",
    title: "IMDB Watchlist",
  },
};

/**
 * Displays source badges for watchlist items using Plex-style design.
 * Dark background with colored text, positioned at top-left corner.
 */
export function SourceBadge({ sources, className = "" }: SourceBadgeProps) {
  if (!sources || sources.length === 0) {
    return null;
  }

  const combinedTitle = sources.map((s) => SOURCE_CONFIG[s].title).join(", ");

  return (
    <div
      className={`flex h-8 min-w-8 items-center justify-center rounded-br-lg bg-black/70 px-1.5 ${className}`}
      title={combinedTitle}
    >
      {sources.map((source) => {
        const config = SOURCE_CONFIG[source];
        return (
          <span
            key={source}
            className={`text-sm font-semibold ${config.textColor}`}
          >
            {config.label}
          </span>
        );
      })}
    </div>
  );
}
