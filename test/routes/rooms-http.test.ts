import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolvePrincipal: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  subscribe: vi.fn(),
  diagnostics: vi.fn(),
  now: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("~/lib/rooms/principal.server", () => ({ resolveRoomPrincipal: mocks.resolvePrincipal }));
vi.mock("~/lib/rooms/coordinator.server", () => ({
  getRoomCoordinator: () => ({
    epoch: "00000000-0000-4000-8000-000000000001",
    now: mocks.now,
    create: mocks.create,
    get: mocks.get,
    subscribe: mocks.subscribe,
    diagnostics: mocks.diagnostics,
  }),
}));
vi.mock("~/lib/auth/session.server", () => ({ getSession: mocks.getSession }));

import { action as createAction, loader as createLoader } from "~/routes/api.v1.rooms";
import { loader as roomLoader } from "~/routes/api.v1.rooms.$roomId";
import { loader as eventsLoader } from "~/routes/api.v1.rooms.$roomId.events";
import { loader as clockLoader } from "~/routes/api.v1.clock";
import { loader as diagnosticsLoader } from "~/routes/api.v1.rooms.diagnostics";

const principal = {
  kind: "web" as const,
  userId: "user-1",
  displayName: "Viewer",
  serverMachineId: "machine-1",
  serverToken: "private-token",
  deviceSessionId: "device-1",
  identityVersion: 0,
};
const validBody = {
  requestId: "10000000-0000-4000-8000-000000000001",
  epoch: "00000000-0000-4000-8000-000000000001",
  expiresAtMs: 50_000,
  media: { ratingKey: "42", mediaId: "101", partId: "102" },
  startPositionMs: 0,
  autoAdvance: true,
};

function post(body: BodyInit = JSON.stringify(validBody), headers: HeadersInit = {}) {
  return new Request("http://watchtower.test/api/v1/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://watchtower.test", ...headers },
    body,
  });
}

describe("room HTTP routes", () => {
  beforeEach(() => {
    mocks.resolvePrincipal.mockReset().mockResolvedValue({ ok: true, principal, setCookie: "__wt_device=signed; Path=/" });
    mocks.create.mockReset().mockResolvedValue({ status: 201, body: { created: true } });
    mocks.get.mockReset().mockReturnValue({ status: 404, body: { error: { code: "not_found", message: "Room not found." } } });
    mocks.subscribe.mockReset().mockReturnValue({ status: 404, body: { error: { code: "not_found", message: "Room not found." } } });
    mocks.diagnostics.mockReset().mockReturnValue({ rooms: 0, participants: 0, connected: 0, subscribers: 0, dedupeEntries: 0, roomDetails: [] });
    mocks.now.mockReset().mockReturnValueOnce(100).mockReturnValue(104);
    mocks.getSession.mockReset().mockResolvedValue({ get: (key: string) => key === "isOwner" });
  });

  it("returns JSON 405 and no-store headers for the wrong method", async () => {
    const response = (await createLoader({ request: new Request("http://watchtower.test/api/v1/rooms"), params: {}, context: {} }))!;
    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: { code: "method_not_allowed", message: "Use POST for this endpoint." } });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it.each([
    ["wrong content type", post("{}", { "Content-Type": "text/plain" }), 415, "unsupported_media_type"],
    ["missing origin", new Request("http://watchtower.test/api/v1/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), 403, "csrf_rejected"],
    ["cross origin", post("{}", { Origin: "https://attacker.test" }), 403, "csrf_rejected"],
    ["cross-site fetch", post("{}", { "Sec-Fetch-Site": "cross-site" }), 403, "csrf_rejected"],
    ["oversized declared body", post("{}", { "Content-Length": "20000" }), 413, "payload_too_large"],
    ["oversized actual body", post(JSON.stringify({ padding: "x".repeat(17_000) })), 413, "payload_too_large"],
    ["invalid JSON", post("{"), 400, "invalid_request"],
    ["unsafe number", post(JSON.stringify({ ...validBody, startPositionMs: Number.MAX_VALUE })), 400, "invalid_request"],
  ])("rejects %s without coordinator side effects", async (_label, request, status, code) => {
    const response = await createAction({ request, params: {}, context: {} });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("authenticates before creating and propagates the device cookie", async () => {
    const response = await createAction({ request: post(), params: {}, context: {} });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ created: true });
    expect(mocks.create).toHaveBeenCalledWith(principal, validBody);
    expect(response.headers.get("Set-Cookie")).toContain("__wt_device=signed");
  });

  it("returns principal authentication errors as JSON", async () => {
    mocks.resolvePrincipal.mockResolvedValue({ ok: false, code: "unauthenticated", message: "Sign in." });
    const response = await createAction({ request: post(), params: {}, context: {} });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "unauthenticated", message: "Sign in." } });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not expose room metadata to non-member GET or SSE requests", async () => {
    const roomId = "80000000-0000-4000-8000-000000000001";
    const getResponse = await roomLoader({ request: new Request(`http://watchtower.test/api/v1/rooms/${roomId}`), params: { roomId }, context: {} });
    const eventResponse = await eventsLoader({ request: new Request(`http://watchtower.test/api/v1/rooms/${roomId}/events`), params: { roomId }, context: {} });
    expect(getResponse.status).toBe(404);
    expect(eventResponse.status).toBe(404);
    expect(getResponse.headers.get("Content-Type")).toContain("application/json");
    expect(eventResponse.headers.get("Content-Type")).toContain("application/json");
    expect(await getResponse.text()).toBe('{"error":{"code":"not_found","message":"Room not found."}}');
    expect(await eventResponse.text()).toBe('{"error":{"code":"not_found","message":"Room not found."}}');
  });

  it("samples the process clock around authentication", async () => {
    const response = await clockLoader({ request: new Request("http://watchtower.test/api/v1/clock"), params: {}, context: {} });
    expect(await response.json()).toEqual({ protocolVersion: 1, epoch: validBody.epoch, receivedAtMs: 100, sentAtMs: 104 });
    expect(mocks.now).toHaveBeenCalledTimes(2);
  });

  it("restricts diagnostics to the server owner", async () => {
    mocks.getSession.mockResolvedValueOnce({ get: () => false });
    const denied = await diagnosticsLoader({ request: new Request("http://watchtower.test/api/v1/rooms/diagnostics"), params: {}, context: {} });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: "forbidden" } });

    const allowed = await diagnosticsLoader({ request: new Request("http://watchtower.test/api/v1/rooms/diagnostics"), params: {}, context: {} });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ rooms: 0, participants: 0, connected: 0, subscribers: 0, dedupeEntries: 0, roomDetails: [] });
  });

  it("does not log request bodies, invite secrets, or principal tokens", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await createAction({ request: post(), params: {}, context: {} });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});