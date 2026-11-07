import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeError } from "~/lib/native/http.server";
import { SeerrRequestError } from "~/lib/integrations/seerr.server";

const mocks = vi.hoisted(() => ({
  requireNativePrincipal: vi.fn(), recheckPrincipal: vi.fn(), createSeerrClient: vi.fn(),
  findUserIdByPlexId: vi.fn(), getRequests: vi.fn(), getIssues: vi.fn(), getIssue: vi.fn(), getTitle: vi.fn(),
}));
vi.mock("~/lib/native/principal.server", () => ({
  requireNativePrincipal: mocks.requireNativePrincipal, recheckPrincipal: mocks.recheckPrincipal,
}));
vi.mock("~/lib/integrations/seerr.server", async (original) => ({
  ...await original<typeof import("~/lib/integrations/seerr.server")>(),
  createSeerrClient: mocks.createSeerrClient,
}));

import { loader as requests } from "~/routes/api.v1.requests";
import { loader as issues } from "~/routes/api.v1.issues";
import { loader as issueDetail } from "~/routes/api.v1.issues.$id";

const principal = { userId: "42", accountUserId: "99", deviceSessionId: "device", identityVersion: 1 };
const media = { id: 10, tmdbId: 101, mediaType: "movie", status: 3 };
const requestItem = { id: 7, status: 2, is4k: false, createdAt: "2026-11-04T12:00:00Z", media, requestedBy: { id: 12, email: "private@example.invalid" } };
const issueItem = { id: 8, issueType: 2, status: 1, createdAt: "2026-11-04T12:00:00Z", media, createdBy: { id: 55 }, comments: [{ id: 9, message: "Audio is missing.", createdAt: "2026-11-04T12:01:00Z", user: { displayName: "Viewer", email: "private@example.invalid" } }] };
const args = (path: string, method = "GET") => ({ request: new Request(`https://watchtower.test/api/v1/${path}`, { method }), params: {}, context: {} });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireNativePrincipal.mockResolvedValue(principal);
  mocks.recheckPrincipal.mockResolvedValue(undefined);
  mocks.createSeerrClient.mockResolvedValue(mocks);
  mocks.findUserIdByPlexId.mockResolvedValue(12);
  mocks.getTitle.mockResolvedValue({ id: 101, title: "A Movie", posterPath: "/poster.jpg", apiKey: "never-return" });
  mocks.getRequests.mockResolvedValue({ pageInfo: { pages: 3, results: 45, page: 2 }, results: [requestItem] });
  mocks.getIssues.mockResolvedValue({ pageInfo: { pages: 1, results: 1, page: 1 }, results: [issueItem] });
  mocks.getIssue.mockResolvedValue(issueItem);
});

