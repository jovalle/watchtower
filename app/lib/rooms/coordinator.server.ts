import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getServerConfig } from "~/lib/config/server-config.server";
import { env } from "~/lib/env.server";
import { onDeviceIdentityEnded } from "~/lib/native/device-store.server";
import { ownedPlaybackSession } from "~/lib/plex/playback-session.server";
import { authorizeMedia, resolveNextMedia, type AuthorizedMedia } from "./media-access.server";
import { resolveRoomPrincipal, type PlaybackPrincipal } from "./principal.server";
import {
  ERROR_STATUS,
  MINIMAL_TERMINAL_REASONS,
  PROTOCOL_VERSION,
  ROOM_POLICY,
  targetPositionMs,
  type CommandEnvelope,
  type CommandResult,
  type CreateRoomRequest,
  type EndedEvent,
  type HeartbeatEvent,
  type InvitationRequest,
  type JoinRoomRequest,
  type LeaveRequest,
  type MediaIdentity,
  type PresenceReport,
  type PresenceResult,
  type RoomEnvelope,
  type RoomErrorBody,
  type RoomErrorCode,
  type RoomInvitation,
  type RoomParticipant,
  type RoomPhase,
  type RoomReason,
  type RoomSnapshot,
  type TerminalReason,
} from "./protocol";

export type MemberPlaybackContext = {
  roomId: string;
  ratingKey: string;
  targetPositionMs: number;
  phase: RoomPhase;
  isHost: boolean;
};

export type CoordinatorResponse<T = unknown> = { status: number; body: T };

type CachedResponse = CoordinatorResponse<unknown>;
type CommandCacheEntry = { digest: string; response: CachedResponse; expiresAtMs: number };
type MutationCacheEntry = { digest: string; expiresAtMs: number; response: Promise<CachedResponse> };

type Subscriber = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  request: Request;
  principal: PlaybackPrincipal;
  closed: boolean;
  pendingSnapshot: RoomSnapshot | null;
  backedUpAtMs: number | null;
  nextHeartbeatAtMs: number;
  nextAuthAtMs: number;
  nextMediaAtMs: number;
  validatingAuth: boolean;
  validatingMedia: boolean;
  cleanup: () => void;
};

type ParticipantRecord = RoomParticipant & {
  userId: string;
  deviceSessionId: string;
  membershipVersion: number;
  joinOrdinal: number;
  active: boolean;
  principal: PlaybackPrincipal;
  lastPresenceAtMs: number;
  lastPositionMs: number | null;
  lastPresenceSequence: number;
  lastCommandSequence: number;
  playbackSessionId: string | null;
  playbackGeneration: number;
  blockerStartedAtMs: number | null;
  subscriber: Subscriber | null;
};

type FormerMembership = { userId: string; deviceSessionId: string; removed: boolean };

type RoomRecord = {
  roomId: string;
  revision: number;
  presenceRevision: number;
  mediaGeneration: number;
  preparationGeneration: number;
  hostParticipantId: string | null;
  phase: RoomPhase;
  reason: RoomReason | null;
  resumeAfterPrepare: boolean;
  nextCountdown: { deadlineMs: number } | null;
  pendingNext: AuthorizedMedia | null;
  /** mediaGeneration whose countdown the host cancelled; automatic scheduling stays off for it. */
  nextCancelledGeneration: number | null;
  advancing: boolean;
  policy: { autoAdvance: boolean };
  media: MediaIdentity;
  durationMs: number;
  anchor: { positionMs: number; effectiveAtMs: number; rate: 1 };
  participants: Map<string, ParticipantRecord>;
  formerMemberships: FormerMembership[];
  bannedUserIds: Set<string>;
  nextJoinOrdinal: number;
  invite: (RoomInvitation & { hash: string }) | null;
  createdAtMs: number;
  endedAtMs: number | null;
  emptySinceMs: number | null;
  hostGraceStartedAtMs: number | null;
  commandResults: Map<string, CommandCacheEntry>;
  lock: Promise<void>;
};

type RateBucket = { startedAtMs: number; count: number };

const MUTATION_CACHE_LIMIT = ROOM_POLICY.maxRooms * ROOM_POLICY.commandResultsPerRoom;
const SWEEP_INTERVAL_MS = 750;
// Due one sweep early so the observed gap stays within sseHeartbeatMs despite tick quantization.
const HEARTBEAT_DUE_MS = ROOM_POLICY.sseHeartbeatMs - SWEEP_INTERVAL_MS;
const encoder = new TextEncoder();

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function inviteHash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function failure(code: RoomErrorCode, message: string, snapshot?: RoomSnapshot): CoordinatorResponse<RoomErrorBody> {
  return { status: ERROR_STATUS[code], body: { error: { code, message }, ...(snapshot ? { snapshot } : {}) } };
}

function success<T>(body: T, status = 200): CoordinatorResponse<T> {
  return { status, body };
}

function bindingKey(userId: string, deviceSessionId: string): string {
  return `${userId}\u0000${deviceSessionId}`;
}

function commandKey(participantId: string, commandId: string): string {
  return `${participantId}:${commandId}`;
}

function samePrincipal(left: PlaybackPrincipal, right: PlaybackPrincipal): boolean {
  return left.userId === right.userId && left.deviceSessionId === right.deviceSessionId && left.identityVersion === right.identityVersion;
}

export class RoomCoordinator {
  readonly epoch: string;
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly invites = new Map<string, string>();
  private readonly mutationResults = new Map<string, MutationCacheEntry>();
  private readonly rates = new Map<string, RateBucket>();
  private readonly nowFn: () => number;
  private readonly idFn: () => string;
  private readonly secretFn: () => string;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private admissionLock: Promise<void> = Promise.resolve();

  constructor(options: {
    now?: () => number;
    id?: () => string;
    secret?: () => string;
    epoch?: string;
    startSweep?: boolean;
  } = {}) {
    this.nowFn = options.now ?? (() => Math.round(performance.now()));
    this.idFn = options.id ?? randomUUID;
    this.secretFn = options.secret ?? (() => randomBytes(32).toString("base64url"));
    this.epoch = options.epoch ?? this.idFn();
    if (options.startSweep !== false) {
      this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
      this.sweepTimer.unref?.();
    }
  }

  now(): number {
    return Math.round(this.nowFn());
  }

  dispose(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    for (const room of this.rooms.values()) {
      for (const participant of room.participants.values()) this.closeSubscriber(room, participant, "feature_disabled");
    }
  }

