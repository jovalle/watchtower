import {
  ROOM_POLICY,
  parseSnapshot,
  type ClockSample,
  type CommandEnvelope,
  type EndedEvent,
  type HeartbeatEvent,
  type InvitationRequest,
  type JoinRoomRequest,
  type PresenceError,
  type PresenceReport,
  type PresenceResult,
  type RoomCommand,
  type RoomEnvelope,
  type RoomErrorBody,
  type RoomErrorCode,
  type RoomMembership,
  type RoomSnapshot,
  type TerminalReason,
} from "./protocol";
import {
  selectClockEstimate,
  type ClockEstimate,
  type ClockProbe,
} from "./sync";

type Fetch = typeof fetch;

type EventSourceLike = {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
};

export type RoomClientStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "error";

export type RoomClientState = {
  status: RoomClientStatus;
  snapshot: RoomSnapshot | null;
  membership: RoomMembership | null;
  invitation: RoomEnvelope["invitation"];
  clock: ClockEstimate | null;
  endedReason: TerminalReason | "server_restarted" | null;
  lastErrorCode: RoomErrorCode | null;
  reconnects: number;
};

export type PresenceInput = Pick<
  PresenceReport,
  | "playbackSessionId"
  | "positionMs"
  | "ready"
  | "buffering"
  | "replacingSource"
  | "error"
>;

type ClientOptions = {
  fetch?: Fetch;
  createEventSource?: (url: string) => EventSourceLike;
  now?: () => number;
};

const AUTH_TERMINAL_STATUSES = new Set([401, 403, 404, 410]);
// Command rejections that end the membership; any other answered rejection only drops that intent.
const COMMAND_TERMINAL_CODES = new Set<RoomErrorCode | null>([
  "removed",
  "forbidden",
  "room_ended",
  "membership_ended",
]);
const MUTATION_EXPIRY_MS = 30_000;
const PRESENCE_RETRY_MS = 1_000;
const mutationBodies = new Map<string, object>();

export class RoomApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: RoomErrorCode | null,
    readonly snapshot?: RoomSnapshot
  ) {
    super(message);
  }
}

function createEventSource(url: string): EventSourceLike {
  return new EventSource(url);
}

async function readError(response: Response): Promise<RoomApiError> {
  const body = (await response.json().catch(() => null)) as RoomErrorBody | null;
  return new RoomApiError(
    body?.error.message ?? `Room request failed (${response.status})`,
    response.status,
    body?.error.code ?? null,
    body?.snapshot
  );
}

async function requestJson<T>(
  fetchImpl: Fetch,
  url: string,
  init?: RequestInit,
  retryNetwork = false
): Promise<T> {
  const attempts = retryNetwork ? 2 : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        credentials: "same-origin",
        ...init,
      });
      if (!response.ok) throw await readError(response);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (error instanceof RoomApiError || attempt === attempts - 1) throw error;
    }
  }
  throw lastError;
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function isEnvelope(value: unknown): value is RoomEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RoomEnvelope>;
  return (
    parseSnapshot(candidate.snapshot).ok &&
    !!candidate.membership &&
    typeof candidate.membership.participantId === "string" &&
    Number.isSafeInteger(candidate.membership.membershipVersion) &&
    Number.isSafeInteger(candidate.membership.nextCommandSequence) &&
    Number.isSafeInteger(candidate.membership.nextPresenceSequence)
  );
}

export async function sampleRoomClock(
  options: { fetch?: Fetch; now?: () => number; samples?: number } = {}
): Promise<ClockEstimate> {
  const fetchImpl = options.fetch ?? fetch.bind(globalThis);
  const now = options.now ?? (() => performance.now());
  const probes: ClockProbe[] = [];
  for (let index = 0; index < (options.samples ?? 3); index++) {
    const clientSentAtMs = now();
    const sample = await requestJson<ClockSample>(fetchImpl, "/api/v1/clock");
    const clientReceivedAtMs = now();
    probes.push({ sample, clientSentAtMs, clientReceivedAtMs });
  }
  const estimate = selectClockEstimate(probes);
  if (!estimate) throw new Error("Could not establish the room clock");
  return estimate;
}

