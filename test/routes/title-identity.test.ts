import { afterEach, expect, it, vi } from "vitest";
import { PlexClient } from "~/lib/plex/client.server";
import { externalTitle, externalImdbTitle } from "~/lib/title.server";

vi.mock("~/lib/auth/user.server", () => ({ requireUser: async () => ({ id: 2 }) }));
vi.mock("~/lib/settings/storage.server", () => ({ getUserSettings: async () => ({ preferences: { discoveryDisabled: true } }) }));
afterEach(() => vi.unstubAllGlobals());
const request = new Request("http://watchtower.test/app/media/movie/tmdb-17");
const makeClient = () => new PlexClient({ serverUrl: "http://plex.test", token: "shared-user-token", clientId: "test" });

it("resolves by type and exact provider ID, preferring the user's most recently viewed edition", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    const url = new URL(String(input));
    expect(url.pathname).toBe("/library/all");
    expect(url.searchParams.has("guid")).toBe(false);
    expect(url.searchParams.get("includeGuids")).toBe("1");
    expect(url.searchParams.get("type")).toBe("1");
    expect(new Headers(init?.headers).get("X-Plex-Token")).toBe("shared-user-token");
    return Response.json({ MediaContainer: { Metadata: [
      { ratingKey: "9", type: "show", Guid: [{ id: "tmdb://17" }], lastViewedAt: 100 },
      { ratingKey: "8", type: "movie", Guid: [{ id: "tmdb://18" }], title: "Same title", lastViewedAt: 100 },
      { ratingKey: "7", type: "movie", Guid: [{ id: "tmdb://17" }], lastViewedAt: 1 },
      { ratingKey: "6", type: "movie", Guid: [{ id: "tmdb://17" }], lastViewedAt: 2 },
    ] } });
  }));
  const response = await externalTitle(request, makeClient(), "movie", 17).catch((error: unknown) => error);
  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(302);
  expect((response as Response).headers.get("Location")).toBe("/app/media/movie/6");
});

it("does not turn a same-named title or a missing GUID into a playable match", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ MediaContainer: { Metadata: [
    { ratingKey: "1", type: "movie", title: "Same title" },
    { ratingKey: "2", type: "show", Guid: [{ id: "tmdb://17" }] },
  ] } })));
  await expect(externalTitle(request, makeClient(), "movie", 17)).rejects.toMatchObject({ status: 403 });
});

it.each([NaN, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid provider ID %s before contacting Plex", async (id) => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  await expect(externalTitle(request, makeClient(), "movie", id)).rejects.toMatchObject({ status: 400 });
  expect(upstream).not.toHaveBeenCalled();
});

it("resolves IMDb-only entries to an accessible, type-matching library detail", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    expect(new URL(String(input)).searchParams.has("guid")).toBe(false);
    return Response.json({ MediaContainer: { Metadata: [
      { ratingKey: "wrong-type", type: "show", Guid: [{ id: "imdb://tt123" }] },
      { ratingKey: "movie", type: "movie", Guid: [{ id: "imdb://tt123" }] },
    ] } });
  }));
  const response = await externalImdbTitle(request, makeClient(), "movie", "tt123").catch((error: unknown) => error);
  expect(response).toBeInstanceOf(Response);
  expect((response as Response).headers.get("Location")).toBe("/app/media/movie/movie");
});
