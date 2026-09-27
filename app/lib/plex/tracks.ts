import type { PlexStream } from "./types";

const SIDECAR_CODECS = new Set(["srt", "subrip", "vtt", "webvtt"]);

/** External text subtitles load as a WebVTT sidecar; embedded, styled, or image subtitles are burned in by Plex. */
export function canSidecar(stream: Pick<PlexStream, "codec" | "key">): boolean {
  return !!stream.key && SIDECAR_CODECS.has(stream.codec?.toLowerCase() ?? "");
}

/** What the user's saved Plex track selection requires from playback. */
export function selectedTrackNeeds(streams: PlexStream[]): {
  burnSubtitleId: number | null;
  nonDefaultAudio: boolean;
} {
  const subtitle = streams.find((s) => s.streamType === 3 && s.selected);
  const audio = streams.filter((s) => s.streamType === 2);
  const defaultAudio = audio.find((s) => s.default) ?? audio[0];
  const selectedAudio = audio.find((s) => s.selected) ?? defaultAudio;
  return {
    burnSubtitleId: subtitle && !canSidecar(subtitle) ? subtitle.id : null,
    nonDefaultAudio: selectedAudio?.id !== defaultAudio?.id,
  };
}

/** Converts SubRip to WebVTT; WebVTT passes through. */
export function toWebVtt(text: string): string {
  const body = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (body.startsWith("WEBVTT")) return body;
  return `WEBVTT\n\n${body.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}
