import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackPrincipal } from "~/lib/rooms/principal.server";
import {
  ROOM_POLICY,
  type CommandEnvelope,
  type PresenceReport,
  type RoomEnvelope,
  type RoomSnapshot,
} from "~/lib/rooms/protocol";

const mocks = vi.hoisted(() => ({
  authorizeMedia: vi.fn(),
  resolveNextMedia: vi.fn(),
  ownedPlaybackSession: vi.fn(),
  resolveRoomPrincipal: vi.fn(),
  machineId: "machine-1",
}));

vi.mock("~/lib/config/server-config.server", () => ({
  getServerConfig: () => ({ machineIdentifier: mocks.machineId }),
}));
vi.mock("~/lib/env.server", () => ({
  env: { PLEX_SERVER_URL: "http://plex.test", PLEX_CLIENT_ID: "watchtower-test" },
}));
vi.mock("~/lib/plex/playback-session.server", () => ({
  ownedPlaybackSession: mocks.ownedPlaybackSession,
}));
vi.mock("~/lib/rooms/media-access.server", () => ({
  authorizeMedia: mocks.authorizeMedia,
  resolveNextMedia: mocks.resolveNextMedia,
}));
vi.mock("~/lib/rooms/principal.server", () => ({
  resolveRoomPrincipal: mocks.resolveRoomPrincipal,
}));

import { RoomCoordinator } from "~/lib/rooms/coordinator.server";

const EPOCH = "00000000-0000-4000-8000-000000000001";
const SESSION_ONE = "30000000-0000-4000-8000-000000000001";
const SESSION_TWO = "30000000-0000-4000-8000-000000000002";

