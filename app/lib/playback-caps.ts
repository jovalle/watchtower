/**
 * Browser playback capabilities, detected client-side and sent to loaders in a cookie
 * so the server can choose direct play only for files the browser can decode.
 */

const COOKIE_NAME = "playback_caps";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface PlaybackCaps {
  containers: string[];
  video: string[];
  audio: string[];
}

// Keys are Plex codec/container names.
const CONTAINER_PROBES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};
const VIDEO_PROBES: Record<string, string[]> = {
  h264: ['video/mp4; codecs="avc1.640028"'],
  hevc: ['video/mp4; codecs="hvc1.1.6.L120.90"', 'video/mp4; codecs="hev1.1.6.L120.90"'],
  av1: ['video/mp4; codecs="av01.0.08M.08"'],
  vp9: ['video/webm; codecs="vp9"', 'video/mp4; codecs="vp09.00.10.08"'],
};
const AUDIO_PROBES: Record<string, string[]> = {
  aac: ['audio/mp4; codecs="mp4a.40.2"'],
  mp3: ["audio/mpeg"],
  ac3: ['audio/mp4; codecs="ac-3"'],
  eac3: ['audio/mp4; codecs="ec-3"'],
  opus: ['audio/webm; codecs="opus"', 'audio/mp4; codecs="opus"'],
  flac: ["audio/flac", 'audio/mp4; codecs="flac"'],
};

/** Detects what this browser can play natively via a <video> element. */
export function detectPlaybackCaps(): PlaybackCaps {
  const video = document.createElement("video");
  const can = (type: string) => video.canPlayType(type) !== "";
  const pick = (probes: Record<string, string[]>) =>
    Object.entries(probes)
      .filter(([, types]) => types.some(can))
      .map(([name]) => name);
  return {
    containers: Object.entries(CONTAINER_PROBES)
      .filter(([, type]) => can(type))
      .map(([name]) => name),
    video: pick(VIDEO_PROBES),
    audio: pick(AUDIO_PROBES),
  };
}

export function serializePlaybackCaps(caps: PlaybackCaps): string {
  return [caps.containers, caps.video, caps.audio].map((list) => list.join(",")).join("|");
}

/** Detects capabilities and stores them in a cookie for loaders (client-side). */
export function saveClientPlaybackCaps(): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(serializePlaybackCaps(detectPlaybackCaps()));
  document.cookie = `${COOKIE_NAME}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function parsePlaybackCaps(cookieHeader: string | null): PlaybackCaps | null {
  const raw = cookieHeader
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!raw) return null;
  const parts = decodeURIComponent(raw).split("|");
  if (parts.length !== 3) return null;
  const [containers, video, audio] = parts.map((p) => (p ? p.split(",") : []));
  return { containers, video, audio };
}

/**
 * True when the browser can play the file as-is: supported container, video and audio codecs,
 * and no Dolby Vision profile 5 (which has no fallback layer browsers can decode).
 */
export function canDirectPlay(
  media: { container?: string; videoCodec?: string; audioCodec?: string },
  caps: PlaybackCaps,
  doviProfile?: number,
): boolean {
  if (doviProfile === 5) return false;
  const container = media.container === "m4v" ? "mp4" : media.container;
  return (
    !!container &&
    !!media.videoCodec &&
    !!media.audioCodec &&
    caps.containers.includes(container) &&
    caps.video.includes(media.videoCodec) &&
    caps.audio.includes(media.audioCodec)
  );
}
