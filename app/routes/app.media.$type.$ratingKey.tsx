/**
 * Media detail page - displays full metadata for movies, TV shows, seasons, and episodes.
 * GET /app/media/:type/:ratingKey
 *
 * Supports hierarchical navigation:
 * - Movies: standalone detail page
 * - Shows: displays seasons and episodes
 * - Seasons: shows episode list with breadcrumb to show
 * - Episodes: shows episode details with breadcrumb to show > season
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useNavigate } from "@remix-run/react";
import { Play, Plus, Check, Star, Clock, Calendar, ExternalLink, ChevronRight, HardDrive, Volume2, Subtitles, RotateCcw } from "lucide-react";
import { Container } from "~/components/layout";
import { CastRow, MediaCard, MediaRow } from "~/components/media";
import { Typography, Button } from "~/components/ui";
import { requireServerToken, requirePlexToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";
import { createTMDBClient } from "~/lib/tmdb/client.server";
import { createOMDbClient } from "~/lib/omdb/client.server";
import type { PlexMediaItem, PlexMetadata, PlexRole } from "~/lib/plex/types";
import type { TMDBRecommendation } from "~/lib/tmdb/types";

interface SeasonView {
  ratingKey: string;
  title: string;
  index: number;
  leafCount: number;
  viewedLeafCount: number;
  thumb: string;
}

interface EpisodeView {
  ratingKey: string;
  title: string;
  index: number;
  seasonIndex: number;
  duration: string | null;
  thumb: string;
  summary?: string;
  viewCount: number;
  viewOffset?: number;
}

// Breadcrumb navigation item
interface BreadcrumbItem {
  label: string;
  href: string;
}

// On Deck info (resume episode)
interface OnDeckInfo {
  seasonIndex: number;
  episodeIndex: number;
  episodeTitle: string;
  episodeRatingKey: string;
  viewOffset?: number; // Resume position in milliseconds
}

interface LoaderData {
  metadata: PlexMetadata;
  backdropUrl: string;
  posterUrl: string;
  year: string | null;
  duration: string | null;
  contentRating: string | null;
  criticRating: string | null;
  audienceRating: string | null;
  userRating: string | null;
  lastRatedAt?: number; // Unix timestamp when user last rated this item
  isAudienceFromPlex: boolean; // True if audienceRating is from Plex (fallback), false if from OMDb
  externalRatings: {
    imdb?: { rating: string; votes: string };
    rottenTomatoes?: { rating: string };
    metacritic?: { rating: string };
  } | null;
  plexAudienceRating: string | null; // Original Plex audience rating for tooltip display
  genres: string[];
  directors: string[];
  writers: string[];
  studio: string | null;
  cast: PlexRole[];
  similar: Array<{
    ratingKey: string;
    title: string;
    posterUrl: string;
    type: string;
  }>;
  recommendations: TMDBRecommendation[];
  serverUrl: string;
  token: string;
  type: "movie" | "show" | "season" | "episode";
  viewOffset?: number; // Resume position in milliseconds
  viewCount: number; // Number of times watched
  leafCount?: number; // Total episodes (TV shows/seasons only)
  viewedLeafCount?: number; // Watched episodes (TV shows/seasons only)
  isInWatchlist: boolean; // Whether item is in user's watchlist
  // TV show specific data
  seasons?: SeasonView[];
  episodes?: EpisodeView[]; // Episodes for the selected season
  initialSeasonIndex?: number; // The initially selected season index
  onDeck?: OnDeckInfo; // Next episode to watch/resume
  // Hierarchy navigation (for seasons and episodes)
  breadcrumbs: BreadcrumbItem[];
  // Parent info for context
  showTitle?: string; // For seasons and episodes
  showRatingKey?: string; // For seasons and episodes
  showPosterUrl?: string; // For seasons and episodes
  seasonTitle?: string; // For episodes
  seasonRatingKey?: string; // For episodes
  seasonIndex?: number; // For episodes (and seasons)
  episodeIndex?: number; // For episodes
  // Episode-specific data
  originallyAired?: string; // Air date for episodes
  // External IDs for linking
  tmdbId?: number;
  imdbId?: string;
  // Media file info (ISS-012: Feature parity with Plex)
  mediaInfo?: {
    resolution?: string; // e.g., "1080p", "4K"
    videoCodec?: string; // e.g., "H.264", "HEVC"
    audioCodec?: string; // e.g., "AAC", "AC3"
    audioChannels?: string; // e.g., "5.1", "Stereo"
    container?: string; // e.g., "MKV", "MP4"
    fileSize?: string; // e.g., "4.2 GB"
    bitrate?: string; // e.g., "8.5 Mbps"
  };
  // Available streams for selection
  videoStreams?: Array<{
    id: number;
    displayTitle: string;
    resolution?: string;
    codec?: string;
    selected?: boolean;
  }>;
  audioStreams?: Array<{
    id: number;
    displayTitle: string;
    language?: string;
    channels?: string;
    codec?: string;
    selected?: boolean;
  }>;
  subtitleStreams?: Array<{
    id: number;
    displayTitle: string;
    language?: string;
    codec?: string;
    selected?: boolean;
  }>;
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = data?.metadata?.title ?? "Media Details";
  return [
    { title: `${title} | Watchtower` },
    { name: "description", content: data?.metadata?.summary ?? "" },
  ];
};

// Use shared image URL helpers with proper sizing
import { buildPosterUrl, buildBackdropUrl, buildPlexImageUrl } from "~/lib/plex/images";

function formatRuntime(durationMs?: number): string | null {
  if (!durationMs) return null;
  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${remainingMinutes}m`;
}

function formatRating(rating?: number): string | null {
  if (rating === undefined || rating === null) return null;
  return rating.toFixed(1);
}

/**
 * Parse a Rotten Tomatoes rating string (e.g., "95%") to a 0-10 scale number.
 */
function parseRTRating(rating: string): number | null {
  const match = rating.match(/^(\d+)%$/);
  if (match) {
    return parseInt(match[1], 10) / 10;
  }
  return null;
}

/**
 * Parse a Metacritic rating string (e.g., "85/100") to a 0-10 scale number.
 */
function parseMetacriticRating(rating: string): number | null {
  const match = rating.match(/^(\d+)\/100$/);
  if (match) {
    return parseInt(match[1], 10) / 10;
  }
  return null;
}

/**
 * Extract critic rating from OMDb data as an average of all available sources.
 * Averages Rotten Tomatoes and Metacritic scores, converting to 10-scale.
 * @param externalRatings - OMDb ratings data
 * @returns Rating as string (e.g., "9.5") or null if not available
 */
function getOMDbCriticRating(externalRatings: ExternalRatings | null): string | null {
  if (!externalRatings) return null;

  const scores: number[] = [];

  // Parse Rotten Tomatoes (format: "95%")
  if (externalRatings.rottenTomatoes?.rating) {
    const rtScore = parseRTRating(externalRatings.rottenTomatoes.rating);
    if (rtScore !== null) scores.push(rtScore);
  }

  // Parse Metacritic (format: "85/100")
  if (externalRatings.metacritic?.rating) {
    const mcScore = parseMetacriticRating(externalRatings.metacritic.rating);
    if (mcScore !== null) scores.push(mcScore);
  }

  if (scores.length === 0) return null;

  const average = scores.reduce((a, b) => a + b, 0) / scores.length;
  return average.toFixed(1);
}

/**
 * Extract audience rating from OMDb data as an average of available sources.
 * Currently uses IMDb rating. Falls back to Plex audienceRating if no OMDb data.
 * @param externalRatings - OMDb ratings data
 * @param plexAudienceRating - Plex audience rating as fallback
 * @returns Rating as string (e.g., "8.2") or null if not available
 */
