/**
 * Watch Together room protocol v1: the wire contract shared by the web client,
 * the room coordinator and the Android TV client. Golden fixtures live in
 * test/fixtures/rooms/v1. Times are integer milliseconds; positions are absolute
 * content time of the whole media item. Server times are the coordinator's
 * monotonic clock and are only comparable within one `epoch`.
 */

export const PROTOCOL_VERSION = 1 as const;

/** Tunable starting policy values from the shared contract, not measured guarantees. */
export const ROOM_POLICY = {
  deadbandMs: 250,
  hardSeekMs: 1500,
  minRate: 0.97,
  maxRate: 1.03,
  hardSeekCooldownMs: 5000,
  startLeadMs: 1000,
  observationIntervalMs: 2000,
  presenceHeartbeatMs: 5000,
  presenceStaleMs: 15000,
  sseHeartbeatMs: 5000,
  clientStaleMs: 15000,
  bufferingReportDelayMs: 1500,
  hostGraceMs: 30000,
  blockerTimeoutMs: 30000,
  nextCountdownMs: 10000,
  maxParticipants: 8,
  maxRooms: 100,
  roomLifetimeMs: 24 * 60 * 60 * 1000,
  emptyRoomMs: 30 * 60 * 1000,
  endedRetentionMs: 5 * 60 * 1000,
  maxBodyBytes: 16 * 1024,
  commandResultsPerRoom: 256,
  mutationWindowMs: 60000,
  authRevalidateMs: 60000,
  mediaRevalidateMs: 5 * 60 * 1000,
  maxDisplayNameLength: 64,
} as const;

export type RoomPhase = "lobby" | "preparing" | "paused" | "playing" | "ended";

export const ROOM_REASONS = [
  "created",
  "host_played",
  "host_paused",
  "host_seeked",
  "prepared",
  "buffering",
  "blocker_timeout",
  "host_disconnected",
  "host_reconnected",
  "host_transferred",
  "host_left",
  "host_lost",
  "participant_joined",
  "participant_left",
  "participant_removed",
  "next_scheduled",
  "next_cancelled",
  "next_selected",
  "next_unavailable",
  "media_ended",
  "policy_changed",
  "host_ended",
  "expired",
  "server_changed",
  "feature_disabled",
] as const;
export type RoomReason = (typeof ROOM_REASONS)[number];

/** Reasons carried by a terminal `ended` event. Minimal ones carry no snapshot. */
export const TERMINAL_REASONS = [
  "host_ended",
  "host_lost",
  "expired",
  "server_changed",
  "feature_disabled",
  "left",
  "removed",
  "access_denied",
  "replaced",
  "identity_changed",
] as const;
export type TerminalReason = (typeof TERMINAL_REASONS)[number];
export const MINIMAL_TERMINAL_REASONS: readonly TerminalReason[] = ["removed", "access_denied", "replaced", "identity_changed"];

export const PRESENCE_ERRORS = [
  "autoplay_blocked",
  "media_error",
  "network_error",
  "unsupported_media",
  "access_denied",
  "stream_unavailable",
] as const;
export type PresenceError = (typeof PRESENCE_ERRORS)[number];

export type MediaIdentity = {
  serverMachineId: string;
  ratingKey: string;
  mediaId: string;
  partId: string;
};

export type RoomAnchor = { positionMs: number; effectiveAtMs: number; rate: 1 };

export type RoomParticipant = {
  participantId: string;
  displayName: string;
  connected: boolean;
  ready: boolean;
  buffering: boolean;
  blocking: boolean;
  /** v1 addition to the shared contract sketch: last reported bounded local error. */
  error: PresenceError | null;
};

