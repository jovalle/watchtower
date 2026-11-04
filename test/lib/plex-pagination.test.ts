import { afterEach, expect, it, vi } from "vitest";
import { PlexClient } from "~/lib/plex/client.server";
const client = new PlexClient({ serverUrl: "http://plex.test", token: "fixture", clientId: "fixture" });
afterEach(() => vi.unstubAllGlobals());
it("retrieves every watchlist page and respects an explicit total limit", async () => {
  const offsets: number[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get("X-Plex-Container-Start"));
    const size = Math.min(50, Number(url.searchParams.get("X-Plex-Container-Size")), 123 - offset);
    offsets.push(offset);
    return Response.json({ MediaContainer: { totalSize: 123, offset, Metadata: Array.from({ length: size }, (_, i) => ({ ratingKey: String(offset + i), type: "movie" })) } });
  }));
  const all = await client.getWatchlist();
  expect(all.success && all.data.length).toBe(123);
  expect(offsets).toEqual([0, 50, 100]);
  offsets.length = 0;
  const limited = await client.getWatchlist({ limit: 60 });
  expect(limited.success && limited.data.length).toBe(60);
  expect(offsets).toEqual([0, 50]);
});
it("reads a library beyond 1,000 items even if Plex clamps page size", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = new URL(String(input));
    expect(url.searchParams.get("includeGuids")).toBe("1");
    const offset = Number(url.searchParams.get("X-Plex-Container-Start"));
    return Response.json({ MediaContainer: { totalSize: 1001, offset, Metadata: Array.from({ length: Math.min(500, 1001 - offset) }, (_, i) => ({ ratingKey: String(offset + i), type: "movie" })) } });
  }));
  const result = await client.getLibraryItems("1", { includeGuids: true, all: true });
  expect(result.success && result.data.at(-1)?.ratingKey).toBe("1000");
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("fails visibly if an upstream repeats a page instead of silently truncating or looping", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ MediaContainer: { totalSize: 100, Metadata: [{ ratingKey: "1" }] } })));
  const result = await client.getWatchlist();
  expect(result.success).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("returns a bounded Plex library page with its total and offset", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = new URL(String(input));
    expect(url.pathname).toBe("/library/sections/1/all");
    expect(url.searchParams.get("X-Plex-Container-Start")).toBe("48");
    expect(url.searchParams.get("X-Plex-Container-Size")).toBe("48");
    expect(url.searchParams.get("genre")).toBe("42");
    expect(url.searchParams.get("sort")).toBe("titleSort:desc");
    return Response.json({ MediaContainer: { totalSize: 100, offset: 48, Metadata: [{ ratingKey: "x" }] } });
  }));
  const result = await client.getLibraryPage("1", { offset: 48, limit: 48, genre: "42", sort: "titleSort:desc" });
  expect(result).toMatchObject({ success: true, data: { total: 100, offset: 48, items: [{ ratingKey: "x" }] } });
});
it("rejects a page whose offset or total is missing or inconsistent", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ MediaContainer: { totalSize: 50, offset: 0, Metadata: [{ ratingKey: "x" }] } })));
  const result = await client.getLibraryPage("1", { offset: 48, limit: 48 });
  expect(result.success).toBe(false);
});
it("reads Plex genre and alphabet facet counts without loading titles", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = new URL(String(input));
    expect(url.searchParams.get("unwatched")).toBe("1");
    return Response.json({ MediaContainer: { Directory: [{ key: "42", title: "Action", size: 13 }] } });
  }));
  expect(await client.getLibraryFacet("1", "genre", { filter: "unwatched=1" })).toMatchObject({ success: true, data: [{ key: "42", title: "Action", size: 13 }] });
});
