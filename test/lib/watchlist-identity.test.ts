import { afterEach, expect, it, vi } from "vitest";
import { getUnifiedWatchlist } from "~/lib/watchlist/service.server";
import { PlexClient } from "~/lib/plex/client.server";
afterEach(() => vi.unstubAllGlobals());
it("keeps colliding movie/show IDs and remakes separate and enables Play only for exact accessible GUIDs", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ MediaContainer: { Metadata: [
    { ratingKey: "a", title: "Same name", year: 2020, type: "movie", guid: "tmdb://42" },
    { ratingKey: "b", title: "Same name", year: 2020, type: "show", guid: "tmdb://42" },
    { ratingKey: "c", title: "Same name", year: 2020, type: "movie", guid: "plex://movie/remake" },
  ] } })));
  const client = new PlexClient({ serverUrl: "http://plex.test", token: "fixture-token", clientId: "fixture" });
  const result = await getUnifiedWatchlist(client, "fixture-token", null, null, "plex", () => "", new Map([
    ["movie:tmdb://42", { type: "movie", ratingKey: "local-movie" }],
  ]));
  expect(result.items).toHaveLength(3);
  expect(result.items.map((item) => [item.type, item.localRatingKey, item.isLocal])).toEqual([
    ["movie", "local-movie", true], ["show", undefined, false], ["movie", undefined, false],
  ]);
});

it("keeps Plex items visible when Trakt refuses access and recovers on a later refresh", async () => {
  const { TraktClient } = await import("~/lib/trakt/client.server");
  let traktStatus = 403;
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    if (new URL(String(input)).hostname === "api.trakt.tv") return Response.json([], { status: traktStatus });
    return Response.json({ MediaContainer: { Metadata: [{ ratingKey: "a", title: "Available source", type: "movie", guid: "plex://movie/a" }] } });
  }));
  const client = new PlexClient({ serverUrl: "http://plex.test", token: "fixture-token", clientId: "fixture" });
  const refresh = () => getUnifiedWatchlist(client, "fixture-token", new TraktClient("fixture-key"), null, "all", () => "", new Map(), { traktUsername: "fixture", imdbWatchlistIds: [] });
  const partial = await refresh();
  expect(partial.items.map(item => item.title)).toEqual(["Available source"]);
  expect(partial.errors).toEqual([expect.stringContaining("Trakt")]);
  traktStatus = 200;
  expect((await refresh()).errors).toEqual([]);
});

it("skips Trakt without an integration even when a watchlist username is saved", async () => {
  const upstream = vi.fn<typeof fetch>(async () => Response.json({ MediaContainer: { Metadata: [] } }));
  vi.stubGlobal("fetch", upstream);
  const client = new PlexClient({ serverUrl: "http://plex.test", token: "fixture-token", clientId: "fixture" });
  const result = await getUnifiedWatchlist(client, "fixture-token", null, null, "all", () => "", new Map(), { traktUsername: "saved-username", imdbWatchlistIds: [] });
  expect(result.errors).toEqual([]);
  expect(upstream).toHaveBeenCalledTimes(1);
  expect(new URL(String(upstream.mock.calls[0][0])).hostname).toBe("discover.provider.plex.tv");
});
