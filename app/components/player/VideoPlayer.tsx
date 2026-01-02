/**
 * Netflix-style VideoPlayer component for HLS streaming.
 * Features: custom controls, quality selection, Plex progress sync, resume playback.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "@remix-run/react";
import type HlsType from "hls.js";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  ArrowLeft,
  Settings,
  Check,
  Zap,
  Loader2,
  ListVideo,
  X,
  ChevronRight,
} from "lucide-react";
import type { QualityProfile, PlaybackMethod } from "~/lib/plex/types";
import { setClientPlaybackPref } from "~/lib/playback-prefs";

interface AudioTrack {
  id: number;
  displayTitle: string;
  language?: string;
  languageCode?: string;
  codec?: string;
  channels?: number;
  selected?: boolean;
}

interface SubtitleTrack {
  id: number;
  displayTitle: string;
  language?: string;
  languageCode?: string;
  codec?: string;
  selected?: boolean;
}

interface EpisodeInfo {
  ratingKey: string;
  title: string;
  index: number;
  thumb?: string;
  summary?: string;
  duration?: number;
  viewOffset?: number;
  viewCount?: number;
}

// Constants
const PROGRESS_REPORT_INTERVAL = 10000; // 10 seconds
const SCROBBLE_THRESHOLD = 0.9; // Mark as watched at 90%
const CONTROLS_HIDE_DELAY = 3000;
const SKIP_DURATION = 10;

export interface VideoPlayerProps {
  src: string;
  title: string;
  subtitle?: string;
  posterUrl?: string;
  durationMs?: number | null;
  resumePositionSeconds?: number;
  ratingKey: string;
  serverUrl?: string;
  token?: string;
  quality?: QualityProfile;
  availableQualities?: QualityProfile[];
  playbackMethod?: PlaybackMethod;
  mediaInfo?: {
    videoCodec?: string;
    audioCodec?: string;
    resolution?: string;
    bitrate?: number;
  };
  audioTracks?: AudioTrack[];
  subtitleTracks?: SubtitleTrack[];
  episodes?: EpisodeInfo[];
  seasonTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function VideoPlayer({
  src,
  title,
  subtitle,
  posterUrl,
  durationMs,
  resumePositionSeconds = 0,
  ratingKey,
  serverUrl: _serverUrl,
  token: _token,
  quality,
  availableQualities = [],
  playbackMethod = "direct_play",
  mediaInfo,
  audioTracks = [],
  subtitleTracks = [],
  episodes = [],
  seasonTitle,
  seasonNumber,
}: VideoPlayerProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const episodePanelRef = useRef<HTMLDivElement>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMs ? durationMs / 1000 : 0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [isSeeking, setIsSeeking] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hasTriedTranscode, setHasTriedTranscode] = useState(playbackMethod === "transcode");

  // Track/Episode panel state
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"quality" | "audio" | "subtitles">("quality");
  const [showEpisodePanel, setShowEpisodePanel] = useState(false);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number | null>(
    audioTracks.find((t) => t.selected)?.id || null
  );
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<number | null>(
    subtitleTracks.find((t) => t.selected)?.id || null
  );

  // Refs for values that shouldn't trigger re-renders
  const hasScrobbledRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const currentMethodRef = useRef(playbackMethod);

  // Update method ref when prop changes
  useEffect(() => {
    currentMethodRef.current = playbackMethod;
  }, [playbackMethod]);

  /**
   * Report progress to Plex
   */
  const reportProgress = useCallback(
    async (state: "playing" | "paused" | "stopped") => {
      const video = videoRef.current;
      if (!video || !ratingKey) return;

      const time = Math.round(video.currentTime * 1000);
      const dur = Math.round(video.duration * 1000);
      if (!dur || isNaN(dur)) return;

      try {
        await fetch("/api/plex/timeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ratingKey, state, time, duration: dur }),
        });
      } catch (e) {
        console.error("Failed to report progress:", e);
      }
    },
    [ratingKey]
  );

  /**
   * Mark as watched
   */
  const markWatched = useCallback(async () => {
    if (!ratingKey || hasScrobbledRef.current) return;
    hasScrobbledRef.current = true;
    try {
      await fetch("/api/plex/scrobble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingKey }),
      });
    } catch (e) {
      console.error("Failed to mark as watched:", e);
      hasScrobbledRef.current = false;
    }
  }, [ratingKey]);

  /**
   * Check if should scrobble
   */
  const checkScrobble = useCallback(() => {
    const video = videoRef.current;
    if (!video || hasScrobbledRef.current || !video.duration) return;
    if (video.currentTime / video.duration >= SCROBBLE_THRESHOLD) {
      markWatched();
    }
  }, [markWatched]);

  /**
   * Handle quality change
   */
  const handleQualityChange = useCallback(
    (newQuality: QualityProfile) => {
      setShowQualityMenu(false);
      const video = videoRef.current;
      const currentPos = video && !isNaN(video.currentTime) && video.currentTime > 0
        ? Math.floor(video.currentTime * 1000)
        : Math.floor(resumePositionSeconds * 1000);

      const params = new URLSearchParams();
      if (currentPos > 0) params.set("t", currentPos.toString());
      params.set("quality", newQuality.id);
      if (!newQuality.isOriginal) params.set("transcode", "1");

      navigate(`/app/watch/${ratingKey}?${params.toString()}`, { replace: true });
    },
    [navigate, ratingKey, resumePositionSeconds]
  );

  /**
   * Retry with transcoding
   */
  const retryWithTranscode = useCallback(() => {
    if (hasTriedTranscode) return;
    setHasTriedTranscode(true);
    setError(null);
    setIsLoading(true);

    const video = videoRef.current;
    const currentPos = video && !isNaN(video.currentTime) && video.currentTime > 0
      ? Math.floor(video.currentTime * 1000)
      : Math.floor(resumePositionSeconds * 1000);

    const params = new URLSearchParams();
    if (currentPos > 0) params.set("t", currentPos.toString());
    params.set("quality", "1080p-20");
    params.set("transcode", "1");

    console.log(`[VideoPlayer] Switching to transcode at ${currentPos}ms`);
    navigate(`/app/watch/${ratingKey}?${params.toString()}`, { replace: true });
  }, [hasTriedTranscode, navigate, ratingKey, resumePositionSeconds]);

  /**
   * Initialize HLS.js or native playback
   * HLS.js is dynamically imported to enable code-splitting (ISS-003)
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const isHls = src.includes(".m3u8");

    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!isHls) {
      video.src = src;
      return;
    }

    // Safari native HLS
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      console.log("[VideoPlayer] Using Safari native HLS");
      video.src = src;
      return;
    }

    // HLS.js for other browsers - dynamically import for code-splitting
    let cancelled = false;

    import("hls.js").then(({ default: HlsClass, Events, ErrorTypes }) => {
      if (cancelled) return;

      if (!HlsClass.isSupported()) {
        setError("HLS streaming not supported in this browser");
        return;
      }

      console.log("[VideoPlayer] Using HLS.js (dynamically loaded)");
      const hls = new HlsClass({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });

      hlsRef.current = hls;
      hls.attachMedia(video);

      hls.on(Events.MEDIA_ATTACHED, () => {
        hls.loadSource(src);
      });

      hls.on(Events.ERROR, (_, data) => {
        console.error("[VideoPlayer] HLS error:", data.type, data.details);
        if (data.fatal) {
          if (data.type === ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            hls.destroy();
            if (playbackMethod === "direct_play" && !hasTriedTranscode) {
              console.log("[VideoPlayer] Direct play failed, trying transcode");
              retryWithTranscode();
            } else {
              setError("Failed to load video. Try a different quality.");
            }
          }
        }
      });
    }).catch((err) => {
      console.error("[VideoPlayer] Failed to load HLS.js:", err);
      if (!cancelled) {
        setError("Failed to load video player. Please refresh the page.");
      }
    });

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, playbackMethod, hasTriedTranscode, retryWithTranscode]);

  /**
   * Video event handlers
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedMetadata = () => {
      console.log("[VideoPlayer] Metadata loaded, duration:", video.duration);
      if (video.duration && !isNaN(video.duration)) {
        setDuration(video.duration);
      }
    };

    const onCanPlay = () => {
      console.log("[VideoPlayer] Can play");
      setIsLoading(false);

      // Auto-play and initial seek (only once)
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;

        // Plex handles resume via offset parameter, but we verify position
        // If video starts at 0 and we expected a resume, seek to it
        if (resumePositionSeconds > 0 && video.currentTime < resumePositionSeconds - 5) {
          console.log(`[VideoPlayer] Seeking to resume position: ${resumePositionSeconds}s`);
          video.currentTime = resumePositionSeconds;
        }

        video.play().catch((e) => {
          console.log("[VideoPlayer] Autoplay blocked:", e.message);
          video.muted = true;
          setIsMuted(true);
          video.play().catch(() => {
            setShowControls(true);
          });
        });
      }
    };

    const onTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(video.currentTime);
      }
      checkScrobble();
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
      reportProgress("playing");
      // Save successful method preference
      setClientPlaybackPref(ratingKey, currentMethodRef.current);
    };

    const onPause = () => {
      setIsPlaying(false);
      reportProgress("paused");
      setShowControls(true);
    };

    const onEnded = () => {
      setIsPlaying(false);
      reportProgress("stopped");
      markWatched();
      setShowControls(true);
    };

    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => setIsLoading(false);

    const onError = () => {
      const err = video.error;
      console.error("[VideoPlayer] Video error:", err?.code, err?.message);

      if (playbackMethod === "direct_play" && !hasTriedTranscode) {
        console.log("[VideoPlayer] Direct play failed, trying transcode");
        retryWithTranscode();
        return;
      }

      let msg = "Failed to load video";
      if (err) {
        switch (err.code) {
          case MediaError.MEDIA_ERR_NETWORK:
            msg = "Network error while loading video";
            break;
          case MediaError.MEDIA_ERR_DECODE:
            msg = "Video format not supported";
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            msg = "Video source not supported";
            break;
        }
      }
      setError(msg);
      setIsLoading(false);
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
    };
  }, [isSeeking, checkScrobble, reportProgress, markWatched, ratingKey, resumePositionSeconds, playbackMethod, hasTriedTranscode, retryWithTranscode]);

  // Progress reporting interval
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => reportProgress("playing"), PROGRESS_REPORT_INTERVAL);
    return () => clearInterval(interval);
  }, [isPlaying, reportProgress]);

  // Report stopped on unmount
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (video && ratingKey) {
        const time = Math.round(video.currentTime * 1000);
        const dur = Math.round(video.duration * 1000);
        if (dur && !isNaN(dur)) {
          navigator.sendBeacon("/api/plex/timeline", JSON.stringify({
            ratingKey,
            state: "stopped",
            time,
            duration: dur,
          }));
        }
      }
    };
  }, [ratingKey]);

  // Fullscreen listener
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Controls auto-hide
  const resetHideControlsTimer = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    setShowControls(true);
    if (isPlaying && !isSeeking && !showTooltip && !showSettingsPanel && !showEpisodePanel) {
      hideControlsTimeoutRef.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_DELAY);
    }
  }, [isPlaying, isSeeking, showTooltip, showSettingsPanel, showEpisodePanel]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          if (showEpisodePanel) {
            setShowEpisodePanel(false);
          } else if (showSettingsPanel) {
            setShowSettingsPanel(false);
          } else if (showQualityMenu) {
            setShowQualityMenu(false);
          }
          break;
        case " ":
        case "k":
          e.preventDefault();
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
          break;
        case "m":
          e.preventDefault();
          video.muted = !video.muted;
          setIsMuted(video.muted);
          break;
        case "f":
          e.preventDefault();
          if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
          } else {
            document.exitFullscreen();
          }
          break;
        case "e":
          // Toggle episode panel for TV shows
          if (episodes.length > 0) {
            e.preventDefault();
            setShowEpisodePanel((prev) => !prev);
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - SKIP_DURATION);
          break;
        case "ArrowRight":
          e.preventDefault();
          video.currentTime = Math.min(video.duration, video.currentTime + SKIP_DURATION);
          break;
        case "ArrowUp":
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          setVolume(video.volume);
          break;
        case "ArrowDown":
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          setVolume(video.volume);
          break;
      }
      resetHideControlsTimer();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resetHideControlsTimer, showEpisodePanel, showSettingsPanel, showQualityMenu, episodes.length]);

  // Control handlers
  const togglePlay = () => {
    const video = videoRef.current;
    if (video) {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (video) {
      video.muted = !video.muted;
      setIsMuted(video.muted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (video) {
      const vol = parseFloat(e.target.value);
      video.volume = vol;
      setVolume(vol);
      setIsMuted(vol === 0);
    }
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const skipForward = () => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.min(video.duration, video.currentTime + SKIP_DURATION);
  };

  const skipBack = () => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.max(0, video.currentTime - SKIP_DURATION);
  };

  /**
   * Navigate to a different episode
   */
  const handleEpisodeSelect = useCallback(
    (episodeRatingKey: string) => {
      setShowEpisodePanel(false);
      navigate(`/app/watch/${episodeRatingKey}`, { replace: true });
    },
    [navigate]
  );

  /**
   * Build thumbnail URL for episodes
   */
  const buildThumbUrl = useCallback(
    (thumbPath?: string) => {
      if (!thumbPath) return undefined;
      return `/api/plex/image?path=${encodeURIComponent(thumbPath)}&width=240&height=135`;
    },
    []
  );

  // Progress bar handlers
  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHoverTime((x / rect.width) * duration);
    setHoverPosition(x);
  };

  const handleProgressBarMouseLeave = () => {
    if (!isSeeking) setHoverTime(null);
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    const video = videoRef.current;
    if (!bar || !video || !duration) return;
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    video.currentTime = (x / rect.width) * duration;
    setCurrentTime(video.currentTime);
  };

  const handleProgressBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsSeeking(true);
    handleProgressBarClick(e);

    const bar = progressBarRef.current;
    const video = videoRef.current;
    if (!bar || !video || !duration) return;

    const onMouseMove = (me: MouseEvent) => {
      const rect = bar.getBoundingClientRect();
      const x = Math.max(0, Math.min(me.clientX - rect.left, rect.width));
      video.currentTime = (x / rect.width) * duration;
      setCurrentTime(video.currentTime);
      setHoverTime(video.currentTime);
      setHoverPosition(x);
    };

    const onMouseUp = () => {
      setIsSeeking(false);
      setHoverTime(null);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

  const getMethodLabel = () => {
    switch (playbackMethod) {
      case "direct_play": return "Direct Play";
      case "direct_stream": return "Direct Stream";
      case "transcode": return "Transcoding";
      default: return "";
    }
  };

  return (
    <div
      ref={containerRef}
      className="group relative flex h-full w-full items-center justify-center bg-black"
      onMouseMove={resetHideControlsTimer}
      onMouseLeave={() => isPlaying && !isSeeking && setShowControls(false)}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        className="h-full w-full cursor-pointer"
        playsInline
        preload="auto"
        poster={posterUrl}
        onClick={togglePlay}
        aria-label={`Video player: ${title}`}
      />

      {/* Loading spinner */}
      {isLoading && !error && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/50">
          <div className={`h-16 w-16 animate-spin rounded-full border-4 ${
            playbackMethod === "transcode"
              ? "border-mango/20 border-t-mango"
              : "border-white/20 border-t-white"
          }`} />
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80">
          <p className="text-lg text-white">{error}</p>
          <div className="flex items-center gap-3">
            {!hasTriedTranscode && playbackMethod === "direct_play" && (
              <button
                onClick={retryWithTranscode}
                className="rounded bg-mango px-6 py-2 font-medium text-black transition-colors hover:bg-mango-hover"
              >
                Try Transcoding
              </button>
            )}
            <button
              onClick={() => navigate(-1)}
              className="rounded bg-white px-6 py-2 font-medium text-black transition-colors hover:bg-white/90"
            >
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 z-30 flex flex-col justify-between transition-opacity duration-300 ${
          (showControls || isSeeking) && !isLoading && !error ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {/* Top bar */}
        <div className="bg-gradient-to-b from-black/70 via-black/30 to-transparent p-4 pb-12">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 rounded-full p-2 text-white transition-colors hover:bg-white/10"
          >
            <ArrowLeft className="h-6 w-6" />
            <span className="hidden sm:inline">Back</span>
          </button>
        </div>

        {/* Click area to toggle play/pause */}
        <div
          className="flex-1 cursor-pointer"
          onClick={togglePlay}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              togglePlay();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={isPlaying ? "Pause video" : "Play video"}
        />

        {/* Bottom controls */}
        <div className="bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 pt-12">
          {/* Title */}
          <div className="mb-4">
            <h1 className="text-lg font-bold text-white sm:text-xl">{title}</h1>
            {subtitle && <p className="text-sm text-white/70">{subtitle}</p>}
          </div>

          {/* Progress bar */}
          <div className="group/progress relative mb-3">
            {hoverTime !== null && (
              <div
                className="absolute bottom-full mb-4 -translate-x-1/2 transform"
                style={{ left: hoverPosition }}
              >
                <div className="rounded bg-black/90 px-2 py-1 text-sm font-medium text-white">
                  {formatTime(hoverTime)}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <span className="min-w-[3rem] text-xs text-white/80 sm:text-sm">
                {formatTime(currentTime)}
              </span>

              <div
                ref={progressBarRef}
                className="relative h-1 flex-1 cursor-pointer rounded-full bg-white/30 transition-all hover:h-2"
                onMouseMove={handleProgressBarMouseMove}
                onMouseLeave={handleProgressBarMouseLeave}
                onMouseDown={handleProgressBarMouseDown}
                role="slider"
                tabIndex={0}
                aria-label="Video progress"
                aria-valuemin={0}
                aria-valuemax={duration}
                aria-valuenow={currentTime}
                aria-valuetext={formatTime(currentTime)}
                onKeyDown={(e) => {
                  const video = videoRef.current;
                  if (!video) return;
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    video.currentTime = Math.max(0, video.currentTime - SKIP_DURATION);
                  } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    video.currentTime = Math.min(video.duration, video.currentTime + SKIP_DURATION);
                  }
                }}
              >
                <div
                  className="pointer-events-none absolute h-full rounded-full bg-white/40"
                  style={{ width: `${bufferedPercent}%` }}
                />
                <div
                  className="pointer-events-none absolute h-full rounded-full bg-mango"
                  style={{ width: `${progressPercent}%` }}
                />
                <div
                  className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-mango shadow-md transition-opacity ${
                    hoverTime !== null || isSeeking ? "opacity-100" : "opacity-0 group-hover/progress:opacity-100"
                  }`}
                  style={{ left: `${progressPercent}%`, marginLeft: "-8px" }}
                />
              </div>

              <span className="min-w-[3rem] text-right text-xs text-white/80 sm:text-sm">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="rounded p-2 text-white transition-colors hover:bg-white/10"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>

              <button
                onClick={skipBack}
                className="rounded p-2 text-white transition-colors hover:bg-white/10"
                aria-label="Skip back 10 seconds"
              >
                <SkipBack className="h-5 w-5" />
              </button>

              <button
                onClick={skipForward}
                className="rounded p-2 text-white transition-colors hover:bg-white/10"
                aria-label="Skip forward 10 seconds"
              >
                <SkipForward className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-1">
                <button
                  onClick={toggleMute}
                  className="rounded p-2 text-white transition-colors hover:bg-white/10"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="hidden h-1 w-16 cursor-pointer accent-white sm:block"
                  aria-label="Volume"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Playback status */}
              <div
                className="relative hidden items-center gap-1.5 rounded bg-black/60 px-2 py-1 text-xs text-white/70 sm:flex cursor-help"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
              >
                {playbackMethod === "transcode" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-mango" />
                ) : (
                  <Zap className="h-3 w-3 text-green-400" />
                )}
                <span>{getMethodLabel()}</span>
                {quality && <span className="text-white/50">• {quality.label}</span>}

                {showTooltip && mediaInfo && (
                  <div className="absolute bottom-full right-0 mb-2 w-56 rounded-lg bg-black/95 p-3 shadow-2xl ring-1 ring-white/20 text-left">
                    <div className="mb-2 text-xs font-semibold text-white/90 uppercase tracking-wide">Stream Info</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-white/50">Method:</span>
                        <span className="text-white">{getMethodLabel()}</span>
                      </div>
                      {mediaInfo.resolution && (
                        <div className="flex justify-between">
                          <span className="text-white/50">Resolution:</span>
                          <span className="text-white">{mediaInfo.resolution}</span>
                        </div>
                      )}
                      {mediaInfo.videoCodec && (
                        <div className="flex justify-between">
                          <span className="text-white/50">Video:</span>
                          <span className="text-white">{mediaInfo.videoCodec.toUpperCase()}</span>
                        </div>
                      )}
                      {mediaInfo.audioCodec && (
                        <div className="flex justify-between">
                          <span className="text-white/50">Audio:</span>
                          <span className="text-white">{mediaInfo.audioCodec.toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Episode list button - only for TV shows */}
              {episodes.length > 0 && (
                <button
                  onClick={() => setShowEpisodePanel(true)}
                  className="rounded p-2 text-white transition-colors hover:bg-white/10"
                  aria-label="Episode list"
                >
                  <ListVideo className="h-5 w-5" />
                </button>
              )}

              {/* Settings button - Quality, Audio, Subtitles */}
              {(availableQualities.length > 0 || audioTracks.length >= 1 || subtitleTracks.length > 0) && (
                <button
                  onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                  className={`rounded p-2 transition-colors hover:bg-white/10 ${
                    selectedSubtitleTrack ? "text-mango" : "text-white"
                  }`}
                  aria-label="Settings"
                >
                  <Settings className="h-5 w-5" />
                </button>
              )}

              <button
                onClick={toggleFullscreen}
                className="rounded p-2 text-white transition-colors hover:bg-white/10"
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Panel - Audio, Subtitles, Quality */}
      {showSettingsPanel && (
        <div className="absolute bottom-24 right-4 z-40 w-72 overflow-hidden rounded-lg bg-black/95 shadow-xl ring-1 ring-white/20">
          {/* Tabs */}
          <div className="flex border-b border-white/10">
            {availableQualities.length > 0 && (
              <button
                onClick={() => setSettingsTab("quality")}
                className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  settingsTab === "quality" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/70"
                }`}
              >
                Quality
              </button>
            )}
            {audioTracks.length >= 1 && (
              <button
                onClick={() => setSettingsTab("audio")}
                className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  settingsTab === "audio" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/70"
                }`}
              >
                Audio
              </button>
            )}
            {subtitleTracks.length > 0 && (
              <button
                onClick={() => setSettingsTab("subtitles")}
                className={`flex-1 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  settingsTab === "subtitles" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/70"
                }`}
              >
                Subtitles
              </button>
            )}
          </div>

          {/* Content */}
          <div className="max-h-64 overflow-y-auto">
            {/* Quality tab */}
            {settingsTab === "quality" && (
              <div>
                {availableQualities.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => {
                      handleQualityChange(q);
                      setShowSettingsPanel(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-white/10 ${
                      quality?.id === q.id ? "text-white" : "text-white/70"
                    }`}
                  >
                    <span>{q.label}</span>
                    {quality?.id === q.id && <Check className="h-4 w-4 text-mango" />}
                  </button>
                ))}
              </div>
            )}

            {/* Audio tab */}
            {settingsTab === "audio" && (
              <div>
                {audioTracks.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => {
                      setSelectedAudioTrack(track.id);
                      // Note: Actually switching audio tracks requires re-requesting the stream with different parameters
                      // For now, we track the selection locally
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-white/10 ${
                      selectedAudioTrack === track.id ? "text-white" : "text-white/70"
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span>{track.displayTitle}</span>
                      {track.codec && (
                        <span className="text-xs text-white/40">
                          {track.codec.toUpperCase()}
                          {track.channels && ` • ${track.channels}ch`}
                        </span>
                      )}
                    </div>
                    {selectedAudioTrack === track.id && <Check className="h-4 w-4 text-mango" />}
                  </button>
                ))}
              </div>
            )}

            {/* Subtitles tab */}
            {settingsTab === "subtitles" && (
              <div>
                <button
                  onClick={() => setSelectedSubtitleTrack(null)}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-white/10 ${
                    selectedSubtitleTrack === null ? "text-white" : "text-white/70"
                  }`}
                >
                  <span>Off</span>
                  {selectedSubtitleTrack === null && <Check className="h-4 w-4 text-mango" />}
                </button>
                {subtitleTracks.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => {
                      setSelectedSubtitleTrack(track.id);
                      // Note: Actually switching subtitles requires re-requesting the stream
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-white/10 ${
                      selectedSubtitleTrack === track.id ? "text-white" : "text-white/70"
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span>{track.displayTitle}</span>
                      {track.codec && (
                        <span className="text-xs text-white/40">{track.codec.toUpperCase()}</span>
                      )}
                    </div>
                    {selectedSubtitleTrack === track.id && <Check className="h-4 w-4 text-mango" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Episode Panel - Slide out from right */}
      <div
        ref={episodePanelRef}
        className={`absolute right-0 top-0 z-50 h-full w-full max-w-md transform bg-black/95 shadow-2xl transition-transform duration-300 ease-out ${
          showEpisodePanel ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h2 className="text-lg font-semibold text-white">
            {seasonTitle || `Season ${seasonNumber}`}
          </h2>
          <button
            onClick={() => setShowEpisodePanel(false)}
            className="rounded p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Episode list */}
        <div className="h-[calc(100%-64px)] overflow-y-auto">
          {episodes.map((episode) => {
            const isCurrentEpisode = episode.ratingKey === ratingKey;
            const isWatched = (episode.viewCount || 0) > 0;
            const progress = episode.viewOffset && episode.duration
              ? (episode.viewOffset / episode.duration) * 100
              : 0;

            return (
              <button
                key={episode.ratingKey}
                onClick={() => !isCurrentEpisode && handleEpisodeSelect(episode.ratingKey)}
                className={`flex w-full gap-3 p-3 text-left transition-colors ${
                  isCurrentEpisode
                    ? "bg-mango/20"
                    : "hover:bg-white/5"
                }`}
              >
                {/* Thumbnail */}
                <div className="relative h-20 w-36 flex-shrink-0 overflow-hidden rounded bg-white/5">
                  {episode.thumb ? (
                    <img
                      src={buildThumbUrl(episode.thumb)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/20">
                      <ListVideo className="h-8 w-8" />
                    </div>
                  )}
                  {/* Progress bar */}
                  {progress > 0 && progress < 90 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                      <div
                        className="h-full bg-mango"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                  {/* Watched indicator */}
                  {isWatched && progress >= 90 && (
                    <div className="absolute right-1 top-1 rounded bg-black/60 p-0.5">
                      <Check className="h-3 w-3 text-green-400" />
                    </div>
                  )}
                  {/* Playing indicator */}
                  {isCurrentEpisode && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Play className="h-8 w-8 text-mango" fill="currentColor" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isCurrentEpisode ? "text-mango" : "text-white"}`}>
                      {episode.index}
                    </span>
                    <span className={`truncate text-sm font-medium ${isCurrentEpisode ? "text-mango" : "text-white"}`}>
                      {episode.title}
                    </span>
                  </div>
                  {episode.summary && (
                    <p className="mt-1 line-clamp-2 text-xs text-white/50">
                      {episode.summary}
                    </p>
                  )}
                  {episode.duration && (
                    <p className="mt-1 text-xs text-white/30">
                      {formatTime(episode.duration / 1000)}
                    </p>
                  )}
                </div>

                {/* Arrow */}
                {!isCurrentEpisode && (
                  <ChevronRight className="h-5 w-5 flex-shrink-0 self-center text-white/30" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Backdrop for episode panel */}
      {showEpisodePanel && (
        <div
          className="absolute inset-0 z-40 bg-black/50"
          onClick={() => setShowEpisodePanel(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter") {
              setShowEpisodePanel(false);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Close episode panel"
        />
      )}
    </div>
  );
}
