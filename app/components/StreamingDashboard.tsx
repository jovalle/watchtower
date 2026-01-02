import { useState, useRef, useEffect } from "react";
import {
  Activity,
  Play,
  Pause,
  Loader2,
  Wifi,
  WifiOff,
  Zap,
  RefreshCw,
  ChevronDown,
  Cpu,
  Monitor,
  Lock,
  Cloud,
  Gauge,
  History,
  Clock,
  X,
} from "lucide-react";
import { useStreamingSessions } from "~/hooks/useStreamingSessions";
import { useSessionHistory } from "~/hooks/useSessionHistory";
import { buildPlexImageUrl } from "~/lib/plex/images";
import type { PlexActiveSession, PlexMediaItem } from "~/lib/plex/types";

/**
 * Format duration from milliseconds to human-readable string.
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Calculate progress percentage from viewOffset and duration.
 */
function calculateProgress(session: PlexActiveSession): number {
  if (!session.duration || !session.viewOffset) return 0;
  return Math.min((session.viewOffset / session.duration) * 100, 100);
}

/**
 * Get display title for a session based on media type.
 */
function getDisplayTitle(session: PlexActiveSession): { primary: string; secondary?: string } {
  if (session.type === "episode") {
    const seasonEpisode = `S${String(session.parentIndex || 1).padStart(2, "0")}E${String(session.index || 1).padStart(2, "0")}`;
    return {
      primary: session.grandparentTitle || session.title,
      secondary: `${seasonEpisode} · ${session.title}`,
    };
  }
  return { primary: session.title };
}

/**
 * Determine if session is using direct play or transcoding.
 */
function isDirectPlay(session: PlexActiveSession): boolean {
  if (!session.TranscodeSession) return true;
  return (
    session.TranscodeSession.videoDecision === "directplay" &&
    session.TranscodeSession.audioDecision === "directplay"
  );
}

/**
 * Format bandwidth in kbps to human-readable format.
 */
function formatBandwidth(kbps: number): string {
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  return `${kbps} Kbps`;
}

/**
 * Format codec names to display-friendly strings.
 */
function formatCodec(codec: string | undefined): string {
  if (!codec) return "Unknown";
  const codecMap: Record<string, string> = {
    hevc: "HEVC",
    h264: "H.264",
    h265: "HEVC",
    vp9: "VP9",
    av1: "AV1",
    aac: "AAC",
    ac3: "AC3",
    eac3: "EAC3",
    dts: "DTS",
    truehd: "TrueHD",
    flac: "FLAC",
    mp3: "MP3",
    opus: "Opus",
    pcm: "PCM",
  };
  return codecMap[codec.toLowerCase()] || codec.toUpperCase();
}

/**
 * Mask an IP address for privacy (keep first octet, mask rest).
 */
function maskIpAddress(ip: string): string {
  if (!ip) return "Unknown";
  // Handle IPv4
  const ipv4Match = ip.match(/^(\d+)\./);
  if (ipv4Match) {
    return `${ipv4Match[1]}.xxx.xxx.xxx`;
  }
  // Handle IPv6 or other formats - just truncate
  if (ip.length > 10) {
    return `${ip.slice(0, 8)}...`;
  }
  return ip;
}

/**
 * Format Unix timestamp to relative time string.
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const viewedAtMs = timestamp * 1000; // Convert Unix timestamp to milliseconds
  const diffMs = now - viewedAtMs;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return "Just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  // For older items, show date
  const date = new Date(viewedAtMs);
  return date.toLocaleDateString();
}

/**
 * Get display title for a recently viewed item based on media type.
 */
function getHistoryDisplayTitle(item: PlexMediaItem): { primary: string; secondary?: string } {
  if (item.type === "episode") {
    const seasonEpisode = `S${String(item.parentIndex || 1).padStart(2, "0")}E${String(item.index || 1).padStart(2, "0")}`;
    return {
      primary: item.grandparentTitle || item.title,
      secondary: `${seasonEpisode} · ${item.title}`,
    };
  }
  return { primary: item.title };
}

