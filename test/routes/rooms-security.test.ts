import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCurrentUser: vi.fn(),
  create: vi.fn(),
  join: vi.fn(),
  command: vi.fn(),
  presence: vi.fn(),
  leave: vi.fn(),
  invitation: vi.fn(),
  get: vi.fn(),
  subscribe: vi.fn(),
  diagnostics: vi.fn(),
  now: vi.fn(),
}));

vi.mock("~/lib/auth/session.server", () => ({ getSession: mocks.getSession }));
vi.mock("~/lib/auth/user.server", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("~/lib/config/server-config.server", () => ({
  getServerConfig: () => ({ machineIdentifier: "machine-1" }),
}));
vi.mock("~/lib/env.server", () => ({
  env: {
    PLEX_SERVER_URL: "http://plex.internal:32400",
    PLEX_CLIENT_ID: "watchtower-test",
    SESSION_SECRET: "cookie-signing-secret",
    SECURE_COOKIES: false,
  },
}));
vi.mock("~/lib/rooms/coordinator.server", () => ({
  getRoomCoordinator: () => ({
    epoch: "00000000-0000-4000-8000-000000000001",
    now: mocks.now,
    create: mocks.create,
    join: mocks.join,
    command: mocks.command,
    presence: mocks.presence,
    leave: mocks.leave,
    invitation: mocks.invitation,
    get: mocks.get,
    subscribe: mocks.subscribe,
    diagnostics: mocks.diagnostics,
  }),
}));

import { action as createAction, loader as createLoader } from "~/routes/api.v1.rooms";
import { action as joinAction, loader as joinLoader } from "~/routes/api.v1.rooms.join";
import { action as commandAction, loader as commandLoader } from "~/routes/api.v1.rooms.$roomId.commands";
import { action as presenceAction, loader as presenceLoader } from "~/routes/api.v1.rooms.$roomId.presence";
import { action as leaveAction, loader as leaveLoader } from "~/routes/api.v1.rooms.$roomId.leave";
import { action as invitationAction, loader as invitationLoader } from "~/routes/api.v1.rooms.$roomId.invitations";
import { loader as roomLoader } from "~/routes/api.v1.rooms.$roomId";
import { loader as eventsLoader } from "~/routes/api.v1.rooms.$roomId.events";
import { loader as diagnosticsLoader } from "~/routes/api.v1.rooms.diagnostics";

const ROOM_ID = "80000000-0000-4000-8000-000000000001";
const EPOCH = "00000000-0000-4000-8000-000000000001";
const REQUEST_ID = "10000000-0000-4000-8000-000000000001";

const bodies = {
  create: {
    requestId: REQUEST_ID,
    epoch: EPOCH,
    expiresAtMs: 50_000,
    media: { ratingKey: "42", mediaId: "101", partId: "102" },
    startPositionMs: 0,
    autoAdvance: true,
  },
  join: {
    requestId: REQUEST_ID,
    epoch: EPOCH,
    expiresAtMs: 50_000,
    invite: "A".repeat(43),
  },
  command: {
    commandId: "20000000-0000-4000-8000-000000000001",
    commandSequence: 1,
    membershipVersion: 1,
    epoch: EPOCH,
    mediaGeneration: 1,
    expectedRevision: 1,
    type: "pause",
    payload: {},
  },
  presence: {
    epoch: EPOCH,
    membershipVersion: 1,
    mediaGeneration: 1,
    preparationGeneration: 1,
    presenceSequence: 1,
    playbackSessionId: null,
    positionMs: 0,
    ready: false,
    buffering: false,
    replacingSource: false,
    error: null,
  },
  leave: { epoch: EPOCH, membershipVersion: 1 },
  invitation: {
    requestId: REQUEST_ID,
    epoch: EPOCH,
    expiresAtMs: 50_000,
    membershipVersion: 1,
    action: "rotate",
  },
} as const;

type RouteCase = {
  name: keyof typeof bodies;
  path: string;
  action: (args: never) => Promise<Response>;
  loader: (args: never) => Response | Promise<Response | null> | null;
  operation: ReturnType<typeof vi.fn>;
};

const routes: RouteCase[] = [
  { name: "create", path: "/api/v1/rooms", action: createAction as RouteCase["action"], loader: createLoader as RouteCase["loader"], operation: mocks.create },
  { name: "join", path: "/api/v1/rooms/join", action: joinAction as RouteCase["action"], loader: joinLoader as RouteCase["loader"], operation: mocks.join },
  { name: "command", path: `/api/v1/rooms/${ROOM_ID}/commands`, action: commandAction as RouteCase["action"], loader: commandLoader as RouteCase["loader"], operation: mocks.command },
  { name: "presence", path: `/api/v1/rooms/${ROOM_ID}/presence`, action: presenceAction as RouteCase["action"], loader: presenceLoader as RouteCase["loader"], operation: mocks.presence },
  { name: "leave", path: `/api/v1/rooms/${ROOM_ID}/leave`, action: leaveAction as RouteCase["action"], loader: leaveLoader as RouteCase["loader"], operation: mocks.leave },
  { name: "invitation", path: `/api/v1/rooms/${ROOM_ID}/invitations`, action: invitationAction as RouteCase["action"], loader: invitationLoader as RouteCase["loader"], operation: mocks.invitation },
];

function session(owner = false) {
  return {
    get: (key: string) =>
      ({
        plexToken: "plex-cookie-token",
        serverToken: "server-token-secret",
        serverMachineId: "machine-1",
        isOwner: owner,
      })[key as "plexToken"],
  };
}

function post(route: RouteCase, body: BodyInit = JSON.stringify(bodies[route.name]), headers: HeadersInit = {}) {
  return new Request(`http://watchtower.test${route.path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://watchtower.test",
      Cookie: "__plex_session=cookie-value",
      ...headers,
    },
    body,
  });
}

function args(request: Request) {
  return { request, params: { roomId: ROOM_ID }, context: {} } as never;
}

function clearOperations() {
  for (const route of routes) route.operation.mockClear();
}

describe("room route security", () => {
  beforeEach(() => {
    mocks.getSession.mockReset().mockResolvedValue(session(false));
    mocks.getCurrentUser.mockReset().mockResolvedValue({ id: "user-1", title: "Viewer" });
    mocks.now.mockReset().mockReturnValue(1_000);
    for (const route of routes) {
      route.operation.mockReset().mockResolvedValue({ status: 200, body: { ok: true } });
    }
    mocks.get.mockReset().mockReturnValue({ status: 404, body: { error: { code: "not_found", message: "Room not found." } } });
    mocks.subscribe.mockReset().mockReturnValue({ status: 404, body: { error: { code: "not_found", message: "Room not found." } } });
    mocks.diagnostics.mockReset().mockReturnValue({
      rooms: 1,
      participants: 2,
      connected: 2,
      subscribers: 1,
      dedupeEntries: 0,
      roomDetails: [{ roomIdPrefix: "80000000", phase: "paused", revision: 3, presenceRevision: 5, participants: 2, connected: 2, driftEstimatesMs: [10] }],
    });
  });

  it.each(routes)("rejects every unsafe request shape on $name before coordinator access", async (route) => {
    const cases: Array<[Request, number, string]> = [
      [post(route, "{}", { "Content-Type": "text/plain" }), 415, "unsupported_media_type"],
      [new Request(`http://watchtower.test${route.path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), 403, "csrf_rejected"],
      [post(route, "{}", { Origin: "https://foreign.test" }), 403, "csrf_rejected"],
      [post(route, "{}", { "Sec-Fetch-Site": "cross-site" }), 403, "csrf_rejected"],
      [post(route, "{}", { "Content-Length": "16385" }), 413, "payload_too_large"],
      [post(route, JSON.stringify({ padding: "x".repeat(17_000) })), 413, "payload_too_large"],
    ];
    for (const [request, status, code] of cases) {
      clearOperations();
      const response = await route.action(args(request));
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ error: { code } });
      expect(route.operation).not.toHaveBeenCalled();
    }
    clearOperations();
    const response = await route.loader(args(new Request(`http://watchtower.test${route.path}`)));
    expect(response?.status).toBe(405);
    expect(route.operation).not.toHaveBeenCalled();
  });

  it.each(routes)("authenticates $name before invoking its coordinator operation", async (route) => {
    mocks.getSession.mockResolvedValueOnce({ get: () => undefined });
    const response = await route.action(args(post(route)));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthenticated" } });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(route.operation).not.toHaveBeenCalled();
  });

  it.each([
    ["without cookie", undefined, "bearer_unsupported"],
    ["with cookie", "__plex_session=cookie-value", "identity_ambiguous"],
  ])("rejects an Authorization header %s without cookie fallback", async (_label, cookie, code) => {
    const route = routes[0];
    const headers: Record<string, string> = {
      Authorization: "Bearer native-token",
      "Content-Type": "application/json",
      Origin: "http://watchtower.test",
    };
    if (cookie) headers.Cookie = cookie;
    const request = new Request(`http://watchtower.test${route.path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(bodies.create),
    });
    const response = await route.action(args(request));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code } });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(route.operation).not.toHaveBeenCalled();
  });

  it("keeps cookie values, server tokens, invite secrets, and Plex URLs out of errors and SSE", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secrets = ["cookie-value", "server-token-secret", "A".repeat(43), "http://plex.internal:32400"];

    mocks.get.mockReturnValueOnce({ status: 403, body: { error: { code: "removed", message: "You were removed." } } });
    const getResponse = await roomLoader(args(new Request(`http://watchtower.test/api/v1/rooms/${ROOM_ID}`, { headers: { Cookie: "__plex_session=cookie-value" } })));
    const getText = await getResponse.text();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`event: ended\ndata: {"reason":"removed"}\n\n`));
        controller.close();
      },
    });
    mocks.subscribe.mockReturnValueOnce({ status: 200, body: stream });
    const eventResponse = await eventsLoader(args(new Request(`http://watchtower.test/api/v1/rooms/${ROOM_ID}/events`, { headers: { Cookie: "__plex_session=cookie-value" } })));
    const eventText = await eventResponse.text();
    const output = JSON.stringify([getText, eventText, log.mock.calls, warn.mock.calls, error.mock.calls]);
    for (const secret of secrets) expect(output).not.toContain(secret);
  });

  it("keeps diagnostics owner-only and excludes names, titles, credentials, and URLs", async () => {
    const denied = await diagnosticsLoader(args(new Request("http://watchtower.test/api/v1/rooms/diagnostics", { headers: { Cookie: "__plex_session=cookie-value" } })));
    expect(denied.status).toBe(403);
    expect(mocks.diagnostics).not.toHaveBeenCalled();

    mocks.getSession.mockResolvedValue(session(true));
    const allowed = await diagnosticsLoader(args(new Request("http://watchtower.test/api/v1/rooms/diagnostics", { headers: { Cookie: "__plex_session=cookie-value" } })));
    expect(allowed.status).toBe(200);
    const text = await allowed.text();
    expect(text).toContain('"roomIdPrefix":"80000000"');
    expect(text).not.toMatch(/Viewer|Private title|cookie-value|server-token-secret|plex\.internal/);
  });
});