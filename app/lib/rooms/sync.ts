import {
  ROOM_POLICY,
  estimateClock,
  targetPositionMs,
  type ClockSample,
  type RoomSnapshot,
} from "./protocol";

const MAX_CLOCK_RTT_MS = 10_000;

export type ClockProbe = {
  sample: ClockSample;
  clientSentAtMs: number;
  clientReceivedAtMs: number;
};

export type ClockEstimate = {
  epoch: string;
  offsetMs: number;
  rttMs: number;
  uncertaintyMs: number;
  sampledAtClientMs: number;
};

export type ObservedMediaState = {
  positionMs: number;
  paused: boolean;
  buffering: boolean;
  seeking: boolean;
  playbackRate: number;
  replacingSource?: boolean;
  error?: boolean;
};

export type ReconciliationMemory = {
  lastHardSeekAtMs: number | null;
  correctingRate: boolean;
};

export type ReconciliationAction =
  | { kind: "hold-paused" }
  | { kind: "schedule-play"; localTimeMs: number }
  | { kind: "play" }
  | { kind: "seek"; positionMs: number }
  | { kind: "rate"; rate: number }
  | { kind: "none" };

export type ReconciliationDecision = {
  action: ReconciliationAction;
  desiredPositionMs: number;
  driftMs: number;
  memory: ReconciliationMemory;
};

export const INITIAL_RECONCILIATION_MEMORY: ReconciliationMemory = {
  lastHardSeekAtMs: null,
  correctingRate: false,
};

/** Select the valid lowest-RTT probe. Its half-RTT is retained as uncertainty. */
export function selectClockEstimate(
  probes: readonly ClockProbe[],
  expectedEpoch?: string
): ClockEstimate | null {
  const estimates = probes.flatMap((probe) => {
    if (expectedEpoch && probe.sample.epoch !== expectedEpoch) return [];
    const estimate = estimateClock(
      probe.sample,
      probe.clientSentAtMs,
      probe.clientReceivedAtMs
    );
    if (!estimate || estimate.rttMs > MAX_CLOCK_RTT_MS) return [];
    return [
      {
        epoch: probe.sample.epoch,
        ...estimate,
        sampledAtClientMs: probe.clientReceivedAtMs,
      },
    ];
  });

  if (estimates.length === 0) return null;
  return estimates.reduce((best, candidate) =>
    candidate.rttMs < best.rttMs ? candidate : best
  );
}

export function estimatedServerNowMs(
  estimate: Pick<ClockEstimate, "offsetMs">,
  localNowMs: number
): number {
  return localNowMs + estimate.offsetMs;
}

function normalRateAction(
  observed: ObservedMediaState,
  desiredPositionMs: number,
  memory: ReconciliationMemory
): ReconciliationDecision {
  return {
    action:
      Math.abs(observed.playbackRate - 1) > Number.EPSILON
        ? { kind: "rate", rate: 1 }
        : { kind: "none" },
    desiredPositionMs,
    driftMs: desiredPositionMs - observed.positionMs,
    memory: { ...memory, correctingRate: false },
  };
}

/**
 * Decide one idempotent local media action. User intent is deliberately absent:
 * this function only reconciles an element to authoritative room state.
 */
export function reconcileRoomPlayback(
  snapshot: RoomSnapshot,
  observed: ObservedMediaState,
  clock: Pick<ClockEstimate, "offsetMs">,
  localNowMs: number,
  memory: ReconciliationMemory = INITIAL_RECONCILIATION_MEMORY
): ReconciliationDecision {
  const serverNowMs = estimatedServerNowMs(clock, localNowMs);
  const desiredPositionMs = targetPositionMs(snapshot, serverNowMs);
  const driftMs = desiredPositionMs - observed.positionMs;
  const unsafeToCorrect =
    observed.buffering ||
    observed.seeking ||
    observed.replacingSource === true ||
    observed.error === true;

  if (snapshot.phase !== "playing") {
    if (!observed.paused) {
      return {
        action: { kind: "hold-paused" },
        desiredPositionMs,
        driftMs,
        memory: { ...memory, correctingRate: false },
      };
    }
    if (Math.abs(observed.playbackRate - 1) > Number.EPSILON) {
      return normalRateAction(observed, desiredPositionMs, memory);
    }
    if (!unsafeToCorrect && Math.abs(driftMs) > ROOM_POLICY.deadbandMs) {
      return {
        action: { kind: "seek", positionMs: desiredPositionMs },
        desiredPositionMs,
        driftMs,
        memory: { ...memory, lastHardSeekAtMs: localNowMs, correctingRate: false },
      };
    }
    return normalRateAction(observed, desiredPositionMs, memory);
  }

  if (serverNowMs < snapshot.anchor.effectiveAtMs) {
    if (!observed.paused) {
      return {
        action: { kind: "hold-paused" },
        desiredPositionMs,
        driftMs,
        memory: { ...memory, correctingRate: false },
      };
    }
    if (Math.abs(observed.playbackRate - 1) > Number.EPSILON) {
      return normalRateAction(observed, desiredPositionMs, memory);
    }
    return {
      action: {
        kind: "schedule-play",
        localTimeMs: snapshot.anchor.effectiveAtMs - clock.offsetMs,
      },
      desiredPositionMs,
      driftMs,
      memory: { ...memory, correctingRate: false },
    };
  }

  if (unsafeToCorrect) {
    return normalRateAction(observed, desiredPositionMs, memory);
  }

  if (observed.paused) {
    if (Math.abs(driftMs) > ROOM_POLICY.deadbandMs) {
      return {
        action: { kind: "seek", positionMs: desiredPositionMs },
        desiredPositionMs,
        driftMs,
        memory: { ...memory, lastHardSeekAtMs: localNowMs, correctingRate: false },
      };
    }
    return {
      action: { kind: "play" },
      desiredPositionMs,
      driftMs,
      memory: { ...memory, correctingRate: false },
    };
  }

  const absoluteDriftMs = Math.abs(driftMs);
  const rateExitThresholdMs = ROOM_POLICY.deadbandMs / 2;
  if (
    absoluteDriftMs <= ROOM_POLICY.deadbandMs &&
    (!memory.correctingRate || absoluteDriftMs <= rateExitThresholdMs)
  ) {
    return normalRateAction(observed, desiredPositionMs, memory);
  }

  const hardSeekAvailable =
    snapshot.reason === "host_seeked" ||
    memory.lastHardSeekAtMs === null ||
    localNowMs - memory.lastHardSeekAtMs >= ROOM_POLICY.hardSeekCooldownMs;
  if (absoluteDriftMs >= ROOM_POLICY.hardSeekMs && hardSeekAvailable) {
    return {
      action: { kind: "seek", positionMs: desiredPositionMs },
      desiredPositionMs,
      driftMs,
      memory: { lastHardSeekAtMs: localNowMs, correctingRate: false },
    };
  }

  const ratio = Math.min(
    1,
    absoluteDriftMs / ROOM_POLICY.hardSeekMs
  );
  const correction = (ROOM_POLICY.maxRate - 1) * ratio;
  const rate = Math.min(
    ROOM_POLICY.maxRate,
    Math.max(ROOM_POLICY.minRate, 1 + Math.sign(driftMs) * correction)
  );
  return {
    action: { kind: "rate", rate },
    desiredPositionMs,
    driftMs,
    memory: { ...memory, correctingRate: true },
  };
}