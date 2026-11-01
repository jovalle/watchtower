import { afterEach, expect, it, vi } from "vitest";
import { loader as movies } from "~/routes/app.watch.movies";
import { loader as series } from "~/routes/app.watch.series";
vi.mock("~/lib/auth/session.server", () => ({ requireServerToken: async () => "server-user", requirePlexToken: async () => "account-user" }));
vi.mock("~/lib/library-index.server", () => ({ getLibraryIndex: (client: { getLibraryItemsForSections: (keys: string[], options: object) => unknown }, _token: string, keys: string[], options: object) => client.getLibraryItemsForSections(keys, options) }));
vi.mock("~/lib/env.server", () => ({ env: { PLEX_SERVER_URL: "http://plex.test", PLEX_CLIENT_ID: "fixture" } }));
afterEach(() => vi.unstubAllGlobals());
it.each([["movie", movies], ["show", series]] as const)("combines all accessible %s sections and uses the account token for cloud watchlist", async (type, loader) => {
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    const url = new URL(String(input));
    const token = new Headers(init?.headers).get("X-Plex-Token");
    if (url.hostname === "discover.provider.plex.tv") {
      expect(token).toBe("account-user");
      return Response.json({ MediaContainer: { Metadata: [{ ratingKey: "cloud", guid: "plex://a" }] } });
    }
    expect(token).toBe("server-user");
    if (url.pathname === "/library/sections") return Response.json({ MediaContainer: { Directory: [{ key: "1", type }, { key: "2", type }] } });
    const second = url.pathname.includes("/2/");
    return Response.json({ MediaContainer: { totalSize: 1, Metadata: [{ ratingKey: second ? "a" : "z", title: second ? "Alpha" : "Zulu", type, guid: second ? "plex://a" : "plex://z" }] } });
  }));
  const response = await loader({ request: new Request("http://watchtower.test/app/watch/movies"), params: {}, context: {} });
  const data = await response.json();
  expect(data.items.map((item: { ratingKey: string }) => item.ratingKey)).toEqual(["a", "z"]);
  expect(data.items[0].isInWatchlist).toBe(true);
});
it.each([["movie", movies], ["show", series]] as const)("returns one globally sorted %s page and retains the full count", async (type, loader) => {
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "discover.provider.plex.tv") return Response.json({ MediaContainer: { Metadata: [] } });
    if (url.pathname === "/library/sections") return Response.json({ MediaContainer: { Directory: [{ key: "1", type }, { key: "2", type }] } });
    const section = url.pathname.includes("/2/") ? 1 : 0;
    const offset = Number(url.searchParams.get("X-Plex-Container-Start") || 0);
    const limit = Number(url.searchParams.get("X-Plex-Container-Size") || 48);
    const items = Array.from({ length: 35 }, (_, i) => ({ ratingKey: String(i * 2 + section), title: `Title ${String(i * 2 + section).padStart(3, "0")}`, type, guid: `plex://${i * 2 + section}` }));
    return Response.json({ MediaContainer: { totalSize: 35, offset, Metadata: items.slice(offset, offset + limit) } });
  }));
  const response = await loader({ request: new Request("http://watchtower.test/app/watch/movies?page=2"), params: {}, context: {} });
  const data = await response.json();
  expect(data.total).toBe(70);
  expect(data.page).toBe(2);
  expect(data.items).toHaveLength(22);
  expect(data.items[0].ratingKey).toBe("48");
});
it.each([["movie", movies, "/app/watch/"], ["show", series, "/app/media/show/"]] as const)("shuffles across the filtered %s library without exposing a full index", async (type, loader, destination) => {
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "discover.provider.plex.tv") return Response.json({ MediaContainer: { Metadata: [] } });
    if (url.pathname === "/library/sections") return Response.json({ MediaContainer: { Directory: [{ key: "1", type }] } });
    if (!url.pathname.endsWith("/all")) return Response.json({ MediaContainer: { Directory: [] } });
    const offset = Number(url.searchParams.get("X-Plex-Container-Start") || 0);
    const limit = Number(url.searchParams.get("X-Plex-Container-Size") || 48);
    return Response.json({ MediaContainer: { totalSize: 100, offset, Metadata: Array.from({ length: Math.min(limit, 100 - offset) }, (_, i) => ({ ratingKey: String(offset + i), title: `Title ${String(offset + i).padStart(3, "0")}`, type, guid: `plex://${offset + i}` })) } });
  }));
  const response = await loader({ request: new Request("http://watchtower.test/app/watch/movies?shuffle=1"), params: {}, context: {} });
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toMatch(new RegExp(`^${destination}\\d+$`));
});
it("preserves episode-count sorting through the agreed full-index fallback", async () => {
  const paths: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "discover.provider.plex.tv") return Response.json({ MediaContainer: { Metadata: [] } });
    if (url.pathname === "/library/sections") return Response.json({ MediaContainer: { Directory: [{ key: "1", type: "show" }] } });
    paths.push(url.pathname);
    return Response.json({ MediaContainer: { totalSize: 2, offset: 0, Metadata: [{ ratingKey: "a", title: "Alpha", type: "show", leafCount: 5 }, { ratingKey: "b", title: "Beta", type: "show", leafCount: 20 }] } });
  }));
  const response = await series({ request: new Request("http://watchtower.test/app/watch/series?sort=leafCount&dir=desc"), params: {}, context: {} });
  const data = await response.json();
  expect(data.items.map((item: { ratingKey: string }) => item.ratingKey)).toEqual(["b", "a"]);
  expect(paths).toEqual(["/library/sections/1/all"]);
});
it("weights shuffle across all matching sections", async () => {
  const random = vi.spyOn(Math, "random").mockReturnValue(0.75);
  try {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "discover.provider.plex.tv") return Response.json({ MediaContainer: { Metadata: [] } });
      if (url.pathname === "/library/sections") return Response.json({ MediaContainer: { Directory: [{ key: "1", type: "movie" }, { key: "2", type: "movie" }] } });
      if (!url.pathname.endsWith("/all")) return Response.json({ MediaContainer: { Directory: [] } });
      const offset = Number(url.searchParams.get("X-Plex-Container-Start") || 0);
      const limit = Number(url.searchParams.get("X-Plex-Container-Size") || 48);
      const section = url.pathname.includes("/2/") ? "2" : "1";
      return Response.json({ MediaContainer: { totalSize: 100, offset, Metadata: Array.from({ length: Math.min(limit, 100 - offset) }, (_, i) => ({ ratingKey: `${section}-${offset + i}`, title: `Title ${String(offset + i).padStart(3, "0")}`, type: "movie", guid: `plex://${section}-${offset + i}` })) } });
    }));
    const response = await movies({ request: new Request("http://watchtower.test/app/watch/movies?shuffle=1"), params: {}, context: {} });
    expect(response.headers.get("Location")).toBe("/app/watch/2-50");
  } finally { random.mockRestore(); }
});