function uuid(index: number): string {
  return `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function principal(userId: string): PlaybackPrincipal {
  return {
    kind: "web",
    userId,
    displayName: userId,
    serverMachineId: "machine-1",
    serverToken: `token-${userId}`,
    deviceSessionId: `device-${userId}`,
    identityVersion: 0,
  };
}

describe("room protocol adversarial security", () => {
  let coordinator: RoomCoordinator;
  let now: number;
  let nextId: number;
  let nextSecret: number;

  const media = (ratingKey = "42") => ({
    media: {
      serverMachineId: "machine-1",
      ratingKey,
      mediaId: ratingKey === "42" ? "101" : "201",
      partId: ratingKey === "42" ? "102" : "202",
    },
    durationMs: 120_000,
    metadata: { ratingKey, type: "episode", title: "Private title" },
  });

  async function create(host = principal("host"), index = 1): Promise<RoomEnvelope> {
    const result = await coordinator.create(host, {
      requestId: uuid(index),
      epoch: EPOCH,
      expiresAtMs: now + 50_000,
      media: { ratingKey: "42", mediaId: "101", partId: "102" },
      startPositionMs: 500,
      autoAdvance: true,
    });
    expect(result.status).toBe(201);
    return result.body as RoomEnvelope;
  }

  async function join(
    room: RoomEnvelope,
    member = principal("guest"),
    index = 2
  ): Promise<RoomEnvelope> {
    const result = await coordinator.join(member, {
      requestId: uuid(index),
      epoch: EPOCH,
      expiresAtMs: now + 50_000,
      invite: room.invitation!.secret,
    });
    expect(result.status).toBe(200);
    return result.body as RoomEnvelope;
  }

  function snapshot(result: { body: unknown }): RoomSnapshot {
    return (result.body as { snapshot: RoomSnapshot }).snapshot;
  }

  function command(
    room: RoomEnvelope,
    sequence: number,
    expectedRevision: number,
    type: CommandEnvelope["type"],
    payload: CommandEnvelope["payload"],
    overrides: Partial<CommandEnvelope> = {}
  ): CommandEnvelope {
    return {
      commandId: uuid(1_000 + sequence),
      commandSequence: sequence,
      membershipVersion: room.membership.membershipVersion,
      epoch: EPOCH,
      mediaGeneration: room.snapshot.mediaGeneration,
      expectedRevision,
      type,
      payload,
      ...overrides,
    } as CommandEnvelope;
  }

  function presence(
    room: RoomEnvelope,
    member: PlaybackPrincipal,
    sequence: number,
    overrides: Partial<PresenceReport> = {}
  ) {
    return coordinator.presence(member, room.snapshot.roomId, {
      epoch: EPOCH,
      membershipVersion: room.membership.membershipVersion,
      mediaGeneration: room.snapshot.mediaGeneration,
      preparationGeneration: room.snapshot.preparationGeneration,
      presenceSequence: sequence,
      playbackSessionId: SESSION_ONE,
      positionMs: 500,
      ready: true,
      buffering: false,
      replacingSource: false,
      error: null,
      ...overrides,
    });
  }

  async function readFrame(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const frame = await reader.read();
    return { ...frame, text: new TextDecoder().decode(frame.value) };
  }

  beforeEach(() => {
    now = 1_000;
    nextId = 9_000;
    nextSecret = 0;
    mocks.machineId = "machine-1";
    mocks.authorizeMedia.mockReset().mockImplementation(async () => ({ ok: true, value: media() }));
    mocks.resolveNextMedia.mockReset().mockResolvedValue({ ok: true, value: media("43") });
    mocks.ownedPlaybackSession.mockReset().mockImplementation((sessionId: string, _ratingKey: string, _server: string, token: string) => ({
      scope: token.replace("token-", "device-"),
      generation: sessionId === SESSION_TWO ? 2 : 1,
    }));
    mocks.resolveRoomPrincipal.mockReset().mockResolvedValue({
      ok: true,
      principal: principal("host"),
      setCookie: null,
    });
    coordinator = new RoomCoordinator({
      now: () => now,
      id: () => uuid(nextId++),
      secret: () => String.fromCharCode(65 + nextSecret++).repeat(43),
      epoch: EPOCH,
      startSweep: false,
    });
  });

  afterEach(() => coordinator.dispose());

  it("rate-limits repeated invite guesses by one authenticated user", async () => {
    const attacker = principal("attacker");
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const result = await coordinator.join(attacker, {
        requestId: uuid(attempt + 1),
        epoch: EPOCH,
        expiresAtMs: 50_000,
        invite: "Z".repeat(43),
      });
      statuses.push(result.status);
    }
    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(404));
    expect(statuses[20]).toBe(429);
  });

  // Invitation guessing is bounded deployment-wide, not only per authenticated user.
  it("globally rate-limits invite guesses spread across many users", async () => {
    const statuses = await Promise.all(
      Array.from({ length: 500 }, (_, attempt) =>
        coordinator.join(principal(`attacker-${attempt}`), {
          requestId: uuid(attempt + 100),
          epoch: EPOCH,
          expiresAtMs: 50_000,
          invite: "Z".repeat(43),
        })
      )
    );
    expect(statuses.some((result) => result.status === 429)).toBe(true);
  });

  it("hides invitations from non-hosts and rejects forged member management", async () => {
    const host = principal("host");
    const guest = principal("guest");
    const room = await create(host);
    const joined = await join(room, guest);

    expect(coordinator.get(guest, room.snapshot.roomId)).toMatchObject({
      status: 200,
      body: { invitation: null },
    });
    const rotate = await coordinator.invitation(guest, room.snapshot.roomId, {
      requestId: uuid(20),
      epoch: EPOCH,
      expiresAtMs: now + 50_000,
      membershipVersion: joined.membership.membershipVersion,
      action: "rotate",
    });
    expect(rotate).toMatchObject({ status: 403, body: { error: { code: "not_host" } } });

    for (const [type, participantId] of [
      ["transfer-host", room.membership.participantId],
      ["remove-participant", uuid(99_999)],
    ] as const) {
      const result = await coordinator.command(
        guest,
        room.snapshot.roomId,
        command(joined, 1, 1, type, { participantId })
      );
      expect(result).toMatchObject({ status: 403, body: { error: { code: "not_host" } } });
    }
  });

  it("rejects playback sessions owned by another user or device scope", async () => {
    const host = principal("host");
    const room = await create(host);
    mocks.ownedPlaybackSession.mockReturnValueOnce(null);
    expect(snapshot(await presence(room, host, 1)).participants[0].ready).toBe(false);

    mocks.ownedPlaybackSession.mockReturnValueOnce({ scope: "device-other", generation: 2 });
    expect(snapshot(await presence(room, host, 2, { playbackSessionId: SESSION_TWO })).participants[0].ready).toBe(false);
  });

  it("terminates a removed member stream before later snapshots and denies every operation", async () => {
    const host = principal("host");
    const guest = principal("guest");
    const room = await create(host);
    const joined = await join(room, guest);
    const stream = coordinator.subscribe(guest, room.snapshot.roomId, new Request("http://watchtower.test/events"));
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader();
    await readFrame(reader);
    await readFrame(reader);

    await coordinator.command(
      host,
      room.snapshot.roomId,
      command(room, 1, 1, "remove-participant", {
        participantId: joined.membership.participantId,
      })
    );
    const terminal = await readFrame(reader);
    expect(terminal.text).toContain('"reason":"removed"');
    expect(terminal.text).not.toContain('"media"');

    await coordinator.command(
      host,
      room.snapshot.roomId,
      command(room, 2, 2, "set-policy", { autoAdvance: false })
    );
    expect((await reader.read()).done).toBe(true);
    expect(coordinator.get(guest, room.snapshot.roomId)).toMatchObject({ status: 403, body: { error: { code: "removed" } } });
    expect(await presence(joined, guest, 1)).toMatchObject({ status: 404 });
    expect(await coordinator.command(guest, room.snapshot.roomId, command(joined, 1, 2, "pause", {}))).toMatchObject({ status: 404 });
  });

  it("terminates an access-denied member stream before publishing protected next-media state", async () => {
    const host = principal("host");
    const denied = principal("denied");
    const room = await create(host);
    const joined = await join(room, denied);
    const stream = coordinator.subscribe(denied, room.snapshot.roomId, new Request("http://watchtower.test/events"));
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader();
    await readFrame(reader);
    await readFrame(reader);
    mocks.authorizeMedia.mockImplementation(async (actor: PlaybackPrincipal, ratingKey: string) =>
      actor.userId === denied.userId && ratingKey === "43"
        ? { ok: false, code: "media_forbidden", message: "denied" }
        : { ok: true, value: media(ratingKey) }
    );

    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "select-next", { delayMs: 0 }));
    const terminal = await readFrame(reader);
    expect(terminal.text).toContain('"reason":"access_denied"');
    expect(terminal.text).not.toContain('"ratingKey":"43"');
    await coordinator.command(host, room.snapshot.roomId, command(room, 2, 2, "set-policy", { autoAdvance: false }));
    expect((await reader.read()).done).toBe(true);
    expect(coordinator.get(denied, room.snapshot.roomId)).toMatchObject({ status: 404 });
    expect(await presence(joined, denied, 1)).toMatchObject({ status: 404 });
    expect(await coordinator.command(denied, room.snapshot.roomId, command(joined, 1, 2, "pause", {}))).toMatchObject({ status: 404 });
  });

  it("closes streams on server change, logout, and identity revalidation failure", async () => {
    const host = principal("host");

    const changed = await create(host, 30);
    const changedReader = (coordinator.subscribe(host, changed.snapshot.roomId, new Request("http://watchtower.test/events")).body as ReadableStream<Uint8Array>).getReader();
    await readFrame(changedReader);
    await readFrame(changedReader);
    mocks.machineId = "machine-2";
    coordinator.sweep();
    expect((await readFrame(changedReader)).text).toContain('"reason":"server_changed"');

    mocks.machineId = "machine-1";
    const loggedOut = await create(host, 31);
    const logoutReader = (coordinator.subscribe(host, loggedOut.snapshot.roomId, new Request("http://watchtower.test/events")).body as ReadableStream<Uint8Array>).getReader();
    await readFrame(logoutReader);
    await readFrame(logoutReader);
    coordinator.leaveDeviceMemberships(host.userId, host.deviceSessionId);
    await Promise.resolve();
    expect((await readFrame(logoutReader)).text).toContain('"reason":"left"');

    const revalidated = await create(host, 32);
    const revalidateReader = (coordinator.subscribe(host, revalidated.snapshot.roomId, new Request("http://watchtower.test/events", { headers: { Cookie: "__plex_session=redacted" } })).body as ReadableStream<Uint8Array>).getReader();
    await readFrame(revalidateReader);
    await readFrame(revalidateReader);
    now += ROOM_POLICY.authRevalidateMs;
    mocks.resolveRoomPrincipal.mockResolvedValueOnce({ ok: false, code: "unauthenticated", message: "expired" });
    coordinator.sweep();
    await Promise.resolve();
    let revalidationFrames = "";
    for (;;) {
      const frame = await readFrame(revalidateReader);
      revalidationFrames += frame.text;
      if (frame.done) break;
    }
    expect(revalidationFrames).toContain('"reason":"identity_changed"');
  });

  it("never serializes tokens, Plex URLs, or invite secrets outside the host envelope", async () => {
    const host = principal("host");
    const guest = principal("guest");
    const room = await create(host);
    await join(room, guest);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const serialized = JSON.stringify([
      coordinator.get(guest, room.snapshot.roomId),
      coordinator.diagnostics(),
      await coordinator.command(guest, room.snapshot.roomId, command(room, 1, 1, "pause", {})),
    ]);
    expect(serialized).not.toContain(host.serverToken);
    expect(serialized).not.toContain(guest.serverToken);
    expect(serialized).not.toContain(room.invitation!.secret);
    expect(serialized).not.toContain("http://plex.test");
    expect(JSON.stringify([log.mock.calls, warn.mock.calls, error.mock.calls])).not.toMatch(/token-|plex\.test|A{43}/);
  });

  it("serializes simultaneous host commands so exactly one expected revision wins", async () => {
    const host = principal("host");
    const room = await create(host);
    const results = await Promise.all([
      coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "set-policy", { autoAdvance: false })),
      coordinator.command(host, room.snapshot.roomId, command(room, 2, 1, "pause", {})),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(snapshot(coordinator.get(host, room.snapshot.roomId)).revision).toBe(2);
  });

  it("returns an identical cached command result without a second transition", async () => {
    const host = principal("host");
    const room = await create(host);
    const body = command(room, 1, 1, "set-policy", { autoAdvance: false });
    const first = await coordinator.command(host, room.snapshot.roomId, body);
    const retry = await coordinator.command(host, room.snapshot.roomId, structuredClone(body));
    expect(retry).toEqual(first);
    expect(snapshot(retry).revision).toBe(2);
    expect(snapshot(coordinator.get(host, room.snapshot.roomId)).revision).toBe(2);
  });

  it("rejects a regressed command sequence after its cached result expires", async () => {
    const host = principal("host");
    const room = await create(host);
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "set-policy", { autoAdvance: false }));
    now += ROOM_POLICY.mutationWindowMs + 1;
    coordinator.sweep();
    const replay = await coordinator.command(
      host,
      room.snapshot.roomId,
      command(room, 1, 2, "pause", {}, { commandId: uuid(2_222) })
    );
    expect(replay).toMatchObject({ status: 409, body: { error: { code: "command_result_expired" } } });
    expect(snapshot(coordinator.get(host, room.snapshot.roomId))).toMatchObject({ revision: 2, phase: "lobby" });
  });

  it("does not let stale preparation or replaced playback sessions release a barrier", async () => {
    const host = principal("host");
    const room = await create(host);
    await presence(room, host, 1);
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "play", {}));
    await coordinator.command(host, room.snapshot.roomId, command(room, 2, 2, "seek", { positionMs: 20_000 }));

    const stale = await presence(room, host, 2, { preparationGeneration: 1 });
    expect(snapshot(stale)).toMatchObject({ phase: "preparing", participants: [{ ready: false }] });
    await presence(room, host, 3, { playbackSessionId: SESSION_TWO, preparationGeneration: 2 });
    await coordinator.command(host, room.snapshot.roomId, command(room, 3, 4, "seek", { positionMs: 30_000 }));
    const oldSession = await presence(room, host, 4, {
      playbackSessionId: SESSION_ONE,
      preparationGeneration: 3,
    });
    expect(snapshot(oldSession)).toMatchObject({ phase: "preparing", participants: [{ ready: false }] });
  });

  it("does not pause for nonblocking replacement and never resumes a manual pause from ready", async () => {
    const host = principal("host");
    const guest = principal("guest");
    const room = await create(host);
    await presence(room, host, 1);
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "play", {}));
    const joined = await join(room, guest);

    const nonblocking = await presence(joined, guest, 1, { ready: false, buffering: true });
    expect(snapshot(nonblocking).phase).toBe("playing");
    const replacing = await presence(joined, guest, 2, { replacingSource: true, ready: false, buffering: true });
    expect(snapshot(replacing)).toMatchObject({ phase: "playing", participants: [{}, { blocking: false, buffering: false }] });

    await coordinator.command(host, room.snapshot.roomId, command(room, 2, 2, "seek", { positionMs: 10_000 }));
    await coordinator.command(host, room.snapshot.roomId, command(room, 3, 3, "pause", {}));
    await presence(room, host, 2, { preparationGeneration: 2 });
    expect(snapshot(coordinator.get(host, room.snapshot.roomId))).toMatchObject({ phase: "paused", resumeAfterPrepare: false });
  });

  it.each(["seek", "transfer-host", "end"] as const)(
    "does not let slow next authorization overwrite a newer %s",
    async (newerAction) => {
      const host = principal("host");
      const guest = principal("guest");
      const room = await create(host);
      const joined = await join(room, guest);
      let resolveNext!: (value: unknown) => void;
      mocks.resolveNextMedia.mockReturnValueOnce(new Promise((resolve) => { resolveNext = resolve; }));
      const slow = coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "select-next", { delayMs: 0 }));
      await Promise.resolve();

      const newer =
        newerAction === "seek"
          ? command(room, 2, 1, "seek", { positionMs: 12_000 })
          : newerAction === "transfer-host"
            ? command(room, 2, 1, "transfer-host", { participantId: joined.membership.participantId })
            : command(room, 2, 1, "end", {});
      expect((await coordinator.command(host, room.snapshot.roomId, newer)).status).toBe(200);
      resolveNext({ ok: true, value: media("43") });
      expect((await slow).status).not.toBe(200);
      expect(snapshot(coordinator.get(guest, room.snapshot.roomId)).media.ratingKey).toBe("42");
    }
  );

  it("does not start a second advance while a countdown advance is in flight", async () => {
    const host = principal("host");
    const room = await create(host);
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "select-next", { delayMs: 100 }));
    let releaseAccess!: (value: unknown) => void;
    mocks.authorizeMedia.mockReturnValueOnce(new Promise((resolve) => { releaseAccess = resolve; }));
    now += 101;
    coordinator.sweep();
    await Promise.resolve();
    coordinator.sweep();
    expect(mocks.authorizeMedia).toHaveBeenCalledTimes(2);
    releaseAccess({ ok: true, value: media("43") });
    await vi.waitFor(() =>
      expect(snapshot(coordinator.get(host, room.snapshot.roomId))).toMatchObject({
        mediaGeneration: 2,
        media: { ratingKey: "43" },
      })
    );
  });

  it("cancels pending advancement when the last host leaves", async () => {
    const host = principal("host");
    const room = await create(host);
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "select-next", { delayMs: 100 }));
    await coordinator.leave(host, room.snapshot.roomId, {
      epoch: EPOCH,
      membershipVersion: room.membership.membershipVersion,
    });
    now += 101;
    coordinator.sweep();
    expect(coordinator.get(host, room.snapshot.roomId)).toMatchObject({ status: 404 });
    expect(mocks.authorizeMedia).toHaveBeenCalledTimes(1);
  });

  it("joins as a blocker during preparation and nonblocking during a future start", async () => {
    const host = principal("host");
    const room = await create(host);
    await presence(room, host, 1);
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "play", {}));
    await coordinator.command(host, room.snapshot.roomId, command(room, 2, 2, "seek", { positionMs: 1_000 }));
    const preparingGuest = await join(room, principal("preparing-guest"), 40);
    expect(snapshot(coordinator.get(principal("preparing-guest"), room.snapshot.roomId)).participants.at(-1)).toMatchObject({ blocking: true, ready: false });
    await presence(room, host, 2, { preparationGeneration: 2 });
    await presence(preparingGuest, principal("preparing-guest"), 1, { preparationGeneration: 2 });
    await join(room, principal("future-guest"), 41);
    expect(snapshot(coordinator.get(principal("future-guest"), room.snapshot.roomId)).participants.at(-1)).toMatchObject({ blocking: false, ready: false });
  });

  it("deduplicates admission mutations and rejects participant overflow without eviction", async () => {
    const host = principal("host");
    const room = await create(host);
    const retry = await coordinator.create(host, {
      requestId: uuid(1),
      epoch: EPOCH,
      expiresAtMs: now + 50_000,
      media: { ratingKey: "42", mediaId: "101", partId: "102" },
      startPositionMs: 500,
      autoAdvance: true,
    });
    expect(retry.body).toEqual(room);
    expect(await coordinator.create(host, {
      requestId: uuid(1), epoch: EPOCH, expiresAtMs: now + 50_000,
      media: { ratingKey: "42", mediaId: "101", partId: "102" }, startPositionMs: 501, autoAdvance: true,
    })).toMatchObject({ status: 409, body: { error: { code: "request_conflict" } } });

    const firstJoin = await join(room, principal("guest-1"), 50);
    const repeatedJoin = await coordinator.join(principal("guest-1"), {
      requestId: uuid(50), epoch: EPOCH, expiresAtMs: now + 50_000, invite: room.invitation!.secret,
    });
    expect(repeatedJoin.body).toEqual(firstJoin);
    expect(await coordinator.join(principal("guest-1"), {
      requestId: uuid(50), epoch: EPOCH, expiresAtMs: now + 50_000, invite: "Z".repeat(43),
    })).toMatchObject({ status: 409, body: { error: { code: "request_conflict" } } });
    const rotation = {
      requestId: uuid(60), epoch: EPOCH, expiresAtMs: now + 50_000,
      membershipVersion: room.membership.membershipVersion, action: "rotate" as const,
    };
    const firstRotation = await coordinator.invitation(host, room.snapshot.roomId, rotation);
    expect(await coordinator.invitation(host, room.snapshot.roomId, rotation)).toEqual(firstRotation);
    expect(await coordinator.invitation(host, room.snapshot.roomId, {
      ...rotation,
      action: "revoke",
    })).toMatchObject({ status: 409, body: { error: { code: "request_conflict" } } });
    const rotatedRoom = {
      ...room,
      invitation: (firstRotation.body as RoomEnvelope).invitation,
    };

    const activeIds = new Set(snapshot(coordinator.get(host, room.snapshot.roomId)).participants.map((member) => member.participantId));
    for (let index = 2; index < ROOM_POLICY.maxParticipants; index += 1) {
      await join(rotatedRoom, principal(`guest-${index}`), 60 + index);
    }
    expect(await coordinator.join(principal("overflow"), {
      requestId: uuid(80), epoch: EPOCH, expiresAtMs: now + 50_000,
      invite: (firstRotation.body as RoomEnvelope).invitation!.secret,
    })).toMatchObject({ status: 429, body: { error: { code: "capacity_exceeded" } } });
    expect(snapshot(coordinator.get(host, room.snapshot.roomId)).participants.slice(0, 2).every((member) => activeIds.has(member.participantId))).toBe(true);

    now += 50_001;
    expect(await coordinator.join(principal("late"), {
      requestId: uuid(81), epoch: EPOCH, expiresAtMs: now, invite: room.invitation!.secret,
    })).toMatchObject({ status: 410, body: { error: { code: "request_expired" } } });
  });

  it("invalidates old takeover versions across streams, presence, commands, and leave", async () => {
    const host = principal("host");
    const room = await create(host);
    const stream = coordinator.subscribe(host, room.snapshot.roomId, new Request("http://watchtower.test/events"));
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader();
    await readFrame(reader);
    await readFrame(reader);
    const takeover = await coordinator.join(host, {
      requestId: uuid(90), epoch: EPOCH, expiresAtMs: now + 50_000,
      roomId: room.snapshot.roomId, takeover: true,
    });
    expect((await readFrame(reader)).text).toContain('"reason":"replaced"');
    expect(await presence(room, host, 1)).toMatchObject({ status: 409, body: { error: { code: "stale_membership" } } });
    expect(await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "pause", {}))).toMatchObject({ status: 409, body: { error: { code: "stale_membership" } } });
    expect(await coordinator.leave(host, room.snapshot.roomId, { epoch: EPOCH, membershipVersion: 1 })).toMatchObject({ status: 409, body: { error: { code: "stale_membership" } } });
    expect((takeover.body as RoomEnvelope).membership.membershipVersion).toBe(2);
  });

  it("disconnects an unread SSE consumer after ten seconds without harming the room", async () => {
    const host = principal("host");
    const room = await create(host);
    coordinator.subscribe(host, room.snapshot.roomId, new Request("http://watchtower.test/events"));
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "set-policy", { autoAdvance: false }));
    now += 10_001;
    coordinator.sweep();
    expect(coordinator.diagnostics()).toMatchObject({ rooms: 1, participants: 1, subscribers: 0 });
    expect(coordinator.get(host, room.snapshot.roomId).status).toBe(200);
  });

  it("enforces room/member caps, returns live counts to baseline, and owns one sweep timer", async () => {
    const host = principal("host");
    const room = await create(host);
    for (let index = 1; index < ROOM_POLICY.maxParticipants; index += 1) {
      await join(room, principal(`member-${index}`), 100 + index);
    }
    expect(snapshot(coordinator.get(host, room.snapshot.roomId)).participants).toHaveLength(ROOM_POLICY.maxParticipants);

    for (let index = 1; index < ROOM_POLICY.maxParticipants; index += 1) {
      const member = principal(`member-${index}`);
      const envelope = coordinator.get(member, room.snapshot.roomId).body as RoomEnvelope;
      await coordinator.leave(member, room.snapshot.roomId, { epoch: EPOCH, membershipVersion: envelope.membership.membershipVersion });
    }
    expect(coordinator.diagnostics()).toMatchObject({ rooms: 1, participants: 1, connected: 1 });

    for (let index = 1; index < ROOM_POLICY.maxRooms; index += 1) {
      await create(principal(`host-${index}`), 1_000 + index);
    }
    expect((await coordinator.create(principal("room-overflow"), {
      requestId: uuid(2_000), epoch: EPOCH, expiresAtMs: now + 50_000,
      media: { ratingKey: "42", mediaId: "101", partId: "102" }, startPositionMs: 0, autoAdvance: false,
    })).status).toBe(429);

    coordinator.dispose();
    vi.useFakeTimers();
    const timerBaseline = vi.getTimerCount();
    const timed = new RoomCoordinator({ now: () => now, epoch: EPOCH });
    expect(vi.getTimerCount()).toBe(timerBaseline + 1);
    timed.sweep();
    expect(vi.getTimerCount()).toBe(timerBaseline + 1);
    timed.dispose();
    expect(vi.getTimerCount()).toBe(timerBaseline);
    vi.useRealTimers();
  });
});