function getOMDbAudienceRating(
  externalRatings: ExternalRatings | null,
  plexAudienceRating?: number
): string | null {
  const scores: number[] = [];

  // Parse IMDb rating (format: "8.2")
  if (externalRatings?.imdb?.rating) {
    const imdbScore = parseFloat(externalRatings.imdb.rating);
    if (!isNaN(imdbScore)) scores.push(imdbScore);
  }

  // If we have OMDb scores, use their average
  if (scores.length > 0) {
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    return average.toFixed(1);
  }

  // Fall back to Plex audience rating
  if (plexAudienceRating !== undefined && plexAudienceRating !== null) {
    return plexAudienceRating.toFixed(1);
  }

  return null;
}

type RatingType = "critic" | "audience" | "user";

interface ExternalRatings {
  imdb?: { rating: string; votes: string };
  rottenTomatoes?: { rating: string };
  metacritic?: { rating: string };
}

interface RatingBadgeProps {
  type: RatingType;
  value: string;
  externalRatings?: ExternalRatings | null;
  lastRatedAt?: number; // For user rating: when they rated it
  isAudienceFromPlex?: boolean; // For audience rating: true if using Plex fallback
  plexAudienceRating?: string | null; // Original Plex rating for tooltip
}

const RATING_CONFIG: Record<RatingType, { color: string; title: string }> = {
  critic: {
    color: "fill-red-500 text-red-500",
    title: "Critic Scores",
  },
  audience: {
    color: "fill-orange-400 text-orange-400",
    title: "Audience Scores",
  },
  user: {
    color: "fill-yellow-400 text-yellow-400",
    title: "Your Rating",
  },
};

function formatVotes(votes: string): string {
  const num = parseInt(votes, 10);
  if (isNaN(num)) return votes;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return votes;
}

