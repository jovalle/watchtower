import { describe, expect, it } from "vitest";
import type { RoomSnapshot } from "~/lib/rooms/protocol";
import {
  INITIAL_RECONCILIATION_MEMORY,
  reconcileRoomPlayback,
  selectClockEstimate,
} from "~/lib/rooms/sync";

const snapshot = (overrides: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  protocolVersion: 1,
  roomId: "11111111-1111-4111-8111-111111111111",
  epoch: "22222222-2222-4222-8222-222222222222",
  revision: 1,
  presenceRevision: 1,
  mediaGeneration: 1,
  preparationGeneration: 1,
  serverNowMs: 1000,
  hostParticipantId: "33333333-3333-4333-8333-333333333333",
  phase: "playing",
  reason: "host_played",
  resumeAfterPrepare: false,
  nextCountdown: null,
  policy: { autoAdvance: true },
  media: {
    serverMachineId: "server",
    ratingKey: "42",
    mediaId: "7",
    partId: "9",
  },
  durationMs: 120_000,
  anchor: { positionMs: 10_000, effectiveAtMs: 1000, rate: 1 },
  participants: [],
  ...overrides,
});

const observed = (
  positionMs: number,
  overrides: Partial<Parameters<typeof reconcileRoomPlayback>[1]> = {}
) => ({
  positionMs,
  paused: false,
  buffering: false,
  seeking: false,
  playbackRate: 1,
  ...overrides,
});

describe("room clock selection", () => {
  it("selects the valid lowest-RTT sample and retains uncertainty", () => {
    const estimate = selectClockEstimate([
      {
        sample: {
          protocolVersion: 1,
          epoch: "22222222-2222-4222-8222-222222222222",
          receivedAtMs: 130,
          sentAtMs: 135,
        },
        clientSentAtMs: 100,
        clientReceivedAtMs: 165,
      },
      {
        sample: {
          protocolVersion: 1,
          epoch: "22222222-2222-4222-8222-222222222222",
          receivedAtMs: 225,
          sentAtMs: 230,
        },
        clientSentAtMs: 200,
        clientReceivedAtMs: 245,
      },
      {
        sample: {
          protocolVersion: 1,
          epoch: "22222222-2222-4222-8222-222222222222",
          receivedAtMs: 1,
          sentAtMs: 2,
        },
        clientSentAtMs: 100,
        clientReceivedAtMs: 90,
      },
    ]);

    expect(estimate).toEqual({
      epoch: "22222222-2222-4222-8222-222222222222",
      offsetMs: 5,
      rttMs: 40,
      uncertaintyMs: 20,
      sampledAtClientMs: 245,
    });
  });
});

describe("room playback reconciliation", () => {
  it("does nothing inside the deadband", () => {
    expect(
      reconcileRoomPlayback(snapshot(), observed(10_900), { offsetMs: 0 }, 2000)
        .action
    ).toEqual({ kind: "none" });
  });

  it("uses a bounded rate correction inside the hard-seek band", () => {
    const decision = reconcileRoomPlayback(
      snapshot(),
      observed(10_500),
      { offsetMs: 0 },
      2000
    );
    expect(decision.action.kind).toBe("rate");
    expect(decision.action).toEqual({ kind: "rate", rate: 1.01 });
  });

  it("hard-seeks large drift and respects the cooldown", () => {
    const first = reconcileRoomPlayback(
      snapshot(),
      observed(8000),
      { offsetMs: 0 },
      2000
    );
    expect(first.action).toEqual({ kind: "seek", positionMs: 11_000 });

    const duringCooldown = reconcileRoomPlayback(
      snapshot(),
      observed(8000),
      { offsetMs: 0 },
      3000,
      first.memory
    );
    expect(duringCooldown.action.kind).toBe("rate");

    expect(
      reconcileRoomPlayback(
        snapshot({ reason: "host_seeked" }),
        observed(8000),
        { offsetMs: 0 },
        3000,
        first.memory
      ).action
    ).toEqual({ kind: "seek", positionMs: 12_000 });
  });

  it("holds and seeks to the fixed target while paused", () => {
    const paused = snapshot({
      phase: "paused",
      anchor: { positionMs: 30_000, effectiveAtMs: 1000, rate: 1 },
    });
    expect(
      reconcileRoomPlayback(paused, observed(30_000), { offsetMs: 0 }, 4000)
        .action
    ).toEqual({ kind: "hold-paused" });
    expect(
      reconcileRoomPlayback(
        paused,
        observed(28_000, { paused: true }),
        { offsetMs: 0 },
        4000
      ).action
    ).toEqual({ kind: "seek", positionMs: 30_000 });
  });

  it("maps a future server anchor to local time without starting early", () => {
    const future = snapshot({
      anchor: { positionMs: 10_000, effectiveAtMs: 5000, rate: 1 },
    });
    const decision = reconcileRoomPlayback(
      future,
      observed(10_000, { paused: true }),
      { offsetMs: 500 },
      4000,
      INITIAL_RECONCILIATION_MEMORY
    );
    expect(decision.action).toEqual({
      kind: "schedule-play",
      localTimeMs: 4500,
    });
  });

  it("restores playback rate on pause, buffering and replacement", () => {
    const cases = [
      [snapshot({ phase: "paused" }), observed(10_000, { paused: true, playbackRate: 1.02 })],
      [snapshot(), observed(11_000, { buffering: true, playbackRate: 1.02 })],
      [snapshot(), observed(11_000, { replacingSource: true, playbackRate: 1.02 })],
    ] as const;
    for (const [room, media] of cases) {
      expect(
        reconcileRoomPlayback(room, media, { offsetMs: 0 }, 2000).action
      ).toEqual({ kind: "rate", rate: 1 });
    }
  });
});