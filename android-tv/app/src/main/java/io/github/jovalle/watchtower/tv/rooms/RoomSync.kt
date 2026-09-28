package io.github.jovalle.watchtower.tv.rooms

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sign

const val MAX_CLOCK_RTT_MS = 10_000L

data class ClockProbe(val sample: ClockSample, val clientSentAtMs: Long, val clientReceivedAtMs: Long)
data class ClockEstimate(
    val epoch: String,
    val offsetMs: Double,
    val rttMs: Double,
    val uncertaintyMs: Double,
    val sampledAtClientMs: Long,
)

data class ObservedMediaState(
    val positionMs: Long,
    val paused: Boolean,
    val buffering: Boolean,
    val seeking: Boolean,
    val playbackRate: Double,
    val replacingSource: Boolean = false,
    val error: Boolean = false,
)

data class ReconciliationMemory(val lastHardSeekAtMs: Long? = null, val correctingRate: Boolean = false)

sealed interface ReconciliationAction {
    data object HoldPaused : ReconciliationAction
    data class SchedulePlay(val localTimeMs: Double) : ReconciliationAction
    data object Play : ReconciliationAction
    data class Seek(val positionMs: Long) : ReconciliationAction
    data class Rate(val rate: Double) : ReconciliationAction
    data object None : ReconciliationAction
}

data class ReconciliationDecision(
    val action: ReconciliationAction,
    val desiredPositionMs: Long,
    val driftMs: Long,
    val memory: ReconciliationMemory,
)

fun selectClockEstimate(probes: List<ClockProbe>, expectedEpoch: String? = null): ClockEstimate? = probes.mapNotNull { probe ->
    if (expectedEpoch != null && probe.sample.epoch != expectedEpoch) return@mapNotNull null
    val estimate = estimateClock(probe.sample, probe.clientSentAtMs, probe.clientReceivedAtMs) ?: return@mapNotNull null
    if (estimate.rttMs > MAX_CLOCK_RTT_MS) return@mapNotNull null
    ClockEstimate(
        epoch = probe.sample.epoch,
        offsetMs = estimate.offsetMs,
        rttMs = estimate.rttMs,
        uncertaintyMs = estimate.uncertaintyMs,
        sampledAtClientMs = probe.clientReceivedAtMs,
    )
}.minByOrNull(ClockEstimate::rttMs)

fun estimatedServerNowMs(estimate: ClockEstimate, localNowMs: Long): Double = localNowMs + estimate.offsetMs

private fun normalRateAction(
    observed: ObservedMediaState,
    desiredPositionMs: Long,
    memory: ReconciliationMemory,
) = ReconciliationDecision(
    action = if (observed.playbackRate != 1.0) ReconciliationAction.Rate(1.0) else ReconciliationAction.None,
    desiredPositionMs = desiredPositionMs,
    driftMs = desiredPositionMs - observed.positionMs,
    memory = memory.copy(correctingRate = false),
)

fun reconcileRoomPlayback(
    snapshot: RoomSnapshot,
    observed: ObservedMediaState,
    clock: ClockEstimate,
    localNowMs: Long,
    memory: ReconciliationMemory = ReconciliationMemory(),
): ReconciliationDecision {
    val serverNowMs = estimatedServerNowMs(clock, localNowMs)
    val desiredPositionMs = targetPositionMs(snapshot, serverNowMs)
    val driftMs = desiredPositionMs - observed.positionMs
    val unsafeToCorrect = observed.buffering || observed.seeking || observed.replacingSource || observed.error

    if (snapshot.phase != "playing") {
        if (!observed.paused) {
            return ReconciliationDecision(
                ReconciliationAction.HoldPaused, desiredPositionMs, driftMs, memory.copy(correctingRate = false),
            )
        }
        if (observed.playbackRate != 1.0) return normalRateAction(observed, desiredPositionMs, memory)
        if (!unsafeToCorrect && abs(driftMs) > RoomPolicy.DEAD_BAND_MS) {
            return ReconciliationDecision(
                ReconciliationAction.Seek(desiredPositionMs),
                desiredPositionMs,
                driftMs,
                memory.copy(lastHardSeekAtMs = localNowMs, correctingRate = false),
            )
        }
        return normalRateAction(observed, desiredPositionMs, memory)
    }

    if (serverNowMs < snapshot.anchor.effectiveAtMs) {
        if (!observed.paused) {
            return ReconciliationDecision(
                ReconciliationAction.HoldPaused, desiredPositionMs, driftMs, memory.copy(correctingRate = false),
            )
        }
        if (observed.playbackRate != 1.0) return normalRateAction(observed, desiredPositionMs, memory)
        return ReconciliationDecision(
            ReconciliationAction.SchedulePlay(snapshot.anchor.effectiveAtMs - clock.offsetMs),
            desiredPositionMs,
            driftMs,
            memory.copy(correctingRate = false),
        )
    }

    if (unsafeToCorrect) return normalRateAction(observed, desiredPositionMs, memory)
    if (observed.paused) {
        if (abs(driftMs) > RoomPolicy.DEAD_BAND_MS) {
            return ReconciliationDecision(
                ReconciliationAction.Seek(desiredPositionMs),
                desiredPositionMs,
                driftMs,
                memory.copy(lastHardSeekAtMs = localNowMs, correctingRate = false),
            )
        }
        return ReconciliationDecision(
            ReconciliationAction.Play, desiredPositionMs, driftMs, memory.copy(correctingRate = false),
        )
    }

    val absoluteDriftMs = abs(driftMs)
    val rateExitThresholdMs = RoomPolicy.DEAD_BAND_MS / 2
    if (absoluteDriftMs <= RoomPolicy.DEAD_BAND_MS && (!memory.correctingRate || absoluteDriftMs <= rateExitThresholdMs)) {
        return normalRateAction(observed, desiredPositionMs, memory)
    }

    val hardSeekAvailable = snapshot.reason == "host_seeked" || memory.lastHardSeekAtMs == null ||
        localNowMs - memory.lastHardSeekAtMs >= RoomPolicy.HARD_SEEK_COOLDOWN_MS
    if (absoluteDriftMs >= RoomPolicy.HARD_SEEK_MS && hardSeekAvailable) {
        return ReconciliationDecision(
            ReconciliationAction.Seek(desiredPositionMs),
            desiredPositionMs,
            driftMs,
            ReconciliationMemory(lastHardSeekAtMs = localNowMs, correctingRate = false),
        )
    }

    val ratio = min(1.0, absoluteDriftMs.toDouble() / RoomPolicy.HARD_SEEK_MS)
    val correction = (RoomPolicy.MAX_RATE - 1) * ratio
    val rate = min(RoomPolicy.MAX_RATE, max(RoomPolicy.MIN_RATE, 1 + driftMs.sign * correction))
    return ReconciliationDecision(
        ReconciliationAction.Rate(rate), desiredPositionMs, driftMs, memory.copy(correctingRate = true),
    )
}