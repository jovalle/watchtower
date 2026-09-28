import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaybackPrincipal } from "~/lib/rooms/principal.server";
import { ROOM_POLICY, type CommandEnvelope, type PresenceReport, type RoomEnvelope, type RoomSnapshot } from "~/lib/rooms/protocol";

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
const ids = Array.from({ length: 400 }, (_, index) => `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`);
const requestId = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const commandId = (index: number) => `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const sessionId = (index: number) => `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const host: PlaybackPrincipal = {
  kind: "web",
  userId: "host-user",
  displayName: "Host",
  serverMachineId: "machine-1",
  serverToken: "host-secret-token",
  deviceSessionId: "host-device",
  identityVersion: 0,
};
const guest: PlaybackPrincipal = {
  ...host,
  userId: "guest-user",
  displayName: "Guest",
  serverToken: "guest-secret-token",
  deviceSessionId: "guest-device",
};

function media(ratingKey = "42") {
  return {
    media: { serverMachineId: "machine-1", ratingKey, mediaId: ratingKey === "42" ? "101" : "201", partId: ratingKey === "42" ? "102" : "202" },
    durationMs: 120_000,
    metadata: { ratingKey, type: "episode", title: "Synthetic" },
  };
}

function snapshot(result: { body: unknown }): RoomSnapshot {
  return (result.body as { snapshot: RoomSnapshot }).snapshot;
}

