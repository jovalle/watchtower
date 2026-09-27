import { describe, it, expect } from "vitest";
import { dedupeByGuid } from "~/lib/plex/client.server";
import type { PlexMediaItem } from "~/lib/plex/types";

const item = (ratingKey: string, guid: string, lastViewedAt?: number) =>
  ({
    ratingKey,
    guid,
    lastViewedAt,
    title: ratingKey,
    type: "movie",
  } as PlexMediaItem);

describe("dedupeByGuid", () => {
  it("keeps the most recently viewed version of the same title", () => {
    const result = dedupeByGuid([
      item("4k", "plex://movie/a", 100),
      item("other", "plex://movie/b", 150),
      item("1080p", "plex://movie/a", 200),
    ]);
    expect(result.map((i) => i.ratingKey)).toEqual(["1080p", "other"]);
  });

  it("falls back to ratingKey when GUID is missing", () => {
    const result = dedupeByGuid([item("1", ""), item("2", "")]);
    expect(result).toHaveLength(2);
  });
});
