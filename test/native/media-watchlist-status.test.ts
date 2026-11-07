import { afterEach, beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ requireNativePrincipal: vi.fn(), recheckPrincipal: vi.fn(), markPrincipalForVerification: vi.fn() }));
vi.mock("~/lib/native/principal.server", () => auth);
import { loader } from "~/routes/api.v1.media.$ratingKey.watchlist";
const guid = "plex://movie/5d7768ba96b655001fdc8b00";
const call = (ratingKey = "42") => loader({ request: new Request(`https://watchtower.test/api/v1/media/${ratingKey}/watchlist`), params: { ratingKey }, context: {} });
beforeEach(() => { auth.requireNativePrincipal.mockResolvedValue({ serverUrl: "https://plex.test", serverToken: "profile-token", plexToken: "account-token" }); auth.recheckPrincipal.mockResolvedValue(undefined); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it.each([true, false])("reads actual membership %s using the account token, not the library token", async (saved) => {
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.hostname === "plex.test") {
      expect((init?.headers as Record<string, string>)["X-Plex-Token"]).toBe("profile-token");
      return Response.json({ MediaContainer: { Metadata: [{ ratingKey: "42", type: "movie", guid }] } });
    }
    expect(url.hostname).toBe("discover.provider.plex.tv"); expect(url.searchParams.get("X-Plex-Token")).toBe("account-token");
    return Response.json({ MediaContainer: { Metadata: saved ? [{ guid, type: "movie" }] : [{ guid: "plex://movie/other", type: "movie" }] } });
  }));
  const response = await call(); expect(response.status).toBe(200); expect(await response.json()).toEqual({ onWatchlist: saved });
  expect(auth.recheckPrincipal).toHaveBeenCalled();
});
it("finds membership beyond the first cloud page", async () => {
  const offsets: number[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.hostname === "plex.test") return Response.json({ MediaContainer: { Metadata: [{ ratingKey: "42", type: "movie", guid }] } });
    const offset = Number(url.searchParams.get("X-Plex-Container-Start")); offsets.push(offset);
    return Response.json({ MediaContainer: { totalSize: 51, offset, Metadata: offset === 0 ? Array.from({ length: 50 }, (_, i) => ({ ratingKey: String(i), guid: `plex://movie/${i}` })) : [{ ratingKey: "saved", guid }] } });
  }));
  expect(await (await call()).json()).toEqual({ onWatchlist: true }); expect(offsets).toEqual([0, 50]);
});
it("does not report absent membership when the cloud is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => new URL(input).hostname === "plex.test"
    ? Response.json({ MediaContainer: { Metadata: [{ ratingKey: "42", type: "movie", guid }] } }) : new Response(null, { status: 503 })));
  expect((await call()).status).toBe(503);
});
it("rejects a stale principal before returning another identity's state", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => Response.json({ MediaContainer: { Metadata: new URL(input).hostname === "plex.test" ? [{ ratingKey: "42", type: "movie", guid }] : [{ guid }] } })));
  const { NativeError } = await import("~/lib/native/http.server");
  auth.recheckPrincipal.mockRejectedValue(new NativeError(409, "identity_version_mismatch", "Profile changed."));
  expect((await call()).status).toBe(409);
});
it("rejects malformed local selectors before fetching", async () => {
  const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
  expect((await call("../secrets")).status).toBe(400); expect(upstream).not.toHaveBeenCalled();
});
it("does not query cloud watchlists for unsupported or unmatched media", async () => {
  const upstream = vi.fn(async () => Response.json({ MediaContainer: { Metadata: [{ ratingKey: "42", type: "episode", guid: "local://42" }] } }));
  vi.stubGlobal("fetch", upstream);
  expect(await (await call()).json()).toEqual({ onWatchlist: null }); expect(upstream).toHaveBeenCalledTimes(1);
});
