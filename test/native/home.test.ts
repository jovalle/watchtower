import { describe, expect, it, vi } from "vitest";
import {
  resolveTrendingLibraryMatches,
  splitContinueWatching,
} from "~/lib/home.server";

describe("shared home helpers", () => {
  it("separates resumable items from next unwatched episodes", () => {
    const items = [
      { type: "movie", viewOffset: 100, viewCount: 0, id: "movie" },
      { type: "episode", viewOffset: 0, viewCount: 0, id: "next" },
      { type: "episode", viewOffset: 0, viewCount: 1, id: "watched" },
    ];

    expect(splitContinueWatching(items)).toEqual({
      continuing: [items[0]],
      nextEpisodes: [items[1]],
    });
  });

  it("matches trending titles by TMDB id and preserves external misses", async () => {
    const match = {
      ratingKey: "library-1",
      key: "/library/metadata/library-1",
      guid: "plex://movie/1",
      type: "movie" as const,
      title: "Library Movie",
    };
    const client = {
      findByTmdbId: vi
        .fn()
        .mockResolvedValueOnce({ success: true, data: [match] })
        .mockResolvedValueOnce({ success: true, data: [] }),
    };
    const recommendations = [
      {
        id: 1,
        type: "movie" as const,
        title: "Movie",
        overview: "",
        posterUrl: null,
        backdropUrl: null,
        rating: 0,
        releaseDate: "2026-01-01",
        tmdbUrl: "https://themoviedb.org/movie/1",
      },
      {
        id: 2,
        type: "show" as const,
        title: "Show",
        overview: "",
        posterUrl: null,
        backdropUrl: null,
        rating: 0,
        releaseDate: "2026-01-01",
        tmdbUrl: "https://themoviedb.org/tv/2",
      },
    ];

    await expect(
      resolveTrendingLibraryMatches(client as never, recommendations),
    ).resolves.toEqual([
      { recommendation: recommendations[0], match },
      { recommendation: recommendations[1], match: null },
    ]);
  });
});