/**
 * Compact history card component for displaying recently viewed items.
 */
function HistoryCard({ item }: { item: PlexMediaItem }) {
  const [imgError, setImgError] = useState(false);
  const { primary, secondary } = getHistoryDisplayTitle(item);
  // Use show thumb for episodes, otherwise item thumb
  const rawThumbUrl = item.type === "episode" && item.grandparentThumb
    ? item.grandparentThumb
    : item.thumb;
  const thumbUrl = buildPlexImageUrl(rawThumbUrl);

  return (
    <div className="flex gap-3 p-3 transition-colors hover:bg-background-primary">
      {/* Thumbnail - smaller than SessionCard */}
      <div className="relative h-12 w-9 flex-shrink-0 overflow-hidden rounded bg-background-primary">
        {rawThumbUrl && !imgError ? (
          <img
            src={thumbUrl}
            alt={primary}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <History className="h-4 w-4 text-foreground-muted" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        {/* Title */}
        <p className="truncate text-sm font-medium text-foreground-primary">
          {primary}
        </p>
        {secondary && (
          <p className="truncate text-xs text-foreground-muted">{secondary}</p>
        )}

        {/* Watched time */}
        {item.lastViewedAt && (
          <div className="mt-1 flex items-center gap-1 text-xs text-foreground-secondary">
            <Clock className="h-3 w-3" />
            <span>{formatRelativeTime(item.lastViewedAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Session card component for displaying individual stream info with expandable details.
 */
function SessionCard({ session }: { session: PlexActiveSession }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { primary, secondary } = getDisplayTitle(session);
  const progress = calculateProgress(session);
  const directPlay = isDirectPlay(session);
  const isLocal = session.Session?.location === "lan" || session.Player?.local;
  const isPaused = session.Player?.state === "paused";
  const isBuffering = session.Player?.state === "buffering";

  // Build thumbnail URL - use show thumb for episodes, proxy through our API
  const rawThumbUrl = session.type === "episode" && session.grandparentThumb
    ? session.grandparentThumb
    : session.thumb;
  const thumbUrl = buildPlexImageUrl(rawThumbUrl);

  // User avatars are already full URLs (https://plex.tv/...) - use directly, don't proxy
  const userThumbUrl = session.User?.thumb || null;

  // Transcode session info
  const ts = session.TranscodeSession;
  const isTranscoding = ts && !directPlay;
  const bandwidth = session.Session?.bandwidth;
  const maxBandwidth = 20000; // 20 Mbps typical max for reference

  // Source codec info from media metadata (cast to access Media from PlexMetadata)
  const media = (session as { Media?: Array<{ videoCodec?: string; audioCodec?: string; audioChannels?: number }> }).Media?.[0];
  const sourceVideoCodec = media?.videoCodec;
  const sourceAudioCodec = media?.audioCodec;
  const sourceAudioChannels = media?.audioChannels;

  return (
    <div className="transition-colors hover:bg-background-primary">
      {/* Main card - clickable for expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full gap-3 p-3 text-left"
        aria-expanded={isExpanded}
      >
        {/* Thumbnail */}
        <div className="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded bg-background-primary">
          {rawThumbUrl ? (
            <img
              src={thumbUrl}
              alt={primary}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Activity className="h-5 w-5 text-foreground-muted" />
            </div>
          )}
          {/* Play state overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            {isBuffering ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : isPaused ? (
              <Pause className="h-4 w-4 text-white" />
            ) : (
              <Play className="h-4 w-4 text-white" />
            )}
          </div>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          {/* Title */}
          <p className="truncate text-sm font-medium text-foreground-primary">
            {primary}
          </p>
          {secondary && (
            <p className="truncate text-xs text-foreground-muted">{secondary}</p>
          )}

          {/* User and device */}
          <div className="mt-1 flex items-center gap-2">
            {userThumbUrl && (
              <img
                src={userThumbUrl}
                alt={session.User?.title || "User"}
                className="h-4 w-4 rounded-full"
              />
            )}
            <span className="truncate text-xs text-foreground-secondary">
              {session.User?.title || "Unknown"} · {session.Player?.product || session.Player?.platform || "Unknown"}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-background-primary">
              <div
                className="h-full bg-accent-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-foreground-muted">
              {session.viewOffset ? formatDuration(session.viewOffset) : "0:00"}
              {session.duration && ` / ${formatDuration(session.duration)}`}
            </span>
          </div>

          {/* Status badges */}
          <div className="mt-1.5 flex items-center gap-2">
            {/* Direct play vs transcode */}
            <span
              className={`flex items-center gap-1 text-xs ${
                directPlay ? "text-green-500" : "text-amber-500"
              }`}
              title={directPlay ? "Direct Play" : "Transcoding"}
            >
              <Zap className="h-3 w-3" />
              {directPlay ? "Direct" : "Transcode"}
            </span>

            {/* Local vs remote */}
            <span
              className={`flex items-center gap-1 text-xs ${
                isLocal ? "text-foreground-secondary" : "text-foreground-muted"
              }`}
              title={isLocal ? "Local network" : "Remote"}
            >
              {isLocal ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isLocal ? "Local" : "Remote"}
            </span>
          </div>
        </div>

        {/* Expand/collapse chevron */}
        <div className="flex items-center">
          <ChevronDown
            className={`h-4 w-4 text-foreground-muted transition-transform duration-200 ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {/* Expandable detail panel */}
      <div
        className={`grid transition-all duration-200 ease-out ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-border-subtle bg-background-primary/50 px-3 pb-3 pt-2">
            {/* Transcode Info */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground-secondary">
                <Cpu className="h-3 w-3" />
                {isTranscoding ? "Transcode" : "Playback"}
              </div>
              {isTranscoding && ts ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {/* Video codec */}
                  {ts.videoDecision === "transcode" ? (
                    <div className="text-foreground-muted">
                      Video:{" "}
                      <span className="text-foreground-secondary">
                        {formatCodec(sourceVideoCodec)} → {formatCodec(ts.videoCodec)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-foreground-muted">
                      Video:{" "}
                      <span className="text-green-500">Direct</span>
                    </div>
                  )}
                  {/* Audio codec */}
                  {ts.audioDecision === "transcode" ? (
                    <div className="text-foreground-muted">
                      Audio:{" "}
                      <span className="text-foreground-secondary">
                        {formatCodec(sourceAudioCodec)}
                        {sourceAudioChannels ? ` ${sourceAudioChannels}ch` : ""} → {formatCodec(ts.audioCodec)}
                        {ts.audioChannels ? ` ${ts.audioChannels}ch` : ""}
                      </span>
                    </div>
                  ) : (
                    <div className="text-foreground-muted">
                      Audio:{" "}
                      <span className="text-green-500">Direct</span>
                    </div>
                  )}
                  {/* Resolution */}
                  {ts.width && ts.height && (
                    <div className="text-foreground-muted">
                      Resolution:{" "}
                      <span className="text-foreground-secondary">
                        {ts.width}×{ts.height}
                      </span>
                    </div>
                  )}
                  {/* Speed and HW acceleration */}
                  <div className="flex items-center gap-2 text-foreground-muted">
                    {ts.speed !== undefined && (
                      <span>
                        Speed:{" "}
                        <span className={`${ts.speed >= 1 ? "text-green-500" : "text-amber-500"}`}>
                          {ts.speed.toFixed(1)}×
                        </span>
                      </span>
                    )}
                    <span
                      className={`rounded px-1 text-[10px] font-medium ${
                        ts.transcodeHwFullPipeline
                          ? "bg-green-500/20 text-green-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {ts.transcodeHwFullPipeline ? "HW" : "SW"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-green-500">
                  Direct Play — No transcoding required
                </div>
              )}
            </div>

            {/* Bandwidth */}
            {bandwidth !== undefined && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground-secondary">
                  <Gauge className="h-3 w-3" />
                  Bandwidth
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background-primary">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${Math.min((bandwidth / maxBandwidth) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-foreground-secondary">
                    {formatBandwidth(bandwidth)}
                  </span>
                </div>
              </div>
            )}

            {/* Client Details */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground-secondary">
                <Monitor className="h-3 w-3" />
                Client
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {/* Device */}
                <div className="text-foreground-muted">
                  Device:{" "}
                  <span className="text-foreground-secondary">
                    {session.Player?.device || session.Player?.model || "Unknown"}
                  </span>
                </div>
                {/* Platform */}
                <div className="text-foreground-muted">
                  Platform:{" "}
                  <span className="text-foreground-secondary">
                    {session.Player?.platform}
                    {session.Player?.platformVersion ? ` ${session.Player.platformVersion}` : ""}
                  </span>
                </div>
                {/* Connection */}
                <div className="flex items-center gap-2 text-foreground-muted">
                  Connection:
                  <span className="flex items-center gap-1">
                    {session.Player?.secure && (
                      <span title="Secure connection" className="text-green-500">
                        <Lock className="h-3 w-3" />
                      </span>
                    )}
                    {session.Player?.relayed && (
                      <span title="Relayed through Plex" className="text-blue-400">
                        <Cloud className="h-3 w-3" />
                      </span>
                    )}
                    {!session.Player?.secure && !session.Player?.relayed && (
                      <span className="text-foreground-secondary">Direct</span>
                    )}
                  </span>
                </div>
                {/* IP */}
                <div className="text-foreground-muted">
                  IP:{" "}
                  <span className="text-foreground-secondary">
                    {isLocal ? "LAN" : maskIpAddress(session.Player?.address || "")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type TabType = "active" | "recent";

/**
 * Streaming dashboard dropdown showing active Plex sessions and recent activity.
 *
 * Replaces the notification bell icon in the header with a
 * real-time view of what's currently streaming on the Plex server,
 * plus a tab for recent watch history.
 */
export function StreamingDashboard() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("active");
  const menuRef = useRef<HTMLDivElement>(null);

  // Active sessions - always fetching
  const { sessions, isLoading, error, lastUpdated, refresh } = useStreamingSessions({
    enabled: true,
    pollInterval: 5000,  // Poll every 5 seconds
  });

  // Session history - lazy loaded with pagination
  const {
    history,
    isLoading: historyLoading,
    isLoadingMore: historyLoadingMore,
    error: historyError,
    hasFetched: historyFetched,
    hasMore: historyHasMore,
    refresh: refreshHistory,
    loadMore: loadMoreHistory,
  } = useSessionHistory({ pageSize: 10 });

  // Fetch history when switching to Recent tab (lazy loading)
  useEffect(() => {
    if (activeTab === "recent" && !historyFetched && !historyLoading) {
      refreshHistory();
    }
  }, [activeTab, historyFetched, historyLoading, refreshHistory]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const sessionCount = sessions.length;
  const hasActiveSessions = sessionCount > 0;

  // Filter history to exclude currently active sessions
  const activeRatingKeys = new Set(sessions.map(s => s.ratingKey));
  const filteredHistory = history.filter(h => !activeRatingKeys.has(h.ratingKey));

  const handleRefresh = () => {
    if (activeTab === "active") {
      refresh();
    } else {
      refreshHistory();
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-md p-2 text-foreground-secondary transition-colors hover:bg-background-elevated hover:text-foreground-primary"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Streaming activity: ${sessionCount} active ${sessionCount === 1 ? "stream" : "streams"}`}
      >
        <Activity className="h-5 w-5" />
        {/* Active session badge */}
        {hasActiveSessions && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-primary px-1 text-[10px] font-medium text-black">
            {sessionCount > 9 ? "9+" : sessionCount}
          </span>
        )}
      </button>

      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 sm:hidden ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Panel - bottom sheet on mobile, dropdown on desktop */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] origin-bottom flex-col rounded-t-2xl bg-background-elevated pb-safe shadow-xl ring-1 ring-border-subtle transition-all duration-300 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:z-auto sm:mt-2 sm:max-h-none sm:w-80 sm:origin-top-right sm:rounded-lg sm:pb-0 ${
          isOpen
            ? "translate-y-0 scale-100 opacity-100 sm:translate-y-0"
            : "pointer-events-none translate-y-full scale-100 opacity-0 sm:translate-y-0 sm:scale-95"
        }`}
        role="menu"
      >
        {/* Mobile drag handle indicator */}
        <div className="flex justify-center py-2 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-foreground-muted/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3 sm:pt-3">
          <div>
            <h3 className="text-sm font-medium text-foreground-primary">
              Streaming Activity
            </h3>
            {activeTab === "active" && lastUpdated && (
              <p className="text-xs text-foreground-muted">
                Updated {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRefresh();
              }}
              className="rounded p-1.5 text-foreground-muted transition-colors hover:bg-background-primary hover:text-foreground-secondary"
              aria-label={activeTab === "active" ? "Refresh sessions" : "Refresh history"}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            {/* Mobile close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-1.5 text-foreground-muted transition-colors hover:bg-background-primary hover:text-foreground-secondary sm:hidden"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border-subtle">
          <button
            onClick={() => setActiveTab("active")}
            className={`flex flex-1 items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "active"
                ? "border-b-2 border-accent-primary text-foreground-primary"
                : "text-foreground-muted hover:text-foreground-secondary"
            }`}
          >
            <Activity className="h-4 w-4" />
            Active
            {hasActiveSessions && (
              <span className="ml-1 rounded-full bg-accent-primary/20 px-1.5 text-xs text-accent-primary">
                {sessionCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("recent")}
            className={`flex flex-1 items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "recent"
                ? "border-b-2 border-accent-primary text-foreground-primary"
                : "text-foreground-muted hover:text-foreground-secondary"
            }`}
          >
            <History className="h-4 w-4" />
            Recent
          </button>
        </div>

        {/* Content - flexible height on mobile, fixed on desktop */}
        <div className="flex-1 overflow-y-auto sm:max-h-96">
          {activeTab === "active" ? (
            // Active sessions tab
            isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
              </div>
            ) : error ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-red-400">{error}</p>
                <button
                  onClick={refresh}
                  className="mt-2 text-xs text-foreground-secondary underline hover:text-foreground-primary"
                >
                  Try again
                </button>
              </div>
            ) : hasActiveSessions ? (
              <div className="divide-y divide-border-subtle">
                {sessions.map((session, index) => (
                  <SessionCard
                    key={session.sessionKey || session.ratingKey || index}
                    session={session}
                  />
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <Activity className="mx-auto h-8 w-8 text-foreground-muted" />
                <p className="mt-2 text-sm text-foreground-secondary">
                  No active streams
                </p>
                <p className="mt-1 text-xs text-foreground-muted">
                  Start watching something on Plex to see it here
                </p>
              </div>
            )
          ) : (
            // Recent history tab
            historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
              </div>
            ) : historyError ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-red-400">{historyError}</p>
                <button
                  onClick={refreshHistory}
                  className="mt-2 text-xs text-foreground-secondary underline hover:text-foreground-primary"
                >
                  Try again
                </button>
              </div>
            ) : filteredHistory.length > 0 ? (
              <div>
                <div className="divide-y divide-border-subtle">
                  {filteredHistory.map((item, index) => (
                    <HistoryCard
                      key={`${item.ratingKey}-${index}`}
                      item={item}
                    />
                  ))}
                </div>
                {/* Load More button */}
                {historyHasMore && (
                  <div className="border-t border-border-subtle p-3">
                    <button
                      onClick={loadMoreHistory}
                      disabled={historyLoadingMore}
                      className="flex w-full items-center justify-center gap-2 rounded-md bg-background-primary py-2 text-sm text-foreground-secondary transition-colors hover:bg-background-elevated hover:text-foreground-primary disabled:opacity-50"
                    >
                      {historyLoadingMore ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        "Load more"
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <History className="mx-auto h-8 w-8 text-foreground-muted" />
                <p className="mt-2 text-sm text-foreground-secondary">
                  No recent activity
                </p>
                <p className="mt-1 text-xs text-foreground-muted">
                  Watch history will appear here
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
