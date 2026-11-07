import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeError } from "~/lib/native/http.server";
const auth = vi.hoisted(() => ({ requireNativePrincipal: vi.fn(), recheckPrincipal: vi.fn(), markPrincipalForVerification: vi.fn() }));
vi.mock("~/lib/native/principal.server", () => auth);
import { loader } from "~/routes/api.v1.media.$ratingKey.ratings";
import { loader as detailLoader } from "~/routes/api.v1.media.$ratingKey";

const movie = { ratingKey: "3", key: "/library/metadata/3", type: "movie", title: "A Film", rating: 8,
  Guid: [{ id: "imdb://tt1234567" }, { id: "tmdb://42" }], Media: [{ id: 1, Part: [{ id: 2 }] }] };
const call = () => loader({ request: new Request("https://watchtower.test/api/v1/media/3/ratings"), params: { ratingKey: "3" }, context: {} });
const plexResponse = (metadata: typeof movie & { Rating?: Array<{ image: string; value: number; type: string }> } = movie) => Response.json({ MediaContainer: { Metadata: [metadata] } });

beforeEach(() => {
  auth.requireNativePrincipal.mockResolvedValue({ serverUrl: "https://plex.test", serverToken: "profile" });
  auth.recheckPrincipal.mockResolvedValue(undefined);
  vi.stubEnv("OMDB_API_KEY", "test-omdb");
  vi.stubEnv("TMDB_API_KEY", "test-tmdb");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("independent native ratings endpoint", () => {
  it.each(["", undefined, "../../../:/scrobble?key=42", "42/children", "42?includeGuids=1", "42%2fchildren", "42#fragment", "opaque-id"])("rejects invalid local rating key %j before any Plex or provider request", async (ratingKey) => {
    const upstream = vi.fn(async () => plexResponse());
    vi.stubGlobal("fetch", upstream);
    const response = await loader({ request: new Request("https://watchtower.test/api/v1/media/invalid/ratings"), params: { ratingKey }, context: {} });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("enriches only the authorized title and returns real provider scales", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.host === "plex.test" && url.pathname === "/library/metadata/3") return plexResponse();
      if (url.host === "www.omdbapi.com" && url.searchParams.get("i") === "tt1234567") return Response.json({ Response: "True", imdbRating: "8.4", imdbVotes: "3,456", Ratings: [{ Source: "Rotten Tomatoes", Value: "93%" }] });
      if (url.host === "api.themoviedb.org" && url.pathname === "/3/movie/42") return Response.json({ title: "A Film", vote_average: 7.3, vote_count: 50 });
      throw new Error("Unexpected request");
    }));
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ratings: [
      { source: "plex", kind: "rating", value: 8, maxValue: 10 },
      { source: "imdb", kind: "rating", value: 8.4, maxValue: 10 },
      { source: "rotten_tomatoes", kind: "critic", value: 93, maxValue: 100 },
      { source: "tmdb", kind: "rating", value: 7.3, maxValue: 10 },
    ], warnings: [] });
  });

  it("replaces cached user and critic scores with fresh provider values without duplicate badges", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const host = new URL(input).host;
      if (host === "plex.test") return plexResponse({ ...movie, Rating: [
        { image: "imdb://image.rating", value: 8.4, type: "audience" },
        { image: "rottentomatoes://image.rating.ripe", value: 9.1, type: "critic" },
        { image: "rottentomatoes://image.rating.upright", value: 9.1, type: "audience" },
      ] });
      if (host === "www.omdbapi.com") return Response.json({ Response: "True", imdbRating: "8.8", Ratings: [{ Source: "Rotten Tomatoes", Value: "94%" }] });
      return Response.json({ vote_average: 7.3, vote_count: 50 });
    }));
    const ratings = (await (await call()).json()).ratings;
    expect(ratings.filter((item: { source: string }) => item.source === "imdb")).toEqual([
      { source: "imdb", kind: "rating", value: 8.8, maxValue: 10 },
    ]);
    expect(ratings.filter((item: { source: string }) => item.source === "rotten_tomatoes")).toEqual([
      { source: "rotten_tomatoes", kind: "critic", value: 94, maxValue: 100 },
      { source: "rotten_tomatoes", kind: "audience", value: 91, maxValue: 100 },
    ]);
  });

  it("keeps valid Plex provider scores when optional scores are malformed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const host = new URL(input).host;
      if (host === "plex.test") return plexResponse({ ...movie, Rating: [
        { image: "imdb://image.rating", value: 8.4, type: "audience" },
        { image: "rottentomatoes://image.rating.ripe", value: 9.1, type: "critic" },
        { image: "themoviedb://image.rating", value: 7.3, type: "audience" },
      ] });
      if (host === "www.omdbapi.com") return Response.json({ Response: "True", imdbRating: "8.8junk", Ratings: [{ Source: "Rotten Tomatoes", Value: "120%" }] });
      return Response.json({ vote_average: 11, vote_count: 50 });
    }));
    expect((await (await call()).json()).ratings).toEqual([
      { source: "imdb", kind: "rating", value: 8.4, maxValue: 10 },
      { source: "rotten_tomatoes", kind: "critic", value: 91, maxValue: 100 },
      { source: "tmdb", kind: "rating", value: 7.3, maxValue: 10 },
      { source: "plex", kind: "rating", value: 8, maxValue: 10 },
    ]);
  });

  it("retains Plex ratings without provider configuration", async () => {
    vi.stubEnv("OMDB_API_KEY", ""); vi.stubEnv("TMDB_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (new URL(input).host !== "plex.test") throw new Error("No configured provider may be called");
      return plexResponse();
    }));
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ratings: [{ source: "plex", value: 8 }], warnings: [expect.stringContaining("OMDb"), expect.stringContaining("TMDB")] });
  });

  it("keeps available ratings during provider outages without disclosing upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (new URL(input).host === "plex.test") return plexResponse();
      return new Response("sensitive upstream body", { status: 503, statusText: "private provider error" });
    }));
    const response = await call();
    const body = await response.json();
    expect(body).toMatchObject({ ratings: [{ source: "plex", value: 8 }], warnings: [expect.stringContaining("OMDb"), expect.stringContaining("TMDB")] });
    expect(JSON.stringify(body)).not.toMatch(/sensitive|private|test-omdb|test-tmdb/);
  });

  it("rejects malformed provider scores and unrated TMDB placeholders", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const host = new URL(input).host;
      if (host === "plex.test") return plexResponse();
      if (host === "www.omdbapi.com") return Response.json({ Response: "True", imdbRating: "8.3junk", Ratings: [{ Source: "Rotten Tomatoes", Value: "120%" }] });
      return Response.json({ vote_average: 0, vote_count: 0 });
    }));
    expect((await (await call()).json()).ratings).toEqual([{ source: "plex", kind: "rating", value: 8, maxValue: 10 }]);
  });

  it("propagates Plex authorization failure before any external lookup", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (new URL(input).host !== "plex.test") throw new Error("Unauthorized external lookup");
      return new Response(null, { status: 401 });
    }));
    const response = await call();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "upstream_auth_failed" } });
  });

  it("discards completed enrichment after the principal changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (new URL(input).host === "plex.test") return plexResponse();
      auth.recheckPrincipal.mockRejectedValue(new NativeError(409, "identity_version_mismatch", "The active profile changed."));
      return new Response(null, { status: 503 });
    }));
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "identity_version_mismatch" } });
  });

  it("keeps required media details independent of provider lookups", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (new URL(input).host !== "plex.test") throw new Error("Required details requested optional provider");
      return plexResponse();
    }));
    const response = await detailLoader({ request: new Request("https://watchtower.test/api/v1/media/3"), params: { ratingKey: "3" }, context: {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ playable: true, ratings: [{ source: "plex", value: 8 }] });
  });
});
