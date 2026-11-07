import { describe, expect, it } from "vitest";
import { castPersonId, mediaDetail } from "~/lib/native/catalog.server";
import type { PlexMetadata } from "~/lib/plex/types";

const movie: PlexMetadata = { ratingKey: "3", key: "/library/metadata/3", guid: "plex://movie/3", type: "movie", title: "A Film" };

describe("native provider ratings", () => {
  it("attributes supplied provider ratings and converts Plex Rotten Tomatoes to percentages", () => {
    expect(mediaDetail({ ...movie, Rating: [
      { image: "imdb://image.rating", value: 8.3, type: "audience" },
      { image: "themoviedb://image.rating", value: 7.8 },
      { image: "thetvdb://image.rating", value: 8 },
      { image: "rottentomatoes://image.rating.ripe", value: 9.2, type: "critic" },
      { image: "rottentomatoes://image.rating.upright", value: 8.1, type: "audience" },
    ] }).ratings).toEqual([
      { source: "imdb", kind: "rating", value: 8.3, maxValue: 10 },
      { source: "tmdb", kind: "rating", value: 7.8, maxValue: 10 },
      { source: "tvdb", kind: "rating", value: 8, maxValue: 10 },
      { source: "rotten_tomatoes", kind: "critic", value: 92, maxValue: 100 },
      { source: "rotten_tomatoes", kind: "audience", value: 81, maxValue: 100 },
    ]);
  });

  it("keeps unknown attribution honest even when IMDb identifiers exist", () => {
    expect(mediaDetail({ ...movie, Guid: [{ id: "imdb://tt1234567" }], rating: 7, audienceRating: 8 }).ratings).toEqual([
      { source: "plex", kind: "rating", value: 7, maxValue: 10 },
      { source: "plex", kind: "audience", value: 8, maxValue: 10 },
    ]);
    expect(mediaDetail({ ...movie, rating: 9, ratingImage: "rottentomatoes://image.rating.ripe", audienceRating: 7.4, audienceRatingImage: "imdb://image.rating" }).ratings).toEqual([
      { source: "rotten_tomatoes", kind: "critic", value: 90, maxValue: 100 },
      { source: "imdb", kind: "rating", value: 7.4, maxValue: 10 },
    ]);
  });

  it("canonicalizes known user-score providers while preserving Rotten Tomatoes and unknown Plex distinctions", () => {
    expect(mediaDetail({ ...movie, Rating: [
      { image: "imdb://image.rating", value: 8.4, type: "audience" },
      { image: "imdb://image.rating", value: 8.4, type: "rating" },
      { image: "themoviedb://image.rating", value: 8, type: "audience" },
      { image: "thetvdb://image.rating", value: 7, type: "audience" },
      { image: "unknown://image.rating", value: 6, type: "critic" },
      { image: "unknown://image.rating", value: 5, type: "audience" },
    ] }).ratings).toEqual([
      { source: "imdb", kind: "rating", value: 8.4, maxValue: 10 },
      { source: "tmdb", kind: "rating", value: 8, maxValue: 10 },
      { source: "tvdb", kind: "rating", value: 7, maxValue: 10 },
      { source: "plex", kind: "critic", value: 6, maxValue: 10 },
      { source: "plex", kind: "audience", value: 5, maxValue: 10 },
    ]);
  });

  it("does not treat bare provider names or malformed image fields as provider provenance", () => {
    for (const ratingImage of ["imdb", "https://imdb.com/image.rating", "unknown://image.rating", 123]) {
      expect(mediaDetail({ ...movie, rating: 8, ratingImage } as unknown as PlexMetadata).ratings).toEqual([
        { source: "plex", kind: "rating", value: 8, maxValue: 10 },
      ]);
    }
  });

  it("omits invalid scores and prefers explicit ratings over duplicate scalar fallbacks", () => {
    for (const value of [NaN, Infinity, -1, 10.1, undefined, null, "8", ""]) {
      expect(mediaDetail({ ...movie, rating: value, Rating: [{ image: "imdb://image.rating", value }] } as unknown as PlexMetadata).ratings).toEqual([]);
    }
    expect(mediaDetail({ ...movie, rating: 7, ratingImage: "imdb://image.rating", Rating: [{ image: "imdb://image.rating", value: 8 }] }).ratings).toEqual([
      { source: "imdb", kind: "rating", value: 8, maxValue: 10 },
    ]);
    expect(mediaDetail(movie).ratings).toEqual([]);
  });
});

describe("native cast identities", () => {
  it("uses safe Plex role identities and stable name/character fallback identities", () => {
    expect(mediaDetail({ ...movie, Role: [{ id: 123, tag: "Actor", role: "Lead" }] }).cast[0].id).toBe("plex:123");
    expect(castPersonId({ tag: "Actor", role: "Lead" })).toMatch(/^name:[a-f0-9]{16}$/);
    expect(castPersonId({ tag: "Actor", role: "Lead" })).toBe(castPersonId({ tag: "Actor", role: "Lead" }));
    expect(castPersonId({ tag: "Actor", role: "Lead" })).not.toBe(castPersonId({ tag: "Actor", role: "Guest" }));
    expect(castPersonId({ id: NaN, tag: "Actor" })).toMatch(/^name:/);
  });
});
