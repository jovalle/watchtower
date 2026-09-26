import { describe, it, expect } from "vitest";
import { pickTrailerKey } from "~/lib/tmdb/client.server";

describe("pickTrailerKey", () => {
  it("prefers official trailers over other trailers, teasers and clips", () => {
    expect(
      pickTrailerKey([
        { key: "clip000001", site: "YouTube", type: "Clip", official: true },
        { key: "teaser0001", site: "YouTube", type: "Teaser", official: true },
        {
          key: "fanTrailer",
          site: "YouTube",
          type: "Trailer",
          official: false,
        },
        { key: "offTrailer", site: "YouTube", type: "Trailer", official: true },
      ])
    ).toBe("offTrailer");
  });

  it("ignores non-YouTube videos, featurettes and malformed keys", () => {
    expect(
      pickTrailerKey([
        { key: "vimeo12345", site: "Vimeo", type: "Trailer" },
        { key: "featurette", site: "YouTube", type: "Featurette" },
        { key: 'bad"key><', site: "YouTube", type: "Trailer" },
      ])
    ).toBeNull();
  });
});
