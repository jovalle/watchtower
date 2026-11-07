import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeError } from "~/lib/native/http.server";
import { SeerrRequestError } from "~/lib/integrations/seerr.server";

const mocks = vi.hoisted(() => ({
  requireNativePrincipal: vi.fn(), recheckPrincipal: vi.fn(), createSeerrClient: vi.fn(),
  findUserIdByPlexId: vi.fn(), getTitle: vi.fn(), createRequest: vi.fn(), findByTmdbId: vi.fn(),
  nativePlexClient: vi.fn(),
}));
vi.mock("~/lib/native/principal.server", () => ({
  requireNativePrincipal: mocks.requireNativePrincipal, recheckPrincipal: mocks.recheckPrincipal,
}));
vi.mock("~/lib/integrations/seerr.server", async (original) => ({
  ...await original<typeof import("~/lib/integrations/seerr.server")>(), createSeerrClient: mocks.createSeerrClient,
}));
vi.mock("~/lib/native/catalog.server", async (original) => ({
  ...await original<typeof import("~/lib/native/catalog.server")>(), nativePlexClient: mocks.nativePlexClient,
}));

import { loader } from "~/routes/api.v1.requests.availability";
import { action } from "~/routes/api.v1.requests";

const principal = { userId: "42", accountUserId: "99", deviceSessionId: "device", identityVersion: 1 };
const target = (type = "movie", method = "GET") => ({
  request: new Request(`https://watchtower.test/api/v1/requests/availability?type=${type}&tmdbId=101`, {
    method, ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, tmdbId: 101 }) } : {}),
  }), params: {}, context: {},
});
const title = (status: number, requests: unknown[] = [], status4k = 1) => ({
  id: 101, title: "A Movie", mediaInfo: { id: 10, tmdbId: 101, mediaType: "movie", status, status4k, requests },
});
const request = (status: number, is4k = false, userId = 12) => ({ id: 7, status, is4k, requestedBy: { id: userId } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireNativePrincipal.mockResolvedValue(principal);
  mocks.recheckPrincipal.mockResolvedValue(undefined);
  mocks.createSeerrClient.mockResolvedValue(mocks);
  mocks.nativePlexClient.mockReturnValue(mocks);
  mocks.findUserIdByPlexId.mockResolvedValue(12);
  mocks.getTitle.mockResolvedValue(title(1));
  mocks.findByTmdbId.mockResolvedValue({ success: true, data: [] });
  mocks.createRequest.mockResolvedValue(undefined);
});

