import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireNativePrincipal: vi.fn(), markPrincipalForVerification: vi.fn() }));
vi.mock("~/lib/native/principal.server", () => auth);
import { NativeError } from "~/lib/native/http.server";
import { decodeCursor } from "~/lib/native/catalog.server";
import { loader } from "~/routes/api.v1.libraries.$sectionId.letters";
import { loader as itemsLoader } from "~/routes/api.v1.libraries.$sectionId.items";

const principal = { serverUrl: "https://plex.test", serverToken: "effective-profile" };
const call = (query = "") => loader({ request: new Request(`https://watchtower.test/api/v1/libraries/4/letters${query}`), params: { sectionId: "4" }, context: {} });
const groups = [
  { key: "#", title: "#", size: 2 }, { key: "A", title: "A", size: 10 },
  { key: "B", title: "B", size: 0 }, { key: "Z", title: "Z", size: 3 },
];
function upstream(facets: unknown[] = groups, accessible = true) {
  const fetch = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname === "/library/sections") return Response.json({ MediaContainer: { Directory: accessible ? [{ key: "4", type: "movie" }] : [] } });
    if (url.pathname.endsWith("/firstCharacter")) return Response.json({ MediaContainer: { Directory: facets } });
    return Response.json({ MediaContainer: { Metadata: [{ ratingKey: "42", title: "Zulu", type: "movie" }] } });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => { auth.requireNativePrincipal.mockResolvedValue(principal); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("native library letters", () => {
  it("uses real nonempty groups and filtered cumulative offsets accepted by the existing items endpoint", async () => {
    const fetch = upstream();
    const response = await call("?sort=titleSort:asc&filter=unwatched&genre=Drama&limit=50");
    expect(response.status).toBe(200);
    const { letters } = await response.json();
    expect(letters.map(({ letter }: { letter: string }) => letter)).toEqual(["#", "A", "Z"]);
    expect(letters.map(({ cursor }: { cursor: string }) => decodeCursor(cursor, "4|titleSort:asc|unwatched|Drama|50"))).toEqual([0, 2, 12]);
    const facetUrl = new URL(fetch.mock.calls[1][0]);
    expect(facetUrl.pathname).toBe("/library/sections/4/firstCharacter");
    expect(facetUrl.searchParams.get("unwatched")).toBe("1");
    expect(facetUrl.searchParams.get("genre")).toBe("Drama");
    const last = letters.at(-1).cursor;
    const items = await itemsLoader({ request: new Request(`https://watchtower.test/api/v1/libraries/4/items?sort=titleSort:asc&filter=unwatched&genre=Drama&limit=50&cursor=${last}`), params: { sectionId: "4" }, context: {} });
    expect(items.status).toBe(200);
    expect(new URL(fetch.mock.calls.at(-1)![0]).searchParams.get("X-Plex-Container-Start")).toBe("12");
  });

  it("reverses groups for descending title sort without changing the actual labels", async () => {
    upstream([{ key: "special", title: "@", size: 2 }, { key: "A", title: "A", size: 4 }, { key: "Z", title: "Z", size: 3 }]);
    const { letters } = await (await call("?sort=titleSort:desc&filter=in_progress&limit=100")).json();
    expect(letters.map(({ letter }: { letter: string }) => letter)).toEqual(["Z", "A", "@"]);
    expect(letters.map(({ cursor }: { cursor: string }) => decodeCursor(cursor, "4|titleSort:desc|in_progress||100"))).toEqual([0, 3, 7]);
    expect(() => decodeCursor(letters[0].cursor, "4|titleSort:desc|in_progress||50")).toThrow();
  });

  it("returns no fabricated letters for an empty library", async () => {
    upstream([]);
    expect(await (await call()).json()).toEqual({ letters: [] });
  });

  it("checks effective profile library access before reading letter counts", async () => {
    const fetch = upstream(groups, false);
    expect((await call()).status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("requires authentication before any Plex read", async () => {
    auth.requireNativePrincipal.mockRejectedValue(new NativeError(401, "unauthenticated", "Sign in."));
    const fetch = upstream();
    expect((await call()).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["?sort=addedAt:desc", "?filter=invalid", "?limit=0", `?genre=${"x".repeat(129)}`])("rejects incompatible queries %s", async (query) => {
    const fetch = upstream();
    expect((await call(query)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe or missing facet count %s", async (size) => {
    upstream([{ key: "A", title: "A", size }]);
    expect((await call()).status).toBe(503);
  });

  it("rejects overflowing cumulative facet counts", async () => {
    upstream([{ key: "A", title: "A", size: Number.MAX_SAFE_INTEGER }, { key: "B", title: "B", size: 1 }]);
    expect((await call()).status).toBe(503);
  });
});
