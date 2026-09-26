import { expect, it } from "vitest";
import { excludeLibraryMatches } from "~/lib/search";
it("hides exact library identities despite spelling or release-year differences", () => {
  expect(excludeLibraryMatches([{ id: 17, type: "movie", title: "Amelie" }], [
    { type: "movie", Guid: [{ id: "tmdb://17" }] },
  ])).toEqual([]);
});
it("keeps remakes, movie/show ID collisions, and titles without a proven library identity", () => {
  const external = [{ id: 17, type: "show" as const }, { id: 18, type: "movie" as const }, { id: 19, type: "movie" as const }];
  expect(excludeLibraryMatches(external, [{ type: "movie", guid: "tmdb://17" }, { type: "movie" }])).toEqual(external);
});