type MutationFields = { requestId?: string };

async function retryableMutation<T extends object>(
  path: string,
  fields: T,
  options: MutationFields & { fetch?: Fetch; now?: () => number } = {}
): Promise<RoomEnvelope> {
  const fetchImpl = options.fetch ?? fetch.bind(globalThis);
  const requestId = options.requestId ?? crypto.randomUUID();
  const mutationKey = `${path}:${requestId}`;
  let body = mutationBodies.get(mutationKey);
  if (!body) {
    const clock = await sampleRoomClock({ fetch: fetchImpl, now: options.now });
    const localNow = (options.now ?? (() => performance.now()))();
    body = {
      requestId,
      epoch: clock.epoch,
      expiresAtMs: Math.floor(localNow + clock.offsetMs + MUTATION_EXPIRY_MS),
      ...fields,
    };
    mutationBodies.set(mutationKey, body);
    setTimeout(() => mutationBodies.delete(mutationKey), MUTATION_EXPIRY_MS);
  }
  const envelope = await requestJson<unknown>(
    fetchImpl,
    path,
    jsonPost(body),
    true
  );
  if (!isEnvelope(envelope)) throw new Error("Room server returned an invalid envelope");
  return envelope;
}

export function createRoom(
  fields: Omit<
    import("./protocol").CreateRoomRequest,
    "requestId" | "epoch" | "expiresAtMs"
  >,
  options?: MutationFields & { fetch?: Fetch; now?: () => number }
) {
  return retryableMutation("/api/v1/rooms", fields, options);
}

export function joinRoom(
  fields: Omit<JoinRoomRequest, "requestId" | "epoch" | "expiresAtMs">,
  options?: MutationFields & { fetch?: Fetch; now?: () => number }
) {
  return retryableMutation("/api/v1/rooms/join", fields, options);
}

export async function recoverRoom(
  roomId: string,
  options: { fetch?: Fetch } = {}
): Promise<RoomEnvelope> {
  const envelope = await requestJson<unknown>(
    options.fetch ?? fetch.bind(globalThis),
    `/api/v1/rooms/${encodeURIComponent(roomId)}`
  );
  if (!isEnvelope(envelope)) throw new Error("Room server returned an invalid envelope");
  return envelope;
}

export class BrowserRoomClient {
  private readonly fetchImpl: Fetch;
  private readonly eventSourceFactory: (url: string) => EventSourceLike;
  private readonly now: () => number;
  private readonly listeners = new Set<(state: RoomClientState) => void>();
  private eventSource: EventSourceLike | null = null;
  private livenessTimer: ReturnType<typeof setInterval> | null = null;
  private presenceTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastAcknowledgementAtMs = 0;
  private commandSequence = 0;
  private presenceSequence = 0;
  private commandQueue: Promise<unknown> = Promise.resolve();
  private latestPresence: PresenceInput = {
    playbackSessionId: null,
    positionMs: null,
    ready: false,
    buffering: false,
    replacingSource: false,
    error: null,
  };
  private stopped = false;
  private recovering = false;

  private state: RoomClientState = {
    status: "idle",
    snapshot: null,
    membership: null,
    invitation: null,
    clock: null,
    endedReason: null,
    lastErrorCode: null,
    reconnects: 0,
  };