describe("RoomCoordinator", () => {
  let now: number;
  let nextId: number;
  let nextSecret: number;
  let coordinator: RoomCoordinator;

  beforeEach(() => {
    now = 1_000;
    nextId = 0;
    nextSecret = 0;
    mocks.machineId = "machine-1";
    mocks.authorizeMedia.mockReset().mockImplementation(async (principal: PlaybackPrincipal, ratingKey: string) =>
      principal.userId === "denied-user" && ratingKey === "43"
        ? { ok: false, code: "media_forbidden", message: "denied" }
        : { ok: true, value: media(ratingKey) }
    );
    mocks.resolveNextMedia.mockReset().mockResolvedValue({ ok: true, value: media("43") });
    mocks.ownedPlaybackSession.mockReset().mockImplementation((id: string, _rating: string, _server: string, token: string) => ({
      scope: token === host.serverToken ? host.deviceSessionId : guest.deviceSessionId,
      generation: Number(id.slice(-1)),
    }));
    mocks.resolveRoomPrincipal.mockReset().mockResolvedValue({ ok: true, principal: host, setCookie: null });
    coordinator = new RoomCoordinator({
      now: () => now,
      id: () => ids[nextId++],
      secret: () => String.fromCharCode(65 + nextSecret++).repeat(43),
      epoch: EPOCH,
      startSweep: false,
    });
  });

  async function create(index = 1) {
    return coordinator.create(host, {
      requestId: requestId(index),
      epoch: EPOCH,
      expiresAtMs: now + 50_000,
      media: { ratingKey: "42", mediaId: "101", partId: "102" },
      startPositionMs: 500,
      autoAdvance: true,
    });
  }

  async function created(index = 1): Promise<RoomEnvelope> {
    const result = await create(index);
    expect(result.status).toBe(201);
    return result.body as RoomEnvelope;
  }

  async function join(room: RoomEnvelope, principal = guest, index = 2): Promise<RoomEnvelope> {
    const result = await coordinator.join(principal, {
      requestId: requestId(index),
      epoch: EPOCH,
      expiresAtMs: now + 50_000,
      invite: room.invitation!.secret,
    });
    expect(result.status).toBe(200);
    return result.body as RoomEnvelope;
  }

  function presence(envelope: RoomEnvelope, principal: PlaybackPrincipal, sequence: number, overrides: Partial<PresenceReport> = {}) {
    return coordinator.presence(principal, envelope.snapshot.roomId, {
      epoch: EPOCH,
      membershipVersion: envelope.membership.membershipVersion,
      mediaGeneration: envelope.snapshot.mediaGeneration,
      preparationGeneration: envelope.snapshot.preparationGeneration,
      presenceSequence: sequence,
      playbackSessionId: sessionId(sequence),
      positionMs: 500,
      ready: true,
      buffering: false,
      replacingSource: false,
      error: null,
      ...overrides,
    });
  }

  function command(envelope: RoomEnvelope, sequence: number, expectedRevision: number, type: CommandEnvelope["type"], payload: CommandEnvelope["payload"]): CommandEnvelope {
    return {
      commandId: commandId(sequence),
      commandSequence: sequence,
      membershipVersion: envelope.membership.membershipVersion,
      epoch: EPOCH,
      mediaGeneration: envelope.snapshot.mediaGeneration,
      expectedRevision,
      type,
      payload,
    } as CommandEnvelope;
  }

  it("deduplicates create requests and rejects changed or expired retries", async () => {
    const first = await create();
    const retry = await create();
    expect(retry).toEqual(first);
    expect(coordinator.diagnostics()).toMatchObject({ rooms: 1, participants: 1, dedupeEntries: 1 });

    const conflict = await coordinator.create(host, {
      ...(first.body as RoomEnvelope).snapshot,
      requestId: requestId(1),
      epoch: EPOCH,
      expiresAtMs: now + 50_000,
      media: { ratingKey: "42", mediaId: "101", partId: "102" },
      startPositionMs: 900,
      autoAdvance: true,
    });
    expect(conflict).toMatchObject({ status: 409, body: { error: { code: "request_conflict" }, snapshot: { roomId: (first.body as RoomEnvelope).snapshot.roomId } } });

    const expired = await coordinator.create(host, {
      requestId: requestId(9), epoch: EPOCH, expiresAtMs: now, media: { ratingKey: "42", mediaId: "101", partId: "102" }, startPositionMs: 0, autoAdvance: false,
    });
    expect(expired).toMatchObject({ status: 410, body: { error: { code: "request_expired" } } });
  });

  it("keeps presenceRevision independent and makes command retries deterministic", async () => {
    const room = await created();
    const ready = await presence(room, host, 1);
    expect(snapshot(ready)).toMatchObject({ revision: 1, presenceRevision: 2, participants: [{ ready: true }] });

    const play = command(room, 1, 1, "play", {});
    const accepted = await coordinator.command(host, room.snapshot.roomId, play);
    expect(accepted).toMatchObject({ status: 200, body: { accepted: true, snapshot: { revision: 2, phase: "playing", reason: "host_played" } } });
    expect(await coordinator.command(host, room.snapshot.roomId, play)).toEqual(accepted);

    const conflicting = { ...play, type: "pause", payload: {} } as CommandEnvelope;
    expect(await coordinator.command(host, room.snapshot.roomId, conflicting)).toMatchObject({ status: 409, body: { error: { code: "command_conflict" } } });

    const stale = await coordinator.command(host, room.snapshot.roomId, command(room, 2, 1, "pause", {}));
    expect(stale).toMatchObject({ status: 409, body: { error: { code: "stale_revision" }, snapshot: { revision: 2 } } });
    const expired = await coordinator.command(host, room.snapshot.roomId, { ...command(room, 2, 2, "pause", {}), commandId: commandId(8) });
    expect(expired).toMatchObject({ status: 409, body: { error: { code: "command_result_expired" } } });
  });

  it("applies seek preparation, ignores stale readiness, and freezes a future start without rewinding", async () => {
    const room = await created();
    await presence(room, host, 1);
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "play", {}));
    const seek = await coordinator.command(host, room.snapshot.roomId, command(room, 2, 2, "seek", { positionMs: 30_000 }));
    expect(snapshot(seek)).toMatchObject({ phase: "preparing", revision: 3, preparationGeneration: 2, resumeAfterPrepare: true, anchor: { positionMs: 30_000 } });

    const staleReady = await presence(room, host, 2, { preparationGeneration: 1 });
    expect(snapshot(staleReady)).toMatchObject({ phase: "preparing", revision: 3, participants: [{ ready: false }] });
    const prepared = await presence(room, host, 3, { preparationGeneration: 2 });
    expect(snapshot(prepared)).toMatchObject({ phase: "playing", revision: 4, reason: "prepared", anchor: { positionMs: 30_000, effectiveAtMs: 2_000 } });

    const paused = await coordinator.command(host, room.snapshot.roomId, command(room, 3, 4, "pause", {}));
    expect(snapshot(paused)).toMatchObject({ phase: "paused", anchor: { positionMs: 30_000 } });
  });

  it("binds authority to membership and bans a removed user", async () => {
    const room = await created();
    const joined = await join(room);
    expect(await coordinator.command(guest, room.snapshot.roomId, command(joined, 1, 1, "pause", {}))).toMatchObject({ status: 403, body: { error: { code: "not_host" } } });

    const remove = command(room, 1, 1, "remove-participant", { participantId: joined.membership.participantId });
    expect(await coordinator.command(host, room.snapshot.roomId, remove)).toMatchObject({ status: 200, body: { snapshot: { reason: "participant_removed" } } });
    expect(coordinator.get(guest, room.snapshot.roomId)).toMatchObject({ status: 403, body: { error: { code: "removed" } } });
    expect(await coordinator.command(guest, room.snapshot.roomId, command(joined, 2, 3, "pause", {}))).toMatchObject({ status: 404, body: { error: { code: "not_found" } } });

    const rejoin = await coordinator.join(guest, { requestId: requestId(20), epoch: EPOCH, expiresAtMs: now + 50_000, invite: room.invitation!.secret });
    expect(rejoin).toMatchObject({ status: 403, body: { error: { code: "removed" } } });
  });

  it("uses deterministic host grace and immediate leave election", async () => {
    const room = await created();
    const joined = await join(room);
    await presence(room, host, 1);
    await presence(joined, guest, 1);
    now = 17_000;
    await presence(joined, guest, 2);
    coordinator.sweep();
    expect(snapshot(coordinator.get(host, room.snapshot.roomId))).toMatchObject({ hostParticipantId: room.membership.participantId, reason: "created" });

    now += 30_001;
    await presence(joined, guest, 3);
    coordinator.sweep();
    expect(snapshot(coordinator.get(guest, room.snapshot.roomId))).toMatchObject({ hostParticipantId: joined.membership.participantId, reason: "host_transferred" });

    const secondRoom = await created(30);
    const secondGuest = await join(secondRoom, guest, 31);
    await presence(secondGuest, guest, 1);
    await coordinator.leave(host, secondRoom.snapshot.roomId, { epoch: EPOCH, membershipVersion: secondRoom.membership.membershipVersion });
    expect(snapshot(coordinator.get(guest, secondRoom.snapshot.roomId))).toMatchObject({ hostParticipantId: secondGuest.membership.participantId, reason: "host_left" });
  });

  it("keeps late joiners nonblocking, does not pause for replacement, and pauses once for buffering", async () => {
    const room = await created();
    await presence(room, host, 1);
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "play", {}));
    const joined = await join(room);
    expect(snapshot(coordinator.get(guest, room.snapshot.roomId)).participants[1]).toMatchObject({ blocking: false, ready: false });

    await presence(joined, guest, 1);
    expect(snapshot(coordinator.get(guest, room.snapshot.roomId)).participants[1]).toMatchObject({ blocking: true, ready: true });
    const replacing = await presence(joined, guest, 2, { replacingSource: true, ready: false });
    expect(snapshot(replacing)).toMatchObject({ phase: "playing", participants: [{}, { blocking: false, ready: false }] });
    await presence(joined, guest, 3, { playbackSessionId: sessionId(3), ready: true });
    const buffering = await presence(joined, guest, 4, { playbackSessionId: sessionId(3), ready: false, buffering: true });
    expect(snapshot(buffering)).toMatchObject({ phase: "paused", reason: "buffering" });
    const revision = snapshot(buffering).revision;
    const repeated = await presence(joined, guest, 5, { playbackSessionId: sessionId(3), ready: false, buffering: true });
    expect(snapshot(repeated).revision).toBe(revision);
  });

  it("sends full SSE snapshots, replaces the old stream, and ignores Last-Event-ID", async () => {
    const room = await created();
    const first = coordinator.subscribe(host, room.snapshot.roomId, new Request("http://watchtower.test/api/v1/rooms/x/events", { headers: { "Last-Event-ID": "old:1:1" } }));
    expect(first.status).toBe(200);
    const firstReader = (first.body as ReadableStream<Uint8Array>).getReader();
    expect(new TextDecoder().decode((await firstReader.read()).value)).toBe("retry: 3000\n\n");
    const initial = new TextDecoder().decode((await firstReader.read()).value);
    expect(initial).toContain("event: snapshot");
    expect(initial).toContain(`id: ${EPOCH}:1:1`);

    const second = coordinator.subscribe(host, room.snapshot.roomId, new Request("http://watchtower.test/api/v1/rooms/x/events", { headers: { "Last-Event-ID": `${EPOCH}:999:999` } }));
    const ended = new TextDecoder().decode((await firstReader.read()).value);
    expect(ended).toContain('"reason":"replaced"');
    expect(ended).not.toContain('"media"');
    const secondReader = (second.body as ReadableStream<Uint8Array>).getReader();
    await secondReader.read();
    expect(new TextDecoder().decode((await secondReader.read()).value)).toContain(`id: ${EPOCH}:1:1`);
    await secondReader.cancel();
  });

  it("removes denied members before publishing next media and pauses when the host is denied", async () => {
    const denied = { ...guest, userId: "denied-user", serverToken: "denied-token" };
    const room = await created();
    await join(room, denied);
    const subscription = coordinator.subscribe(denied, room.snapshot.roomId, new Request("http://watchtower.test/events"));
    const reader = (subscription.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    await reader.read();

    const advanced = await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "select-next", { delayMs: 0 }));
    expect(snapshot(advanced)).toMatchObject({ media: { ratingKey: "43" }, reason: "next_selected" });
    const terminal = new TextDecoder().decode((await reader.read()).value);
    expect(terminal).toContain('"reason":"access_denied"');
    expect(terminal).not.toContain('"ratingKey":"43"');
    expect(coordinator.get(denied, room.snapshot.roomId)).toMatchObject({ status: 404 });

    const hostDeniedRoom = await created(40);
    mocks.authorizeMedia.mockImplementation(async (principal: PlaybackPrincipal, ratingKey: string) =>
      principal.userId === host.userId && ratingKey === "43"
        ? { ok: false, code: "media_forbidden", message: "denied" }
        : { ok: true, value: media(ratingKey) }
    );
    const unavailable = await coordinator.command(host, hostDeniedRoom.snapshot.roomId, command(hostDeniedRoom, 1, 1, "select-next", { delayMs: 0 }));
    expect(unavailable).toMatchObject({ status: 404, body: { error: { code: "not_found" } } });
    expect(snapshot(coordinator.get(host, hostDeniedRoom.snapshot.roomId))).toMatchObject({ phase: "paused", reason: "next_unavailable", media: { ratingKey: "42" } });
  });

  it("rejects playback sessions scoped to another device and ends rooms after server changes", async () => {
    const room = await created();
    mocks.ownedPlaybackSession.mockReturnValue({ scope: "another-device", generation: 10 });
    const report = await presence(room, host, 1);
    expect(snapshot(report).participants[0]).toMatchObject({ ready: false });

    mocks.machineId = "machine-2";
    coordinator.sweep();
    expect(coordinator.get(host, room.snapshot.roomId)).toMatchObject({ status: 410, body: { error: { code: "room_ended" }, snapshot: { phase: "ended", reason: "server_changed" } } });
  });

  it("does not let a slow next-episode lookup overwrite a newer seek", async () => {
    const room = await created();
    let resolveNext!: (value: unknown) => void;
    mocks.resolveNextMedia.mockReturnValueOnce(new Promise((resolve) => { resolveNext = resolve; }));
    const slow = coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "select-next", { delayMs: 0 }));
    await Promise.resolve();
    const seek = await coordinator.command(host, room.snapshot.roomId, command(room, 2, 1, "seek", { positionMs: 20_000 }));
    expect(snapshot(seek)).toMatchObject({ revision: 2, mediaGeneration: 1, anchor: { positionMs: 20_000 } });
    resolveNext({ ok: true, value: media("43") });
    expect(await slow).toMatchObject({ status: 409, body: { error: { code: "command_result_expired" } } });
    expect(snapshot(coordinator.get(host, room.snapshot.roomId))).toMatchObject({ mediaGeneration: 1, media: { ratingKey: "42" }, anchor: { positionMs: 20_000 } });
  });

  it("rotates and revokes invitations and takeover replaces the active stream", async () => {
    const room = await created();
    const oldSecret = room.invitation!.secret;
    const rotated = await coordinator.invitation(host, room.snapshot.roomId, {
      requestId: requestId(50), epoch: EPOCH, expiresAtMs: now + 50_000, membershipVersion: 1, action: "rotate",
    });
    const replacement = (rotated.body as RoomEnvelope).invitation!.secret;
    expect(replacement).not.toBe(oldSecret);
    expect(await coordinator.join(guest, { requestId: requestId(51), epoch: EPOCH, expiresAtMs: now + 50_000, invite: oldSecret })).toMatchObject({ status: 404, body: { error: { code: "not_found" } } });
    const joined = await coordinator.join(guest, { requestId: requestId(52), epoch: EPOCH, expiresAtMs: now + 50_000, invite: replacement });
    expect(joined.status).toBe(200);

    const stream = coordinator.subscribe(guest, room.snapshot.roomId, new Request("http://watchtower.test/events"));
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    await reader.read();
    const takeover = await coordinator.join(guest, {
      requestId: requestId(53), epoch: EPOCH, expiresAtMs: now + 50_000, roomId: room.snapshot.roomId, takeover: true,
    });
    expect((takeover.body as RoomEnvelope).membership.membershipVersion).toBe(2);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"reason":"replaced"');

    const revoked = await coordinator.invitation(host, room.snapshot.roomId, {
      requestId: requestId(54), epoch: EPOCH, expiresAtMs: now + 50_000, membershipVersion: 1, action: "revoke",
    });
    expect((revoked.body as RoomEnvelope).invitation).toBeNull();
    expect(await coordinator.join({ ...guest, userId: "other" }, { requestId: requestId(55), epoch: EPOCH, expiresAtMs: now + 50_000, invite: replacement })).toMatchObject({ status: 404 });
  });

  it("keeps a returning host during grace and times out an unready preparation blocker", async () => {
    const room = await created();
    const joined = await join(room);
    await presence(room, host, 1);
    await presence(joined, guest, 1);
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "play", {}));

    now += 15_001;
    await presence(joined, guest, 2);
    coordinator.sweep();
    expect(snapshot(coordinator.get(guest, room.snapshot.roomId))).toMatchObject({ phase: "paused", reason: "host_disconnected" });
    now += 1;
    const returned = await presence(room, host, 2);
    expect(snapshot(returned)).toMatchObject({ hostParticipantId: room.membership.participantId, reason: "host_reconnected" });

    const blockerRoom = await created(70);
    const blockerGuest = await join(blockerRoom, guest, 71);
    await presence(blockerRoom, host, 1);
    await presence(blockerGuest, guest, 1);
    await coordinator.command(host, blockerRoom.snapshot.roomId, command(blockerRoom, 1, 1, "play", {}));
    await coordinator.command(host, blockerRoom.snapshot.roomId, command(blockerRoom, 2, 2, "seek", { positionMs: 10_000 }));
    await presence(blockerRoom, host, 2, { preparationGeneration: 2 });
    now += 30_001;
    await presence(blockerRoom, host, 3, { preparationGeneration: 2 });
    await presence(blockerGuest, guest, 2, { preparationGeneration: 1, ready: false });
    coordinator.sweep();
    const afterTimeout = snapshot(coordinator.get(host, blockerRoom.snapshot.roomId));
    expect(afterTimeout.participants[1]).toMatchObject({ blocking: false, ready: false });
    expect(afterTimeout).toMatchObject({ phase: "playing", reason: "prepared" });
  });

  it("keeps a cancelled countdown cancelled and auto-schedules at media end", async () => {
    const room = await created();
    const scheduled = await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "select-next", { delayMs: 10_000 }));
    expect(snapshot(scheduled)).toMatchObject({ reason: "next_scheduled", nextCountdown: { deadlineMs: 11_000 } });
    const cancelled = await coordinator.command(host, room.snapshot.roomId, command(room, 2, 2, "cancel-next", {}));
    expect(snapshot(cancelled)).toMatchObject({ reason: "next_cancelled", nextCountdown: null });
    now = 20_000;
    coordinator.sweep();
    expect(snapshot(coordinator.get(host, room.snapshot.roomId)).media.ratingKey).toBe("42");

    const ending = await created(60);
    await presence(ending, host, 1);
    const play = await coordinator.command(host, ending.snapshot.roomId, command(ending, 1, 1, "play", {}));
    now = snapshot(play).anchor.effectiveAtMs + 120_000;
    await presence(ending, host, 2, { positionMs: 120_000 });
    coordinator.sweep();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshot(coordinator.get(host, ending.snapshot.roomId))).toMatchObject({ reason: "next_scheduled", nextCountdown: { deadlineMs: now + 10_000 } });
  });

  it("closes a persistently backed-up SSE consumer without evicting its room", async () => {
    const room = await created();
    coordinator.subscribe(host, room.snapshot.roomId, new Request("http://watchtower.test/events"));
    expect(coordinator.diagnostics().subscribers).toBe(1);
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "set-policy", { autoAdvance: false }));
    now += 10_001;
    coordinator.sweep();
    expect(coordinator.diagnostics()).toMatchObject({ rooms: 1, participants: 1, subscribers: 0 });
  });

  it("rate-limits generic invitation guessing without exposing room data", async () => {
    for (let index = 0; index < 20; index += 1) {
      const result = await coordinator.join(guest, {
        requestId: requestId(100 + index), epoch: EPOCH, expiresAtMs: now + 50_000, invite: "Z".repeat(43),
      });
      expect(result).toEqual({ status: 404, body: { error: { code: "not_found", message: "Invitation not found." } } });
    }
    expect(await coordinator.join(guest, {
      requestId: requestId(121), epoch: EPOCH, expiresAtMs: now + 50_000, invite: "Z".repeat(43),
    })).toEqual({ status: 429, body: { error: { code: "rate_limited", message: "Too many invitation attempts. Try again later." } } });
  });

  it("rejects room capacity without evicting active rooms", async () => {
    for (let index = 0; index < 100; index += 1) {
      const result = await coordinator.create({ ...host, userId: `user-${index}`, deviceSessionId: `device-${index}` }, {
        requestId: requestId(200 + index),
        epoch: EPOCH,
        expiresAtMs: now + 50_000,
        media: { ratingKey: "42", mediaId: "101", partId: "102" },
        startPositionMs: 0,
        autoAdvance: false,
      });
      expect(result.status).toBe(201);
    }
    const rejected = await coordinator.create({ ...host, userId: "overflow", deviceSessionId: "overflow-device" }, {
      requestId: requestId(301),
      epoch: EPOCH,
      expiresAtMs: now + 50_000,
      media: { ratingKey: "42", mediaId: "101", partId: "102" },
      startPositionMs: 0,
      autoAdvance: false,
    });
    expect(rejected).toMatchObject({ status: 429, body: { error: { code: "capacity_exceeded" } } });
    expect(coordinator.diagnostics()).toMatchObject({ rooms: 100, participants: 100 });
  });

  it("transfers host authority, changes policy, ends, and leaves idempotently", async () => {
    const room = await created();
    const joined = await join(room);
    const transfer = await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "transfer-host", { participantId: joined.membership.participantId }));
    expect(snapshot(transfer)).toMatchObject({ revision: 2, hostParticipantId: joined.membership.participantId, reason: "host_transferred" });
    expect(await coordinator.command(host, room.snapshot.roomId, command(room, 2, 2, "pause", {}))).toMatchObject({ status: 403, body: { error: { code: "not_host" } } });

    const staleEpoch = await coordinator.command(guest, room.snapshot.roomId, { ...command(joined, 1, 2, "set-policy", { autoAdvance: false }), epoch: requestId(999) });
    expect(staleEpoch).toMatchObject({ status: 409, body: { error: { code: "stale_epoch" } } });
    const policy = await coordinator.command(guest, room.snapshot.roomId, command(joined, 1, 2, "set-policy", { autoAdvance: false }));
    expect(snapshot(policy)).toMatchObject({ revision: 3, reason: "policy_changed", policy: { autoAdvance: false } });
    const ended = await coordinator.command(guest, room.snapshot.roomId, command(joined, 2, 3, "end", {}));
    expect(snapshot(ended)).toMatchObject({ revision: 4, phase: "ended", reason: "host_ended" });
    expect(coordinator.get(guest, room.snapshot.roomId)).toMatchObject({ status: 410, body: { error: { code: "room_ended" }, snapshot: { phase: "ended" } } });

    const other = await created(350);
    expect(await coordinator.leave(host, other.snapshot.roomId, { epoch: EPOCH, membershipVersion: 1 })).toEqual({ status: 200, body: { left: true } });
    expect(await coordinator.leave(host, other.snapshot.roomId, { epoch: EPOCH, membershipVersion: 1 })).toEqual({ status: 200, body: { left: true } });
  });

  it("keeps two devices on one account as distinct participants", async () => {
    const room = await created();
    const secondDevice = { ...host, displayName: "Host TV", deviceSessionId: "host-tv-device" };
    const joined = await join(room, secondDevice);
    expect(joined.membership.participantId).not.toBe(room.membership.participantId);
    expect(snapshot(coordinator.get(host, room.snapshot.roomId)).participants).toHaveLength(2);
    await coordinator.leave(secondDevice, room.snapshot.roomId, { epoch: EPOCH, membershipVersion: joined.membership.membershipVersion });
    expect(coordinator.get(host, room.snapshot.roomId)).toMatchObject({ status: 200, body: { snapshot: { participants: [{ participantId: room.membership.participantId }] } } });
  });

  it("device logout closes its stream and repeated join/leave returns live counts to baseline", async () => {
    const room = await created();
    const stream = coordinator.subscribe(host, room.snapshot.roomId, new Request("http://watchtower.test/events"));
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    await reader.read();
    coordinator.leaveDeviceMemberships(host.userId, host.deviceSessionId);
    await Promise.resolve();
    await Promise.resolve();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"reason":"left"');
    expect(coordinator.diagnostics()).toMatchObject({ participants: 0, connected: 0, subscribers: 0 });

    const stable = await created(360);
    for (let index = 0; index < 5; index += 1) {
      const member = await join(stable, guest, 361 + index);
      await coordinator.leave(guest, stable.snapshot.roomId, { epoch: EPOCH, membershipVersion: member.membership.membershipVersion });
    }
    expect(coordinator.diagnostics()).toMatchObject({ rooms: 2, participants: 1, connected: 1, subscribers: 0 });
  });

  it("closes a stream when identity revalidation fails", async () => {
    const room = await created();
    const stream = coordinator.subscribe(host, room.snapshot.roomId, new Request("http://watchtower.test/events", { headers: { Cookie: "session=redacted" } }));
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    await reader.read();
    now += ROOM_POLICY.authRevalidateMs;
    await presence(room, host, 1);
    mocks.resolveRoomPrincipal.mockResolvedValueOnce({ ok: false, code: "unauthenticated", message: "expired" });
    coordinator.sweep();
    await Promise.resolve();
    await Promise.resolve();
    let remaining = "";
    for (;;) {
      const frame = await reader.read();
      if (frame.done) break;
      remaining += new TextDecoder().decode(frame.value);
    }
    expect(remaining).toContain('"reason":"identity_changed"');
    expect(remaining.slice(remaining.indexOf("event: ended"))).not.toContain('"media"');
    expect(coordinator.diagnostics().subscribers).toBe(0);
  });

  it("coalesces backed-up snapshots to the latest revision", async () => {
    const room = await created();
    const stream = coordinator.subscribe(host, room.snapshot.roomId, new Request("http://watchtower.test/events"));
    const reader = (stream.body as ReadableStream<Uint8Array>).getReader();
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "set-policy", { autoAdvance: false }));
    await coordinator.command(host, room.snapshot.roomId, command(room, 2, 2, "set-policy", { autoAdvance: true }));
    await reader.read();
    await reader.read();
    coordinator.sweep();
    const latest = new TextDecoder().decode((await reader.read()).value);
    expect(latest).toContain(`id: ${EPOCH}:3:1`);
    expect(latest).not.toContain(`id: ${EPOCH}:2:1`);
    await reader.cancel();
  });

  it("treats joins and non-host leaves as presence so a pending host command stays valid (WTT-03)", async () => {
    const room = await created();
    await presence(room, host, 1);
    const joined = await join(room);
    const afterJoin = snapshot(coordinator.get(host, room.snapshot.roomId));
    expect(afterJoin).toMatchObject({ revision: 1, presenceRevision: 3 });
    await coordinator.leave(guest, room.snapshot.roomId, { epoch: EPOCH, membershipVersion: joined.membership.membershipVersion });
    expect(snapshot(coordinator.get(host, room.snapshot.roomId))).toMatchObject({ revision: 1, presenceRevision: 4 });
    // The host built this command against revision 1 before the roster changed.
    const play = await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "play", {}));
    expect(play).toMatchObject({ status: 200, body: { snapshot: { revision: 2, phase: "playing" } } });
  });

  it("times out every unready blocker of a buffering pause, not only the first reporter (WTT-12)", async () => {
    const third: PlaybackPrincipal = { ...guest, userId: "third-user", deviceSessionId: "guest-device", serverToken: "guest-secret-token" };
    const room = await created();
    const second = await join(room);
    const late = await join(room, third, 3);
    await presence(room, host, 1);
    await presence(second, guest, 1);
    await presence(late, third, 2);
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "play", {}));
    now += 2_000;
    await presence(second, guest, 3, { playbackSessionId: sessionId(3), ready: false, buffering: true });
    now += 5_000;
    await presence(late, third, 4, { playbackSessionId: sessionId(4), ready: false, buffering: true });
    expect(snapshot(coordinator.get(host, room.snapshot.roomId))).toMatchObject({ phase: "paused", reason: "buffering" });
    // Both stay connected (fresh presence) but never recover.
    for (const [step, sequence] of [[14_000, 5], [16_001, 6]] as const) {
      now += step;
      await presence(room, host, sequence);
      await presence(second, guest, sequence, { playbackSessionId: sessionId(3), ready: false, buffering: true });
      await presence(late, third, sequence, { playbackSessionId: sessionId(4), ready: false, buffering: true });
    }
    coordinator.sweep();
    const blocked = snapshot(coordinator.get(host, room.snapshot.roomId)).participants;
    expect(blocked.map(({ connected, blocking }) => [connected, blocking])).toEqual([[true, true], [true, false], [true, false]]);
    expect(snapshot(coordinator.get(host, room.snapshot.roomId)).reason).toBe("blocker_timeout");
  });

  it("does not auto-schedule the next item after the host cancelled it for this media (WTT-13)", async () => {
    const room = await created();
    await presence(room, host, 1);
    await coordinator.command(host, room.snapshot.roomId, command(room, 1, 1, "select-next", { delayMs: 10_000 }));
    await coordinator.command(host, room.snapshot.roomId, command(room, 2, 2, "cancel-next", {}));
    const play = await coordinator.command(host, room.snapshot.roomId, command(room, 3, 3, "play", {}));
    now = snapshot(play).anchor.effectiveAtMs + 120_000;
    await presence(room, host, 2, { positionMs: 120_000 });
    coordinator.sweep();
    for (let tick = 0; tick < 4; tick += 1) await Promise.resolve();
    expect(snapshot(coordinator.get(host, room.snapshot.roomId))).toMatchObject({ reason: "media_ended", nextCountdown: null, media: { ratingKey: "42" } });
    expect(mocks.resolveNextMedia).toHaveBeenCalledTimes(1);
  });

  it("keeps former-membership records bounded under join/leave cycling (WTT-16)", async () => {
    const room = await created();
    for (let cycle = 0; cycle < 25; cycle += 1) {
      const joined = await join(room, guest, 500 + cycle);
      await coordinator.leave(guest, room.snapshot.roomId, { epoch: EPOCH, membershipVersion: joined.membership.membershipVersion });
    }
    const record = (coordinator as unknown as { rooms: Map<string, { formerMemberships: unknown[] }> }).rooms.get(room.snapshot.roomId)!;
    expect(record.formerMemberships).toHaveLength(1);
    expect(coordinator.diagnostics()).toMatchObject({ participants: 1 });
  });
});