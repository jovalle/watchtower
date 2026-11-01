import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ logo: Promise.resolve<string | null>(null) }));
vi.mock("~/lib/auth/session.server", () => ({ requireServerToken: async () => "user", requirePlexToken: async () => "account" }));
vi.mock("~/lib/auth/user.server", () => ({ getCurrentUser: async () => ({ id: 1 }) }));
vi.mock("~/lib/env.server", () => ({ env: { PLEX_SERVER_URL: "http://plex.test", PLEX_CLIENT_ID: "test" } }));
vi.mock("~/lib/plex/cache.server", () => ({ getCache: async () => null, setCache: async () => {}, getUserCacheKey: (key: string) => key }));
vi.mock("~/lib/settings/storage.server", () => ({ getUserSettings: async () => ({ preferences: { discoveryDisabled: false, showTrending: false, showContinueWatching: true, showRecentlyAdded: true, showCollections: false } }), DEFAULT_PREFERENCES: {} }));
vi.mock("~/lib/tmdb/client.server", () => ({ createTMDBClient: () => ({ getCachedMovieLogoUrl: () => state.logo }) }));
vi.mock("~/lib/home.server", () => ({ personalRecommendations: async () => null }));
import { loader } from "~/routes/app._index";
it("streams the home feed before a slow logo finishes and supplies it later", async () => {
  let release!: (value: string) => void;
  state.logo = new Promise((resolve) => { release = resolve; });
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/library/recentlyAdded") return Response.json({ MediaContainer: { Metadata: [{ ratingKey: "1", title: "Movie", type: "movie", guid: "plex://1" }] } });
    return Response.json({ MediaContainer: { Metadata: [] } });
  }));
  try {
    const result = await Promise.race([loader({ request: new Request("http://localhost/app"), params: {}, context: {} }), new Promise<null>((resolve) => setTimeout(() => resolve(null), 200))]);
    expect(result).not.toBeNull();
    expect(result && "data" in result && result.data.recentlyAdded).toHaveLength(1);
    release("/logo.png");
    expect(result && "data" in result && await result.data.logos).toEqual({ "1": "/logo.png" });
  } finally { release("/logo.png"); vi.unstubAllGlobals(); }
});
