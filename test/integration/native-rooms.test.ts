import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { saveServerConfig } from "~/lib/config/server-config.server";
import { resetNativeCryptoForTests } from "~/lib/native/crypto.server";
import { createDeviceSession, resetDeviceStoreForTests, revokeDeviceSession } from "~/lib/native/device-store.server";
import { getRoomCoordinator } from "~/lib/rooms/coordinator.server";
import { prepareRoomPost } from "~/lib/rooms/http.server";
import { resolveRoomPrincipal } from "~/lib/rooms/principal.server";
import { parseCreateRoom } from "~/lib/rooms/protocol";
import { action as createRoom } from "~/routes/api.v1.rooms";
import { loader as getRoom } from "~/routes/api.v1.rooms.$roomId";

const dataPath = path.resolve("tmp/integration-native-rooms-test");
const machineId = "integration-machine";

async function tvSession(userId = "10") {
  return createDeviceSession({
    name: "Living Room TV",
    platform: "android-tv",
    model: "Integration TV",
    appVersion: "0.1.0 (1)",
    account: { userId, title: "Owner" },
    profile: { userId, title: "Owner", restricted: false, owner: true, protected: false },
    serverMachineId: machineId,
    serverName: "Integration PMS",
    plexToken: `plex-${userId}`,
    serverToken: `server-${userId}`,
    isOwner: true,
  });
}

function bearer(token: string, init: RequestInit & { identityVersion?: string | null } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.identityVersion !== null) headers.set("X-Watchtower-Identity-Version", init.identityVersion ?? "1");
  return { ...init, headers };
}

beforeEach(async () => {
  process.env.DATA_PATH = dataPath;
  await rm(dataPath, { recursive: true, force: true });
  await mkdir(dataPath, { recursive: true });
  resetDeviceStoreForTests();
  resetNativeCryptoForTests();
  saveServerConfig({ serverUrl: "http://pms.test:32400", machineIdentifier: machineId, serverName: "Integration PMS", token: "owner-token", adminUserId: 10, adminUsername: "Owner" });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dataPath, { recursive: true, force: true });
});

describe("Android TV bearer principals on Watch Together routes", () => {
  it("resolves a native device session with its identity version", async () => {
    const { accessToken, record } = await tvSession();
    const resolved = await resolveRoomPrincipal(new Request("http://watchtower.test/api/v1/rooms/x", bearer(accessToken)));
    expect(resolved).toMatchObject({
      ok: true,
      setCookie: null,
      principal: { kind: "native", userId: "10", deviceSessionId: record.deviceSessionId, identityVersion: 1, serverMachineId: machineId },
    });
  });

  it.each([
    ["missing identity version", { identityVersion: null }, "identity_version_mismatch"],
    ["stale identity version", { identityVersion: "7" }, "identity_version_mismatch"],
    ["cookie and bearer together", { headers: { Cookie: "__plex_session=abc" } }, "identity_ambiguous"],
  ])("rejects %s", async (_name, init, code) => {
    const { accessToken } = await tvSession();
    const resolved = await resolveRoomPrincipal(new Request("http://watchtower.test/api/v1/rooms/x", bearer(accessToken, init)));
    expect(resolved).toMatchObject({ ok: false, code });
  });

  it("rejects revoked and unknown device credentials without cookie fallback", async () => {
    const { accessToken, record } = await tvSession();
    await revokeDeviceSession(record.deviceSessionId);
    expect(await resolveRoomPrincipal(new Request("http://watchtower.test/api/v1/rooms/x", bearer(accessToken)))).toMatchObject({ ok: false, code: "unauthenticated" });
    expect(await resolveRoomPrincipal(new Request("http://watchtower.test/api/v1/rooms/x", bearer(`wtd_${"A".repeat(43)}`)))).toMatchObject({ ok: false, code: "unauthenticated" });
  });

  it("skips browser CSRF proof only for bearer requests", async () => {
    const { accessToken } = await tvSession();
    const body = JSON.stringify({});
    const native = await prepareRoomPost(
      new Request("http://watchtower.test/api/v1/rooms", bearer(accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body })),
      parseCreateRoom,
    );
    expect(native.ok).toBe(false);
    if (!native.ok) expect((await native.response.json()).error.code).toBe("invalid_request");
    const cookie = await prepareRoomPost(
      new Request("http://watchtower.test/api/v1/rooms", { method: "POST", headers: { "Content-Type": "application/json", Cookie: "__plex_session=x" }, body }),
      parseCreateRoom,
    );
    expect(cookie.ok).toBe(false);
    if (!cookie.ok) expect((await cookie.response.json()).error.code).toBe("csrf_rejected");
  });

  it("lets a TV create and read a room for media its profile token can access", async () => {
    const { accessToken, record } = await tvSession();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      expect(url.origin).toBe("http://pms.test:32400");
      return new Response(JSON.stringify({
        MediaContainer: { Metadata: [{ ratingKey: "42", key: "/library/metadata/42", guid: "plex://movie/1", type: "movie", title: "Room Movie", duration: 120000, Media: [{ id: 101, duration: 120000, Part: [{ id: 102, key: "/library/parts/102/file.mp4", duration: 120000 }] }] }] },
      }), { headers: { "Content-Type": "application/json" } });
    });
    const coordinator = getRoomCoordinator();
    const create = await createRoom({
      request: new Request("http://watchtower.test/api/v1/rooms", bearer(accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: "10000000-0000-4000-8000-000000000009",
          epoch: coordinator.epoch,
          expiresAtMs: coordinator.now() + 30_000,
          media: { ratingKey: "42", mediaId: "101", partId: "102" },
          startPositionMs: 0,
          autoAdvance: true,
        }),
      })),
      params: {},
      context: {},
    });
    expect(create.status).toBe(201);
    const created = await create.json();
    expect(created.snapshot.media).toEqual({ serverMachineId: machineId, ratingKey: "42", mediaId: "101", partId: "102" });
    expect(created.membership.participantId).toBe(created.snapshot.hostParticipantId);
    const tokensUsed = fetchMock.mock.calls.map(([input, init]) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      return url.searchParams.get("X-Plex-Token") ?? new Headers(init?.headers).get("X-Plex-Token");
    });
    expect(tokensUsed.every((token) => token === "server-10")).toBe(true);

    const read = await getRoom({ request: new Request(`http://watchtower.test/api/v1/rooms/${created.snapshot.roomId}`, bearer(accessToken)), params: { roomId: created.snapshot.roomId }, context: {} });
    expect(read.status).toBe(200);
    expect((await read.json()).membership.participantId).toBe(created.membership.participantId);

    const leave = vi.spyOn(coordinator, "leaveDeviceMemberships");
    await revokeDeviceSession(record.deviceSessionId);
    expect(leave).toHaveBeenCalledWith("10", record.deviceSessionId);
  });
});
