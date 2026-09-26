import { afterEach, expect, it, vi } from "vitest";
import { loader as movies } from "~/routes/app.watch.movies";
import { loader as series } from "~/routes/app.watch.series";
vi.mock("~/lib/auth/session.server", () => ({ requireServerToken: async () => "server-user", requirePlexToken: async () => "account-user" }));
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