  private snapshot(room: RoomRecord, now = this.now()): RoomSnapshot {
    return {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      epoch: this.epoch,
      revision: room.revision,
      presenceRevision: room.presenceRevision,
      mediaGeneration: room.mediaGeneration,
      preparationGeneration: room.preparationGeneration,
      serverNowMs: now,
      hostParticipantId: room.hostParticipantId,
      phase: room.phase,
      reason: room.reason,
      resumeAfterPrepare: room.resumeAfterPrepare,
      nextCountdown: room.nextCountdown,
      policy: { ...room.policy },
      media: { ...room.media },
      durationMs: room.durationMs,
      anchor: { ...room.anchor },
      participants: [...room.participants.values()]
        .filter((participant) => participant.active)
        .sort((left, right) => left.joinOrdinal - right.joinOrdinal || left.participantId.localeCompare(right.participantId))
        .map(({ participantId, displayName, connected, ready, buffering, blocking, error }) => ({
          participantId,
          displayName,
          connected,
          ready,
          buffering,
          blocking,
          error,
        })),
    };
  }

  private membership(participant: ParticipantRecord) {
    return {
      participantId: participant.participantId,
      membershipVersion: participant.membershipVersion,
      nextCommandSequence: participant.lastCommandSequence + 1,
      nextPresenceSequence: participant.lastPresenceSequence + 1,
    };
  }

  private envelope(room: RoomRecord, participant: ParticipantRecord): RoomEnvelope {
    const isHost = room.hostParticipantId === participant.participantId;
    return {
      snapshot: this.snapshot(room),
      membership: this.membership(participant),
      invitation: isHost && room.invite ? { secret: room.invite.secret, expiresAtMs: room.invite.expiresAtMs } : null,
    };
  }

  private findParticipant(room: RoomRecord, principal: PlaybackPrincipal): ParticipantRecord | null {
    for (const participant of room.participants.values()) {
      if (participant.active && participant.userId === principal.userId && participant.deviceSessionId === principal.deviceSessionId) {
        return participant;
      }
    }
    return null;
  }

  private findFormer(room: RoomRecord, principal: PlaybackPrincipal): FormerMembership | null {
    return room.formerMemberships.find(
      (entry) => entry.userId === principal.userId && entry.deviceSessionId === principal.deviceSessionId
    ) ?? null;
  }

  private participant(principal: PlaybackPrincipal, blocking: boolean, now: number, joinOrdinal: number): ParticipantRecord {
    return {
      participantId: this.idFn(),
      userId: principal.userId,
      deviceSessionId: principal.deviceSessionId,
      membershipVersion: 1,
      joinOrdinal,
      active: true,
      principal: { ...principal },
      displayName: principal.displayName,
      connected: true,
      ready: false,
      buffering: false,
      blocking,
      error: null,
      lastPresenceAtMs: now,
      lastPositionMs: null,
      lastPresenceSequence: 0,
      lastCommandSequence: 0,
      playbackSessionId: null,
      playbackGeneration: -1,
      blockerStartedAtMs: null,
      subscriber: null,
    };
  }

  private async withAdmissionLock<T>(work: () => Promise<T> | T): Promise<T> {
    const previous = this.admissionLock;
    let release!: () => void;
    this.admissionLock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  }

  private async withRoomLock<T>(room: RoomRecord, work: () => Promise<T> | T): Promise<T> {
    const previous = room.lock;
    let release!: () => void;
    room.lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  }

  private mutationWindow(request: { epoch: string; expiresAtMs: number }, now: number): CachedResponse | null {
    if (request.epoch !== this.epoch) return failure("stale_epoch", "The coordinator restarted. Refresh and try again.");
    if (request.expiresAtMs <= now) return failure("request_expired", "This request expired. Try again.");
    if (request.expiresAtMs > now + ROOM_POLICY.mutationWindowMs) {
      return failure("invalid_request", "expiresAtMs is outside the allowed request window.");
    }
    return null;
  }

  private async dedupeMutation(
    principal: PlaybackPrincipal,
    request: { requestId: string; expiresAtMs: number },
    body: unknown,
    work: () => Promise<CachedResponse>
  ): Promise<CachedResponse> {
    this.expireDedupe(this.now());
    const key = `${bindingKey(principal.userId, principal.deviceSessionId)}\u0000${request.requestId}`;
    const bodyDigest = digest(body);
    const existing = this.mutationResults.get(key);
    if (existing) {
      if (existing.digest !== bodyDigest) {
        const prior = await existing.response;
        const priorSnapshot = (prior.body as { snapshot?: RoomSnapshot } | null)?.snapshot;
        const room = priorSnapshot ? this.rooms.get(priorSnapshot.roomId) : null;
        const currentSnapshot = room && this.findParticipant(room, principal) ? this.snapshot(room) : undefined;
        return failure("request_conflict", "requestId was already used for different data.", currentSnapshot);
      }
      return existing.response;
    }
    if (this.mutationResults.size >= MUTATION_CACHE_LIMIT) {
      return failure("capacity_exceeded", "The mutation retry cache is full. Try again later.");
    }
    const response = work();
    this.mutationResults.set(key, { digest: bodyDigest, expiresAtMs: request.expiresAtMs, response });
    return response;
  }

  private rateLimited(key: string, limit: number, windowMs: number, now: number): boolean {
    const bucket = this.rates.get(key);
    if (!bucket || now - bucket.startedAtMs >= windowMs) {
      this.rates.set(key, { startedAtMs: now, count: 1 });
      return false;
    }
    bucket.count += 1;
    return bucket.count > limit;
  }

  private makeInvite(room: RoomRecord, now: number): RoomInvitation & { hash: string } {
    const secret = this.secretFn();
    const invitation = {
      secret,
      hash: inviteHash(secret),
      expiresAtMs: Math.min(room.createdAtMs + ROOM_POLICY.roomLifetimeMs, now + 24 * 60 * 60 * 1000),
    };
    this.invites.set(invitation.hash, room.roomId);
    return invitation;
  }

  async create(principal: PlaybackPrincipal, request: CreateRoomRequest): Promise<CachedResponse> {
    const sampledNow = this.now();
    const invalid = this.mutationWindow(request, sampledNow);
    if (invalid) return invalid;
    return this.dedupeMutation(principal, request, request, async () => {
      if (!isWatchTogetherEnabled()) return failure("feature_disabled", "Watch Together is disabled.");
      if (this.rateLimited(`create:${principal.userId}`, 5, 60_000, sampledNow)) {
        return failure("rate_limited", "Too many rooms were created. Try again later.");
      }
      const access = await authorizeMedia(principal, request.media.ratingKey, request.media, false);
      if (!access.ok) return failure(access.code, access.message);
      return this.withAdmissionLock(() => {
        if (this.rooms.size >= ROOM_POLICY.maxRooms) return failure("capacity_exceeded", "The room coordinator is at capacity.");
        const now = this.now();
        const roomId = this.idFn();
        const host = this.participant(principal, true, now, 1);
        const room: RoomRecord = {
          roomId,
          revision: 1,
          presenceRevision: 1,
          mediaGeneration: 1,
          preparationGeneration: 1,
          hostParticipantId: host.participantId,
          phase: "lobby",
          reason: "created",
          resumeAfterPrepare: false,
          nextCountdown: null,
          pendingNext: null,
          nextCancelledGeneration: null,
          advancing: false,
          policy: { autoAdvance: request.autoAdvance },
          media: access.value.media,
          durationMs: access.value.durationMs,
          anchor: { positionMs: Math.min(request.startPositionMs, access.value.durationMs), effectiveAtMs: now, rate: 1 },
          participants: new Map([[host.participantId, host]]),
          formerMemberships: [],
          bannedUserIds: new Set(),
          nextJoinOrdinal: 2,
          invite: null,
          createdAtMs: now,
          endedAtMs: null,
          emptySinceMs: null,
          hostGraceStartedAtMs: null,
          commandResults: new Map(),
          lock: Promise.resolve(),
        };
        room.invite = this.makeInvite(room, now);
        this.rooms.set(roomId, room);
        return success(this.envelope(room, host), 201);
      });
    });
  }

