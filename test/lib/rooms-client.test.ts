import { beforeEach, describe, expect, it, vi } from "vitest";
import fixtures from "../fixtures/rooms/v1/fixtures.json";
import {
  BrowserRoomClient,
  createRoom,
  type RoomClientState,
} from "~/lib/rooms/client";
import type { RoomEnvelope, RoomSnapshot } from "~/lib/rooms/protocol";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, (event: MessageEvent) => void>();
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, listener);
  }
}

const envelope = structuredClone(fixtures.createResponse) as RoomEnvelope;
const playing = structuredClone(fixtures.playingSnapshot) as RoomSnapshot;
const roomId = envelope.snapshot.roomId;

function clockResponse() {
  return new Response(JSON.stringify({
    ...fixtures.clock,
    sentAtMs: fixtures.clock.receivedAtMs,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient(fetchImpl: typeof fetch = vi.fn()) {
  return new BrowserRoomClient(roomId, structuredClone(envelope), {
    fetch: fetchImpl,
    createEventSource: (url) => new FakeEventSource(url),
    now: () => 100,
  });
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.useRealTimers();
});

describe("snapshot ordering", () => {
  it("accepts newer presence at the same control revision and ignores regressions", () => {
    const client = makeClient();
    expect(client.applySnapshot(playing)).toBe(true);
    const presenceOnly = {
      ...playing,
      presenceRevision: playing.presenceRevision + 1,
      participants: [{ ...playing.participants[0], buffering: true }],
    };
    expect(client.applySnapshot(presenceOnly)).toBe(true);
    expect(client.getState().snapshot?.participants[0].buffering).toBe(true);

    expect(
      client.applySnapshot({
        ...playing,
        revision: playing.revision - 1,
        presenceRevision: playing.presenceRevision,
      })
    ).toBe(false);
    expect(client.getState().snapshot?.presenceRevision).toBe(10);
  });

  it("ends the room when the coordinator epoch changes", () => {
    const client = makeClient();
    client.applySnapshot({
      ...playing,
      epoch: "99999999-9999-4999-8999-999999999999",
    });
    expect(client.getState()).toMatchObject({
      status: "ended",
      endedReason: "server_restarted",
    });
  });
});

describe("recovery and liveness", () => {
  it("enters reconnecting after the stale threshold", async () => {
    vi.useFakeTimers();
    let now = 100;
    const fetchImpl = vi.fn(async () => clockResponse());
    const client = new BrowserRoomClient(roomId, structuredClone(envelope), {
      fetch: fetchImpl,
      createEventSource: (url) => new FakeEventSource(url),
      now: () => now,
    });
    const states: RoomClientState[] = [];
    client.subscribe((state) => states.push(state));
    await client.start();
    fetchImpl.mockImplementation(() => new Promise<Response>(() => {}));
    now += 15_000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.some((state) => state.status === "reconnecting")).toBe(true);
    client.stop();
  });

  it.each([401, 404])(
    "stops recovery after a terminal %s response",
    async (status) => {
      const fetchImpl = vi.fn(async () => clockResponse());
      const client = makeClient(fetchImpl);
      await client.start();
      fetchImpl.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: "not_found", message: "Gone" } }),
          { status, headers: { "Content-Type": "application/json" } }
        )
      );
      FakeEventSource.instances[0].onerror?.(new Event("error"));
      await vi.waitFor(() => expect(client.getState().status).toBe("error"));
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      client.stop();
    }
  );
});

