import { afterEach, expect, it, vi } from "vitest";
import { TMDBClient } from "~/lib/tmdb/client.server";
import { PlexClient } from "~/lib/plex/client.server";
afterEach(() => vi.unstubAllGlobals());
it("uses title/episode credits and person endpoints without name search", async () => {
  const urls: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => { const url = new URL(input); urls.push(url); return Response.json(url.pathname.endsWith("/credits") ? { cast: [{ id: 1, name: "Actor", character: "Hero" }], guest_stars: [{ id: 2, name: "Guest", character: "Guest" }] } : url.pathname.endsWith("combined_credits") ? { cast: [] } : { id: 1, biography: "Biography" }); }));
  const tmdb = new TMDBClient("fixture");
  expect(await tmdb.getTitleCast("show", 10, { season: 2, episode: 3 })).toMatchObject({ success: true, data: [{ id: 1 }, { id: 2 }] });
  expect(await tmdb.getPerson(1)).toMatchObject({ success: true, data: { biography: "Biography" } });
  expect(await tmdb.getPersonCredits(1)).toMatchObject({ success: true, data: [] });
  expect(urls.map((url) => url.pathname)).toEqual(["/3/tv/10/season/2/episode/3/credits", "/3/person/1", "/3/person/1/combined_credits"]);
});
it("paginates actor works with external GUIDs and safely encodes the actor filter", async () => {
  const offsets: number[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input); const offset = Number(url.searchParams.get("X-Plex-Container-Start")); offsets.push(offset);
    expect(url.searchParams.get("includeGuids")).toBe("1"); expect(url.searchParams.get("actor")).toBe("7&other=1");
    return Response.json({ MediaContainer: { totalSize: 3, offset, Metadata: Array.from({ length: Math.min(2, 3 - offset) }, (_, index) => ({ ratingKey: String(offset + index) })) } });
  }));
  const result = await new PlexClient({ serverUrl: "https://plex.test", token: "fixture", clientId: "fixture" }).getLibraryItemsByActor("1", "7&other=1");
  expect(result.success && result.data.length).toBe(3); expect(offsets).toEqual([0, 2]);
});
it("uses person search only for the already-verified person's known works, never a same-name ID", async () => {
  const urls: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input); urls.push(url);
    return Response.json({ results: [{ id: 51, name: "Actor & Actor", known_for: [{ id: 999, media_type: "movie" }] },
      { id: 50, name: "Actor & Actor", known_for: [{ id: 30, media_type: "movie" }] }] });
  }));
  const client = new TMDBClient("fixture");
  expect(await client.getPersonKnownFor(50, "Actor & Actor")).toMatchObject({ success: true, data: [{ id: 30 }] });
  expect(await client.getPersonKnownFor(52, "Actor & Actor")).toEqual({ success: true, data: null });
  expect(urls[0].pathname).toBe("/3/search/person"); expect(urls[0].searchParams.get("query")).toBe("Actor & Actor");
  expect(urls[0].searchParams.get("include_adult")).toBe("false");
});
it("treats malformed optional known-for results as unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ results: { unexpected: true } })));
  expect(await new TMDBClient("fixture").getPersonKnownFor(50, "Actor")).toEqual({ success: true, data: null });
});