  async join(principal: PlaybackPrincipal, request: JoinRoomRequest): Promise<CachedResponse> {
    const sampledNow = this.now();
    const invalid = this.mutationWindow(request, sampledNow);
    if (invalid) return invalid;
    return this.dedupeMutation(principal, request, request, async () => {
      if (!isWatchTogetherEnabled()) return failure("feature_disabled", "Watch Together is disabled.");
      if ("roomId" in request) {
        const room = this.rooms.get(request.roomId);
        if (!room) return failure("not_found", "Room not found.");
        return this.withRoomLock(room, () => {
          const participant = this.findParticipant(room, principal);
          if (!participant) return failure("not_found", "Room not found.");
          participant.membershipVersion += 1;
          participant.principal = { ...principal };
          this.closeSubscriber(room, participant, "replaced");
          return success(this.envelope(room, participant));
        });
      }

      const hash = inviteHash(request.invite);
      const roomId = this.invites.get(hash);
      const room = roomId ? this.rooms.get(roomId) : undefined;
      if (!room || !room.invite || room.invite.hash !== hash || room.invite.expiresAtMs <= sampledNow || room.phase === "ended") {
        // Only invalid attempts count, so a flood of guesses cannot block valid invitations.
        const globallyLimited = this.rateLimited("invite:*", 300, 60_000, sampledNow);
        if (this.rateLimited(`invite:${principal.userId}`, 20, 60_000, sampledNow) || globallyLimited) {
          return failure("rate_limited", "Too many invitation attempts. Try again later.");
        }
        return failure("not_found", "Invitation not found.");
      }
      if (room.bannedUserIds.has(principal.userId)) return failure("removed", "You were removed from this room.");
      const generation = room.mediaGeneration;
      const access = await authorizeMedia(principal, room.media.ratingKey, { mediaId: room.media.mediaId, partId: room.media.partId }, true);
      if (!access.ok) return failure(access.code, access.message);
      return this.withRoomLock(room, () => {
        if (room.phase === "ended" || room.mediaGeneration !== generation) return failure("not_found", "Invitation not found.");
        if (!room.invite || room.invite.hash !== hash || room.invite.expiresAtMs <= this.now()) return failure("not_found", "Invitation not found.");
        const existing = this.findParticipant(room, principal);
        if (existing) {
          existing.principal = { ...principal };
          return success(this.envelope(room, existing));
        }
        if (room.participants.size >= ROOM_POLICY.maxParticipants) return failure("capacity_exceeded", "This room is full.");
        const now = this.now();
        const participant = this.participant(principal, room.phase !== "playing", now, room.nextJoinOrdinal++);
        if (room.phase === "preparing") participant.blockerStartedAtMs = now;
        room.participants.set(participant.participantId, participant);
        // Roster changes are presence, not control: a join must not invalidate the host's expectedRevision.
        room.presenceRevision += 1;
        room.emptySinceMs = null;
        this.publish(room);
        return success(this.envelope(room, participant));
      });
    });
  }

  get(principal: PlaybackPrincipal, roomId: string): CachedResponse {
    const room = this.rooms.get(roomId);
    if (!room) return failure("not_found", "Room not found.");
    const participant = this.findParticipant(room, principal);
    if (participant) {
      if (room.phase === "ended") return failure("room_ended", "This room has ended.", this.snapshot(room));
      return success(this.envelope(room, participant));
    }
    const former = this.findFormer(room, principal);
    if (former?.removed || room.bannedUserIds.has(principal.userId)) return failure("removed", "You were removed from this room.");
    return failure("not_found", "Room not found.");
  }

  async invitation(principal: PlaybackPrincipal, roomId: string, request: InvitationRequest): Promise<CachedResponse> {
    const sampledNow = this.now();
    const invalid = this.mutationWindow(request, sampledNow);
    if (invalid) return invalid;
    return this.dedupeMutation(principal, request, request, async () => {
      const room = this.rooms.get(roomId);
      if (!room) return failure("not_found", "Room not found.");
      return this.withRoomLock(room, () => {
        const participant = this.findParticipant(room, principal);
        if (!participant) return failure("not_found", "Room not found.");
        if (participant.membershipVersion !== request.membershipVersion) return failure("stale_membership", "This room membership was replaced.", this.snapshot(room));
        if (room.phase === "ended") return failure("room_ended", "This room has ended.", this.snapshot(room));
        if (room.hostParticipantId !== participant.participantId) return failure("not_host", "Only the host can manage invitations.");
        if (room.invite) this.invites.delete(room.invite.hash);
        room.invite = request.action === "rotate" ? this.makeInvite(room, this.now()) : null;
        return success(this.envelope(room, participant));
      });
    });
  }

  private cacheCommand(room: RoomRecord, participant: ParticipantRecord, command: CommandEnvelope, bodyDigest: string, response: CachedResponse): CachedResponse {
    participant.lastCommandSequence = Math.max(participant.lastCommandSequence, command.commandSequence);
    room.commandResults.set(commandKey(participant.participantId, command.commandId), {
      digest: bodyDigest,
      response,
      expiresAtMs: this.now() + ROOM_POLICY.mutationWindowMs,
    });
    return response;
  }