describe("native request eligibility", () => {
  it.each([
    ["movie", 1, true], ["movie", 2, false], ["movie", 3, false], ["movie", 4, false],
    ["movie", 5, false], ["movie", 6, false], ["movie", 7, true], ["tv", 4, true],
  ])("evaluates %s status %i before exposing Request", async (type, status, canRequest) => {
    mocks.getTitle.mockResolvedValue(title(status));
    const response = await loader(target(type));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ canRequest, ratingKey: null });
    expect(mocks.findByTmdbId).toHaveBeenCalledWith(type === "tv" ? "show" : "movie", 101);
    expect(mocks.nativePlexClient).toHaveBeenCalledWith(principal);
    expect(mocks.getTitle).toHaveBeenCalledWith(type, 101, 12);
  });

  it.each([1, 2, 5])("rejects direct submission with active standard request status %i", async (status) => {
    mocks.getTitle.mockResolvedValue(title(1, [request(status)]));
    const response = await action(target("movie", "POST"));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "conflict", message: expect.stringMatching(/request/i) } });
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });

  it.each([2, 3, 4, 5, 6])("rejects direct movie submission for status %i", async (status) => {
    mocks.getTitle.mockResolvedValue(title(status));
    expect((await action(target("movie", "POST"))).status).toBe(409);
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });

  it("resolves accessible local movies even when Seerr has stale availability", async () => {
    mocks.findByTmdbId.mockResolvedValue({ success: true, data: [{ ratingKey: "local-5", type: "movie" }] });
    expect(await (await loader(target())).json()).toMatchObject({ status: "available", ratingKey: "local-5", canRequest: false });
    expect((await action(target("movie", "POST"))).status).toBe(409);
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });

  it("keeps partial TV requestable with a local show and existing season requests", async () => {
    mocks.getTitle.mockResolvedValue(title(4, [request(2)]));
    mocks.findByTmdbId.mockResolvedValue({ success: true, data: [{ ratingKey: "local-show", type: "show" }] });
    expect(await (await loader(target("tv"))).json()).toMatchObject({ status: "partially_available", ratingKey: "local-show", canRequest: true });
    expect((await action(target("tv", "POST"))).status).toBe(201);
    expect(mocks.createRequest).toHaveBeenCalledWith("tv", 101, 12);
  });

  it.each([3, 4])("permits retry after request status %i while ignoring separate 4K availability", async (status) => {
    mocks.getTitle.mockResolvedValue(title(1, [request(status), request(2, true)], 5));
    expect(await (await loader(target())).json()).toMatchObject({ status4k: "available", canRequest: true });
    expect((await action(target("movie", "POST"))).status).toBe(201);
  });

  it("allows deleted media to be requested again after its completed request", async () => {
    mocks.getTitle.mockResolvedValue(title(7, [request(5)]));
    expect((await action(target("movie", "POST"))).status).toBe(201);
  });

  it("uses another visible user's active request without exposing that user's decision", async () => {
    mocks.getTitle.mockResolvedValue(title(1, [request(1, false, 999)]));
    expect(await (await loader(target())).json()).toMatchObject({ canRequest: false, requests: [] });
  });

  it("fails closed when either scoped upstream availability check fails", async () => {
    mocks.getTitle.mockRejectedValueOnce(new SeerrRequestError("Offline", 503));
    expect((await action(target("movie", "POST"))).status).toBe(503);
    mocks.findByTmdbId.mockResolvedValueOnce({ success: false, error: { status: 503, message: "Offline" } });
    expect((await action(target("movie", "POST"))).status).toBe(503);
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });

  it("reports upstream creation success even if its subsequent refresh fails", async () => {
    mocks.getTitle.mockResolvedValueOnce(title(1)).mockRejectedValueOnce(new SeerrRequestError("Offline", 503));
    const response = await action(target("movie", "POST"));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ status: "pending", canRequest: false, ratingKey: null });
    expect(mocks.createRequest).toHaveBeenCalledTimes(1);
    expect(mocks.nativePlexClient).toHaveBeenCalledTimes(1);
  });

  it("keeps Request disabled when Seerr has not yet reflected its successful write", async () => {
    const response = await action(target("movie", "POST"));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ status: "pending", canRequest: false });
  });

  it("rechecks the profile before reads return and before requests are written", async () => {
    mocks.recheckPrincipal.mockRejectedValue(new NativeError(409, "identity_version_mismatch", "Profile changed."));
    expect((await loader(target())).status).toBe(409);
    expect((await action(target("movie", "POST"))).status).toBe(409);
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });

  it("does not return title data if the profile changes during the post-write refresh", async () => {
    mocks.recheckPrincipal.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new NativeError(409, "identity_version_mismatch", "Profile changed."));
    const response = await action(target("movie", "POST"));
    expect(response.status).toBe(409);
    expect(await response.json()).not.toHaveProperty("status");
  });
});

describe.each(["findUserIdByPlexId", "createRequest"] as const)("native Seerr %s failures", (operation) => {
  it.each([
    [400, 400, "invalid_request", false], [401, 403, "forbidden", false], [403, 403, "forbidden", false],
    [404, 404, "not_found", false], [409, 409, "conflict", false], [429, 429, "rate_limited", false],
    [503, 503, "upstream_unavailable", true],
  ] as const)("maps upstream %i to sanitized native %i", async (upstreamStatus, status, code, retryable) => {
    mocks[operation].mockRejectedValue(new SeerrRequestError("private upstream detail: fixture-key", upstreamStatus));
    const response = await action(target("movie", "POST"));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code, retryable } });
    expect(JSON.stringify(body)).not.toMatch(/private upstream|fixture-key/);
    expect(response.headers.get("Retry-After")).toBe(retryable ? "15" : null);
    if (operation === "findUserIdByPlexId") expect(mocks.createRequest).not.toHaveBeenCalled();
  });

  it("makes network failures recoverable without exposing upstream details", async () => {
    mocks[operation].mockRejectedValue(new TypeError("private upstream detail: fixture-key"));
    const response = await action(target("movie", "POST"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(await response.json()).toMatchObject({ error: { code: "upstream_unavailable", retryable: true } });
  });
});