export type RoomSnapshot = {
  protocolVersion: 1;
  roomId: string;
  epoch: string;
  revision: number;
  presenceRevision: number;
  mediaGeneration: number;
  preparationGeneration: number;
  serverNowMs: number;
  hostParticipantId: string | null;
  phase: RoomPhase;
  reason: RoomReason | null;
  resumeAfterPrepare: boolean;
  nextCountdown: { deadlineMs: number } | null;
  /** v1 addition: room auto-advance policy, initialised from the host's preference. */
  policy: { autoAdvance: boolean };
  media: MediaIdentity;
  durationMs: number;
  anchor: RoomAnchor;
  /** Ordered by server join ordinal, participant ID tie-break. */
  participants: RoomParticipant[];
};

export type RoomMembership = {
  participantId: string;
  membershipVersion: number;
  nextCommandSequence: number;
  nextPresenceSequence: number;
};

/** High-entropy invite secret; only ever returned to the current host. */
export type RoomInvitation = { secret: string; expiresAtMs: number };

/** Response of create, join, GET room and takeover. */
export type RoomEnvelope = {
  snapshot: RoomSnapshot;
  membership: RoomMembership;
  invitation: RoomInvitation | null;
};

export type ClockSample = {
  protocolVersion: 1;
  epoch: string;
  receivedAtMs: number;
  sentAtMs: number;
};

/** Retry envelope for create/join/invitation mutations. */
export type MutationEnvelope = { requestId: string; epoch: string; expiresAtMs: number };

export type CreateRoomRequest = MutationEnvelope & {
  media: { ratingKey: string; mediaId: string; partId: string };
  startPositionMs: number;
  autoAdvance: boolean;
};

export type JoinRoomRequest = MutationEnvelope &
  ({ invite: string } | { roomId: string; takeover: true });

export type InvitationRequest = MutationEnvelope & {
  membershipVersion: number;
  action: "rotate" | "revoke";
};

export type LeaveRequest = { epoch: string; membershipVersion: number };

export type RoomCommand =
  | { type: "play"; payload: Record<string, never> }
  | { type: "pause"; payload: Record<string, never> }
  | { type: "seek"; payload: { positionMs: number } }
  | { type: "select-next"; payload: { delayMs: number } }
  | { type: "cancel-next"; payload: Record<string, never> }
  | { type: "transfer-host"; payload: { participantId: string } }
  | { type: "remove-participant"; payload: { participantId: string } }
  | { type: "set-policy"; payload: { autoAdvance: boolean } }
  | { type: "end"; payload: Record<string, never> };
export type RoomCommandType = RoomCommand["type"];

export type CommandEnvelope = {
  commandId: string;
  commandSequence: number;
  membershipVersion: number;
  epoch: string;
  mediaGeneration: number;
  expectedRevision: number;
} & RoomCommand;

export type CommandResult = { accepted: true; snapshot: RoomSnapshot };

export type PresenceReport = {
  epoch: string;
  membershipVersion: number;
  mediaGeneration: number;
  preparationGeneration: number;
  presenceSequence: number;
  /** Owned Plex playback session of this device's current player; validated server-side. */
  playbackSessionId: string | null;
  positionMs: number | null;
  ready: boolean;
  buffering: boolean;
  /** Deliberate local quality/track replacement: become nonblocking and unready first. */
  replacingSource: boolean;
  error: PresenceError | null;
};

export type PresenceResult = {
  ack: { presenceSequence: number; epoch: string; serverNowMs: number; ignored: boolean };
  snapshot: RoomSnapshot;
};

export type HeartbeatEvent = {
  protocolVersion: 1;
  roomId: string;
  epoch: string;
  serverNowMs: number;
  revision: number;
  presenceRevision: number;
};

export type EndedEvent = {
  protocolVersion: 1;
  roomId: string;
  epoch: string;
  reason: TerminalReason;
  /** Present only for non-minimal reasons (final authorized snapshot). */
  snapshot?: RoomSnapshot;
};

export const SSE_EVENTS = ["snapshot", "heartbeat", "ended"] as const;

