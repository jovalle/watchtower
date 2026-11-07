import { describe, expect, it, vi } from "vitest";
import { audioTrack, mediaSummary, mediaVersions } from "~/lib/native/catalog.server";
import type { PlexMetadata } from "~/lib/plex/types";

const metadata: PlexMetadata = { ratingKey: "42", key: "/library/metadata/42", guid: "plex://movie/42", type: "movie", title: "Fixture" };

describe("hero listing metadata", () => {
  it("maps genres and provider ratings from the listing without upstream requests", () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    try {
      expect(mediaSummary({ ...metadata, Genre: [{ tag: "Drama" }, { tag: "Adventure" }], audienceRating: 8.2, audienceRatingImage: "imdb://image.rating", Rating: [{ image: "rottentomatoes://image.rating.ripe", type: "critic", value: 9.2 }] }))
        .toMatchObject({ genres: ["Drama", "Adventure"], ratings: [{ source: "rotten_tomatoes", kind: "critic", value: 92, maxValue: 100 }, { source: "imdb", kind: "rating", value: 8.2, maxValue: 10 }] });
      expect(mediaSummary(metadata)).toMatchObject({ genres: [], ratings: [] });
      expect(upstream).not.toHaveBeenCalled();
    } finally { upstream.mockRestore(); }
  });
});

describe("selected media-version facts", () => {
  it("keeps actual video stream facts isolated per version and omits private paths", () => {
    const result = mediaVersions({ ...metadata, Media: [
      { id: 1, width: 3840, height: 2160, aspectRatio: 2.35, videoFrameRate: "24p", bitDepth: 8, videoCodec: "hevc", audioCodec: "truehd", Part: [{ id: 11, key: "/library/parts/11/file.mkv", file: "/private/library/film.mkv", size: 123456, Stream: [{ id: 111, streamType: 1, frameRate: "23.976", bitDepth: 10, DOVIProfile: 8 }] }] },
      { id: 2, aspectRatio: 1.78, Part: [{ id: 22, key: "/library/parts/22/file.mp4", Stream: [{ id: 222, streamType: 1, frameRate: "29.97", bitDepth: 8 }] }] },
    ] });
    expect(result[0]).toMatchObject({ aspectRatio: 2.35, frameRate: 23.976, bitDepth: 10, dolbyVisionProfile: 8, hdr: "dolby-vision", audioCodec: "truehd", parts: [{ sizeBytes: 123456 }] });
    expect(result[1]).toMatchObject({ aspectRatio: 1.78, frameRate: 29.97, bitDepth: 8, dolbyVisionProfile: null, hdr: null });
    expect(JSON.stringify(result)).not.toMatch(/private|file\.mkv|Atmos/);
  });

  it("reads the first available video stream when the first part has no analysis", () => {
    expect(mediaVersions({ ...metadata, Media: [{ id: 1, Part: [
      { id: 11, key: "hidden" },
      { id: 12, key: "hidden", Stream: [{ id: 121, streamType: 1, frameRate: 23.976, bitDepth: 10, DOVIProfile: 5 }] },
    ] }] })[0]).toMatchObject({ frameRate: 23.976, bitDepth: 10, dolbyVisionProfile: 5, hdr: "dolby-vision" });
  });

  it("does not expose invalid audio channel counts as technical facts", () => {
    for (const channels of [NaN, Infinity, -1, 0, 2.5]) {
      expect(audioTrack({ id: 1, streamType: 2, channels }).channels).toBeNull();
    }
    expect(audioTrack({ id: 1, streamType: 2, channels: 8 }).channels).toBe(8);
  });

  it("uses reported numeric media facts only when stream facts are absent", () => {
    expect(mediaVersions({ ...metadata, Media: [{ id: 1, videoFrameRate: "25", bitDepth: 10 }] })[0])
      .toMatchObject({ frameRate: 25, bitDepth: 10, aspectRatio: null, dolbyVisionProfile: null });
    expect(mediaVersions({ ...metadata, Media: [{ id: 2, videoFrameRate: "24p" }] })[0].frameRate).toBeNull();
  });

  it("returns null for unknown, nonfinite, nonpositive or malformed technical values", () => {
    for (const value of [undefined, NaN, Infinity, -1, 0]) {
      const version = mediaVersions({ ...metadata, Media: [{ id: 1, aspectRatio: value, bitDepth: value, width: value, height: value, bitrate: value, audioCodec: "truehd", audioChannels: value, Part: [{ id: 11, key: "hidden", size: value, Stream: [{ id: 111, streamType: 1, DOVIProfile: value, frameRate: String(value), bitDepth: value }] }] }] })[0];
      expect(version).toMatchObject({ width: null, height: null, bitrateKbps: null, audioChannels: null, aspectRatio: null, frameRate: null, bitDepth: null, dolbyVisionProfile: null, hdr: null, parts: [{ sizeBytes: null }] });
      expect(version.label).toBe("TRUEHD");
    }
  });
});