  private commandPreflight(room: RoomRecord, participant: ParticipantRecord, command: CommandEnvelope, bodyDigest: string): CachedResponse | null {
    if (!participant.active || room.participants.get(participant.participantId) !== participant) return failure("not_found", "Room not found.");
    if (participant.membershipVersion !== command.membershipVersion) return failure("stale_membership", "This room membership was replaced.", this.snapshot(room));
    if (room.phase === "ended") return failure("room_ended", "This room has ended.", this.snapshot(room));
    if (command.epoch !== this.epoch) return failure("stale_epoch", "The coordinator restarted.", this.snapshot(room));
    if (this.rateLimited(`command:${room.roomId}:${participant.participantId}`, 30, 2_000, this.now())) return failure("rate_limited", "Commands are arriving too quickly.");
    const cached = room.commandResults.get(commandKey(participant.participantId, command.commandId));
    if (cached) return cached.digest === bodyDigest ? cached.response : failure("command_conflict", "commandId was already used for a different command.", this.snapshot(room));
    if (command.commandSequence <= participant.lastCommandSequence) {
      return this.cacheCommand(room, participant, command, bodyDigest, failure("command_result_expired", "This command sequence was already processed.", this.snapshot(room)));
    }
    if (room.commandResults.size >= ROOM_POLICY.commandResultsPerRoom) return failure("capacity_exceeded", "The command retry cache is full. Try again later.");
    if (room.hostParticipantId !== participant.participantId) return failure("not_host", "Only the host can control the room.");
    if (command.mediaGeneration !== room.mediaGeneration) return this.cacheCommand(room, participant, command, bodyDigest, failure("stale_generation", "The room media changed.", this.snapshot(room)));
    if (command.expectedRevision !== room.revision) return this.cacheCommand(room, participant, command, bodyDigest, failure("stale_revision", "The room changed. Try again.", this.snapshot(room)));
    return null;
  }

  async command(principal: PlaybackPrincipal, roomId: string, command: CommandEnvelope): Promise<CachedResponse> {
    const room = this.rooms.get(roomId);
    if (!room) return failure("not_found", "Room not found.");
    const participant = this.findParticipant(room, principal);
    if (!participant) return failure("not_found", "Room not found.");
    participant.principal = { ...principal };
    const bodyDigest = digest(command);

    if (command.type === "select-next") {
      const initial = await this.withRoomLock(room, () => this.commandPreflight(room, participant, command, bodyDigest));
      if (initial) return initial;
      const expectedGeneration = room.mediaGeneration;
      const next = await resolveNextMedia(participant.principal, room.media.ratingKey);
      if (!next.ok) return failure(next.code, next.message);
      if (command.payload.delayMs === 0) return this.advanceResolved(room, participant, command, bodyDigest, next.value, expectedGeneration);
      return this.withRoomLock(room, () => {
        const rechecked = this.commandPreflight(room, participant, command, bodyDigest);
        if (rechecked) return rechecked;
        if (room.mediaGeneration !== expectedGeneration) return this.cacheCommand(room, participant, command, bodyDigest, failure("stale_generation", "The room media changed.", this.snapshot(room)));
        room.pendingNext = next.value;
        room.nextCountdown = { deadlineMs: this.now() + command.payload.delayMs };
        room.reason = "next_scheduled";
        room.revision += 1;
        const response = success<CommandResult>({ accepted: true, snapshot: this.snapshot(room) });
        this.cacheCommand(room, participant, command, bodyDigest, response);
        this.publish(room);
        return response;
      });
    }

    return this.withRoomLock(room, () => {
      const rejected = this.commandPreflight(room, participant, command, bodyDigest);
      if (rejected) return rejected;
      const now = this.now();
      let semanticError: CoordinatorResponse | null = null;
      switch (command.type) {
        case "play":
          if (room.phase !== "lobby" && room.phase !== "paused") semanticError = failure("wrong_phase", "The room cannot play from its current phase.", this.snapshot(room));
          else if (!this.barrierReady(room)) semanticError = failure("participants_not_ready", "Blocking participants are not ready.", this.snapshot(room));
          else {
            room.phase = "playing";
            room.anchor = { positionMs: targetPositionMs(this.snapshot(room, now), now), effectiveAtMs: now + ROOM_POLICY.startLeadMs, rate: 1 };
            room.reason = "host_played";
            room.resumeAfterPrepare = false;
          }
          break;
        case "pause": {
          const positionMs = targetPositionMs(this.snapshot(room, now), now);
          room.phase = room.phase === "preparing" && !this.barrierReady(room) ? "preparing" : "paused";
          room.anchor = { positionMs, effectiveAtMs: now, rate: 1 };
          room.reason = "host_paused";
          room.resumeAfterPrepare = false;
          break;
        }
        case "seek": {
          if (command.payload.positionMs > room.durationMs) {
            semanticError = failure("invalid_request", "Seek position exceeds the media duration.");
            break;
          }
          const wasResuming = room.phase === "playing" || (room.phase === "preparing" && room.resumeAfterPrepare);
          room.preparationGeneration += 1;
          room.anchor = { positionMs: command.payload.positionMs, effectiveAtMs: now, rate: 1 };
          room.resumeAfterPrepare = room.phase === "lobby" ? false : wasResuming;
          if (room.phase !== "lobby") room.phase = "preparing";
          for (const member of room.participants.values()) {
            member.ready = false;
            member.buffering = false;
            member.blockerStartedAtMs = member.blocking && room.phase === "preparing" ? now : null;
          }
          room.presenceRevision += 1;
          room.reason = "host_seeked";
          break;
        }
        case "cancel-next":
          room.nextCountdown = null;
          room.pendingNext = null;
          room.nextCancelledGeneration = room.mediaGeneration;
          room.reason = "next_cancelled";
          break;
        case "transfer-host": {
          const target = room.participants.get(command.payload.participantId);
          if (!target?.active || !target.connected) semanticError = failure("wrong_phase", "The new host must be connected.", this.snapshot(room));
          else {
            room.hostParticipantId = target.participantId;
            room.hostGraceStartedAtMs = null;
            room.reason = "host_transferred";
          }
          break;
        }
        case "remove-participant": {
          if (command.payload.participantId === participant.participantId) semanticError = failure("invalid_request", "The host cannot remove themselves.");
          else {
            const target = room.participants.get(command.payload.participantId);
            if (!target?.active) semanticError = failure("not_found", "Participant not found.");
            else {
              this.removeParticipant(room, target, true, "removed");
              room.reason = "participant_removed";
            }
          }
          break;
        }
        case "set-policy":
          room.policy = { autoAdvance: command.payload.autoAdvance };
          room.reason = "policy_changed";
          break;
        case "end":
          this.endRoom(room, "host_ended", "host_ended");
          break;
      }
      if (semanticError) return semanticError.status === 409 ? this.cacheCommand(room, participant, command, bodyDigest, semanticError) : semanticError;
      if (command.type !== "end") room.revision += 1;
      const response = success<CommandResult>({ accepted: true, snapshot: this.snapshot(room) });
      this.cacheCommand(room, participant, command, bodyDigest, response);
      if (command.type !== "end") this.publish(room);
      return response;
    });
  }