export const ERROR_STATUS = {
  invalid_request: 400,
  unsupported_protocol: 400,
  unauthenticated: 401,
  bearer_unsupported: 401,
  identity_ambiguous: 401,
  server_changed: 401,
  csrf_rejected: 403,
  forbidden: 403,
  not_host: 403,
  media_forbidden: 403,
  removed: 403,
  not_found: 404,
  method_not_allowed: 405,
  stale_epoch: 409,
  stale_revision: 409,
  stale_membership: 409,
  stale_generation: 409,
  wrong_phase: 409,
  participants_not_ready: 409,
  command_conflict: 409,
  command_result_expired: 409,
  request_conflict: 409,
  takeover_required: 409,
  room_ended: 410,
  membership_ended: 410,
  request_expired: 410,
  payload_too_large: 413,
  unsupported_media_type: 415,
  media_unsupported: 422,
  media_mismatch: 422,
  rate_limited: 429,
  capacity_exceeded: 429,
  feature_disabled: 503,
  upstream_unavailable: 503,
} as const;
export type RoomErrorCode = keyof typeof ERROR_STATUS;

export type RoomErrorBody = {
  error: { code: RoomErrorCode; message: string };
  /** Current authorized snapshot for stale/conflict errors. */
  snapshot?: RoomSnapshot;
};

// ---------------------------------------------------------------------------
// Time helpers shared by coordinator and clients.

/** Authoritative content position at `serverNowMs`; never earlier than the anchor. */
export function targetPositionMs(
  snapshot: Pick<RoomSnapshot, "phase" | "anchor" | "durationMs">,
  serverNowMs: number
): number {
  const { positionMs, effectiveAtMs } = snapshot.anchor;
  const elapsed = snapshot.phase === "playing" ? Math.max(0, serverNowMs - effectiveAtMs) : 0;
  return Math.min(Math.max(positionMs + elapsed, 0), snapshot.durationMs);
}

/** Four-timestamp estimate; returns null for implausible samples. */
export function estimateClock(sample: Pick<ClockSample, "receivedAtMs" | "sentAtMs">, c0: number, c3: number) {
  const { receivedAtMs: s1, sentAtMs: s2 } = sample;
  const rttMs = c3 - c0 - (s2 - s1);
  if (![s1, s2, c0, c3].every(Number.isFinite) || c3 < c0 || s2 < s1 || rttMs < 0) return null;
  return { offsetMs: (s1 - c0 + (s2 - c3)) / 2, rttMs, uncertaintyMs: rttMs / 2 };
}

// ---------------------------------------------------------------------------
// Runtime validation. Every parser rejects unknown extra shapes it cannot use.

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RATING_KEY = /^[0-9]{1,12}$/;
const INVITE = /^[A-Za-z0-9_-]{43}$/;

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
export const isInviteSecret = (value: unknown): value is string => typeof value === "string" && INVITE.test(value);
export const isRatingKey = (value: unknown): value is string => typeof value === "string" && RATING_KEY.test(value);
const isCount = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const isEmptyPayload = (value: unknown) => isRecord(value) && Object.keys(value).length === 0;

const fail = <T>(message: string): Parsed<T> => ({ ok: false, message });

function parseMutation(body: Record<string, unknown>): Parsed<MutationEnvelope> {
  if (!isUuid(body.requestId)) return fail("requestId must be a UUID");
  if (!isUuid(body.epoch)) return fail("epoch must be a UUID");
  if (!isCount(body.expiresAtMs)) return fail("expiresAtMs must be a non-negative integer");
  return { ok: true, value: { requestId: body.requestId, epoch: body.epoch, expiresAtMs: body.expiresAtMs } };
}