  constructor(
    readonly roomId: string,
    envelope?: RoomEnvelope,
    options: ClientOptions = {}
  ) {
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis);
    this.eventSourceFactory = options.createEventSource ?? createEventSource;
    this.now = options.now ?? (() => performance.now());
    if (envelope) this.applyEnvelope(envelope);
  }

  getState(): RoomClientState {
    return this.state;
  }

  subscribe(listener: (state: RoomClientState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private update(patch: Partial<RoomClientState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }

  private acknowledge() {
    this.lastAcknowledgementAtMs = this.now();
    if (this.state.status === "reconnecting" || this.state.status === "connecting") {
      this.update({ status: "connected", lastErrorCode: null });
    }
  }

  private applyEnvelope(envelope: RoomEnvelope) {
    this.commandSequence = envelope.membership.nextCommandSequence;
    this.presenceSequence = envelope.membership.nextPresenceSequence;
    this.state = {
      ...this.state,
      snapshot: envelope.snapshot,
      membership: envelope.membership,
      invitation: envelope.invitation,
    };
  }

  /** Apply control and presence ordering independently within one epoch. */
  applySnapshot(incoming: RoomSnapshot): boolean {
    const parsed = parseSnapshot(incoming);
    if (!parsed.ok) return false;
    const current = this.state.snapshot;
    if (!current) {
      this.update({ snapshot: incoming });
      this.acknowledge();
      return true;
    }
    if (incoming.epoch !== current.epoch) {
      this.end("server_restarted");
      return false;
    }

    const newerControl = incoming.revision > current.revision;
    const newerPresence = incoming.presenceRevision > current.presenceRevision;
    if (!newerControl && !newerPresence) {
      if (
        incoming.revision === current.revision &&
        incoming.presenceRevision === current.presenceRevision
      ) {
        this.acknowledge();
      }
      return false;
    }

    let next = current;
    if (newerControl) {
      next = incoming;
      if (!newerPresence && incoming.presenceRevision < current.presenceRevision) {
        next = {
          ...incoming,
          presenceRevision: current.presenceRevision,
          participants: current.participants,
        };
      }
    } else if (newerPresence) {
      next = {
        ...current,
        presenceRevision: incoming.presenceRevision,
        participants: incoming.participants,
        serverNowMs: incoming.serverNowMs,
      };
    }
    this.update({ snapshot: next });
    this.acknowledge();
    return true;
  }

  async start(): Promise<void> {
    if (this.state.status !== "idle") return;
    this.stopped = false;
    this.update({ status: "connecting" });
    try {
      if (!this.state.membership) await this.recover();
      const clock = await sampleRoomClock({ fetch: this.fetchImpl, now: this.now });
      if (this.state.snapshot && clock.epoch !== this.state.snapshot.epoch) {
        this.end("server_restarted");
        return;
      }
      this.update({ clock });
      if (this.stopped || this.isTerminal()) return;
      this.acknowledge();
      this.openEvents();
      this.startTimers();
      window.addEventListener("online", this.handleResume);
      document.addEventListener("visibilitychange", this.handleVisibility);
    } catch (error) {
      this.handleRequestFailure(error);
    }
  }

  private readonly handleResume = () => {
    if (!this.stopped && !this.isTerminal()) void this.recoverAndReconnect();
  };

  private readonly handleVisibility = () => {
    if (document.visibilityState === "visible") this.handleResume();
  };

  private startTimers() {
    if (!this.livenessTimer) {
      this.livenessTimer = setInterval(() => {
        if (
          !this.isTerminal() &&
          this.now() - this.lastAcknowledgementAtMs >= ROOM_POLICY.clientStaleMs
        ) {
          this.beginReconnect();
        }
      }, 1000);
    }
    if (!this.presenceTimer) {
      this.presenceTimer = setInterval(() => {
        if (this.state.status === "connected") {
          void this.reportPresence(this.latestPresence).catch(() => {});
        }
      }, ROOM_POLICY.presenceHeartbeatMs);
    }
  }

  private openEvents() {
    this.eventSource?.close();
    const source = this.eventSourceFactory(
      `/api/v1/rooms/${encodeURIComponent(this.roomId)}/events`
    );
    this.eventSource = source;
    source.addEventListener("snapshot", (event) => {
      const snapshot = JSON.parse(event.data) as RoomSnapshot;
      this.applySnapshot(snapshot);
    });
    source.addEventListener("heartbeat", (event) => {
      const heartbeat = JSON.parse(event.data) as HeartbeatEvent;
      if (this.state.snapshot && heartbeat.epoch !== this.state.snapshot.epoch) {
        this.end("server_restarted");
      } else {
        this.acknowledge();
      }
    });
    source.addEventListener("ended", (event) => {
      const ended = JSON.parse(event.data) as EndedEvent;
      if (ended.snapshot) this.applySnapshot(ended.snapshot);
      this.end(ended.reason);
    });
    source.onerror = () => this.beginReconnect();
  }

  private beginReconnect() {
    if (this.recovering || this.stopped || this.isTerminal()) return;
    this.eventSource?.close();
    this.eventSource = null;
    this.update({
      status: "reconnecting",
      reconnects: this.state.reconnects + 1,
    });
    void this.recoverAndReconnect();
  }

  private async recoverAndReconnect() {
    if (this.recovering || this.stopped || this.isTerminal()) return;
    this.recovering = true;
    try {
      await this.recover();
      const clock = await sampleRoomClock({ fetch: this.fetchImpl, now: this.now });
      if (this.state.snapshot && clock.epoch !== this.state.snapshot.epoch) {
        this.end("server_restarted");
        return;
      }
      this.update({ clock });
      this.acknowledge();
      this.openEvents();
    } catch (error) {
      if (!this.handleRequestFailure(error)) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          void this.recoverAndReconnect();
        }, 1000);
      }
    } finally {
      this.recovering = false;
    }
  }

  private async recover() {
    const envelope = await requestJson<unknown>(
      this.fetchImpl,
      `/api/v1/rooms/${encodeURIComponent(this.roomId)}`
    );
    if (!isEnvelope(envelope)) throw new Error("Room server returned an invalid envelope");
    const previousEpoch = this.state.snapshot?.epoch;
    if (previousEpoch && envelope.snapshot.epoch !== previousEpoch) {
      this.end("server_restarted");
      return;
    }
    this.applyEnvelope(envelope);
    this.update({
      snapshot: envelope.snapshot,
      membership: envelope.membership,
      invitation: envelope.invitation,
    });
  }

  private handleRequestFailure(error: unknown): boolean {
    if (error instanceof RoomApiError && AUTH_TERMINAL_STATUSES.has(error.status)) {
      this.update({
        status: error.status === 410 ? "ended" : "error",
        lastErrorCode: error.code,
        endedReason: error.status === 410 ? "expired" : null,
      });
      this.closeTransport();
      return true;
    }
    return false;
  }

  private isTerminal() {
    return this.state.status === "ended" || this.state.status === "error";
  }

  private end(reason: RoomClientState["endedReason"]) {
    this.update({ status: "ended", endedReason: reason });
    this.closeTransport();
  }

  private closeTransport() {
    this.eventSource?.close();
    this.eventSource = null;
    if (this.livenessTimer) clearInterval(this.livenessTimer);
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.presenceRetryTimer) clearTimeout(this.presenceRetryTimer);
    this.livenessTimer = null;
    this.presenceTimer = null;
    this.reconnectTimer = null;
    this.presenceRetryTimer = null;
  }

  async sendCommand(command: RoomCommand): Promise<boolean> {
    const execute = async () => {
      const { snapshot, membership } = this.state;
      if (this.state.status !== "connected" || !snapshot || !membership) return false;
      const body: CommandEnvelope = {
        commandId: crypto.randomUUID(),
        commandSequence: this.commandSequence++,
        membershipVersion: membership.membershipVersion,
        epoch: snapshot.epoch,
        mediaGeneration: snapshot.mediaGeneration,
        expectedRevision: snapshot.revision,
        ...command,
      };
      try {
        const result = await requestJson<{ accepted: true; snapshot: RoomSnapshot }>(
          this.fetchImpl,
          `/api/v1/rooms/${encodeURIComponent(this.roomId)}/commands`,
          jsonPost(body),
          true
        );
        this.applySnapshot(result.snapshot);
        this.acknowledge();
        return true;
      } catch (error) {
        if (error instanceof RoomApiError && error.status === 409) {
          if (error.snapshot) this.applySnapshot(error.snapshot);
          this.update({ lastErrorCode: error.code });
          return false;
        }
        if (
          error instanceof RoomApiError &&
          error.status !== 401 &&
          !COMMAND_TERMINAL_CODES.has(error.code)
        ) {
          if (error.snapshot) this.applySnapshot(error.snapshot);
          this.update({ lastErrorCode: error.code });
          // "No next episode" and a missing room share not_found; ask the room which one it is.
          if (error.code === "not_found") {
            void this.recover().catch((recoverError) =>
              this.handleRequestFailure(recoverError)
            );
          }
          return false;
        }
        if (!this.handleRequestFailure(error)) this.beginReconnect();
        throw error;
      }
    };
    const pending = this.commandQueue.then(execute, execute);
    this.commandQueue = pending.catch(() => undefined);
    return pending;
  }

  async reportPresence(input: PresenceInput): Promise<boolean> {
    this.latestPresence = input;
    const { snapshot, membership } = this.state;
    if (this.state.status !== "connected" || !snapshot || !membership) return false;
    const body: PresenceReport = {
      epoch: snapshot.epoch,
      membershipVersion: membership.membershipVersion,
      mediaGeneration: snapshot.mediaGeneration,
      preparationGeneration: snapshot.preparationGeneration,
      presenceSequence: this.presenceSequence++,
      ...input,
    };
    try {
      const result = await requestJson<PresenceResult>(
        this.fetchImpl,
        `/api/v1/rooms/${encodeURIComponent(this.roomId)}/presence`,
        jsonPost(body)
      );
      this.applySnapshot(result.snapshot);
      this.acknowledge();
      return !result.ack.ignored;
    } catch (error) {
      if (error instanceof RoomApiError && error.status === 429) {
        // Presence is latest-state: resend the newest report after the burst.
        this.presenceRetryTimer ??= setTimeout(() => {
          this.presenceRetryTimer = null;
          if (this.state.status === "connected") {
            void this.reportPresence(this.latestPresence).catch(() => {});
          }
        }, PRESENCE_RETRY_MS);
        return false;
      }
      if (!this.handleRequestFailure(error)) this.beginReconnect();
      throw error;
    }
  }

  observePresence(input: PresenceInput) {
    this.latestPresence = input;
  }

  async prepareSourceReplacement(input: {
    playbackSessionId: string | null;
    positionMs: number | null;
  }): Promise<boolean> {
    return this.reportPresence({
      ...input,
      ready: false,
      buffering: false,
      replacingSource: true,
      error: null,
    });
  }

  async updateInvitation(
    action: InvitationRequest["action"],
    requestId = crypto.randomUUID()
  ): Promise<RoomEnvelope> {
    const { membership } = this.state;
    if (!membership) throw new Error("Room membership is unavailable");
    const envelope = await retryableMutation(
      `/api/v1/rooms/${encodeURIComponent(this.roomId)}/invitations`,
      { membershipVersion: membership.membershipVersion, action },
      { fetch: this.fetchImpl, now: this.now, requestId }
    );
    this.applyEnvelope(envelope);
    this.update({
      snapshot: envelope.snapshot,
      membership: envelope.membership,
      invitation: envelope.invitation,
    });
    return envelope;
  }

  async leave(): Promise<void> {
    const { snapshot, membership } = this.state;
    this.stop();
    if (!snapshot || !membership) return;
    await requestJson<unknown>(
      this.fetchImpl,
      `/api/v1/rooms/${encodeURIComponent(this.roomId)}/leave`,
      jsonPost({
        epoch: snapshot.epoch,
        membershipVersion: membership.membershipVersion,
      })
    );
  }

  stop() {
    this.stopped = true;
    this.closeTransport();
    window.removeEventListener("online", this.handleResume);
    document.removeEventListener("visibilitychange", this.handleVisibility);
  }
}

export function roomPresenceError(message: string): PresenceError {
  return message === "autoplay_blocked" ? message : "media_error";
}