  private async advanceResolved(room: RoomRecord, host: ParticipantRecord, command: CommandEnvelope | null, bodyDigest: string | null, next: AuthorizedMedia, expectedGeneration: number): Promise<CachedResponse> {
    const checks = await Promise.all([...room.participants.values()].filter((participant) => participant.active).map(async (participant) => ({
      participant,
      access: await authorizeMedia(participant.principal, next.media.ratingKey, { mediaId: next.media.mediaId, partId: next.media.partId }, true),
    })));
    return this.withRoomLock(room, () => {
      if (room.phase === "ended" || room.mediaGeneration !== expectedGeneration) {
        const response = failure("stale_generation", "The room media changed.", this.snapshot(room));
        return command && bodyDigest ? this.cacheCommand(room, host, command, bodyDigest, response) : response;
      }
      if (command && bodyDigest) {
        const rejected = this.commandPreflight(room, host, command, bodyDigest);
        if (rejected) return rejected;
      }
      const hostCheck = checks.find((entry) => entry.participant.participantId === room.hostParticipantId);
      if (!hostCheck?.access.ok) {
        const now = this.now();
        room.anchor = { positionMs: targetPositionMs(this.snapshot(room, now), now), effectiveAtMs: now, rate: 1 };
        room.phase = "paused";
        room.resumeAfterPrepare = false;
        room.nextCountdown = null;
        room.pendingNext = null;
        room.reason = "next_unavailable";
        room.revision += 1;
        this.publish(room);
        return command ? failure("not_found", "The next episode is unavailable.") : success({ advanced: false });
      }
      const indeterminate = checks.find(
        (entry) => entry.participant.participantId !== room.hostParticipantId && !entry.access.ok && entry.access.code !== "media_forbidden"
      );
      if (indeterminate) {
        const now = this.now();
        room.anchor = { positionMs: targetPositionMs(this.snapshot(room, now), now), effectiveAtMs: now, rate: 1 };
        room.phase = "paused";
        room.resumeAfterPrepare = false;
        room.nextCountdown = null;
        room.pendingNext = null;
        room.reason = "next_unavailable";
        room.revision += 1;
        this.publish(room);
        return command ? failure("upstream_unavailable", "Plex is temporarily unavailable.") : success({ advanced: false });
      }
      for (const check of checks) {
        if (check.participant.participantId !== room.hostParticipantId && !check.access.ok && check.access.code === "media_forbidden") {
          this.removeParticipant(room, check.participant, false, "access_denied");
        }
      }
      const now = this.now();
      room.media = next.media;
      room.durationMs = next.durationMs;
      room.mediaGeneration += 1;
      room.preparationGeneration += 1;
      room.phase = "preparing";
      room.resumeAfterPrepare = true;
      room.anchor = { positionMs: 0, effectiveAtMs: now, rate: 1 };
      room.nextCountdown = null;
      room.pendingNext = null;
      room.reason = "next_selected";
      for (const participant of room.participants.values()) {
        participant.ready = false;
        participant.buffering = false;
        participant.blocking = participant.connected;
        participant.blockerStartedAtMs = participant.blocking ? now : null;
        participant.playbackSessionId = null;
        participant.playbackGeneration = -1;
      }
      room.presenceRevision += 1;
      room.revision += 1;
      const response = command ? success<CommandResult>({ accepted: true, snapshot: this.snapshot(room) }) : success({ advanced: true });
      if (command && bodyDigest) this.cacheCommand(room, host, command, bodyDigest, response);
      this.publish(room);
      return response;
    });
  }

  async presence(principal: PlaybackPrincipal, roomId: string, report: PresenceReport): Promise<CachedResponse> {
    const room = this.rooms.get(roomId);
    if (!room) return failure("not_found", "Room not found.");
    return this.withRoomLock(room, () => {
      const participant = this.findParticipant(room, principal);
      if (!participant) return failure("not_found", "Room not found.");
      if (participant.membershipVersion !== report.membershipVersion) return failure("stale_membership", "This room membership was replaced.", this.snapshot(room));
      if (room.phase === "ended") return failure("room_ended", "This room has ended.", this.snapshot(room));
      if (report.epoch !== this.epoch) return failure("stale_epoch", "The coordinator restarted.", this.snapshot(room));
      const now = this.now();
      if (this.rateLimited(`presence:${roomId}:${participant.participantId}`, 20, 5_000, now)) return failure("rate_limited", "Presence reports are arriving too quickly.");
      if (report.presenceSequence <= participant.lastPresenceSequence) {
        return success<PresenceResult>({ ack: { presenceSequence: report.presenceSequence, epoch: this.epoch, serverNowMs: now, ignored: true }, snapshot: this.snapshot(room, now) });
      }

      participant.lastPresenceSequence = report.presenceSequence;
      participant.lastPresenceAtMs = now;
      participant.lastPositionMs = report.positionMs;
      participant.principal = { ...principal };
      let presenceChanged = false;
      let controlChanged = false;
      if (!participant.connected) {
        participant.connected = true;
        room.emptySinceMs = null;
        presenceChanged = true;
        if (participant.participantId === room.hostParticipantId && room.hostGraceStartedAtMs !== null) {
          room.hostGraceStartedAtMs = null;
          room.reason = "host_reconnected";
          room.revision += 1;
          controlChanged = true;
        }
      }

      let claimsAllowed = report.playbackSessionId !== null && report.playbackSessionId === participant.playbackSessionId;
      if (report.playbackSessionId && report.playbackSessionId !== participant.playbackSessionId) {
        const owned = ownedPlaybackSession(report.playbackSessionId, room.media.ratingKey, env.PLEX_SERVER_URL, principal.serverToken);
        if (owned && owned.scope === principal.deviceSessionId && owned.generation > participant.playbackGeneration) {
          participant.playbackSessionId = report.playbackSessionId;
          participant.playbackGeneration = owned.generation;
          claimsAllowed = true;
        } else claimsAllowed = false;
      }

      if (report.replacingSource) {
        if (participant.ready || participant.blocking || participant.buffering) presenceChanged = true;
        participant.ready = false;
        participant.blocking = false;
        participant.buffering = false;
        participant.blockerStartedAtMs = null;
      } else if (claimsAllowed && report.mediaGeneration === room.mediaGeneration && report.preparationGeneration === room.preparationGeneration) {
        if (participant.ready !== report.ready || participant.buffering !== report.buffering || participant.error !== report.error || (report.ready && !participant.blocking)) presenceChanged = true;
        participant.ready = report.ready;
        participant.buffering = report.buffering;
        participant.error = report.error;
        if (report.ready && !participant.blocking) participant.blocking = true;
        if (participant.ready) participant.blockerStartedAtMs = null;
        // Every unready blocker of a paused/preparing room is individually bounded, not only the first reporter.
        else if (participant.blocking && (room.phase === "paused" || room.phase === "preparing")) participant.blockerStartedAtMs ??= now;
        if (participant.blocking && report.buffering && room.phase === "playing") {
          room.anchor = { positionMs: targetPositionMs(this.snapshot(room, now), now), effectiveAtMs: now, rate: 1 };
          room.phase = "paused";
          room.reason = "buffering";
          room.resumeAfterPrepare = false;
          participant.ready = false;
          participant.blockerStartedAtMs = now;
          room.revision += 1;
          controlChanged = true;
        }
      }
      if (presenceChanged) room.presenceRevision += 1;
      if (this.releaseBarrier(room, now)) controlChanged = true;
      if (presenceChanged || controlChanged) this.publish(room);
      return success<PresenceResult>({ ack: { presenceSequence: report.presenceSequence, epoch: this.epoch, serverNowMs: now, ignored: false }, snapshot: this.snapshot(room, now) });
    });
  }

