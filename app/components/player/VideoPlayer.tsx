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

// Webkit fullscreen types for iOS
interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void>;
}

interface WebkitHTMLVideoElement extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitSupportsFullscreen?: boolean;
}

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
  const [wantsToPlay, setWantsToPlay] = useState(true); // User's intent - starts true for autoplay
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
  // Scrubber lock for transcoded streams - prevents seeking until stream is ready
  const [scrubberReady, setScrubberReady] = useState(playbackMethod === "direct_play");

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
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigatingRef = useRef(false); // Prevents duplicate stream reloads
  const seekDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSeekRef = useRef<number | null>(null); // Track pending seek position

  // Update method ref when prop changes
  useEffect(() => {
    currentMethodRef.current = playbackMethod;
  }, [playbackMethod]);

  // Reset state when new stream loads
  useEffect(() => {
    console.log("[VideoPlayer] New stream loaded, resetting state");
    isNavigatingRef.current = false;
    pendingSeekRef.current = null;
    hasInitializedRef.current = false;
    // Clear error from previous stream
    setError(null);
    setIsLoading(true);
    // Lock scrubber for transcoded streams until ready
    setScrubberReady(playbackMethod === "direct_play");
    // Clear any pending debounce from previous stream
    if (seekDebounceRef.current) {
      clearTimeout(seekDebounceRef.current);
      seekDebounceRef.current = null;
    }
  }, [src, playbackMethod]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (seekDebounceRef.current) {
        clearTimeout(seekDebounceRef.current);
      }
    };
  }, []);

  // Loading timeout - longer for transcode (30s) vs direct play (15s)
  useEffect(() => {
    if (isLoading && !error) {
      const timeout = playbackMethod === "transcode" ? 30000 : 15000;
      loadingTimeoutRef.current = setTimeout(() => {
        console.log("[VideoPlayer] Loading timeout - resetting navigation state");
        // CRITICAL: Reset navigation ref so user can try again
        isNavigatingRef.current = false;
        pendingSeekRef.current = null;
        setError("Loading is taking too long. The stream may be unavailable.");
        setIsLoading(false);
      }, timeout);
    } else {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    }

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [isLoading, error, playbackMethod]);

  // Unlock scrubber for transcoded streams once enough buffer is available
  // Requires 10 seconds of buffer ahead of current position
  const MIN_BUFFER_FOR_SCRUB = 10; // seconds
  useEffect(() => {
    // Direct play always has scrubber ready
    if (playbackMethod === "direct_play") {
      setScrubberReady(true);
      return;
    }

    // For transcoded streams, check buffer before enabling scrubber
    if (!isLoading && !error && buffered > 0) {
      const video = videoRef.current;
      if (video) {
        const bufferAhead = buffered - video.currentTime;
        if (bufferAhead >= MIN_BUFFER_FOR_SCRUB) {
          if (!scrubberReady) {
            console.log(`[VideoPlayer] Scrubber ready (${bufferAhead.toFixed(1)}s buffered)`);
            setScrubberReady(true);
          }
        }
      }
    }
  }, [playbackMethod, isLoading, error, buffered, currentTime, scrubberReady]);

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

      // Stop all media loading before navigation
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

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

    // Stop all media loading before navigation
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const params = new URLSearchParams();
    if (currentPos > 0) params.set("t", currentPos.toString());
    params.set("quality", "1080p-20");
    params.set("transcode", "1");

    console.log(`[VideoPlayer] Switching to transcode at ${currentPos}ms`);
    navigate(`/app/watch/${ratingKey}?${params.toString()}`, { replace: true });
  }, [hasTriedTranscode, navigate, ratingKey, resumePositionSeconds]);

  /**
   * Reload stream at a specific position (in seconds).
   * This is the centralized function for handling out-of-buffer seeks.
   * It includes guards against duplicate calls and debouncing for rapid scrubs.
   */
  const reloadStreamAtPosition = useCallback((targetSeconds: number, immediate = false) => {
    // Guard against duplicate navigations - just update the pending target
    if (isNavigatingRef.current) {
      pendingSeekRef.current = targetSeconds;
      return;
    }

    const video = videoRef.current;

    const executeReload = (finalTargetSeconds: number) => {
      // Double-check we're not already navigating
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;

      // Lock scrubber until new stream is ready
      setScrubberReady(false);

      console.log(`[VideoPlayer] Reloading stream at ${finalTargetSeconds}s`);

      // Tell Plex to stop the current transcode session before starting a new one
      // This prevents session buildup that causes Plex to fail on subsequent seeks
      if (video && ratingKey) {
        const dur = Math.round((video.duration || 0) * 1000);
        if (dur && !isNaN(dur)) {
          navigator.sendBeacon("/api/plex/timeline", JSON.stringify({
            ratingKey,
            state: "stopped",
            time: Math.round(finalTargetSeconds * 1000),
            duration: dur,
          }));
        }
      }

      // Stop all media loading before navigation
      if (video && video.src) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      setIsLoading(true);

      const params = new URLSearchParams();
      params.set("t", Math.floor(finalTargetSeconds * 1000).toString());
      if (quality) {
        params.set("quality", quality.id);
        if (!quality.isOriginal) {
          params.set("transcode", "1");
        }
      }

      navigate(`/app/watch/${ratingKey}?${params.toString()}`, { replace: true });
    };

    // Clear any pending debounce
    if (seekDebounceRef.current) {
      clearTimeout(seekDebounceRef.current);
      seekDebounceRef.current = null;
    }

    if (immediate) {
      // For immediate mode, use the target directly
      pendingSeekRef.current = null;
      executeReload(targetSeconds);
    } else {
      // Debounce: wait 500ms before reloading to allow for iOS native scrubbing
      // Each call resets the timer and updates the pending target
      pendingSeekRef.current = targetSeconds;
      seekDebounceRef.current = setTimeout(() => {
        // Use the most recent pending target (may have been updated by subsequent calls)
        const finalTarget = pendingSeekRef.current ?? targetSeconds;
        pendingSeekRef.current = null;
        seekDebounceRef.current = null;
        executeReload(finalTarget);
      }, 500);
    }
  }, [navigate, quality, ratingKey]);

  /**
   * Check if a time position is within the buffered range.
   */
  const isTimeBuffered = useCallback((time: number): boolean => {
    const video = videoRef.current;
    if (!video) return false;

    for (let i = 0; i < video.buffered.length; i++) {
      const start = video.buffered.start(i);
      const end = video.buffered.end(i);
      // Allow 5 second tolerance for ongoing buffer
      if (time >= start - 1 && time <= end + 5) {
        return true;
      }
    }
    return false;
  }, []);

  /**
   * Seek to position - handles both buffered and unbuffered seeks.
   * For transcoded streams, seeking beyond buffer requires reloading with new offset.
   */
  const seekToPosition = useCallback((targetTime: number, immediate = false) => {
    const video = videoRef.current;
    if (!video) return;

    // Clamp to valid range
    const clampedTime = Math.max(0, Math.min(targetTime, video.duration || duration));

    // For transcoded streams, check if we need to reload
    const isTranscoding = playbackMethod === "transcode" || playbackMethod === "direct_stream";

    // Block out-of-buffer seeks when scrubber is locked (transcoding not ready)
    if (isTranscoding && !scrubberReady && !isTimeBuffered(clampedTime)) {
      console.log("[VideoPlayer] Scrubber locked - ignoring out-of-buffer seek");
      return;
    }

    // For direct play, always use native seeking (HLS segments are all available)
    // For transcoded streams, only allow native seeking within buffer
    if (!isTranscoding || isTimeBuffered(clampedTime)) {
      video.currentTime = clampedTime;
      setCurrentTime(clampedTime);
    } else {
      // Seek beyond buffer in transcode mode - use centralized reload
      reloadStreamAtPosition(clampedTime, immediate);
    }
  }, [duration, playbackMethod, isTimeBuffered, reloadStreamAtPosition, scrubberReady]);

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
      // Don't clear loading here - let onPlaying handle it
      // This ensures loading spinner shows until video actually starts playing

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
            // Autoplay completely blocked - clear loading and show controls
            setIsLoading(false);
            setWantsToPlay(false);
            setShowControls(true);
          });
        });
      } else if (wantsToPlay && video.paused) {
        // Resume playback after buffering if user intended to play
        video.play().catch(() => {});
      }
    };

    /**
     * Handle native seeking events (e.g., from iOS native fullscreen controls).
     * For transcoded streams seeking outside buffer, we use a longer debounce
     * to capture the final position when user stops dragging.
     *
     * NOTE: We can't rely on `seeked` event because it only fires when seek
     * completes - seeking to an unbuffered position never completes (stalls).
     */
    const onSeeking = () => {
      // Don't handle seeking during initial load or if navigation is already in progress
      if (!hasInitializedRef.current || isNavigatingRef.current) return;

      const isTranscoding = playbackMethod === "transcode" || playbackMethod === "direct_stream";
      if (!isTranscoding) return;

      const seekTarget = video.currentTime;

      // Check if seek target is within buffered range
      if (!isTimeBuffered(seekTarget)) {
        // Track the pending seek target
        pendingSeekRef.current = seekTarget;

        // Show loading UI
        setIsLoading(true);
        setScrubberReady(false);

        // Use debounced reload with longer timeout (500ms) to allow iOS scrubbing
        // The debounce will reset with each seeking event, capturing the final position
        reloadStreamAtPosition(seekTarget, false);
      }
    };

    /**
     * Handle seek completion - used for within-buffer seeks to clear loading state.
     * For out-of-buffer seeks, the video stalls and seeked may not fire,
     * so we rely on the debounced reload from onSeeking.
     */
    const onSeeked = () => {
      // If we completed a seek within buffer, clear loading state
      if (!isNavigatingRef.current && isTimeBuffered(video.currentTime)) {
        setIsLoading(false);
        setScrubberReady(true);
        pendingSeekRef.current = null;
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
      setWantsToPlay(false);
      reportProgress("stopped");
      markWatched();
      setShowControls(true);
    };

    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => {
      setIsLoading(false);
      // Sync intent with actual state when video starts playing
      setWantsToPlay(true);
    };

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
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);

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
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
    };
    }, [isSeeking, checkScrobble, reportProgress, markWatched, ratingKey, resumePositionSeconds, playbackMethod, hasTriedTranscode, retryWithTranscode, wantsToPlay, isTimeBuffered, reloadStreamAtPosition]);

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

  // Fullscreen listener - handle both standard and webkit (iOS) events
  useEffect(() => {
    const video = videoRef.current;

    const onFullscreenChange = () => {
      const isFs = !!(document.fullscreenElement || (document as WebkitDocument).webkitFullscreenElement);
      setIsFullscreen(isFs);
    };

    // iOS video fullscreen events
    const onWebkitBeginFullscreen = () => setIsFullscreen(true);
    const onWebkitEndFullscreen = () => setIsFullscreen(false);

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    video?.addEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen);
    video?.addEventListener("webkitendfullscreen", onWebkitEndFullscreen);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onWebkitEndFullscreen);
      video?.removeEventListener("webkitbeginfullscreen", onWebkitBeginFullscreen);
      video?.removeEventListener("webkitendfullscreen", onWebkitEndFullscreen);
    };
  }, []);

  // Controls auto-hide
  const resetHideControlsTimer = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    setShowControls(true);
    if (wantsToPlay && !isSeeking && !showTooltip && !showSettingsPanel && !showEpisodePanel) {
      hideControlsTimeoutRef.current = setTimeout(() => setShowControls(false), CONTROLS_HIDE_DELAY);
    }
  }, [wantsToPlay, isSeeking, showTooltip, showSettingsPanel, showEpisodePanel]);

  // Toggle fullscreen - handles both standard and iOS webkit APIs
  const toggleFullscreen = useCallback(async () => {
    const video = videoRef.current as WebkitHTMLVideoElement | null;
    const doc = document as WebkitDocument;

    // Check current fullscreen state (standard or webkit)
    const isCurrentlyFullscreen = !!(document.fullscreenElement || doc.webkitFullscreenElement);

    if (!isCurrentlyFullscreen) {
      // Try iOS video fullscreen first (works on iPhones)
      if (video?.webkitSupportsFullscreen && video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
        return;
      }
      // Standard fullscreen API
      if (containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen();
      }
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      } else if (video?.webkitExitFullscreen) {
        video.webkitExitFullscreen();
      }
    }
  }, []);

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
          if (video.paused || !wantsToPlay) {
            setWantsToPlay(true);
            video.play().catch(() => {});
          } else {
            setWantsToPlay(false);
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
          toggleFullscreen();
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
          seekToPosition(video.currentTime - SKIP_DURATION);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekToPosition(video.currentTime + SKIP_DURATION);
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
    }, [resetHideControlsTimer, toggleFullscreen, seekToPosition, showEpisodePanel, showSettingsPanel, showQualityMenu, episodes.length, wantsToPlay]);

  // Control handlers
  const togglePlay = () => {
    const video = videoRef.current;
    if (video) {
      if (video.paused || !wantsToPlay) {
        setWantsToPlay(true);
        video.play().catch(() => {
          // If play fails (e.g., not ready), intent is still set
        });
      } else {
        setWantsToPlay(false);
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

  const skipForward = () => {
    const video = videoRef.current;
    if (video) seekToPosition(video.currentTime + SKIP_DURATION);
  };

  const skipBack = () => {
    const video = videoRef.current;
    if (video) seekToPosition(video.currentTime - SKIP_DURATION);
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

  const handleProgressBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsSeeking(true);

    const bar = progressBarRef.current;
    if (!bar || !duration) return;

    // Calculate initial position
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    let targetTime = (x / rect.width) * duration;
    setCurrentTime(targetTime);
    setHoverTime(targetTime);
    setHoverPosition(x);

    const onMouseMove = (me: MouseEvent) => {
      const rect = bar.getBoundingClientRect();
      const x = Math.max(0, Math.min(me.clientX - rect.left, rect.width));
      targetTime = (x / rect.width) * duration;
      // Only update visual state during drag
      setCurrentTime(targetTime);
      setHoverTime(targetTime);
      setHoverPosition(x);
    };

    const onMouseUp = () => {
      setIsSeeking(false);
      setHoverTime(null);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      // Perform actual seek on release - use immediate mode to skip debounce
      seekToPosition(targetTime, true);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  // Touch event handlers for mobile scrubbing
  const handleProgressBarTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsSeeking(true);

    const bar = progressBarRef.current;
    if (!bar || !duration) return;

    const touch = e.touches[0];
    const rect = bar.getBoundingClientRect();
    const x = Math.max(0, Math.min(touch.clientX - rect.left, rect.width));
    let targetTime = (x / rect.width) * duration;
    setCurrentTime(targetTime);
    setHoverTime(targetTime);
    setHoverPosition(x);

    const onTouchMove = (te: TouchEvent) => {
      te.preventDefault();
      const touch = te.touches[0];
      const rect = bar.getBoundingClientRect();
      const x = Math.max(0, Math.min(touch.clientX - rect.left, rect.width));
      targetTime = (x / rect.width) * duration;
      setCurrentTime(targetTime);
      setHoverTime(targetTime);
      setHoverPosition(x);
    };

    const onTouchEnd = () => {
      setIsSeeking(false);
      setHoverTime(null);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
      // Perform actual seek on release - use immediate mode to skip debounce
      seekToPosition(targetTime, true);
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
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
      onMouseLeave={() => wantsToPlay && !isSeeking && setShowControls(false)}
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

      {/* Loading spinner with back button */}
      {isLoading && !error && (
        <div className="absolute inset-0 z-40 bg-black/50">
          {/* Back button always accessible during loading */}
          <div className="absolute left-0 top-0 p-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
            >
              <ArrowLeft className="h-6 w-6" />
              <span className="hidden sm:inline">Back</span>
            </button>
          </div>
          {/* Centered spinner - absolutely positioned for true center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`h-16 w-16 animate-spin rounded-full border-4 ${
              playbackMethod === "transcode"
                ? "border-mango/20 border-t-mango"
                : "border-white/20 border-t-white"
            }`} />
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="pointer-events-auto absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80">
          <p className="text-lg text-white">{error}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-mango px-6 py-2 font-medium text-black transition-colors hover:bg-mango-hover"
            >
              Retry
            </button>
            {!hasTriedTranscode && playbackMethod === "direct_play" && (
              <button
                onClick={retryWithTranscode}
                className="rounded bg-white/20 px-6 py-2 font-medium text-white transition-colors hover:bg-white/30"
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
          aria-label={wantsToPlay ? "Pause video" : "Play video"}
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

              {/* Progress bar - taller touch target on mobile via padding */}
              <div
                ref={progressBarRef}
                className={`relative h-1 flex-1 rounded-full bg-white/30 transition-all hover:h-2 ${
                  scrubberReady ? "cursor-pointer" : "cursor-not-allowed"
                } before:absolute before:-top-4 before:-bottom-4 before:left-0 before:right-0 before:content-[''] sm:before:-top-2 sm:before:-bottom-2`}
                onMouseMove={handleProgressBarMouseMove}
                onMouseLeave={handleProgressBarMouseLeave}
                onMouseDown={scrubberReady ? handleProgressBarMouseDown : undefined}
                onTouchStart={scrubberReady ? handleProgressBarTouchStart : undefined}
                role="slider"
                tabIndex={0}
                aria-label="Video progress"
                aria-valuemin={0}
                aria-valuemax={duration}
                aria-valuenow={currentTime}
                aria-valuetext={formatTime(currentTime)}
                aria-disabled={!scrubberReady}
                onKeyDown={(e) => {
                  if (!scrubberReady) return;
                  const video = videoRef.current;
                  if (!video) return;
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    seekToPosition(video.currentTime - SKIP_DURATION);
                  } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    seekToPosition(video.currentTime + SKIP_DURATION);
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
                {/* Scrubbing dot - with expanded touch target for mobile */}
                {/* Shows locked state for transcoded streams until buffer is ready */}
                <div
                  className="absolute top-1/2 -translate-y-1/2"
                  style={{ left: `${progressPercent}%`, marginLeft: "-22px" }}
                >
                  {/* Invisible expanded touch target - 44px minimum for mobile accessibility */}
                  <div
                    role="slider"
                    tabIndex={0}
                    aria-label="Seek"
                    aria-valuemin={0}
                    aria-valuemax={duration || 0}
                    aria-valuenow={currentTime}
                    aria-disabled={!scrubberReady}
                    className={`relative flex h-11 w-11 items-center justify-center ${
                      scrubberReady ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed"
                    }`}
                    onMouseDown={scrubberReady ? handleProgressBarMouseDown : undefined}
                    onTouchStart={scrubberReady ? handleProgressBarTouchStart : undefined}
                  >
                    {/* Visual dot */}
                    <div
                      className={`h-5 w-5 rounded-full shadow-md transition-all sm:h-4 sm:w-4 ${
                        scrubberReady
                          ? "bg-mango active:scale-125"
                          : "bg-white/50"
                      } ${
                        hoverTime !== null || isSeeking ? "opacity-100 scale-125" : "opacity-100 sm:opacity-0 sm:group-hover/progress:opacity-100"
                      }`}
                    >
                      {/* Loading ring when scrubber is locked */}
                      {!scrubberReady && playbackMethod !== "direct_play" && (
                        <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-mango" />
                      )}
                    </div>
                  </div>
                </div>
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
                aria-label={wantsToPlay ? "Pause" : "Play"}
              >
                {wantsToPlay ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
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