describe("commands", () => {
  it("retries a lost response with the identical command body", async () => {
    const requests: string[] = [];
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(init?.body));
      if (requests.length === 1) throw new TypeError("connection lost");
      return new Response(
        JSON.stringify({ accepted: true, snapshot: playing }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    const client = makeClient(fetchImpl);
    (client as unknown as { state: RoomClientState }).state = {
      ...client.getState(),
      status: "connected",
    };
    await expect(
      client.sendCommand({ type: "seek", payload: { positionMs: 90_000 } })
    ).resolves.toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toBe(requests[0]);
  });

  it("applies a 409 snapshot and drops the intent without replay", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: { code: "stale_revision", message: "Changed" },
          snapshot: playing,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = makeClient(fetchImpl);
    (client as unknown as { state: RoomClientState }).state = {
      ...client.getState(),
      status: "connected",
    };
    await expect(
      client.sendCommand({ type: "pause", payload: {} })
    ).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(client.getState().snapshot?.revision).toBe(playing.revision);
    expect(client.getState().lastErrorCode).toBe("stale_revision");
  });

  it.each([
    [403, "not_host"],
    [404, "not_found"],
    [429, "rate_limited"],
    [503, "upstream_unavailable"],
  ])("keeps the room connected after a %s %s command rejection", async (status, code) => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      if (String(url).endsWith("/commands")) {
        return new Response(
          JSON.stringify({ error: { code, message: "Rejected" } }),
          { status, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = makeClient(fetchImpl);
    (client as unknown as { state: RoomClientState }).state = {
      ...client.getState(),
      status: "connected",
    };

    await expect(
      client.sendCommand({ type: "select-next", payload: { delayMs: 0 } })
    ).resolves.toBe(false);
    await Promise.resolve();

    expect(client.getState()).toMatchObject({ status: "connected", lastErrorCode: code });
    expect(urls.filter((url) => url.endsWith("/commands"))).toHaveLength(1);
    // Only not_found is ambiguous with a missing room, so only it re-reads the room.
    expect(urls.includes(`/api/v1/rooms/${roomId}`)).toBe(code === "not_found");
  });

  it("ends the client when a not_found command is confirmed by a missing room", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: "not_found", message: "Room not found." } }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = makeClient(fetchImpl);
    (client as unknown as { state: RoomClientState }).state = {
      ...client.getState(),
      status: "connected",
    };

    await expect(
      client.sendCommand({ type: "pause", payload: {} })
    ).resolves.toBe(false);
    await vi.waitFor(() => expect(client.getState().status).toBe("error"));
    expect(client.getState().lastErrorCode).toBe("not_found");
  });

  it.each([
    [401, "unauthenticated", "error"],
    [403, "removed", "error"],
    [410, "room_ended", "ended"],
  ])("ends the client after a terminal %s %s command rejection", async (status, code, terminal) => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code, message: "Ended" } }),
        { status, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = makeClient(fetchImpl);
    (client as unknown as { state: RoomClientState }).state = {
      ...client.getState(),
      status: "connected",
    };

    await expect(
      client.sendCommand({ type: "pause", payload: {} })
    ).rejects.toMatchObject({ status, code });
    expect(client.getState()).toMatchObject({ status: terminal, lastErrorCode: code });
  });
});

it("reuses the complete create body when a later retry uses the same request ID", async () => {
  const requestId = "77777777-7777-4777-8777-777777777777";
  const postBodies: string[] = [];
  let postAttempts = 0;
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (url === "/api/v1/clock") return clockResponse();
    postBodies.push(String(init?.body));
    postAttempts++;
    if (postAttempts <= 2) throw new TypeError("connection lost");
    return new Response(JSON.stringify(envelope), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const fields = {
    media: { ratingKey: "42", mediaId: "7", partId: "9" },
    startPositionMs: 0,
    autoAdvance: true,
  };

  await expect(
    createRoom(fields, { fetch: fetchImpl, now: () => 100, requestId })
  ).rejects.toThrow("connection lost");
  await expect(
    createRoom(fields, { fetch: fetchImpl, now: () => 500, requestId })
  ).resolves.toEqual(envelope);

  expect(postBodies).toHaveLength(3);
  expect(new Set(postBodies).size).toBe(1);
  expect(fetchImpl.mock.calls.filter(([url]) => url === "/api/v1/clock")).toHaveLength(3);
});