  private barrierReady(room: RoomRecord): boolean {
    const host = room.hostParticipantId ? room.participants.get(room.hostParticipantId) : null;
    if (!host?.active || !host.connected || !host.ready) return false;
    return [...room.participants.values()].every((participant) => !participant.active || !participant.blocking || (participant.connected && participant.ready));
  }

  private releaseBarrier(room: RoomRecord, now: number): boolean {
    if (room.phase !== "preparing" || !this.barrierReady(room)) return false;
    room.phase = room.resumeAfterPrepare ? "playing" : "paused";
    room.anchor = { positionMs: room.anchor.positionMs, effectiveAtMs: room.resumeAfterPrepare ? now + ROOM_POLICY.startLeadMs : now, rate: 1 };
    room.resumeAfterPrepare = false;
    room.reason = "prepared";
    room.revision += 1;
    return true;
  }

  async leave(principal: PlaybackPrincipal, roomId: string, request: LeaveRequest): Promise<CachedResponse> {
    const room = this.rooms.get(roomId);
    if (!room) return success({ left: true });
    return this.withRoomLock(room, () => {
      const participant = this.findParticipant(room, principal);
      if (!participant) {
        const former = this.findFormer(room, principal);
        return former?.removed ? failure("removed", "You were removed from this room.") : success({ left: true });
      }
      if (participant.membershipVersion !== request.membershipVersion) return failure("stale_membership", "This room membership was replaced.", this.snapshot(room));
      if (request.epoch !== this.epoch) return failure("stale_epoch", "The coordinator restarted.", this.snapshot(room));
      const wasHost = room.hostParticipantId === participant.participantId;
      this.removeParticipant(room, participant, false, "left");
      if (wasHost) this.electHost(room, "host_left");
      else if (room.phase !== "ended") {
        this.releaseBarrier(room, this.now());
        this.publish(room);
      }
      return success({ left: true });
    });
  }

  private removeParticipant(room: RoomRecord, participant: ParticipantRecord, banned: boolean, reason: TerminalReason): void {
    this.closeSubscriber(room, participant, reason);
    participant.active = false;
    room.participants.delete(participant.participantId);
    room.formerMemberships = room.formerMemberships.filter(
      (entry) => entry.userId !== participant.userId || entry.deviceSessionId !== participant.deviceSessionId || entry.removed
    );
    room.formerMemberships.push({ userId: participant.userId, deviceSessionId: participant.deviceSessionId, removed: banned });
    if (banned) room.bannedUserIds.add(participant.userId);
    room.presenceRevision += 1;
    if (![...room.participants.values()].some((member) => member.active && member.connected)) room.emptySinceMs ??= this.now();
  }

  private electHost(room: RoomRecord, reason: "host_left" | "host_transferred"): void {
    const candidate = [...room.participants.values()]
      .filter((participant) => participant.active && participant.connected && participant.ready)
      .sort((left, right) => left.joinOrdinal - right.joinOrdinal || left.participantId.localeCompare(right.participantId))[0];
    if (!candidate) {
      this.endRoom(room, "host_lost", "host_lost");
      return;
    }
    room.hostParticipantId = candidate.participantId;
    room.hostGraceStartedAtMs = null;
    room.reason = reason;
    room.revision += 1;
    this.publish(room);
  }

  private endRoom(room: RoomRecord, reason: RoomReason, terminalReason: TerminalReason): void {
    if (room.phase === "ended") return;
    const now = this.now();
    room.anchor = { positionMs: targetPositionMs(this.snapshot(room, now), now), effectiveAtMs: now, rate: 1 };
    room.phase = "ended";
    room.reason = reason;
    room.resumeAfterPrepare = false;
    room.nextCountdown = null;
    room.pendingNext = null;
    room.hostGraceStartedAtMs = null;
    room.endedAtMs = now;
    room.revision += 1;
    if (room.invite) this.invites.delete(room.invite.hash);
    room.invite = null;
    for (const participant of room.participants.values()) this.closeSubscriber(room, participant, terminalReason);
  }

  leaveDeviceMemberships(userId: string, deviceSessionId: string): void {
    for (const room of this.rooms.values()) {
      const participant = [...room.participants.values()].find((member) => member.active && member.userId === userId && member.deviceSessionId === deviceSessionId);
      if (!participant || room.phase === "ended") continue;
      void this.withRoomLock(room, () => {
        if (!participant.active) return;
        const wasHost = room.hostParticipantId === participant.participantId;
        this.removeParticipant(room, participant, false, "left");
        if (wasHost) this.electHost(room, "host_left");
        else {
          this.releaseBarrier(room, this.now());
          this.publish(room);
        }
      });
    }
  }

  memberPlaybackContext(roomId: string, principal: PlaybackPrincipal): MemberPlaybackContext | null {
    const room = this.rooms.get(roomId);
    if (!room || room.phase === "ended" || !this.findParticipant(room, principal)) return null;
    return {
      roomId,
      ratingKey: room.media.ratingKey,
      targetPositionMs: targetPositionMs(this.snapshot(room), this.now()),
      phase: room.phase,
      isHost: room.hostParticipantId === this.findParticipant(room, principal)?.participantId,
    };
  }

