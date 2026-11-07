import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeError } from "~/lib/native/http.server";
import { SeerrRequestError } from "~/lib/integrations/seerr.server";

const mocks = vi.hoisted(() => ({
  requireNativePrincipal: vi.fn(), recheckPrincipal: vi.fn(), createSeerrClient: vi.fn(),
  findUserIdByPlexId: vi.fn(), getTitle: vi.fn(), createIssue: vi.fn(),
}));
vi.mock("~/lib/native/principal.server", () => ({
  requireNativePrincipal: mocks.requireNativePrincipal, recheckPrincipal: mocks.recheckPrincipal,
}));
vi.mock("~/lib/integrations/seerr.server", async (original) => ({
  ...await original<typeof import("~/lib/integrations/seerr.server")>(), createSeerrClient: mocks.createSeerrClient,
}));

import { action } from "~/routes/api.v1.issues";

const principal = { userId: "42", accountUserId: "99", deviceSessionId: "device", identityVersion: 1 };
const args = () => ({
  request: new Request("https://watchtower.test/api/v1/issues", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "movie", tmdbId: 101, issueType: 2, message: "  Missing audio  " }) }),
  params: {}, context: {},
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireNativePrincipal.mockResolvedValue(principal);
  mocks.recheckPrincipal.mockResolvedValue(undefined);
  mocks.createSeerrClient.mockResolvedValue(mocks);
  mocks.findUserIdByPlexId.mockResolvedValue(12);
  mocks.getTitle.mockResolvedValue({ id: 101, mediaInfo: { id: 10 } });
  mocks.createIssue.mockResolvedValue({ id: 8, privateUpstream: "never-return" });
});

describe("native issue mutations", () => {
  it("files the issue under the mapped profile and returns only its safe identifier", async () => {
    const response = await action(args());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 8 });
    expect(mocks.createIssue).toHaveBeenCalledWith(10, 2, "Missing audio", 12);
    expect(mocks.recheckPrincipal).toHaveBeenCalledTimes(2);
  });

  it("does not file an issue after a profile switch during the title lookup", async () => {
    mocks.recheckPrincipal.mockRejectedValue(new NativeError(409, "identity_version_mismatch", "Profile changed."));
    const response = await action(args());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "identity_version_mismatch" } });
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it("withholds the issue identifier after a profile switch during creation", async () => {
    mocks.recheckPrincipal.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new NativeError(409, "identity_version_mismatch", "Profile changed."));
    const response = await action(args());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "identity_version_mismatch" } });
  });
});

describe.each(["getTitle", "createIssue"] as const)("native issue %s failures", (operation) => {
  it.each([
    [400, 400, "invalid_request", false], [401, 403, "forbidden", false], [403, 403, "forbidden", false],
    [404, 404, "not_found", false], [409, 409, "conflict", false], [429, 429, "rate_limited", false],
    [503, 503, "upstream_unavailable", true],
  ] as const)("maps upstream %i to sanitized native %i", async (upstreamStatus, status, code, retryable) => {
    mocks[operation].mockRejectedValue(new SeerrRequestError("private upstream detail: fixture-key", upstreamStatus));
    const response = await action(args());
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code, retryable } });
    expect(JSON.stringify(body)).not.toMatch(/private upstream|fixture-key/);
    expect(response.headers.get("Retry-After")).toBe(retryable ? "15" : null);
    if (operation === "getTitle") expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it.each([new TypeError("private upstream detail"), new DOMException("private upstream detail", "TimeoutError")])("makes upstream network/timeouts retryable", async (error) => {
    mocks[operation].mockRejectedValue(error);
    const response = await action(args());
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(await response.json()).toMatchObject({ error: { code: "upstream_unavailable", retryable: true } });
  });
});