describe("native Seerr inbox reads", () => {
  it("reads the active profile's request page, enriches safe fields, and rechecks identity", async () => {
    const response = await requests(args("requests?page=2&filter=processing"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ page: 2, pages: 3, totalResults: 45, items: [{ id: 7, type: "movie", tmdbId: 101, title: "A Movie", status: "Processing", ratingKey: null, is4k: false, createdAt: requestItem.createdAt }] });
    expect(body.items[0].posterUrl).toMatch(/^\/api\/v1\/images\?src=/);
    expect(mocks.findUserIdByPlexId).toHaveBeenCalledWith(42);
    expect(mocks.getRequests).toHaveBeenCalledWith(12, 2, "processing");
    expect(mocks.getTitle).toHaveBeenCalledWith("movie", 101, 12);
    expect(mocks.recheckPrincipal).toHaveBeenCalledWith(principal);
    expect(JSON.stringify(body)).not.toMatch(/requestedBy|private@example|apiKey|never-return/);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("uses the web pagination/filter normalization", async () => {
    await requests(args("requests?page=999999&filter=not-a-filter"));
    expect(mocks.getRequests).toHaveBeenCalledWith(12, 10000, "all");
    await issues(args("issues?page=-1&filter=unknown"));
    expect(mocks.getIssues).toHaveBeenCalledWith(12, 1, "all");
  });

  it("returns issue summaries and a scoped detail with safe comments", async () => {
    const list = await issues(args("issues?filter=open"));
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ page: 1, pages: 1, totalResults: 1, items: [{ id: 8, status: "open", issueType: 2, message: "Audio is missing." }] });
    expect(mocks.getIssues).toHaveBeenCalledWith(12, 1, "open");
    const response = await issueDetail({ ...args("issues/8"), params: { id: "8" } });
    const detail = await response.json();
    expect(detail).toMatchObject({ id: 8, title: "A Movie", comments: [{ id: 9, message: "Audio is missing.", author: "Viewer" }] });
    expect(mocks.getIssue).toHaveBeenCalledWith(8, 12);
    expect(JSON.stringify(detail)).not.toMatch(/createdBy|private@example|apiKey/);
  });

  it.each(["0", "-1", "1.5", "1e3", "not-an-id", "9007199254740992"])("rejects invalid issue ID %s before upstream access", async (id) => {
    const response = await issueDetail({ ...args(`issues/${id}`), params: { id } });
    expect(response.status).toBe(400);
    expect(mocks.getIssue).not.toHaveBeenCalled();
  });

  it("requires native authentication before Seerr access", async () => {
    mocks.requireNativePrincipal.mockRejectedValue(new NativeError(401, "unauthenticated", "Pair first."));
    expect((await requests(args("requests"))).status).toBe(401);
    expect((await issues(args("issues"))).status).toBe(401);
    expect(mocks.createSeerrClient).not.toHaveBeenCalled();
  });

  it("explains unavailable and unlinked integrations", async () => {
    mocks.createSeerrClient.mockResolvedValueOnce(null);
    expect((await requests(args("requests"))).status).toBe(501);
    mocks.findUserIdByPlexId.mockResolvedValueOnce(null);
    const response = await issues(args("issues"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "requests_not_linked" } });
  });

  it("does not return data after revocation or profile switch during a read", async () => {
    mocks.recheckPrincipal.mockRejectedValue(new NativeError(409, "identity_version_mismatch", "Profile changed."));
    const response = await requests(args("requests"));
    expect(response.status).toBe(409);
    expect(await response.json()).not.toHaveProperty("items");
    expect((await issueDetail({ ...args("issues/8"), params: { id: "8" } })).status).toBe(409);
  });

  it("fails closed if a request page contains another user's requests", async () => {
    mocks.getRequests.mockResolvedValue({ pageInfo: { pages: 1, results: 1, page: 1 }, results: [{ ...requestItem, requestedBy: { id: 999 } }] });
    const response = await requests(args("requests"));
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("items");
  });

  it.each([403, 404, 503])("maps upstream %i without exposing service errors", async (status) => {
    mocks.getIssue.mockRejectedValue(new SeerrRequestError("private upstream detail", status));
    const response = await issueDetail({ ...args("issues/8"), params: { id: "8" } });
    expect(response.status).toBe(status === 403 ? 403 : status === 404 ? 404 : 503);
    expect(JSON.stringify(await response.json())).not.toContain("private upstream detail");
  });

  it("makes a Seerr network failure retryable", async () => {
    mocks.getRequests.mockRejectedValue(new TypeError("fetch failed"));
    const response = await requests(args("requests"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(await response.json()).toMatchObject({ error: { code: "upstream_unavailable", retryable: true } });
  });

  it("keeps an unavailable title usable with a safe fallback", async () => {
    mocks.getTitle.mockRejectedValue(new SeerrRequestError("missing", 404));
    const response = await requests(args("requests"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [{ title: "Title #101", posterUrl: null }] });
  });

  it("keeps unsupported loader methods rejected", async () => {
    expect((await requests(args("requests", "DELETE"))).status).toBe(405);
  });
});