  subscribe(principal: PlaybackPrincipal, roomId: string, request: Request): CoordinatorResponse<ReadableStream<Uint8Array> | RoomErrorBody> {
    const room = this.rooms.get(roomId);
    if (!room) return failure("not_found", "Room not found.");
    const participant = this.findParticipant(room, principal);
    if (!participant) return failure("not_found", "Room not found.");
    if (room.phase === "ended") return failure("room_ended", "This room has ended.", this.snapshot(room));
    participant.principal = { ...principal };
    this.closeSubscriber(room, participant, "replaced");
    let subscriber!: Subscriber;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const now = this.now();
        subscriber = {
          controller,
          request,
          principal: { ...principal },
          closed: false,
          pendingSnapshot: null,
          backedUpAtMs: null,
          nextHeartbeatAtMs: now + HEARTBEAT_DUE_MS,
          nextAuthAtMs: now + ROOM_POLICY.authRevalidateMs,
          nextMediaAtMs: now + ROOM_POLICY.mediaRevalidateMs,
          validatingAuth: false,
          validatingMedia: false,
          cleanup: () => {
            if (participant.subscriber === subscriber) participant.subscriber = null;
          },
        };
        participant.subscriber = subscriber;
        this.enqueueRaw(subscriber, "retry: 3000\n\n");
        const initial = this.snapshot(room, now);
        this.enqueueRaw(subscriber, this.frame("snapshot", initial, `${initial.epoch}:${initial.revision}:${initial.presenceRevision}`));
      },
      cancel: () => {
        if (subscriber) subscriber.closed = true;
        subscriber?.cleanup();
      },
    });
    request.signal.addEventListener("abort", () => {
      this.closeStream(subscriber);
    }, { once: true });
    return success(stream);
  }

  private frame(event: string, value: unknown, id?: string): string {
    return `event: ${event}\n${id ? `id: ${id}\n` : ""}data: ${JSON.stringify(value)}\n\n`;
  }

  private enqueueRaw(subscriber: Subscriber, frame: string): boolean {
    if (subscriber.closed) return false;
    try {
      subscriber.controller.enqueue(encoder.encode(frame));
      return true;
    } catch {
      this.closeStream(subscriber);
      return false;
    }
  }

  private enqueueSnapshot(subscriber: Subscriber, snapshot: RoomSnapshot): void {
    if (subscriber.closed) return;
    if ((subscriber.controller.desiredSize ?? 1) <= 0) {
      subscriber.pendingSnapshot = snapshot;
      subscriber.backedUpAtMs ??= this.now();
      return;
    }
    subscriber.pendingSnapshot = null;
    subscriber.backedUpAtMs = null;
    this.enqueueRaw(subscriber, this.frame("snapshot", snapshot, `${snapshot.epoch}:${snapshot.revision}:${snapshot.presenceRevision}`));
  }

  private publish(room: RoomRecord): void {
    const snapshot = this.snapshot(room);
    for (const participant of room.participants.values()) if (participant.active && participant.subscriber) this.enqueueSnapshot(participant.subscriber, snapshot);
  }

  private closeStream(subscriber: Subscriber | null): void {
    if (!subscriber || subscriber.closed) return;
    subscriber.closed = true;
    subscriber.cleanup();
    try { subscriber.controller.close(); } catch { /* already closed */ }
  }

  private closeSubscriber(room: RoomRecord, participant: ParticipantRecord, reason: TerminalReason): void {
    const subscriber = participant.subscriber;
    if (!subscriber) return;
    const event: EndedEvent = {
      protocolVersion: PROTOCOL_VERSION,
      roomId: room.roomId,
      epoch: this.epoch,
      reason,
      ...(MINIMAL_TERMINAL_REASONS.includes(reason) ? {} : { snapshot: this.snapshot(room) }),
    };
    this.enqueueRaw(subscriber, this.frame("ended", event));
    this.closeStream(subscriber);
    participant.subscriber = null;
  }

  private async revalidateSubscriber(room: RoomRecord, participant: ParticipantRecord, subscriber: Subscriber): Promise<void> {
    if (subscriber.closed || subscriber.validatingAuth) return;
    subscriber.validatingAuth = true;
    try {
      const request = new Request(subscriber.request.url, { method: "GET", headers: new Headers(subscriber.request.headers) });
      const resolved = await resolveRoomPrincipal(request);
      if (!resolved.ok || !samePrincipal(resolved.principal, subscriber.principal) || !participant.active) {
        this.closeSubscriber(room, participant, participant.active ? "identity_changed" : "removed");
        return;
      }
      participant.principal = { ...resolved.principal };
      subscriber.principal = { ...resolved.principal };
    } catch {
      this.closeSubscriber(room, participant, "identity_changed");
    } finally {
      subscriber.validatingAuth = false;
      subscriber.nextAuthAtMs = this.now() + ROOM_POLICY.authRevalidateMs;
    }
  }

  private async revalidateMedia(room: RoomRecord, participant: ParticipantRecord, subscriber: Subscriber): Promise<void> {
    if (subscriber.closed || subscriber.validatingMedia) return;
    subscriber.validatingMedia = true;
    const generation = room.mediaGeneration;
    try {
      const access = await authorizeMedia(participant.principal, room.media.ratingKey, { mediaId: room.media.mediaId, partId: room.media.partId }, true);
      if (access.ok || room.mediaGeneration !== generation || !participant.active) return;
      if (access.code === "media_forbidden") {
        await this.withRoomLock(room, () => {
          if (!participant.active || room.mediaGeneration !== generation) return;
          const wasHost = room.hostParticipantId === participant.participantId;
          this.removeParticipant(room, participant, false, "access_denied");
          if (wasHost) this.electHost(room, "host_left");
          else {
            room.reason = "participant_removed";
            room.revision += 1;
            this.publish(room);
          }
        });
      } else if (access.code === "upstream_unavailable") console.error(`[Room ${room.roomId.slice(0, 8)}] Plex media revalidation failed`);
    } finally {
      subscriber.validatingMedia = false;
      subscriber.nextMediaAtMs = this.now() + ROOM_POLICY.mediaRevalidateMs;
    }
  }

  sweep(): void {
    const now = this.now();
    this.expireDedupe(now);
    const machineId = getServerConfig()?.machineIdentifier;
    for (const room of this.rooms.values()) {
      for (const [key, cached] of room.commandResults) if (cached.expiresAtMs <= now) room.commandResults.delete(key);
      if (room.phase === "ended") {
        if (room.endedAtMs !== null && now - room.endedAtMs >= ROOM_POLICY.endedRetentionMs) this.rooms.delete(room.roomId);
        continue;
      }
      if (machineId !== room.media.serverMachineId) {
        this.endRoom(room, "server_changed", "server_changed");
        continue;
      }
      if (now - room.createdAtMs >= ROOM_POLICY.roomLifetimeMs || (room.emptySinceMs !== null && now - room.emptySinceMs >= ROOM_POLICY.emptyRoomMs)) {
        this.endRoom(room, "expired", "expired");
        continue;
      }

      let presenceChanged = false;
      for (const participant of room.participants.values()) {
        if (!participant.active) continue;
        if (participant.connected && now - participant.lastPresenceAtMs > ROOM_POLICY.presenceStaleMs) {
          participant.connected = false;
          participant.ready = false;
          participant.buffering = false;
          participant.blocking = false;
          participant.blockerStartedAtMs = null;
          presenceChanged = true;
          if (participant.participantId === room.hostParticipantId) {
            if (room.phase === "playing" || room.phase === "preparing") {
              room.anchor = { positionMs: targetPositionMs(this.snapshot(room, now), now), effectiveAtMs: now, rate: 1 };
              room.phase = "paused";
              room.resumeAfterPrepare = false;
              room.reason = "host_disconnected";
              room.revision += 1;
            }
            room.hostGraceStartedAtMs ??= now;
          }
        }
        if (participant.blocking && !participant.ready && participant.blockerStartedAtMs !== null && (room.phase === "preparing" || room.phase === "paused") && now - participant.blockerStartedAtMs > ROOM_POLICY.blockerTimeoutMs) {
          participant.blocking = false;
          participant.buffering = false;
          participant.blockerStartedAtMs = null;
          room.reason = "blocker_timeout";
          room.revision += 1;
          presenceChanged = true;
        }

        const subscriber = participant.subscriber;
        if (!subscriber || subscriber.closed) continue;
        if (subscriber.pendingSnapshot) {
          if ((subscriber.controller.desiredSize ?? 1) > 0) this.enqueueSnapshot(subscriber, subscriber.pendingSnapshot);
          else if (subscriber.backedUpAtMs !== null && now - subscriber.backedUpAtMs > 10_000) this.closeStream(subscriber);
        }
        if (!subscriber.closed && now >= subscriber.nextHeartbeatAtMs) {
          const heartbeat: HeartbeatEvent = {
            protocolVersion: PROTOCOL_VERSION,
            roomId: room.roomId,
            epoch: this.epoch,
            serverNowMs: now,
            revision: room.revision,
            presenceRevision: room.presenceRevision,
          };
          this.enqueueRaw(subscriber, this.frame("heartbeat", heartbeat));
          subscriber.nextHeartbeatAtMs = now + HEARTBEAT_DUE_MS;
        }
        if (now >= subscriber.nextAuthAtMs) void this.revalidateSubscriber(room, participant, subscriber);
        if (now >= subscriber.nextMediaAtMs) void this.revalidateMedia(room, participant, subscriber);
      }
      if (presenceChanged) room.presenceRevision += 1;
      room.emptySinceMs = [...room.participants.values()].some((participant) => participant.active && participant.connected)
        ? null
        : (room.emptySinceMs ?? now);
      if (room.hostGraceStartedAtMs !== null && now - room.hostGraceStartedAtMs > ROOM_POLICY.hostGraceMs) {
        this.electHost(room, "host_transferred");
        continue;
      }
      if (this.releaseBarrier(room, now)) this.publish(room);
      else if (presenceChanged) this.publish(room);

      if (room.phase === "playing" && targetPositionMs(this.snapshot(room, now), now) >= room.durationMs) {
        room.phase = "paused";
        room.anchor = { positionMs: room.durationMs, effectiveAtMs: now, rate: 1 };
        room.resumeAfterPrepare = false;
        room.reason = "media_ended";
        room.revision += 1;
        this.publish(room);
        if (room.policy.autoAdvance && !room.advancing && !room.nextCountdown && room.nextCancelledGeneration !== room.mediaGeneration) {
          this.scheduleAutomaticNext(room, room.mediaGeneration, room.revision);
        }
      }
      if (room.nextCountdown && room.nextCountdown.deadlineMs <= now && room.pendingNext && !room.advancing) {
        room.advancing = true;
        const host = room.hostParticipantId ? room.participants.get(room.hostParticipantId) : null;
        const next = room.pendingNext;
        const generation = room.mediaGeneration;
        if (host) void this.advanceResolved(room, host, null, null, next, generation).finally(() => { room.advancing = false; });
        else room.advancing = false;
      }
    }
  }

  private scheduleAutomaticNext(room: RoomRecord, expectedGeneration: number, expectedRevision: number): void {
    const host = room.hostParticipantId ? room.participants.get(room.hostParticipantId) : null;
    if (!host) return;
    room.advancing = true;
    void resolveNextMedia(host.principal, room.media.ratingKey)
      .then((next) => this.withRoomLock(room, () => {
        if (!next.ok || room.phase === "ended" || room.mediaGeneration !== expectedGeneration || room.revision !== expectedRevision) return;
        room.pendingNext = next.value;
        room.nextCountdown = { deadlineMs: this.now() + ROOM_POLICY.nextCountdownMs };
        room.reason = "next_scheduled";
        room.revision += 1;
        this.publish(room);
      }))
      .catch(() => undefined)
      .finally(() => { room.advancing = false; });
  }

  private expireDedupe(now: number): void {
    for (const [key, entry] of this.mutationResults) if (entry.expiresAtMs <= now) this.mutationResults.delete(key);
    for (const [key, bucket] of this.rates) if (now - bucket.startedAtMs > 5 * 60_000) this.rates.delete(key);
  }

  diagnostics() {
    const now = this.now();
    const rooms = [...this.rooms.values()];
    return {
      rooms: rooms.length,
      participants: rooms.reduce((total, room) => total + room.participants.size, 0),
      connected: rooms.reduce((total, room) => total + [...room.participants.values()].filter((participant) => participant.connected).length, 0),
      subscribers: rooms.reduce((total, room) => total + [...room.participants.values()].filter((participant) => participant.subscriber && !participant.subscriber.closed).length, 0),
      dedupeEntries: this.mutationResults.size,
      roomDetails: rooms.map((room) => ({
        roomIdPrefix: room.roomId.slice(0, 8),
        phase: room.phase,
        revision: room.revision,
        presenceRevision: room.presenceRevision,
        participants: room.participants.size,
        connected: [...room.participants.values()].filter((participant) => participant.connected).length,
        driftEstimatesMs: [...room.participants.values()].filter((participant) => participant.lastPositionMs !== null).map((participant) => targetPositionMs(this.snapshot(room, now), now) - (participant.lastPositionMs ?? 0)),
      })),
    };
  }
}

