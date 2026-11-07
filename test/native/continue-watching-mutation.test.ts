import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeError } from "~/lib/native/http.server";
const auth = vi.hoisted(() => ({ requireNativePrincipal: vi.fn(), recheckPrincipal: vi.fn(), markPrincipalForVerification: vi.fn() }));
vi.mock("~/lib/native/principal.server", () => auth);

const call = async (ratingKey = "42", method = "DELETE") => {
  const { action } = await import("~/routes/api.v1.media.$ratingKey.continue-watching");
  return action({ request: new Request(`https://watchtower.test/api/v1/media/${ratingKey}/continue-watching`, { method }), params: { ratingKey }, context: {} });
};
beforeEach(() => {
  vi.resetAllMocks();
  auth.requireNativePrincipal.mockResolvedValue({ serverUrl: "https://plex.test", serverToken: "profile-token", plexToken: "account-token" });
  auth.recheckPrincipal.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

function plexFetch(metadataStatus = 200, mutationStatus = 200) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://plex.test");
    expect(new Headers(init?.headers).get("X-Plex-Token")).toBe("profile-token");
    if (url.pathname === "/library/metadata/42") {
      expect(init?.method ?? "GET").toBe("GET");
      return metadataStatus === 200 ? Response.json({ MediaContainer: { Metadata: [{ ratingKey: "42", type: "episode", title: "Fixture", viewOffset: 1234, viewCount: 0 }] } }) : new Response(null, { status: metadataStatus });
    }
    expect(url.pathname).toBe("/actions/removeFromContinueWatching");
    expect(url.searchParams.get("ratingKey")).toBe("42");
    expect(init?.method).toBe("PUT");
    return new Response(null, { status: mutationStatus });
  });
}

describe("native continue-watching dismissal", () => {
  it("checks profile access then dismisses without resetting progress or marking watched", async () => {
    const upstream = plexFetch();
    vi.stubGlobal("fetch", upstream);
    const response = await call();
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(auth.recheckPrincipal).toHaveBeenCalledTimes(2);
  });

  it.each([[401, "unauthenticated"], [409, "identity_version_mismatch"]] as const)("rejects principal failure %i before any upstream request", async (status, code) => {
    auth.requireNativePrincipal.mockRejectedValue(new NativeError(status, code, "Denied"));
    const upstream = plexFetch();
    vi.stubGlobal("fetch", upstream);
    const response = await call();
    expect(response.status).toBe(status);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("does not mutate media inaccessible to the selected profile", async () => {
    const upstream = plexFetch(404);
    vi.stubGlobal("fetch", upstream);
    expect((await call()).status).toBe(404);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("blocks a profile change during the access check", async () => {
    auth.recheckPrincipal.mockRejectedValue(new NativeError(409, "identity_version_mismatch", "Changed"));
    const upstream = plexFetch();
    vi.stubGlobal("fetch", upstream);
    expect((await call()).status).toBe(409);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale success when identity changes during the write", async () => {
    auth.recheckPrincipal.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new NativeError(409, "identity_version_mismatch", "Changed"));
    vi.stubGlobal("fetch", plexFetch());
    expect((await call()).status).toBe(409);
  });

  it.each([[401, 401, "upstream_auth_failed"], [503, 503, "upstream_unavailable"]] as const)("does not acknowledge upstream failure %i", async (upstreamStatus, status, code) => {
    vi.stubGlobal("fetch", plexFetch(200, upstreamStatus));
    const response = await call();
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
    expect(auth.markPrincipalForVerification).toHaveBeenCalledTimes(upstreamStatus === 401 ? 1 : 0);
  });

  it.each(["42,43", "../42", ""])("rejects invalid selector %j before contacting Plex", async (ratingKey) => {
    const upstream = plexFetch();
    vi.stubGlobal("fetch", upstream);
    expect((await call(ratingKey)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects other methods before authentication or mutation", async () => {
    vi.stubGlobal("fetch", plexFetch());
    expect((await call("42", "PUT")).status).toBe(405);
    expect(auth.requireNativePrincipal).not.toHaveBeenCalled();
  });
});