export function parseCreateRoom(body: unknown): Parsed<CreateRoomRequest> {
  if (!isRecord(body)) return fail("Body must be an object");
  const envelope = parseMutation(body);
  if (!envelope.ok) return envelope;
  const media = body.media;
  if (!isRecord(media) || !isRatingKey(media.ratingKey) || !isRatingKey(media.mediaId) || !isRatingKey(media.partId))
    return fail("media must identify ratingKey, mediaId and partId");
  if (!isCount(body.startPositionMs)) return fail("startPositionMs must be a non-negative integer");
  if (typeof body.autoAdvance !== "boolean") return fail("autoAdvance must be boolean");
  return {
    ok: true,
    value: {
      ...envelope.value,
      media: { ratingKey: media.ratingKey, mediaId: media.mediaId, partId: media.partId },
      startPositionMs: body.startPositionMs,
      autoAdvance: body.autoAdvance,
    },
  };
}

export function parseJoinRoom(body: unknown): Parsed<JoinRoomRequest> {
  if (!isRecord(body)) return fail("Body must be an object");
  const envelope = parseMutation(body);
  if (!envelope.ok) return envelope;
  if ("invite" in body) {
    if (!isInviteSecret(body.invite) || "roomId" in body) return fail("invite is invalid");
    return { ok: true, value: { ...envelope.value, invite: body.invite } };
  }
  if (!isUuid(body.roomId) || body.takeover !== true) return fail("Provide an invite, or roomId with takeover");
  return { ok: true, value: { ...envelope.value, roomId: body.roomId, takeover: true } };
}

export function parseInvitation(body: unknown): Parsed<InvitationRequest> {
  if (!isRecord(body)) return fail("Body must be an object");
  const envelope = parseMutation(body);
  if (!envelope.ok) return envelope;
  if (!isCount(body.membershipVersion)) return fail("membershipVersion must be an integer");
  if (body.action !== "rotate" && body.action !== "revoke") return fail("action must be rotate or revoke");
  return { ok: true, value: { ...envelope.value, membershipVersion: body.membershipVersion, action: body.action } };
}

export function parseLeave(body: unknown): Parsed<LeaveRequest> {
  if (!isRecord(body) || !isUuid(body.epoch) || !isCount(body.membershipVersion))
    return fail("epoch and membershipVersion are required");
  return { ok: true, value: { epoch: body.epoch, membershipVersion: body.membershipVersion } };
}

function parseCommandBody(type: unknown, payload: unknown): Parsed<RoomCommand> {
  switch (type) {
    case "play":
    case "pause":
    case "cancel-next":
    case "end":
      return isEmptyPayload(payload) ? { ok: true, value: { type, payload: {} } } : fail(`${type} takes no payload`);
    case "seek":
      return isRecord(payload) && isCount(payload.positionMs) && Object.keys(payload).length === 1
        ? { ok: true, value: { type, payload: { positionMs: payload.positionMs } } }
        : fail("seek requires an integer positionMs");
    case "select-next":
      return isRecord(payload) && isCount(payload.delayMs, 60000) && Object.keys(payload).length === 1
        ? { ok: true, value: { type, payload: { delayMs: payload.delayMs } } }
        : fail("select-next requires delayMs between 0 and 60000");
    case "transfer-host":
    case "remove-participant":
      return isRecord(payload) && isUuid(payload.participantId) && Object.keys(payload).length === 1
        ? { ok: true, value: { type, payload: { participantId: payload.participantId } } }
        : fail(`${type} requires a participantId`);
    case "set-policy":
      return isRecord(payload) && typeof payload.autoAdvance === "boolean" && Object.keys(payload).length === 1
        ? { ok: true, value: { type, payload: { autoAdvance: payload.autoAdvance } } }
        : fail("set-policy requires autoAdvance");
    default:
      return fail("Unknown command type");
  }
}