function RatingBadge({ type, value, externalRatings, lastRatedAt, isAudienceFromPlex, plexAudienceRating }: RatingBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const config = RATING_CONFIG[type];

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (
        badgeRef.current &&
        !badgeRef.current.contains(target) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // Format the lastRatedAt timestamp
  const formatRatedDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Build tooltip content based on type
  const renderTooltipContent = () => {
    if (type === "user") {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground-secondary">Your Rating</span>
            <span className="font-medium text-foreground-primary">{value}/10</span>
          </div>
          {lastRatedAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground-secondary">Rated</span>
              <span className="text-sm text-foreground-muted">{formatRatedDate(lastRatedAt)}</span>
            </div>
          )}
          <p className="mt-2 text-xs text-foreground-muted">
            Your personal rating set in Plex.
          </p>
        </div>
      );
    }

    if (type === "critic") {
      const hasRatings = externalRatings?.rottenTomatoes || externalRatings?.metacritic;
      return (
        <div className="space-y-2">
          {hasRatings ? (
            <>
              <div className="space-y-1.5">
                {externalRatings?.rottenTomatoes && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground-secondary">Rotten Tomatoes</span>
                    <span className="font-medium text-foreground-primary">{externalRatings.rottenTomatoes.rating}</span>
                  </div>
                )}
                {externalRatings?.metacritic && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground-secondary">Metacritic</span>
                    <span className="font-medium text-foreground-primary">{externalRatings.metacritic.rating}</span>
                  </div>
                )}
              </div>
              {externalRatings?.rottenTomatoes && externalRatings?.metacritic && (
                <div className="border-t border-border-subtle pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground-secondary">Average</span>
                    <span className="font-medium text-foreground-primary">{value}/10</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-foreground-secondary">
              Professional critic reviews from Rotten Tomatoes and Metacritic.
            </p>
          )}
        </div>
      );
    }

    if (type === "audience") {
      const hasExternalRatings = externalRatings?.imdb;
      return (
        <div className="space-y-2">
          {hasExternalRatings ? (
            <>
              <div className="space-y-1.5">
                {externalRatings?.imdb && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-foreground-secondary">IMDb</span>
                    <span className="font-medium text-foreground-primary">
                      {externalRatings.imdb.rating}/10
                      <span className="ml-1 text-xs text-foreground-muted">
                        ({formatVotes(externalRatings.imdb.votes)} votes)
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : isAudienceFromPlex && plexAudienceRating ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground-secondary">Plex</span>
                <span className="font-medium text-foreground-primary">{plexAudienceRating}/10</span>
              </div>
              <p className="mt-2 text-xs text-foreground-muted">
                Audience rating from Plex metadata.
              </p>
            </div>
          ) : (
            <p className="text-sm text-foreground-secondary">
              Average audience ratings from IMDb.
            </p>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <span className="relative inline-flex">
      <button
        ref={badgeRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-white/10"
      >
        <Star className={`h-4 w-4 ${config.color}`} />
        <span className="text-foreground-primary">{value}</span>
      </button>
      {isOpen && (
        <div
          ref={tooltipRef}
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-border-subtle bg-background-elevated p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center gap-2">
            <Star className={`h-4 w-4 ${config.color}`} />
            <span className="font-medium text-foreground-primary">{config.title}</span>
          </div>
          {renderTooltipContent()}
        </div>
      )}
    </span>
  );
}

function formatFileSize(bytes?: number): string | null {
  if (!bytes) return null;
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function formatBitrate(kbps?: number): string | null {
  if (!kbps) return null;
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(1)} Mbps`;
  return `${kbps} Kbps`;
}

function formatAudioChannels(channels?: number): string | null {
  if (!channels) return null;
  if (channels === 1) return "Mono";
  if (channels === 2) return "Stereo";
  if (channels === 6) return "5.1";
  if (channels === 8) return "7.1";
  return `${channels}ch`;
}

function formatVideoCodec(codec?: string): string {
  if (!codec) return "Unknown";
  const codecMap: Record<string, string> = {
    h264: "H.264",
    hevc: "HEVC",
    h265: "HEVC",
    vp9: "VP9",
    av1: "AV1",
    mpeg2video: "MPEG-2",
    mpeg4: "MPEG-4",
  };
  return codecMap[codec.toLowerCase()] || codec.toUpperCase();
}

function formatAudioCodec(codec?: string): string {
  if (!codec) return "Unknown";
  const codecMap: Record<string, string> = {
    aac: "AAC",
    ac3: "AC3",
    eac3: "E-AC3",
    dts: "DTS",
    truehd: "TrueHD",
    flac: "FLAC",
    mp3: "MP3",
    opus: "Opus",
  };
  return codecMap[codec.toLowerCase()] || codec.toUpperCase();
}

function formatResolution(width?: number, height?: number, resolution?: string): string {
  if (resolution) {
    // Map common resolution strings
    if (resolution === "4k" || resolution === "2160") return "4K";
    if (resolution === "1080") return "1080p";
    if (resolution === "720") return "720p";
    if (resolution === "480") return "480p";
    return resolution;
  }
  if (width && height) {
    if (width >= 3840) return "4K";
    if (width >= 1920) return "1080p";
    if (width >= 1280) return "720p";
    if (width >= 854) return "480p";
    return `${width}x${height}`;
  }
  return "Unknown";
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  // Get both tokens:
  // - serverToken: for local Plex server operations
  // - plexToken: for plex.tv cloud services (Discover API / watchlist)
  const serverToken = await requireServerToken(request);
  const plexToken = await requirePlexToken(request);
  const { type, ratingKey } = params;

  // Validate type parameter - now supports all content types
  if (type !== "movie" && type !== "show" && type !== "season" && type !== "episode") {
    throw new Response("Invalid media type", { status: 400 });
  }

  // Validate ratingKey
  if (!ratingKey) {
    throw new Response("Missing rating key", { status: 400 });
  }

  // Client for local server operations
  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token: serverToken,
    clientId: env.PLEX_CLIENT_ID,
  });

  // Client for Discover API operations (watchlist check)
  const discoverClient = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token: plexToken,
    clientId: env.PLEX_CLIENT_ID,
  });

  const result = await client.getMetadata(ratingKey);

  if (!result.success) {
    throw new Response("Media not found", { status: 404 });
  }

  const metadata = result.data;

  // Build breadcrumbs based on content type
  const breadcrumbs: BreadcrumbItem[] = [];
  let showTitle: string | undefined;
  let showRatingKey: string | undefined;
  let showPosterUrl: string | undefined;
  let seasonTitle: string | undefined;
  let seasonRatingKey: string | undefined;
  let seasonIndex: number | undefined;
  let episodeIndex: number | undefined;
  let originallyAired: string | undefined;

  // Fetch parent metadata for seasons and episodes
  if (type === "season" && metadata.parentRatingKey) {
    // Season: fetch show info
    const showResult = await client.getMetadata(metadata.parentRatingKey);
    if (showResult.success) {
      showTitle = showResult.data.title;
      showRatingKey = metadata.parentRatingKey;
      showPosterUrl = buildPosterUrl(showResult.data.thumb);
      breadcrumbs.push({
        label: showTitle,
        href: `/app/media/show/${showRatingKey}`,
      });
    }
    seasonIndex = metadata.index;
  } else if (type === "episode") {
    // Episode: fetch show and season info
    episodeIndex = metadata.index;
    seasonIndex = metadata.parentIndex;
    originallyAired = metadata.originallyAvailableAt;

    // Fetch season info if available
    if (metadata.parentRatingKey) {
      const seasonResult = await client.getMetadata(metadata.parentRatingKey);
      if (seasonResult.success) {
        seasonTitle = seasonResult.data.title;
        seasonRatingKey = metadata.parentRatingKey;
        seasonIndex = seasonResult.data.index ?? metadata.parentIndex;

        // Fetch show info from season's parent
        if (seasonResult.data.parentRatingKey) {
          const showResult = await client.getMetadata(seasonResult.data.parentRatingKey);
          if (showResult.success) {
            showTitle = showResult.data.title;
            showRatingKey = seasonResult.data.parentRatingKey;
            showPosterUrl = buildPosterUrl(showResult.data.thumb);
          }
        }
      }
    }

    // Alternative: use grandparent info from episode metadata
    if (!showTitle && metadata.grandparentTitle) {
      showTitle = metadata.grandparentTitle;
      showRatingKey = metadata.grandparentRatingKey;
      if (metadata.grandparentThumb) {
        showPosterUrl = buildPosterUrl(metadata.grandparentThumb);
      }
    }

    // Build breadcrumbs for episode
    if (showTitle && showRatingKey) {
      breadcrumbs.push({
        label: showTitle,
        href: `/app/media/show/${showRatingKey}`,
      });
    }
    if (seasonTitle && seasonRatingKey) {
      breadcrumbs.push({
        label: seasonTitle,
        href: `/app/media/season/${seasonRatingKey}`,
      });
    }
  }

  // Check if item is in watchlist (uses Discover API with plexToken)
  let isInWatchlist = false;
  if (metadata.guid) {
    try {
      const watchlistResult = await discoverClient.getWatchlist();
      if (watchlistResult.success) {
        isInWatchlist = watchlistResult.data.some(
          (item) => item.guid === metadata.guid
        );
      }
    } catch (error) {
      // Silently fail - watchlist check is optional
      console.error("[Watchlist] Failed to check watchlist status:", error);
    }
  }

  // For episodes/seasons, use parent art as backdrop if not available
  const artPath = metadata.art || (type === "episode" ? metadata.grandparentArt : undefined);

  // Extract external IDs from Plex Guid array (contains external references like imdb://, tmdb://)
  // Also fall back to checking the main guid field for older Plex agents
  let imdbId: string | undefined;
  let tmdbId: number | undefined;

  // First check the Guid array (modern Plex agents)
  if (metadata.Guid) {
    for (const guidEntry of metadata.Guid) {
      const imdbMatch = guidEntry.id.match(/imdb:\/\/(tt\d+)/);
      const tmdbMatch = guidEntry.id.match(/tmdb:\/\/(\d+)/);
      if (imdbMatch) {
        imdbId = imdbMatch[1];
      }
      if (tmdbMatch) {
        tmdbId = parseInt(tmdbMatch[1], 10);
      }
    }
  }

  // Fallback to main guid field (legacy agents)
  if (!imdbId || !tmdbId) {
    const guidToCheck = metadata.guid;
    if (!imdbId) {
      const imdbMatch = guidToCheck?.match(/imdb:\/\/(tt\d+)/);
      if (imdbMatch) {
        imdbId = imdbMatch[1];
      }
    }
    if (!tmdbId) {
      const tmdbMatch = guidToCheck?.match(/tmdb:\/\/(\d+)/);
      if (tmdbMatch) {
        tmdbId = parseInt(tmdbMatch[1], 10);
      }
    }
  }

  // Extract media file info (for movies and episodes that have playable media)
  let mediaInfo: LoaderData["mediaInfo"];
  let videoStreams: LoaderData["videoStreams"];
  let audioStreams: LoaderData["audioStreams"];
  let subtitleStreams: LoaderData["subtitleStreams"];

  if ((type === "movie" || type === "episode") && metadata.Media?.[0]) {
    const media = metadata.Media[0];
    const part = media.Part?.[0];
    const streams = part?.Stream ?? [];

    // Build media info
    mediaInfo = {
      resolution: formatResolution(media.width, media.height, media.videoResolution),
      videoCodec: formatVideoCodec(media.videoCodec),
      audioCodec: formatAudioCodec(media.audioCodec),
      audioChannels: formatAudioChannels(media.audioChannels) ?? undefined,
      container: media.container?.toUpperCase(),
      fileSize: formatFileSize(part?.size) ?? undefined,
      bitrate: formatBitrate(media.bitrate) ?? undefined,
    };

    // Extract video streams (streamType 1)
    videoStreams = streams
      .filter((s) => s.streamType === 1)
      .map((s) => ({
        id: s.id,
        displayTitle: s.displayTitle || `${formatResolution(s.width, s.height)} ${formatVideoCodec(s.codec)}`,
        resolution: formatResolution(s.width, s.height),
        codec: formatVideoCodec(s.codec),
        selected: s.selected,
      }));

    // Extract audio streams (streamType 2)
    audioStreams = streams
      .filter((s) => s.streamType === 2)
      .map((s) => ({
        id: s.id,
        displayTitle: s.displayTitle || `${s.language || "Unknown"} (${formatAudioCodec(s.codec)})`,
        language: s.language,
        channels: formatAudioChannels(s.channels) ?? undefined,
        codec: formatAudioCodec(s.codec),
        selected: s.selected,
      }));

    // Extract subtitle streams (streamType 3)
    subtitleStreams = streams
      .filter((s) => s.streamType === 3)
      .map((s) => ({
        id: s.id,
        displayTitle: s.displayTitle || s.language || "Unknown",
        language: s.language,
        codec: s.codec,
        selected: s.selected,
      }));
  }

  // Fetch external ratings from OMDb if IMDb ID is available
  let externalRatings: LoaderData["externalRatings"] = null;
  if (imdbId && (type === "movie" || type === "show")) {
    const omdbClient = createOMDbClient();
    if (omdbClient) {
      const ratingsResult = await omdbClient.getRatingsByIMDbId(imdbId);
      if (ratingsResult.success) {
        externalRatings = ratingsResult.data;
      }
    }
  }

  // Calculate audience rating with fallback logic
  const calculatedAudienceRating = getOMDbAudienceRating(externalRatings, metadata.audienceRating);
  const isAudienceFromPlex = !externalRatings?.imdb && metadata.audienceRating !== undefined;

  // Build processed data for the view
  const loaderData: LoaderData = {
    metadata,
    backdropUrl: buildBackdropUrl(artPath),
    posterUrl: buildPosterUrl(metadata.thumb),
    year: metadata.year?.toString() ?? null,
    duration: formatRuntime(metadata.duration),
    contentRating: metadata.contentRating ?? null,
    criticRating: getOMDbCriticRating(externalRatings) ?? formatRating(metadata.rating),
    audienceRating: calculatedAudienceRating,
    userRating: formatRating(metadata.userRating),
    lastRatedAt: metadata.lastRatedAt,
    isAudienceFromPlex,
    externalRatings,
    plexAudienceRating: formatRating(metadata.audienceRating),
    genres: metadata.Genre?.map((g) => g.tag) ?? [],
    directors: metadata.Director?.map((d) => d.tag) ?? [],
    writers: metadata.Writer?.map((w) => w.tag) ?? [],
    studio: metadata.studio ?? null,
    cast: metadata.Role?.slice(0, 15) ?? [],
    similar: (metadata.Similar ?? [])
      .filter((s) => s.ratingKey)
      .slice(0, 10)
      .map((s) => ({
        ratingKey: s.ratingKey!,
        title: s.tag,
        posterUrl: "", // Similar items don't have poster URLs in the response
        type,
      })),
    recommendations: [],
    serverUrl: env.PLEX_SERVER_URL,
    token: serverToken, // serverToken for local server operations (images, API calls)
    type,
    viewOffset: metadata.viewOffset,
    viewCount: metadata.viewCount ?? 0,
    leafCount: metadata.leafCount,
    viewedLeafCount: metadata.viewedLeafCount,
    isInWatchlist,
    // Hierarchy navigation
    breadcrumbs,
    showTitle,
    showRatingKey,
    showPosterUrl,
    seasonTitle,
    seasonRatingKey,
    seasonIndex,
    episodeIndex,
    originallyAired,
    // External IDs
    tmdbId,
    imdbId,
    // Media file info
    mediaInfo,
    videoStreams,
    audioStreams,
    subtitleStreams,
  };

  // Fetch seasons and episodes for TV shows
  if (type === "show") {
    const seasonsResult = await client.getChildren(ratingKey);
    if (seasonsResult.success && seasonsResult.data.length > 0) {
      // Filter to only actual seasons (not specials which have index 0)
      const seasonItems = seasonsResult.data
        .filter((s) => s.type === "season")
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      loaderData.seasons = seasonItems.map((season) => ({
        ratingKey: season.ratingKey,
        title: season.title,
        index: season.index ?? 0,
        leafCount: season.leafCount ?? 0,
        viewedLeafCount: season.viewedLeafCount ?? 0,
        thumb: buildPosterUrl(season.thumb),
      }));

      // Get episodes for the first unwatched season, or latest if all watched
      const regularSeasons = seasonItems
        .filter((s) => (s.index ?? 0) >= 1)
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      let targetSeason = seasonItems[0]; // Fallback
      if (regularSeasons.length > 0) {
        // Find first season that's not fully watched
        const firstUnwatched = regularSeasons.find(
          (s) => (s.leafCount ?? 0) > 0 && (s.viewedLeafCount ?? 0) < (s.leafCount ?? 0)
        );
        targetSeason = firstUnwatched || regularSeasons[regularSeasons.length - 1];
      }

      if (targetSeason) {
        const episodesResult = await client.getChildren(targetSeason.ratingKey);
        if (episodesResult.success) {
          const sortedEpisodes = episodesResult.data
            .filter((e) => e.type === "episode")
            .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

          loaderData.episodes = sortedEpisodes.map((episode) => ({
              ratingKey: episode.ratingKey,
              title: episode.title,
              index: episode.index ?? 0,
              seasonIndex: episode.parentIndex ?? targetSeason.index ?? 0,
              duration: formatRuntime(episode.duration),
              thumb: buildBackdropUrl(episode.thumb),
              summary: episode.summary,
              viewCount: episode.viewCount ?? 0,
              viewOffset: episode.viewOffset,
            }));
          // Store the initially selected season index
          loaderData.initialSeasonIndex = targetSeason.index ?? 1;

          // Find On Deck episode (first with viewOffset or first unwatched)
          const inProgressEp = sortedEpisodes.find((e) => e.viewOffset && e.viewOffset > 0);
          const firstUnwatchedEp = sortedEpisodes.find((e) => (e.viewCount ?? 0) === 0);
          const onDeckEpisode = inProgressEp || firstUnwatchedEp;

          if (onDeckEpisode) {
            loaderData.onDeck = {
              seasonIndex: onDeckEpisode.parentIndex ?? targetSeason.index ?? 1,
              episodeIndex: onDeckEpisode.index ?? 1,
              episodeTitle: onDeckEpisode.title,
              episodeRatingKey: onDeckEpisode.ratingKey,
              viewOffset: onDeckEpisode.viewOffset,
            };
          }
        }
      }
    }
  }

  // Fetch episodes for season pages
  if (type === "season") {
    const episodesResult = await client.getChildren(ratingKey);
    if (episodesResult.success) {
      const sortedEpisodes = episodesResult.data
        .filter((e) => e.type === "episode")
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      loaderData.episodes = sortedEpisodes.map((episode) => ({
          ratingKey: episode.ratingKey,
          title: episode.title,
          index: episode.index ?? 0,
          seasonIndex: seasonIndex ?? 0,
          duration: formatRuntime(episode.duration),
          thumb: buildBackdropUrl(episode.thumb),
          summary: episode.summary,
          viewCount: episode.viewCount ?? 0,
          viewOffset: episode.viewOffset,
        }));

      // Find On Deck episode for season page
      const inProgressEp = sortedEpisodes.find((e) => e.viewOffset && e.viewOffset > 0);
      const firstUnwatchedEp = sortedEpisodes.find((e) => (e.viewCount ?? 0) === 0);
      const onDeckEpisode = inProgressEp || firstUnwatchedEp;

      if (onDeckEpisode) {
        loaderData.onDeck = {
          seasonIndex: seasonIndex ?? 1,
          episodeIndex: onDeckEpisode.index ?? 1,
          episodeTitle: onDeckEpisode.title,
          episodeRatingKey: onDeckEpisode.ratingKey,
          viewOffset: onDeckEpisode.viewOffset,
        };
      }
    }
  }

  // Fetch TMDB recommendations (optional, non-blocking - only for movies and shows)
  if (type === "movie" || type === "show") {
    const tmdbClient = createTMDBClient();
    if (tmdbClient && metadata.title) {
      try {
        const year = metadata.year;
        const recsResult =
          type === "movie"
            ? await tmdbClient.getMovieRecommendationsByTitle(metadata.title, year)
            : await tmdbClient.getTVRecommendationsByTitle(metadata.title, year);

        if (recsResult.success) {
          loaderData.recommendations = recsResult.data;
        }
      } catch (error) {
        // Silently fail - recommendations are optional
        console.error("[TMDB] Failed to fetch recommendations:", error);
      }
    }
  }

  return json(loaderData);
}

// Breadcrumb navigation component
function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length === 0) return null;

  return (
    <nav className="flex items-center gap-2 text-sm">
      {items.map((item, index) => (
        <span key={item.href} className="flex items-center gap-2">
          <Link
            to={item.href}
            className="text-foreground-secondary transition-colors hover:text-foreground-primary"
          >
            {item.label}
          </Link>
          {index < items.length - 1 && (
            <ChevronRight className="h-4 w-4 text-foreground-muted" />
          )}
        </span>
      ))}
      <ChevronRight className="h-4 w-4 text-foreground-muted" />
    </nav>
  );
}

export default function MediaDetailPage() {
  const data = useLoaderData<typeof loader>();
  const {
    metadata,
    backdropUrl,
    posterUrl,
    year,
    duration,
    contentRating,
    criticRating,
    audienceRating,
    userRating,
    lastRatedAt,
    isAudienceFromPlex,
    externalRatings,
    plexAudienceRating,
    genres,
    directors,
    writers,
    studio,
    cast,
    similar,
    recommendations,
    serverUrl,
    token,
    type,
    viewOffset,
    viewCount,
    leafCount,
    viewedLeafCount,
    isInWatchlist: initialIsInWatchlist,
    seasons,
    episodes: initialEpisodes,
    initialSeasonIndex,
    onDeck: initialOnDeck,
    // Hierarchy navigation
    breadcrumbs,
    showTitle,
    seasonIndex,
    episodeIndex,
    originallyAired,
    // External IDs
    tmdbId,
    imdbId,
    // Media file info
    mediaInfo,
    audioStreams,
    subtitleStreams,
  } = data;

  // For TV shows/seasons, watched = all episodes watched. For movies/episodes, watched = viewCount > 0
  const isWatched =
    type === "show" || type === "season"
      ? leafCount !== undefined &&
        viewedLeafCount !== undefined &&
        leafCount > 0 &&
        viewedLeafCount >= leafCount
      : viewCount > 0;
  const navigate = useNavigate();

  // Season selection state - use the server-provided initial season index
  const [, setSelectedSeasonIndex] = useState<number>(initialSeasonIndex ?? 1);
  const [episodes, setEpisodes] = useState(initialEpisodes);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [onDeck, setOnDeck] = useState(initialOnDeck);

  const buildPhotoUrl = (thumbPath: string) => {
    return buildPlexImageUrl(thumbPath);
  };

  // Handle season change - fetch episodes for the selected season
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSeasonChange = useCallback(async (newSeasonIndex: number) => {
    setSelectedSeasonIndex(newSeasonIndex);

    const selectedSeason = seasons?.find((s) => s.index === newSeasonIndex);
    if (!selectedSeason) return;

    setIsLoadingEpisodes(true);
    try {
      // Fetch episodes via API route
      const response = await fetch(
        `/api/plex/children/${selectedSeason.ratingKey}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.children) {
          const sortedEpisodes = data.children
              .filter((e: PlexMediaItem) => e.type === "episode")
              .sort((a: PlexMediaItem, b: PlexMediaItem) => (a.index ?? 0) - (b.index ?? 0));

          setEpisodes(
            sortedEpisodes.map((episode: PlexMediaItem) => ({
                ratingKey: episode.ratingKey,
                title: episode.title,
                index: episode.index ?? 0,
                seasonIndex: episode.parentIndex ?? seasonIndex,
                duration: episode.duration ? formatRuntime(episode.duration) : null,
                thumb: buildBackdropUrl(episode.thumb),
                summary: episode.summary,
                viewCount: episode.viewCount ?? 0,
                viewOffset: episode.viewOffset,
              }))
          );

          // Update On Deck
          const inProgressEp = sortedEpisodes.find((e: PlexMediaItem) => e.viewOffset && e.viewOffset > 0);
          const firstUnwatchedEp = sortedEpisodes.find((e: PlexMediaItem) => (e.viewCount ?? 0) === 0);
          const onDeckEp = inProgressEp || firstUnwatchedEp;
          if (onDeckEp) {
            setOnDeck({
              seasonIndex: onDeckEp.parentIndex ?? seasonIndex,
              episodeIndex: onDeckEp.index ?? 1,
              episodeTitle: onDeckEp.title,
              episodeRatingKey: onDeckEp.ratingKey,
              viewOffset: onDeckEp.viewOffset,
            });
          } else {
            setOnDeck(undefined);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load episodes:", error);
    } finally {
      setIsLoadingEpisodes(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasons, serverUrl, token]);

  const handlePlay = () => {
    // For TV shows and seasons, play the On Deck episode
    if ((type === "show" || type === "season") && onDeck) {
      const url = onDeck.viewOffset
        ? `/app/watch/${onDeck.episodeRatingKey}?t=${onDeck.viewOffset}`
        : `/app/watch/${onDeck.episodeRatingKey}`;
      navigate(url);
      return;
    }
    // For movies and episodes, play directly
    const url = viewOffset
      ? `/app/watch/${metadata.ratingKey}?t=${viewOffset}`
      : `/app/watch/${metadata.ratingKey}`;
    navigate(url);
  };

  const handlePlayFromBeginning = () => {
    // For TV shows and seasons, play the On Deck episode from beginning
    if ((type === "show" || type === "season") && onDeck) {
      navigate(`/app/watch/${onDeck.episodeRatingKey}`);
      return;
    }
    // For movies and episodes, play from beginning
    navigate(`/app/watch/${metadata.ratingKey}`);
  };

  const [isInList, setIsInList] = useState(initialIsInWatchlist);
  const [isAddingToList, setIsAddingToList] = useState(false);

  const handleAddToList = useCallback(async () => {
    if (isAddingToList) return;

    setIsAddingToList(true);
    try {
      const response = await fetch("/api/plex/list", {
        method: isInList ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingKey: metadata.ratingKey }),
      });

      if (response.ok) {
        setIsInList(!isInList);
      }
    } catch (error) {
      console.error("Failed to update list:", error);
    } finally {
      setIsAddingToList(false);
    }
  }, [isInList, isAddingToList, metadata.ratingKey]);

  // Determine display title for episodes
  const displayTitle =
    type === "episode" && seasonIndex !== undefined && episodeIndex !== undefined
      ? `${episodeIndex}. ${metadata.title}`
      : metadata.title;

  // Determine button label based on watch state
  const playButtonLabel = () => {
    if ((type === "show" || type === "season") && onDeck?.viewOffset) return "Resume";
    if (viewOffset) return "Resume";
    if (isWatched) return "Play Again";
    return "Play";
  };

  // For movies and episodes, keep the original hero layout
  // For shows and seasons, use Plex-style layout
  const usePlexLayout = type === "show" || type === "season";

  return (
    <div className="min-h-screen pb-16">
      {usePlexLayout ? (
        /* ===== PLEX-STYLE LAYOUT FOR TV SHOWS AND SEASONS ===== */
        <>
          {/* Header Section with gradient background */}
          <div className="relative">
            {/* Subtle gradient background */}
            <div className="absolute inset-0 bg-gradient-to-b from-background-elevated via-background-primary to-background-primary" />
            {backdropUrl && (
              <div className="absolute inset-0 opacity-20">
                <img
                  src={backdropUrl}
                  alt=""
                  className="h-full w-full object-cover object-top blur-xl"
                />
              </div>
            )}

            <Container size="wide" className="relative py-6 sm:py-8 md:py-12">
              {/* Mobile: Centered stack, Desktop: Side-by-side */}
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6 md:gap-8">
                {/* Poster with badge */}
                <div className="flex-shrink-0">
                  <div className="relative w-32 sm:w-36 md:w-44 lg:w-52">
                    {/* Episode count badge */}
                    {leafCount !== undefined && leafCount > 0 && (
                      <div className="absolute right-0 top-0 z-10 flex h-7 min-w-7 items-center justify-center rounded-bl-lg bg-black/70 px-1.5 sm:h-8 sm:min-w-8 sm:px-2">
                        {isWatched ? (
                          <Check className="h-4 w-4 text-white sm:h-5 sm:w-5" />
                        ) : (
                          <span className="text-xs font-semibold text-white sm:text-sm">{leafCount}</span>
                        )}
                      </div>
                    )}
                    {/* Poster image */}
                    <img
                      src={posterUrl}
                      alt={metadata.title}
                      className="w-full rounded-lg shadow-2xl"
                    />
                    {/* On Deck indicator */}
                    {onDeck && (
                      <div className="mt-2 text-center text-xs text-foreground-secondary sm:mt-3 sm:text-sm">
                        On Deck — S{onDeck.seasonIndex} · E{onDeck.episodeIndex}
                      </div>
                    )}
                  </div>
                </div>

                {/* Info section - centered on mobile, left-aligned on desktop */}
                <div className="w-full text-center sm:flex-1 sm:pt-2 sm:text-left">
                  {/* Title */}
                  <h1 className="mb-1 text-2xl font-bold text-foreground-primary sm:text-3xl md:text-4xl lg:text-5xl">
                    {type === "season" && showTitle ? showTitle : metadata.title}
                  </h1>

                  {/* Season subtitle */}
                  {type === "season" && (
                    <Typography variant="title" className="mb-2 text-foreground-secondary sm:mb-3">
                      Season {seasonIndex}
                    </Typography>
                  )}

                  {/* Metadata row - centered on mobile */}
                  <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-sm text-foreground-secondary sm:justify-start sm:gap-3">
                    {year && <span>{year}</span>}
                    {genres.length > 0 && (
                      <span className="hidden sm:inline">{genres.slice(0, 2).join(", ")}</span>
                    )}
                    {contentRating && (
                      <span className="rounded bg-white/10 px-2 py-0.5">
                        {contentRating}
                      </span>
                    )}
                    {criticRating && (
                      <RatingBadge type="critic" value={criticRating} externalRatings={externalRatings} />
                    )}
                    {audienceRating && (
                      <RatingBadge type="audience" value={audienceRating} externalRatings={externalRatings} isAudienceFromPlex={isAudienceFromPlex} plexAudienceRating={plexAudienceRating} />
                    )}
                    {userRating && (
                      <RatingBadge type="user" value={userRating} lastRatedAt={lastRatedAt} />
                    )}
                  </div>

                  {/* Action buttons - full width on mobile, inline on desktop */}
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                    <Button variant="primary" size="lg" onClick={handlePlay} className="w-full sm:w-auto">
                      <Play className="mr-2 h-5 w-5 fill-current" />
                      {playButtonLabel()}
                    </Button>
                    {/* Watchlist button - only for shows */}
                    {type === "show" && (
                      <Button
                        variant="secondary"
                        size="lg"
                        onClick={handleAddToList}
                        disabled={isAddingToList}
                        className="w-full sm:w-auto"
                      >
                        {isInList ? (
                          <>
                            <Check className="mr-2 h-5 w-5 sm:mr-0" />
                            <span className="sm:hidden">In Watchlist</span>
                          </>
                        ) : (
                          <>
                            <Plus className="mr-2 h-5 w-5 sm:mr-0" />
                            <span className="sm:hidden">Add to Watchlist</span>
                          </>
                        )}
                      </Button>
                    )}
                    {/* External Links - hidden on very small screens */}
                    <div className="hidden gap-2 sm:flex">
                      {tmdbId && (
                        <a
                          href={
                            type === "season" && seasonIndex !== undefined
                              ? `https://www.themoviedb.org/tv/${tmdbId}/season/${seasonIndex}`
                              : `https://www.themoviedb.org/tv/${tmdbId}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-11 items-center gap-1.5 rounded-lg bg-[#01b4e4]/20 px-4 text-sm font-medium text-[#01b4e4] transition-colors hover:bg-[#01b4e4]/30"
                        >
                          TMDB
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      {imdbId && (
                        <a
                          href={`https://www.imdb.com/title/${imdbId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-11 items-center gap-1.5 rounded-lg bg-[#f5c518]/20 px-4 text-sm font-medium text-[#f5c518] transition-colors hover:bg-[#f5c518]/30"
                        >
                          IMDb
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Summary - clamp to 3 lines on mobile, 4 on desktop */}
                  {metadata.summary && (
                    <Typography variant="body" className="max-w-2xl text-foreground-secondary line-clamp-3 sm:line-clamp-4">
                      {metadata.summary}
                    </Typography>
                  )}
                </div>
              </div>
            </Container>
          </div>

          {/* Seasons Row (Series only) */}
          {type === "show" && seasons && seasons.length > 0 && (
            <Container size="wide" className="mt-6 sm:mt-8">
              <Typography variant="title" className="mb-3 sm:mb-4">
                Seasons
              </Typography>
              <div className="-mx-5 px-5 sm:mx-0 sm:px-0">
                <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 pt-2 sm:snap-none sm:gap-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {seasons.map((season) => (
                    <Link
                      key={season.ratingKey}
                      to={`/app/media/season/${season.ratingKey}`}
                      className="group flex-shrink-0 snap-start"
                    >
                      <div className="relative w-28 sm:w-32 md:w-36">
                        {/* Episode count or checkmark badge */}
                        <div className="absolute right-0 top-0 z-10 flex h-6 min-w-6 items-center justify-center rounded-bl-lg bg-black/70 px-1.5">
                          {season.viewedLeafCount >= season.leafCount && season.leafCount > 0 ? (
                            <Check className="h-3.5 w-3.5 text-white" />
                          ) : (
                            <span className="text-xs font-semibold text-white">{season.leafCount}</span>
                          )}
                        </div>
                        {/* Season poster */}
                        <div className="overflow-hidden rounded-lg bg-background-elevated ring-1 ring-white/10 transition-all duration-200 group-hover:ring-2 group-hover:ring-white/30">
                          <img
                            src={season.thumb}
                            alt={season.title}
                            className="aspect-[2/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        </div>
                        {/* Season info */}
                        <div className="mt-2">
                          <Typography variant="body" className="text-sm font-medium sm:text-base">
                            {season.title}
                          </Typography>
                          <Typography variant="caption" className="text-foreground-muted">
                            {season.leafCount} ep{season.leafCount !== 1 ? "s" : ""}
                          </Typography>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </Container>
          )}

          {/* Episodes Grid (Seasons only) */}
          {type === "season" && (
            <Container size="wide" className="mt-6 sm:mt-8">
              <Typography variant="title" className="mb-3 sm:mb-4">
                {leafCount} Episode{leafCount !== 1 ? "s" : ""}
              </Typography>

              {isLoadingEpisodes ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
                </div>
              ) : episodes && episodes.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {episodes.map((episode) => (
                    <Link
                      key={episode.ratingKey}
                      to={`/app/media/episode/${episode.ratingKey}`}
                      className="group flex gap-3 sm:flex-col sm:gap-0"
                    >
                      {/* Episode Thumbnail - small side thumbnail on mobile, full width on sm+ */}
                      <div className="relative w-28 flex-shrink-0 overflow-hidden rounded-lg bg-background-elevated sm:w-full">
                        <img
                          src={episode.thumb}
                          alt={episode.title}
                          className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                        {/* Watched badge */}
                        {episode.viewCount > 0 && !episode.viewOffset && (
                          <div className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-bl-lg bg-black/70">
                            <Check className="h-3.5 w-3.5 text-white" />
                          </div>
                        )}
                        {/* Progress bar */}
                        {episode.viewOffset && episode.viewOffset > 0 && (
                          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                            <div
                              className="h-full bg-accent-primary"
                              style={{
                                width: `${Math.min(100, Math.max(0, (episode.viewOffset / 1000 / 60) * 2))}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                      {/* Episode Info - side text on mobile, below thumbnail on sm+ */}
                      <div className="flex flex-1 flex-col justify-center sm:mt-2">
                        <Typography variant="body" className="text-sm font-medium line-clamp-2 group-hover:text-accent-primary sm:text-base sm:line-clamp-1">
                          {episode.title}
                        </Typography>
                        <Typography variant="caption" className="text-foreground-muted">
                          Episode {episode.index}{episode.duration && ` · ${episode.duration}`}
                        </Typography>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <Typography variant="body" className="py-8 text-center text-foreground-muted">
                  No episodes available for this season.
                </Typography>
              )}
            </Container>
          )}

          {/* Cast Section */}
          {cast.length > 0 && (
            <Container size="wide" className="mt-6 sm:mt-8">
              <CastRow title="Cast" people={cast} buildPhotoUrl={buildPhotoUrl} />
            </Container>
          )}

          {/* TMDB Recommendations */}
          {recommendations.length > 0 && (
            <Container size="wide" className="mt-6 sm:mt-8">
              <div className="mb-3 flex items-baseline justify-between sm:mb-4">
                <Typography variant="title">Recommendations</Typography>
                <span className="text-xs text-foreground-muted">
                  Powered by TMDB
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6">
                {recommendations.map((rec) => (
                  <a
                    key={rec.id}
                    href={rec.tmdbUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative"
                  >
                    <div className="aspect-[2/3] overflow-hidden rounded-lg bg-background-elevated ring-1 ring-white/10 transition-all duration-200 group-hover:ring-2 group-hover:ring-white/30">
                      {rec.posterUrl ? (
                        <img
                          src={rec.posterUrl}
                          alt={rec.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-foreground-muted sm:text-sm">
                          No Image
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 sm:mt-2">
                      <Typography
                        variant="body"
                        className="line-clamp-1 text-xs group-hover:text-accent-primary sm:text-sm"
                      >
                        {rec.title}
                      </Typography>
                      <div className="flex items-center gap-1 text-xs text-foreground-muted sm:gap-2">
                        {rec.releaseDate && (
                          <span>{rec.releaseDate.substring(0, 4)}</span>
                        )}
                        {rec.rating > 0 && (
                          <span className="hidden items-center gap-0.5 sm:flex">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            {rec.rating.toFixed(1)}
                          </span>
                        )}
                        <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </Container>
          )}
        </>
      ) : (
        /* ===== PLEX-STYLE RESPONSIVE LAYOUT FOR MOVIES AND EPISODES ===== */
        <>
          {/* Hero Section - Responsive with mobile-first design */}
          <div className="relative w-full">
            {/* Backdrop container - shorter on mobile */}
            <div className="relative h-[40vh] min-h-[280px] sm:h-[50vh] sm:min-h-[350px] md:h-[60vh] md:min-h-[450px]">
              {/* Backdrop image */}
              {backdropUrl ? (
                <div className="absolute inset-0 animate-fadeIn">
                  <img
                    src={backdropUrl}
                    alt={metadata.title}
                    className="h-full w-full object-cover object-center"
                  />
                </div>
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-background-elevated to-background-primary" />
              )}

              {/* Gradient overlays - stronger on mobile for readability */}
              <div className="absolute inset-0 bg-black/40 sm:bg-black/30" />
              <div className="absolute inset-0 bg-gradient-to-t from-background-primary via-background-primary/80 to-transparent sm:via-background-primary/60" />
              {/* Side gradient only on larger screens */}
              <div className="absolute inset-0 hidden bg-gradient-to-r from-background-primary/80 via-transparent to-transparent sm:block" />
            </div>

            {/* Content overlapping backdrop - Plex style */}
            <div className="relative -mt-32 sm:-mt-40 md:-mt-48">
              <Container size="wide">
                {/* Mobile: Centered poster + stacked content */}
                {/* Desktop: Side-by-side layout */}
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end sm:gap-6 md:gap-8">
                  {/* Poster - visible on all sizes, smaller on mobile */}
                  {posterUrl && (
                    <div className={`flex-shrink-0 ${
                      type === "episode"
                        ? "w-40 sm:w-48 md:w-56 lg:w-64"
                        : "w-32 sm:w-40 md:w-48 lg:w-56"
                    }`}>
                      <img
                        src={posterUrl}
                        alt={metadata.title}
                        className={`w-full rounded-lg shadow-2xl ring-1 ring-white/10 ${
                          type === "episode" ? "aspect-video object-cover" : ""
                        }`}
                      />
                    </div>
                  )}

                  {/* Title and metadata - centered on mobile, left-aligned on desktop */}
                  <div className="w-full text-center sm:flex-1 sm:pb-2 sm:text-left">
                    {/* Breadcrumbs for episodes - hidden on mobile */}
                    {breadcrumbs.length > 0 && (
                      <div className="mb-2 hidden sm:block">
                        <Breadcrumbs items={breadcrumbs} />
                      </div>
                    )}

                    {/* Season indicator for episodes */}
                    {type === "episode" && seasonIndex !== undefined && (
                      <Typography variant="caption" className="mb-1 block text-accent-primary">
                        Season {seasonIndex}
                      </Typography>
                    )}

                    {/* Title - smaller on mobile */}
                    <h1 className="mb-2 text-2xl font-bold text-foreground-primary sm:text-3xl md:text-4xl lg:text-5xl">
                      {displayTitle}
                    </h1>

                    {/* Metadata row - wrapped and centered on mobile */}
                    <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-sm sm:justify-start sm:gap-3 sm:text-base">
                      {type === "episode" && originallyAired && (
                        <span className="flex items-center gap-1 text-foreground-secondary">
                          <Calendar className="h-4 w-4" />
                          {new Date(originallyAired).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                      {type === "movie" && year && (
                        <span className="text-foreground-secondary">{year}</span>
                      )}
                      {duration && (
                        <span className="flex items-center gap-1 text-foreground-secondary">
                          <Clock className="h-4 w-4" />
                          {duration}
                        </span>
                      )}
                      {contentRating && (
                        <span className="rounded bg-white/10 px-2 py-0.5 text-foreground-secondary">
                          {contentRating}
                        </span>
                      )}
                      {criticRating && (
                        <RatingBadge type="critic" value={criticRating} externalRatings={externalRatings} />
                      )}
                      {audienceRating && (
                        <RatingBadge type="audience" value={audienceRating} externalRatings={externalRatings} isAudienceFromPlex={isAudienceFromPlex} plexAudienceRating={plexAudienceRating} />
                      )}
                      {userRating && (
                        <RatingBadge type="user" value={userRating} lastRatedAt={lastRatedAt} />
                      )}
                    </div>

                    {/* Tagline - hidden on very small screens */}
                    {metadata.tagline && (
                      <Typography variant="subtitle" className="mb-4 hidden italic text-foreground-secondary sm:block">
                        &quot;{metadata.tagline}&quot;
                      </Typography>
                    )}

                    {/* Action buttons - full width on mobile, inline on desktop */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
                      <Button variant="primary" size="lg" onClick={handlePlay} className="w-full sm:w-auto">
                        <Play className="mr-2 h-5 w-5 fill-current" />
                        {viewOffset ? "Resume" : isWatched ? "Play Again" : "Play"}
                      </Button>
                      {viewOffset && (
                        <Button variant="secondary" size="lg" onClick={handlePlayFromBeginning} className="w-full sm:w-auto">
                          <RotateCcw className="mr-2 h-5 w-5" />
                          From Start
                        </Button>
                      )}
                      {type === "movie" && (
                        <Button
                          variant="secondary"
                          size="lg"
                          onClick={handleAddToList}
                          disabled={isAddingToList}
                          className="w-full sm:w-auto"
                        >
                          {isInList ? (
                            <>
                              <Check className="mr-2 h-5 w-5" />
                              In Watchlist
                            </>
                          ) : (
                            <>
                              <Plus className="mr-2 h-5 w-5" />
                              Watchlist
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Container>
            </div>
          </div>

          {/* Details Section */}
          <Container size="wide" className="relative z-10 mt-6 space-y-6 sm:mt-8 sm:space-y-8">
            {/* Summary - full width on all sizes */}
            {metadata.summary && (
              <div>
                <Typography variant="title" className="mb-2 sm:mb-3">
                  Overview
                </Typography>
                <Typography variant="body" className="text-foreground-secondary">
                  {metadata.summary}
                </Typography>
              </div>
            )}

            {/* Cast - horizontal scroll */}
            {cast.length > 0 && (
              <CastRow title="Cast" people={cast} buildPhotoUrl={buildPhotoUrl} />
            )}

            {/* Metadata grid - 2 cols on mobile, sidebar on desktop */}
            <div className="grid gap-6 sm:gap-8 lg:grid-cols-3">
              {/* Main metadata - spans 2 cols on desktop */}
              <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:col-span-2">
                {/* Genres */}
                {genres.length > 0 && (
                  <div>
                    <Typography variant="caption" className="mb-2 block text-foreground-muted">
                      Genres
                    </Typography>
                    <div className="flex flex-wrap gap-2">
                      {genres.map((genre) => (
                        <span
                          key={genre}
                          className="rounded-full bg-white/10 px-3 py-1 text-sm text-foreground-primary"
                        >
                          {genre}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Studio */}
                {studio && (
                  <div>
                    <Typography variant="caption" className="mb-1 block text-foreground-muted">
                      Studio
                    </Typography>
                    <Typography variant="body">{studio}</Typography>
                  </div>
                )}

                {/* Directors */}
                {directors.length > 0 && (
                  <div>
                    <Typography variant="caption" className="mb-1 block text-foreground-muted">
                      {directors.length === 1 ? "Director" : "Directors"}
                    </Typography>
                    <Typography variant="body">{directors.join(", ")}</Typography>
                  </div>
                )}

                {/* Writers (especially for episodes) */}
                {writers.length > 0 && (
                  <div>
                    <Typography variant="caption" className="mb-1 block text-foreground-muted">
                      {writers.length === 1 ? "Writer" : "Writers"}
                    </Typography>
                    <Typography variant="body">{writers.join(", ")}</Typography>
                  </div>
                )}

                {/* Original title if different */}
                {metadata.originalTitle && metadata.originalTitle !== metadata.title && (
                  <div>
                    <Typography variant="caption" className="mb-1 block text-foreground-muted">
                      Original Title
                    </Typography>
                    <Typography variant="body">{metadata.originalTitle}</Typography>
                  </div>
                )}

                {/* Media Info Section */}
                {mediaInfo && (
                  <div className="border-t border-border-subtle pt-4">
                    <Typography variant="caption" className="mb-3 flex items-center gap-2 text-foreground-muted">
                      <HardDrive className="h-4 w-4" />
                      Media Info
                    </Typography>
                    <div className="space-y-2 text-sm">
                      {mediaInfo.resolution && (
                        <div className="flex items-center justify-between">
                          <span className="text-foreground-muted">Resolution</span>
                          <span className="font-medium">{mediaInfo.resolution}</span>
                        </div>
                      )}
                      {mediaInfo.videoCodec && (
                        <div className="flex items-center justify-between">
                          <span className="text-foreground-muted">Video</span>
                          <span className="font-medium">{mediaInfo.videoCodec}</span>
                        </div>
                      )}
                      {mediaInfo.audioCodec && (
                        <div className="flex items-center justify-between">
                          <span className="text-foreground-muted">Audio</span>
                          <span className="font-medium">
                            {mediaInfo.audioCodec}
                            {mediaInfo.audioChannels && ` ${mediaInfo.audioChannels}`}
                          </span>
                        </div>
                      )}
                      {mediaInfo.container && (
                        <div className="flex items-center justify-between">
                          <span className="text-foreground-muted">Container</span>
                          <span className="font-medium">{mediaInfo.container}</span>
                        </div>
                      )}
                      {mediaInfo.fileSize && (
                        <div className="flex items-center justify-between">
                          <span className="text-foreground-muted">Size</span>
                          <span className="font-medium">{mediaInfo.fileSize}</span>
                        </div>
                      )}
                      {mediaInfo.bitrate && (
                        <div className="flex items-center justify-between">
                          <span className="text-foreground-muted">Bitrate</span>
                          <span className="font-medium">{mediaInfo.bitrate}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Audio Streams */}
                {audioStreams && audioStreams.length > 1 && (
                  <div className="border-t border-border-subtle pt-4">
                    <Typography variant="caption" className="mb-3 flex items-center gap-2 text-foreground-muted">
                      <Volume2 className="h-4 w-4" />
                      Audio Tracks ({audioStreams.length})
                    </Typography>
                    <div className="space-y-1.5 text-sm">
                      {audioStreams.map((stream) => (
                        <div
                          key={stream.id}
                          className={`flex items-center gap-2 rounded px-2 py-1 ${
                            stream.selected ? "bg-accent-primary/20 text-accent-primary" : "text-foreground-secondary"
                          }`}
                        >
                          {stream.selected && <Check className="h-3 w-3" />}
                          <span className="flex-1 truncate">{stream.displayTitle}</span>
                          {stream.channels && (
                            <span className="text-xs text-foreground-muted">{stream.channels}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subtitle Streams */}
                {subtitleStreams && subtitleStreams.length > 0 && (
                  <div className="border-t border-border-subtle pt-4">
                    <Typography variant="caption" className="mb-3 flex items-center gap-2 text-foreground-muted">
                      <Subtitles className="h-4 w-4" />
                      Subtitles ({subtitleStreams.length})
                    </Typography>
                    <div className="space-y-1.5 text-sm">
                      {subtitleStreams.slice(0, 5).map((stream) => (
                        <div
                          key={stream.id}
                          className={`flex items-center gap-2 rounded px-2 py-1 ${
                            stream.selected ? "bg-accent-primary/20 text-accent-primary" : "text-foreground-secondary"
                          }`}
                        >
                          {stream.selected && <Check className="h-3 w-3" />}
                          <span className="flex-1 truncate">{stream.displayTitle}</span>
                        </div>
                      ))}
                      {subtitleStreams.length > 5 && (
                        <div className="px-2 text-xs text-foreground-muted">
                          +{subtitleStreams.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* External Links */}
                {(tmdbId || imdbId) && (
                  <div className="border-t border-border-subtle pt-4">
                    <Typography variant="caption" className="mb-3 flex items-center gap-2 text-foreground-muted">
                      <ExternalLink className="h-4 w-4" />
                      External Links
                    </Typography>
                    <div className="flex flex-wrap gap-2">
                      {tmdbId && (
                        <a
                          href={
                            type === "movie"
                              ? `https://www.themoviedb.org/movie/${tmdbId}`
                              : type === "episode" && seasonIndex !== undefined && episodeIndex !== undefined
                                ? `https://www.themoviedb.org/tv/${tmdbId}/season/${seasonIndex}/episode/${episodeIndex}`
                                : `https://www.themoviedb.org/tv/${tmdbId}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-full bg-[#01b4e4]/20 px-3 py-1.5 text-sm text-[#01b4e4] transition-colors hover:bg-[#01b4e4]/30"
                        >
                          TMDB
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {imdbId && (
                        <a
                          href={`https://www.imdb.com/title/${imdbId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-full bg-[#f5c518]/20 px-3 py-1.5 text-sm text-[#f5c518] transition-colors hover:bg-[#f5c518]/30"
                        >
                          IMDb
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Similar Section (from Plex) */}
            {similar.length > 0 && (
              <MediaRow title="More Like This">
                {similar.map((item) => (
                  <Link
                    key={item.ratingKey}
                    to={`/app/media/${type}/${item.ratingKey}`}
                    className="flex-shrink-0 snap-start"
                  >
                    <MediaCard
                      imageUrl={
                        item.posterUrl ||
                        "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&h=225&fit=crop"
                      }
                      title={item.title}
                    />
                  </Link>
                ))}
              </MediaRow>
            )}

            {/* TMDB Recommendations */}
            {recommendations.length > 0 && (
              <div>
                <div className="mb-4 flex items-baseline justify-between">
                  <Typography variant="title">Recommendations</Typography>
                  <span className="text-xs text-foreground-muted">
                    Powered by TMDB
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {recommendations.map((rec) => (
                    <a
                      key={rec.id}
                      href={rec.tmdbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative"
                    >
                      <div className="aspect-[2/3] overflow-hidden rounded-lg bg-background-elevated">
                        {rec.posterUrl ? (
                          <img
                            src={rec.posterUrl}
                            alt={rec.title}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-foreground-muted">
                            No Image
                          </div>
                        )}
                      </div>
                      <div className="mt-2">
                        <Typography
                          variant="body"
                          className="line-clamp-1 text-sm group-hover:text-accent-primary"
                        >
                          {rec.title}
                        </Typography>
                        <div className="flex items-center gap-2 text-xs text-foreground-muted">
                          {rec.releaseDate && (
                            <span>{rec.releaseDate.substring(0, 4)}</span>
                          )}
                          {rec.rating > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              {rec.rating.toFixed(1)}
                            </span>
                          )}
                          <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </Container>
        </>
      )}
    </div>
  );
}
