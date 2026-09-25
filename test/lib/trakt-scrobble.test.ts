import { describe, it, expect } from "vitest";
import {
  toScrobbleTarget,
  nextScrobbleAction,
} from "~/lib/trakt/scrobble.server";

describe("toScrobbleTarget", () => {
  it("builds a movie target with title, year, and external IDs", () => {
    expect(
      toScrobbleTarget({
        type: "movie",
        title: "The Matrix",
        year: 1999,
        Guid: [
          { id: "imdb://tt0133093" },
          { id: "tmdb://603" },
          { id: "plex://movie/5d77" },
        ],
      })
    ).toEqual({
      movie: {
        title: "The Matrix",
        year: 1999,
        ids: { imdb: "tt0133093", tmdb: 603 },
      },
    });
  });

  it("builds an episode target from its TVDB ID", () => {
    expect(
      toScrobbleTarget({
        type: "episode",
        title: "Pilot",
        Guid: [{ id: "tvdb://349232" }, { id: "tmdb://63056" }],
      })
    ).toEqual({ episode: { ids: { tvdb: 349232, tmdb: 63056 } } });
  });

  it("falls back to show IDs and episode numbers when the episode has no TVDB ID", () => {
    const episode = {
      type: "episode" as const,
      title: "Pilot",
      parentIndex: 1,
      index: 2,
      Guid: [{ id: "tmdb://63056" }],
    };
    expect(
      toScrobbleTarget(episode, {
        title: "Game of Thrones",
        Guid: [{ id: "tvdb://121361" }],
      })
    ).toEqual({
      show: { title: "Game of Thrones", ids: { tvdb: 121361 } },
      episode: { season: 1, number: 2 },
    });
    expect(toScrobbleTarget(episode)).toEqual({
      episode: { ids: { tmdb: 63056 } },
    });
  });

  it("returns null without usable IDs or for non-playable types", () => {
    expect(
      toScrobbleTarget({
        type: "movie",
        title: "X",
        Guid: [{ id: "plex://movie/5d77" }],
      })
    ).toBeNull();
    expect(
      toScrobbleTarget({
        type: "show",
        title: "X",
        Guid: [{ id: "tmdb://1399" }],
      })
    ).toBeNull();
  });
});

describe("nextScrobbleAction", () => {
  it("starts on first play and ignores repeated progress reports", () => {
    expect(nextScrobbleAction(undefined, "playing")).toBe("start");
    expect(nextScrobbleAction("playing", "playing")).toBeNull();
  });

  it("pauses, resumes, and stops on transitions", () => {
    expect(nextScrobbleAction("playing", "paused")).toBe("pause");
    expect(nextScrobbleAction("paused", "playing")).toBe("start");
    expect(nextScrobbleAction("paused", "stopped")).toBe("stop");
  });

  it("ignores a stop or pause with no prior playback", () => {
    expect(nextScrobbleAction(undefined, "stopped")).toBeNull();
    expect(nextScrobbleAction(undefined, "paused")).toBeNull();
  });
});