export function parseCommand(body: unknown): Parsed<CommandEnvelope> {
  if (!isRecord(body)) return fail("Body must be an object");
  if (!isUuid(body.commandId)) return fail("commandId must be a UUID");
  if (!isUuid(body.epoch)) return fail("epoch must be a UUID");
  for (const field of ["commandSequence", "membershipVersion", "mediaGeneration", "expectedRevision"] as const) {
    if (!isCount(body[field])) return fail(`${field} must be a non-negative integer`);
  }
  const command = parseCommandBody(body.type, body.payload);
  if (!command.ok) return command;
  return {
    ok: true,
    value: {
      commandId: body.commandId,
      commandSequence: body.commandSequence as number,
      membershipVersion: body.membershipVersion as number,
      epoch: body.epoch,
      mediaGeneration: body.mediaGeneration as number,
      expectedRevision: body.expectedRevision as number,
      ...command.value,
    },
  };
}

export function parsePresence(body: unknown): Parsed<PresenceReport> {
  if (!isRecord(body)) return fail("Body must be an object");
  if (!isUuid(body.epoch)) return fail("epoch must be a UUID");
  for (const field of ["membershipVersion", "mediaGeneration", "preparationGeneration", "presenceSequence"] as const) {
    if (!isCount(body[field])) return fail(`${field} must be a non-negative integer`);
  }
  if (body.playbackSessionId !== null && !isUuid(body.playbackSessionId)) return fail("playbackSessionId must be a UUID or null");
  if (body.positionMs !== null && !isCount(body.positionMs)) return fail("positionMs must be a non-negative integer or null");
  for (const field of ["ready", "buffering", "replacingSource"] as const) {
    if (typeof body[field] !== "boolean") return fail(`${field} must be boolean`);
  }
  if (body.error !== null && !PRESENCE_ERRORS.includes(body.error as PresenceError)) return fail("error is not a known value");
  return {
    ok: true,
    value: {
      epoch: body.epoch,
      membershipVersion: body.membershipVersion as number,
      mediaGeneration: body.mediaGeneration as number,
      preparationGeneration: body.preparationGeneration as number,
      presenceSequence: body.presenceSequence as number,
      playbackSessionId: body.playbackSessionId as string | null,
      positionMs: body.positionMs as number | null,
      ready: body.ready as boolean,
      buffering: body.buffering as boolean,
      replacingSource: body.replacingSource as boolean,
      error: body.error as PresenceError | null,
    },
  };
}

/** Client-side guard for received snapshots (rejects unknown protocol versions). */
export function parseSnapshot(value: unknown): Parsed<RoomSnapshot> {
  if (!isRecord(value)) return fail("Snapshot must be an object");
  if (value.protocolVersion !== PROTOCOL_VERSION) return fail("Unsupported room protocol version");
  if (!isUuid(value.roomId) || !isUuid(value.epoch)) return fail("Snapshot identity is invalid");
  for (const field of ["revision", "presenceRevision", "mediaGeneration", "preparationGeneration", "serverNowMs", "durationMs"] as const) {
    if (!isCount(value[field])) return fail(`${field} is invalid`);
  }
  if (!["lobby", "preparing", "paused", "playing", "ended"].includes(value.phase as string)) return fail("phase is invalid");
  const anchor = value.anchor;
  if (!isRecord(anchor) || !isCount(anchor.positionMs) || !isCount(anchor.effectiveAtMs) || anchor.rate !== 1)
    return fail("anchor is invalid");
  const media = value.media;
  if (!isRecord(media) || !(["serverMachineId", "ratingKey", "mediaId", "partId"] as const).every((key) => typeof media[key] === "string" && media[key] !== ""))
    return fail("media is invalid");
  if (value.hostParticipantId !== null && !isUuid(value.hostParticipantId)) return fail("hostParticipantId is invalid");
  if (
    !Array.isArray(value.participants) ||
    value.participants.length > ROOM_POLICY.maxParticipants ||
    !value.participants.every(
      (participant) =>
        isRecord(participant) &&
        isUuid(participant.participantId) &&
        typeof participant.displayName === "string" &&
        (["connected", "ready", "buffering", "blocking"] as const).every((key) => typeof participant[key] === "boolean")
    )
  )
    return fail("participants are invalid");
  return { ok: true, value: value as RoomSnapshot };
}
