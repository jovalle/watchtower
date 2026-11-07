import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireNativePrincipal: vi.fn(), recheckPrincipal: vi.fn(), markPrincipalForVerification: vi.fn() }));
const settings = vi.hoisted(() => ({ getUserSettings: vi.fn() }));
vi.mock("~/lib/native/principal.server", () => auth);
vi.mock("~/lib/settings/storage.server", () => settings);
import { loader } from "~/routes/api.v1.media.$ratingKey.cast.$personId";

const source = { ratingKey: "1", type: "movie", title: "Source", Guid: [{ id: "tmdb://10" }], Role: [{ id: 7, tag: "Same Name", role: "Hero", thumb: "/portrait" }] };
let principal: Record<string, unknown>;
let discoveryDisabled = false;
let sourceItem: Record<string, unknown>;
let credits: Record<string, unknown>[];
let knownForResults: Record<string, unknown>[];
let failSection: number | null;
let failProvider: string | null;
let calls: URL[];
let plexTokens: (string | null)[];
const work = (id: number, media_type = "movie", popularity = 1) => ({ id, media_type, title: `Work ${id}`, name: `Show ${id}`, release_date: "2020-01-01", first_air_date: "2021-01-01", popularity, poster_path: "/poster.jpg", backdrop_path: null, overview: "Work summary" });
const call = (personId = "plex:7", ratingKey = "1") => loader({ request: new Request(`https://watchtower.test/api/v1/media/${ratingKey}/cast/${personId}`), params: { ratingKey, personId }, context: {} });
beforeEach(() => {
  vi.stubEnv("TMDB_API_KEY", "test-key");
  principal = { serverUrl: "https://plex.test", serverToken: "scoped", userId: "3", profile: { restricted: false } };
  auth.requireNativePrincipal.mockImplementation(async () => principal);
  auth.recheckPrincipal.mockResolvedValue(undefined);
  settings.getUserSettings.mockImplementation(async () => ({ preferences: { discoveryDisabled } }));
  discoveryDisabled = false; sourceItem = source; failSection = null; failProvider = null; calls = []; plexTokens = [];
  credits = [{ id: 50, name: "Same Name", character: "Hero" }];
  knownForResults = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input); calls.push(url);
    if (url.hostname === "plex.test") {
      plexTokens.push(new Headers(init?.headers).get("X-Plex-Token"));
      if (url.pathname === "/library/metadata/1") return Response.json({ MediaContainer: { Metadata: [sourceItem] } });
      if (url.pathname === "/library/metadata/9") return Response.json({ MediaContainer: { Metadata: [{ ratingKey: "9", type: "show", title: "Parent", Guid: [{ id: "tmdb://90" }] }] } });
      if (url.pathname === "/library/sections") return Response.json({ MediaContainer: { Directory: [{ key: "a", type: "movie" }, { key: "b", type: "show" }, { key: "c", type: "movie" }, { key: "music", type: "artist" }] } });
      if (url.pathname === "/library/sections/b/all" && failSection) return new Response(null, { status: failSection });
      const rows = url.pathname.includes("/b/") ? [{ ratingKey: "20", type: "show", title: "Local Show", Guid: [{ id: "tmdb://20" }] }] : url.pathname.includes("/c/") ? [{ ratingKey: "30", type: "movie", title: "Other Movie", Guid: [{ id: "tmdb://30" }] }] : [source];
      return Response.json({ MediaContainer: { Metadata: rows, totalSize: rows.length } });
    }
    if (url.pathname === failProvider) return new Response(null, { status: 503 });
    if (url.pathname === "/3/search/person") return Response.json({ results: knownForResults });
    if (url.pathname.endsWith("/credits") && !url.pathname.endsWith("/combined_credits")) return Response.json({ cast: sourceItem.type === "episode" ? [] : credits, guest_stars: sourceItem.type === "episode" ? credits : [] });
    if (url.pathname === "/3/person/50") return Response.json({ id: 50, name: "Same Name", biography: "Verified biography", birthday: "1980-01-01", deathday: null, place_of_birth: "Somewhere", known_for_department: "Acting", profile_path: "/person.jpg" });
    if (url.pathname === "/3/person/50/combined_credits") return Response.json({ cast: [work(20, "tv", 80), work(20, "tv", 2), work(30, "movie", 30), work(20, "movie", 1), work(40, "movie", 100)], crew: [work(999)] });
    throw new Error(`Unexpected upstream ${url.pathname}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("authorized native cast profiles", () => {
  it("reads all scoped movie/show libraries, verifies identity through the source, and uses exact typed local matches", async () => {
    const response = await call(); expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ id: "plex:7", biography: "Verified biography", birthday: "1980-01-01", warnings: [] });
    expect(body.library.map((item: { ratingKey: string }) => item.ratingKey)).toEqual(["1", "20", "30"]);
    expect(body.knownFor.map((item: { title: string }) => item.title)).toEqual(["Work 40", "Local Show", "Other Movie", "Work 20"]);
    expect(body.filmography).toHaveLength(4);
    expect(body.filmography.find((item: { title: string }) => item.title === "Work 20")).toMatchObject({ ratingKey: null, external: { provider: "tmdb", id: "20", type: "movie" } });
    expect(body.thumbUrl).toContain("/api/v1/images?src=");
    expect(plexTokens.length).toBeGreaterThan(0); expect(plexTokens.every((token) => token === "scoped")).toBe(true);
    expect(calls.findIndex((url) => url.pathname === "/3/search/person")).toBeGreaterThan(calls.findIndex((url) => url.pathname === "/3/movie/10/credits"));
    expect(auth.recheckPrincipal).toHaveBeenCalled();
  });
  it.each(["invalid", "plex:-7", "plex:9007199254740992", "name:bad"])("rejects malformed cast IDs %s", async (id) => { expect((await call(id)).status).toBe(400); });
  it("rejects a cast ID absent from authorized source metadata", async () => { expect((await call("plex:8")).status).toBe(404); expect(calls).toHaveLength(1); });
  it.each([
    [{ id: 51, name: "Different Name", character: "Hero" }],
    [{ id: 50, name: "Same Name", character: "Different Role" }],
    [{ id: 50, name: "Same Name", character: "Hero" }, { id: 51, name: "Same Name", character: "Hero" }],
  ])("does not publish a biography for mismatched or ambiguous credits", async (...cast) => {
    credits = cast; const body = await (await call()).json();
    expect(body).toMatchObject({ biography: null, knownFor: [], filmography: [] }); expect(body.library).toHaveLength(3);
    expect(body.warnings).toEqual(["Extended profile information could not be verified. Titles from your library are shown below."]);
    expect(calls.some((url) => url.pathname === "/3/search/person")).toBe(false);
  });
  it("uses the verified person's provider-known works before popular incidental credits", async () => {
    knownForResults = [{ id: 51, name: "Same Name", known_for: [work(999)] },
      { id: 50, name: "Same Name", known_for: [work(30, "movie", 1), work(20, "movie", 1), work(20, "tv", 1), work(30), { ...work(888), adult: true }] }];
    const body = await (await call()).json();
    expect(body).toMatchObject({ biography: "Verified biography", warnings: [] });
    expect(body.knownFor.map((item: { title: string }) => item.title)).toEqual(["Other Movie", "Work 20", "Local Show"]);
    expect(body.knownFor[1]).toMatchObject({ ratingKey: null, external: { provider: "tmdb", id: "20", type: "movie" } });
    expect(body.filmography).toHaveLength(4); expect(body.library).toHaveLength(3);
  });
  it("ignores a same-name search result with a different person ID", async () => {
    knownForResults = [{ id: 51, name: "Same Name", known_for: [work(999)] }];
    const body = await (await call()).json();
    expect(body.biography).toBe("Verified biography");
    expect(body.knownFor.map((item: { title: string }) => item.title)).toEqual(["Work 40", "Local Show", "Other Movie", "Work 20"]);
    expect(body.filmography).toHaveLength(4); expect(body.library).toHaveLength(3);
  });
  it("preserves profile content and falls back to full-credit ranking when known-for lookup fails", async () => {
    failProvider = "/3/search/person";
    const body = await (await call()).json();
    expect(body).toMatchObject({ biography: "Verified biography", warnings: [] });
    expect(body.knownFor.map((item: { title: string }) => item.title)).toEqual(["Work 40", "Local Show", "Other Movie", "Work 20"]);
    expect(body.filmography).toHaveLength(4); expect(body.library).toHaveLength(3);
  });
  it.each(["disabled", "restricted"])("keeps %s profiles library-only", async (mode) => {
    if (mode === "disabled") discoveryDisabled = true; else principal.profile = { restricted: true };
    const body = await (await call()).json(); expect(body.biography).toBeNull(); expect(body.library).toHaveLength(3);
    expect(body.warnings).toEqual(["This profile shows titles from your library only."]);
    expect(calls.every((url) => url.hostname === "plex.test")).toBe(true);
  });
  it("keeps library usable with human-readable warnings when extended profiles are unavailable", async () => {
    vi.stubEnv("TMDB_API_KEY", ""); const body = await (await call()).json(); expect(body.library).toHaveLength(3);
    expect(body.warnings).toEqual(["Biography and filmography are unavailable. Titles from your library are shown below."]);
  });
  it("describes an unverified title identity without provider details", async () => {
    sourceItem = { ...source, Guid: [] }; const body = await (await call()).json();
    expect(body.warnings).toEqual(["Extended profile information could not be verified. Titles from your library are shown below."]);
    expect(body.biography).toBeNull(); expect(body.library).toHaveLength(3);
  });
  it("describes incomplete episode information without implementation details", async () => {
    sourceItem = { ...source, type: "episode" }; const body = await (await call()).json();
    expect(body.warnings).toEqual(["Extended profile information is unavailable for this episode. Titles from your library are shown below."]);
    expect(body.biography).toBeNull(); expect(body.library.length).toBeGreaterThan(0);
  });
  it.each(["/3/movie/10/credits", "/3/person/50", "/3/person/50/combined_credits"])("keeps library usable when %s is unavailable", async (path) => {
    failProvider = path; const body = await (await call()).json(); expect(body.library).toHaveLength(3); expect(body.warnings.join(" ")).toMatch(/retry/i);
  });
  it("reports partial library failures without discarding allowed successful sections", async () => { failSection = 503; const body = await (await call()).json(); expect(body.library).toHaveLength(2); expect(body.warnings.join(" ")).toMatch(/library/i); });
  it("propagates Plex authorization failure from optional library reads", async () => { failSection = 401; expect((await call()).status).toBe(401); });
  it("resolves episode guests using authorized parent-show GUID and episode coordinates", async () => {
    sourceItem = { ...source, type: "episode", grandparentRatingKey: "9", parentIndex: 2, index: 4 };
    expect(await (await call()).json()).toMatchObject({ biography: "Verified biography" });
    expect(calls.some((url) => url.pathname === "/3/tv/90/season/2/episode/4/credits")).toBe(true);
  });
  it("returns a truthful source-only library fallback without a Plex actor ID", async () => {
    sourceItem = { ...source, Role: [{ tag: "Same Name", role: "Hero" }] };
    const { castPersonId } = await import("~/lib/native/catalog.server");
    const body = await (await call(castPersonId({ tag: "Same Name", role: "Hero" }))).json();
    expect(body.library).toHaveLength(1);
    expect(body.warnings).toEqual(["More library titles could not be matched to this cast member. Showing this title."]);
  });
  it("rejects stale identity before publishing any enriched profile", async () => {
    const { NativeError } = await import("~/lib/native/http.server");
    auth.recheckPrincipal.mockRejectedValue(new NativeError(409, "identity_version_mismatch", "Changed")); expect((await call()).status).toBe(409);
  });
});
