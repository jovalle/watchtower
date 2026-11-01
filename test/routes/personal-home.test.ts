import { afterEach, expect, it, vi } from "vitest";
import { loader } from "~/routes/app._index";
import { createTMDBClient } from "~/lib/tmdb/client.server";

vi.mock("~/lib/auth/session.server", () => ({ requireServerToken: async (request: Request) => request.headers.get("test-user") || "a", requirePlexToken: async () => "account-token" }));
vi.mock("~/lib/auth/user.server", () => ({ getCurrentUser: async () => ({ id: 1 }) }));
vi.mock("~/lib/env.server", () => ({ env: { PLEX_SERVER_URL: "http://plex.test", PLEX_CLIENT_ID: "test" } }));
vi.mock("~/lib/plex/cache.server", () => ({ getCache: async () => null, setCache: async () => {}, getUserCacheKey: (key: string, token: string) => `${key}-${token}` }));
vi.mock("~/lib/settings/storage.server", () => ({ getUserSettings: async () => ({ preferences: { discoveryDisabled: true, showTrending: true, showContinueWatching: true, showRecentlyAdded: true, showCollections: false } }), DEFAULT_PREFERENCES: {} }));
vi.mock("~/lib/integrations/seerr.server", () => ({ createSeerrClient: async () => null }));
vi.mock("~/lib/tmdb/client.server", () => ({ createTMDBClient: vi.fn(() => { throw new Error("External discovery must not be fetched"); }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("serves independent progress, next episodes, and related unwatched titles without external discovery", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    const url = new URL(String(input));
    const user = new Headers(init?.headers).get("X-Plex-Token");
    if (url.hostname === "discover.provider.plex.tv") {
      expect(user).toBe("account-token");
      return Response.json({ MediaContainer: { Metadata: [] } });
    }
    if (url.pathname === "/library/sections") return Response.json({ MediaContainer: { Directory: [{ key: "1", type: "movie" }] } });
    let items: object[];
    if (url.pathname === "/hubs/continueWatching/items") items = [
      { ratingKey: `${user}-episode`, guid: `${user}-episode`, type: "episode", title: "Started", grandparentTitle: user, viewOffset: 120000, duration: 300000 },
      { ratingKey: `${user}-next`, guid: `${user}-next`, type: "episode", title: "Next", grandparentTitle: user, viewCount: 0, duration: 300000 },
    ];
    else if (url.pathname === "/library/recentlyAdded") items = [{ ratingKey: "recent", type: "movie", title: "Recent" }];
    else if (url.pathname === "/library/sections/1/all") items = [{ ratingKey: `${user}-seed`, type: "movie", title: `${user}'s movie`, lastViewedAt: 1 }];
    else if (url.pathname === `/library/metadata/${user}-seed`) items = [{ ratingKey: `${user}-seed`, type: "movie", title: `${user}'s movie`, Similar: [{ ratingKey: `${user}-related`, tag: "Related" }, { ratingKey: "watched", tag: "Watched" }, { ratingKey: "unavailable", tag: "Restricted" }] }];
    else if (url.pathname === `/library/metadata/${user}-related`) items = [{ ratingKey: `${user}-related`, type: "movie", title: "Related" }];
    else if (url.pathname === "/library/metadata/watched") items = [{ ratingKey: "watched", type: "movie", title: "Watched", viewCount: 1 }];
    else if (url.pathname === "/library/metadata/unavailable") return new Response(null, { status: 403 });
    else throw new Error(`Unexpected fixture request: ${url.pathname}`);
    return Response.json({ MediaContainer: { Metadata: items } });
  }));
  for (const user of ["a", "b"]) {
    const response = await loader({ request: new Request("http://watchtower.test/app", { headers: { "test-user": user } }), params: {}, context: {} });
    const home = response.data;
    const extraRows = await home.extraRows;
    expect(home.continueWatching.map((item) => item.ratingKey)).toEqual([`${user}-episode`]);
    expect(home.nextRows.map((row) => row.title)).toEqual(["Next episodes for you"]);
    expect(extraRows.map((row) => row.title)).toEqual([`Because you watched ${user}'s movie`]);
    expect(home.nextRows[0].items[0].ratingKey).toBe(`${user}-next`);
    expect(extraRows[0].items.map((item) => item.ratingKey)).toEqual([`${user}-related`]);
    expect(home.feedErrors).toEqual([]);
  }
  expect(createTMDBClient).not.toHaveBeenCalled();
});

it("returns the core home feed while optional recommendations are still loading", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/library/sections") await pending;
    if (url.hostname === "discover.provider.plex.tv") return Response.json({ MediaContainer: { Metadata: [] } });
    if (url.pathname === "/library/sections") return Response.json({ MediaContainer: { Directory: [] } });
    return Response.json({ MediaContainer: { Metadata: [{ ratingKey: "1", title: "Movie", type: "movie", guid: "x" }] } });
  }));
  try {
    const response = await Promise.race([
      loader({ request: new Request("http://watchtower.test/app"), params: {}, context: {} }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 200)),
    ]);
    expect(response).not.toBeNull();
    expect(response && "data" in response && response.data.extraRows).toBeInstanceOf(Promise);
  } finally {
    release();
  }
});