declare global {
  // Global singleton declaration requires `var` so repeated module evaluation shares one binding.
  // eslint-disable-next-line no-var
  var __watchtowerRoomCoordinator: RoomCoordinator | undefined;
}

export function getRoomCoordinator(): RoomCoordinator {
  globalThis.__watchtowerRoomCoordinator ??= new RoomCoordinator();
  return globalThis.__watchtowerRoomCoordinator;
}

/** Room-mode context for the watch loader; null when the caller is not an active member. */
export function getMemberPlaybackContext(roomId: string, principal: PlaybackPrincipal): MemberPlaybackContext | null {
  return getRoomCoordinator().memberPlaybackContext(roomId, principal);
}

/** Rollout switch: `WATCH_TOGETHER=disabled` rejects new rooms/joins. */
export function isWatchTogetherEnabled(): boolean {
  return process.env.WATCH_TOGETHER !== "disabled";
}

/** Called on logout: ends this browser device's memberships for the user. */
export function leaveDeviceMemberships(userId: string, deviceSessionId: string): void {
  getRoomCoordinator().leaveDeviceMemberships(userId, deviceSessionId);
}

// Native device revocation, sign-out and profile switches end that device's memberships too.
onDeviceIdentityEnded(({ userId, deviceSessionId }) => leaveDeviceMemberships(userId, deviceSessionId));
