import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({ requireNativePrincipal: vi.fn(), getUserSettings: vi.fn() }));
vi.mock("~/lib/native/principal.server", () => dependencies);
vi.mock("~/lib/settings/storage.server", () => dependencies);
vi.mock("~/lib/trakt/client.server", () => ({
  createTraktClient: async () => ({ getPublicWatchlist: async () => ({ success: true, data: [
    { type: "movie", listed_at: "2026-01-01", movie: { title: "TMDB poster", ids: { trakt: 4, imdb: "tt0000004", tmdb: 4 } } },
  ] }) }),
}));
vi.mock("~/lib/tmdb/client.server", () => ({
  createTMDBClient: () => ({
    findByIMDB: async () => ({ success: true, data: { id: 4, type: "movie", posterPath: "/poster.jpg" } }),
    searchMovie: async () => ({ success: true, data: [] }),
    searchTV: async () => ({ success: true, data: [] }),
  }),
}));

import { loader } from "~/routes/api.v1.watchlist";
import { resolveImageUrl } from "~/lib/plex/image-proxy.server";

const localThumb = "/library/metadata/1/thumb/99";
const discoverThumb = "/library/metadata/abcdef/thumb/99";
const noLocalThumb = "/library/metadata/other/thumb/99";

beforeEach(() => {
  dependencies.requireNativePrincipal.mockResolvedValue({ serverUrl: "https://plex.test", serverToken: "profile-token", plexToken: "account-token", userId: "1" });
  dependencies.getUserSettings.mockResolvedValue({ traktUsername: "fixture", imdbWatchlistIds: [] });
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/library/sections") return Response.json({ MediaContainer: { Directory: [{ key: "1", type: "movie" }] } });
    if (url.pathname === "/library/sections/1/all") return Response.json({ MediaContainer: { Metadata: [
      { ratingKey: "1", type: "movie", guid: "plex://movie/local", thumb: localThumb },
      { ratingKey: "2", type: "movie", guid: "plex://movie/no-local-thumb" },
    ] } });
    if (url.hostname === "discover.provider.plex.tv") return Response.json({ MediaContainer: { Metadata: [
      { ratingKey: "local", title: "Local poster", type: "movie", guid: "plex://movie/local", thumb: discoverThumb },
      { ratingKey: "external", title: "Discover poster", type: "movie", guid: "plex://movie/external", thumb: discoverThumb },
      { ratingKey: "no-local-thumb", title: "Local without artwork", type: "movie", guid: "plex://movie/no-local-thumb", thumb: noLocalThumb },
    ] } });
    throw new Error(`Unexpected fixture path: ${url.pathname}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("native watchlist artwork", () => {
  it("wraps local and external artwork once and preserves its actual origin", async () => {
    const response = await loader({ request: new Request("https://watchtower.test/api/v1/watchlist"), params: {}, context: {} });
    expect(response.status).toBe(200);
    const body = await response.json();
    const sources = Object.fromEntries(body.items.map((item: { title: string; posterUrl: string }) => {
      const image = new URL(item.posterUrl, "https://watchtower.test");
      expect(image.pathname).toBe("/api/v1/images");
      const source = image.searchParams.get("src");
      expect(source).not.toContain("/api/v1/images");
      expect(item.posterUrl).not.toMatch(/profile-token|account-token|X-Plex-Token/i);
      expect(resolveImageUrl(source!, "fixture", "https://plex.test")).not.toBeNull();
      return [item.title, source];
    }));
    expect(sources).toEqual({
      "Local poster": localThumb,
      "Discover poster": `https://discover.provider.plex.tv${discoverThumb}`,
      "Local without artwork": `https://discover.provider.plex.tv${noLocalThumb}`,
      "TMDB poster": "https://image.tmdb.org/t/p/w342/poster.jpg",
    });
  });
});
