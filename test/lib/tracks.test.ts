import { describe, it, expect } from "vitest";
import { canSidecar, selectedTrackNeeds, toWebVtt } from "~/lib/plex/tracks";
import type { PlexStream } from "~/lib/plex/types";

const audio = (id: number, extra: Partial<PlexStream> = {}): PlexStream => ({ id, streamType: 2, ...extra });
const sub = (id: number, extra: Partial<PlexStream> = {}): PlexStream => ({ id, streamType: 3, ...extra });

describe("canSidecar", () => {
  it("sidecars only external SRT/VTT files", () => {
    expect(canSidecar({ codec: "srt", key: "/library/streams/9" })).toBe(true);
    expect(canSidecar({ codec: "srt" })).toBe(false);
    expect(canSidecar({ codec: "pgs", key: "/library/streams/9" })).toBe(false);
    expect(canSidecar({ codec: "ass", key: "/library/streams/9" })).toBe(false);
  });
});

describe("selectedTrackNeeds", () => {
  it("needs nothing for the default audio and no subtitles", () => {
    expect(selectedTrackNeeds([audio(1, { default: true }), audio(2)])).toEqual({
      burnSubtitleId: null,
      nonDefaultAudio: false,
    });
  });

  it("flags a saved non-default audio track and a subtitle that must be burned in", () => {
    const streams = [audio(1, { default: true }), audio(2, { selected: true }), sub(7, { codec: "pgs", selected: true })];
    expect(selectedTrackNeeds(streams)).toEqual({ burnSubtitleId: 7, nonDefaultAudio: true });
  });

  it("does not burn in a selected external SRT", () => {
    const streams = [audio(1), sub(8, { codec: "srt", key: "/library/streams/8", selected: true })];
    expect(selectedTrackNeeds(streams).burnSubtitleId).toBeNull();
  });
});

describe("toWebVtt", () => {
  it("converts SubRip line endings, BOM, and timestamps", () => {
    expect(toWebVtt("\uFEFF1\r\n00:00:01,500 --> 00:00:02,000\r\nHi\r\n")).toBe(
      "WEBVTT\n\n1\n00:00:01.500 --> 00:00:02.000\nHi\n"
    );
  });

  it("passes WebVTT through", () => {
    expect(toWebVtt("WEBVTT\n\n00:01.000 --> 00:02.000\nHi")).toBe("WEBVTT\n\n00:01.000 --> 00:02.000\nHi");
  });
});
