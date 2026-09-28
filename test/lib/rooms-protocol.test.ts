import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/rooms/v1/fixtures.json";
import {
  estimateClock,
  parseCommand,
  parseCreateRoom,
  parseInvitation,
  parseJoinRoom,
  parseLeave,
  parsePresence,
  parseSnapshot,
  targetPositionMs,
  type RoomSnapshot,
} from "~/lib/rooms/protocol";

describe("room protocol v1 golden fixtures", () => {
  it.each([
    ["createRequest", parseCreateRoom],
    ["joinRequest", parseJoinRoom],
    ["takeoverRequest", parseJoinRoom],
    ["invitationRequest", parseInvitation],
    ["leaveRequest", parseLeave],
    ["seekCommand", parseCommand],
    ["selectNextCommand", parseCommand],
    ["presenceReady", parsePresence],
    ["presenceReplacingSource", parsePresence],
    ["playingSnapshot", parseSnapshot],
  ] as const)("%s round-trips through its parser unchanged", (name, parse) => {
    const result = parse(fixtures[name]);
    expect(result).toEqual({ ok: true, value: fixtures[name] });
  });

  it("parses the create response snapshot", () => {
    expect(parseSnapshot(fixtures.createResponse.snapshot).ok).toBe(true);
  });

  it.each([
    ["numeric ratingKey", { ...fixtures.playingSnapshot, media: { ...fixtures.playingSnapshot.media, ratingKey: 4242 } }],
    ["missing media", { ...fixtures.playingSnapshot, media: null }],
    ["forged host id", { ...fixtures.playingSnapshot, hostParticipantId: "host" }],
    ["participant without flags", { ...fixtures.playingSnapshot, participants: [{ participantId: fixtures.playingSnapshot.participants[0].participantId, displayName: "X" }] }],
  ])("rejects a snapshot with %s", (_, snapshot) => {
    expect(parseSnapshot(snapshot).ok).toBe(false);
  });

  it.each([
    ["NaN position", { ...fixtures.seekCommand, payload: { positionMs: Number.NaN } }],
    ["fractional sequence", { ...fixtures.seekCommand, commandSequence: 1.5 }],
    ["negative revision", { ...fixtures.seekCommand, expectedRevision: -1 }],
    ["extra payload field", { ...fixtures.seekCommand, payload: { positionMs: 1, actor: "host" } }],
    ["unknown command", { ...fixtures.seekCommand, type: "select-media" }],
    ["forged play payload", { ...fixtures.seekCommand, type: "play", payload: { participantId: "x" } }],
    ["huge next delay", { ...fixtures.selectNextCommand, payload: { delayMs: 3_600_000 } }],
  ])("rejects a command with %s", (_, body) => {
    expect(parseCommand(body).ok).toBe(false);
  });

  it.each([
    ["an unknown error enum", { ...fixtures.presenceReady, error: "<script>" }],
    ["a caller-chosen session id", { ...fixtures.presenceReady, playbackSessionId: "not-a-session" }],
    ["a string ready flag", { ...fixtures.presenceReady, ready: "true" }],
  ])("rejects presence with %s", (_, body) => {
    expect(parsePresence(body).ok).toBe(false);
  });

  it("rejects join with both invite and room id, and future protocol snapshots", () => {
    expect(parseJoinRoom({ ...fixtures.joinRequest, roomId: fixtures.takeoverRequest.roomId }).ok).toBe(false);
    expect(parseSnapshot({ ...fixtures.playingSnapshot, protocolVersion: 2 }).ok).toBe(false);
  });
});

describe("shared time helpers", () => {
  const playing = fixtures.playingSnapshot as RoomSnapshot;

  it("advances only while playing and never before the scheduled anchor", () => {
    // anchor 60 000 ms effective at server 129 000 ms
    expect(targetPositionMs(playing, 130_000)).toBe(61_000);
    expect(targetPositionMs(playing, 128_000)).toBe(60_000);
    expect(targetPositionMs({ ...playing, phase: "paused" }, 200_000)).toBe(60_000);
    expect(targetPositionMs(playing, 129_000 + 10_000_000)).toBe(playing.durationMs);
  });

  it("estimates offset and RTT from four timestamps", () => {
    // client sends at 1 000, server receives at 120 000, replies at 120 002, client receives at 1 042
    expect(estimateClock(fixtures.clock, 1000, 1042)).toEqual({ offsetMs: 118_980, rttMs: 40, uncertaintyMs: 20 });
    expect(estimateClock(fixtures.clock, 1042, 1000)).toBeNull();
  });
});
