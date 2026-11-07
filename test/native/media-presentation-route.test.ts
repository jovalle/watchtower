import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireNativePrincipal: vi.fn(), markPrincipalForVerification: vi.fn() }));
vi.mock("~/lib/native/principal.server", () => auth);
import { loader } from "~/routes/api.v1.media.$ratingKey";

const episode = { ratingKey: "3", type: "episode", title: "Pilot", grandparentRatingKey: "1" };
const call = () => loader({ request: new Request("https://watchtower.test/api/v1/media/3"), params: { ratingKey: "3" }, context: {} });
beforeEach(() => { auth.requireNativePrincipal.mockResolvedValue({ serverUrl: "https://plex.test", serverToken: "profile" }); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("native show title artwork", () => {
  it("uses the actual show's logo when episode metadata has none", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => Response.json({ MediaContainer: { Metadata: [
      new URL(input).pathname.endsWith("/3") ? episode : { ratingKey: "1", type: "show", title: "The show", Image: [{ type: "clearLogo", url: "/library/metadata/1/clearLogo/99" }] },
    ] } })));
    expect(await (await call()).json()).toMatchObject({ title: "Pilot", clearLogoUrl: "/api/v1/images?src=%2Flibrary%2Fmetadata%2F1%2FclearLogo%2F99&w=800&h=310" });
  });

  it("uses an item's own logo without an extra parent read", async () => {
    const upstream = vi.fn(async () => Response.json({ MediaContainer: { Metadata: [
      { ...episode, Image: [{ type: "clearLogo", url: "https://image.tmdb.org/t/p/original/logo.png" }] },
    ] } }));
    vi.stubGlobal("fetch", upstream);
    expect(await (await call()).json()).toMatchObject({ clearLogoUrl: "/api/v1/images?src=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Foriginal%2Flogo.png&w=800&h=310" });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("propagates revoked profile authorization during optional parent reads", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => new URL(input).pathname.endsWith("/3") ?
      Response.json({ MediaContainer: { Metadata: [episode] } }) : new Response(null, { status: 401 })));
    const response = await call();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "upstream_auth_failed" } });
    expect(auth.markPrincipalForVerification).toHaveBeenCalledTimes(1);
  });

  it("keeps episode details available when optional parent artwork is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => new URL(input).pathname.endsWith("/3") ?
      Response.json({ MediaContainer: { Metadata: [episode] } }) : new Response(null, { status: 404 })));
    expect(await (await call()).json()).toMatchObject({ title: "Pilot", clearLogoUrl: null });
  });
});

describe("optional native edition discovery", () => {
  const movie = { ratingKey: "3", type: "movie", title: "A Movie", guid: "plex://movie/shared-id",
    duration: 120_000, Media: [{ id: 10, duration: 120_000, container: "mp4", Part: [{ id: 100, key: "/library/parts/100/file.mp4", duration: 120_000 }] }] };

  it.each([503, 404, "network"] as const)("keeps loaded movie details playable when edition lookup fails with %s", async (failure) => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (new URL(input).pathname === "/library/metadata/3") return Response.json({ MediaContainer: { Metadata: [movie] } });
      if (failure === "network") throw new TypeError("fetch failed");
      return new Response(null, { status: failure });
    }));
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ratingKey: "3", title: "A Movie", playable: true, editions: [], versions: [{ mediaId: "10" }] });
  });

  it("retains alternate editions when the optional lookup succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => Response.json({ MediaContainer: {
      Metadata: new URL(input).pathname === "/library/metadata/3" ? [movie] : [movie,
        { ...movie, ratingKey: "4", editionTitle: "Extended" }, { ...movie, ratingKey: "5", guid: "plex://movie/another-id" }],
    } })));
    expect(await (await call()).json()).toMatchObject({ playable: true, editions: [{ ratingKey: "4", editionTitle: "Extended" }] });
  });

  it("propagates revoked authorization during edition discovery", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => new URL(input).pathname === "/library/metadata/3" ?
      Response.json({ MediaContainer: { Metadata: [movie] } }) : new Response(null, { status: 401 })));
    const response = await call();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "upstream_auth_failed" } });
    expect(auth.markPrincipalForVerification).toHaveBeenCalledTimes(1);
  });
});
