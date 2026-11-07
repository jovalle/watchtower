import { describe, expect, it } from "vitest";
import { audioTrack, mediaDetail, mediaSummary } from "~/lib/native/catalog.server";
import type { PlexMediaItem } from "~/lib/plex/types";

const episode: PlexMediaItem = {
  ratingKey: "3", key: "/library/metadata/3", guid: "plex://episode/3", type: "episode", title: "Pilot",
  thumb: "/library/metadata/3/thumb/1", grandparentThumb: "/library/metadata/1/thumb/1",
  summary: "A new beginning.",
};

describe("native presentation metadata", () => {
  it("keeps episode posters and stills separate", () => {
    const result = mediaSummary(episode);
    expect(new URL(result.posterUrl!, "https://watchtower.test").searchParams.get("src")).toBe(episode.grandparentThumb);
    expect(new URL(result.thumbUrl!, "https://watchtower.test").searchParams.get("src")).toBe(episode.thumb);
    expect(result).toMatchObject({ summary: "A new beginning.", clearLogoUrl: null });
  });

  it("maps the upstream clearLogo image through the authenticated image proxy", () => {
    const result = mediaDetail({ ...episode, Image: [
      { type: "snapshot", url: episode.thumb! },
      { type: "clearLogo", url: "/library/metadata/1/clearLogo/123" },
    ] });
    expect(result).toMatchObject({ clearLogoUrl: "/api/v1/images?src=%2Flibrary%2Fmetadata%2F1%2FclearLogo%2F123&w=800&h=310" });
  });

  it("preserves all four real artwork colors without inventing a palette", () => {
    const colors = { topLeft: "44181b", topRight: "55140b", bottomRight: "9A3936", bottomLeft: "31313a" };
    expect(mediaSummary({ ...episode, UltraBlurColors: [colors] })).toMatchObject({ artworkColors: colors });
    expect(mediaDetail({ ...episode, UltraBlurColors: [colors] })).toMatchObject({ artworkColors: colors });
    for (const UltraBlurColors of [undefined, [], [{ ...colors, topLeft: "#44181b" }], [{ ...colors, bottomRight: "invalid" }], [{ topLeft: "44181b" }]]) {
      expect(mediaSummary({ ...episode, UltraBlurColors })).toMatchObject({ artworkColors: null });
    }
  });

  it("keeps absent artwork nullable and rejects unsafe logo sources", () => {
    expect(mediaSummary({ ...episode, thumb: undefined, grandparentThumb: undefined, summary: undefined }))
      .toMatchObject({ posterUrl: null, thumbUrl: null, summary: null, clearLogoUrl: null });
    for (const url of ["https://evil.test/logo.png", "https://private:secret@image.tmdb.org/logo.png", "/library/metadata/1/clearLogo/1?X-Plex-Token=private"]) {
      expect(mediaSummary({ ...episode, Image: [{ type: "clearLogo", url }] })).toMatchObject({ clearLogoUrl: null });
    }
  });
});

describe("native audio descriptions", () => {
  it("keeps commentary separate when streams share the same display title", () => {
    const stream = { id: 3, streamType: 2, codec: "flac", channels: 2, language: "English",
      displayTitle: "English (FLAC Stereo)", title: "  Commentary by Film Historian Tim Lucas  " };
    expect(audioTrack(stream)).toMatchObject({
      title: "English (FLAC Stereo)", description: "Commentary by Film Historian Tim Lucas", audioDescription: false,
    });
    expect(audioTrack({ ...stream, id: 2, title: undefined })).toMatchObject({ title: stream.displayTitle });
  });

  it("does not repeat blank or normalized-equivalent titles as descriptions", () => {
    for (const title of [undefined, "", "  ", "english (flac stereo)", "  ENGLISH   (FLAC Stereo)  "]) {
      expect(audioTrack({ id: 1, streamType: 2, displayTitle: "English (FLAC Stereo)", title }).description ?? null).toBeNull();
    }
    expect(audioTrack({ id: 1, streamType: 2, title: "Commentary" }).description ?? null).toBeNull();
  });
});
