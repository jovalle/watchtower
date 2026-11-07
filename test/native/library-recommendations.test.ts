import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireNativePrincipal: vi.fn(), markPrincipalForVerification: vi.fn() }));
vi.mock("~/lib/native/principal.server", () => auth);
import { NativeError } from "~/lib/native/http.server";
import { loader } from "~/routes/api.v1.libraries.$sectionId.recommendations";

const principal = { serverUrl: "https://plex.test", serverToken: "effective-profile", serverMachineId: "machine", userId: "profile" };
const call = () => loader({ request: new Request("https://watchtower.test/api/v1/libraries/4/recommendations"), params: { sectionId: "4" }, context: {} });

beforeEach(() => { auth.requireNativePrincipal.mockResolvedValue(principal); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("native library recommendations", () => {
  it("preserves actual section hub titles and order and maps supported media", async () => {
    const item = { ratingKey: "12", type: "movie", title: "A film", summary: "The premise." };
    vi.stubGlobal("fetch", vi.fn(async (input: string) => Response.json(new URL(input).pathname === "/library/sections" ?
      { MediaContainer: { Directory: [{ key: "4", type: "movie", title: "Movies" }] } } :
      { MediaContainer: { Hub: [
        { hubIdentifier: "movie.recentlyreleased.4", title: "Recently Released", Metadata: [item] },
        { hubIdentifier: "empty", title: "Empty" },
        { hubIdentifier: "actor", title: "Actors", Metadata: [{ type: "actor", title: "A person" }] },
        { hubIdentifier: "custom.collection.4.1", title: "My collection", Metadata: [item] },
      ] } })));
    const response = await call();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows.map((row: { title: string }) => row.title)).toEqual(["Recently Released", "My collection"]);
    expect(body.rows[0]).toMatchObject({ kind: "recommendations", items: [{ ratingKey: "12", summary: "The premise." }] });
  });

  it("does not fetch hubs for a section outside the effective profile's libraries", async () => {
    const upstream = vi.fn(async () => Response.json({ MediaContainer: { Directory: [{ key: "1", type: "show" }] } }));
    vi.stubGlobal("fetch", upstream);
    expect((await call()).status).toBe(404);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("requires an authenticated identity before any Plex reads", async () => {
    auth.requireNativePrincipal.mockImplementation(async () => { throw new NativeError(401, "unauthenticated", "Sign in."); });
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    expect((await call()).status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
});
