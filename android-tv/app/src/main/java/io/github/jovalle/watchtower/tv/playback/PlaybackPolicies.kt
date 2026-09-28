package io.github.jovalle.watchtower.tv.playback

import androidx.media3.common.Player
import io.github.jovalle.watchtower.tv.api.Marker

enum class PlaybackRouteMode { SOLO, ROOM, TERMINAL_ROOM }

fun playbackRouteMode(roomId: String?, hasActiveRoomSession: Boolean): PlaybackRouteMode = when {
    roomId == null -> PlaybackRouteMode.SOLO
    hasActiveRoomSession -> PlaybackRouteMode.ROOM
    else -> PlaybackRouteMode.TERMINAL_ROOM
}

data class LocalInterruptionDecision(
    val interrupted: Boolean,
    val reconcile: Boolean,
    val ready: Boolean,
)

fun localInterruptionDecision(
    lifecycleStopped: Boolean,
    playbackSuppressionReason: Int,
    playWhenReadyChangeReason: Int?,
    transportInterruptionLatched: Boolean,
): LocalInterruptionDecision {
    val transportInterrupted = transportInterruptionLatched || playWhenReadyChangeReason in setOf(
        Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS,
        Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY,
    )
    val interrupted = lifecycleStopped || playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE || transportInterrupted
    return LocalInterruptionDecision(interrupted, reconcile = !interrupted, ready = !interrupted)
}

sealed interface PlaybackIntent {
    data object Play : PlaybackIntent
    data object Pause : PlaybackIntent
    data object Toggle : PlaybackIntent
    data class SeekTo(val positionMs: Long) : PlaybackIntent
    data class SeekBy(val deltaMs: Long) : PlaybackIntent
    data object Next : PlaybackIntent
    data object Previous : PlaybackIntent
    data object Stop : PlaybackIntent
    data object StartOver : PlaybackIntent
}

sealed interface AuthorityDecision {
    data object Allow : AuthorityDecision
    data object Handled : AuthorityDecision
    data class Deny(val reason: String) : AuthorityDecision
    data class Redirect(val intent: PlaybackIntent) : AuthorityDecision
}

fun interface TransportAuthority {
    fun authorize(intent: PlaybackIntent): AuthorityDecision

    /** Automatic actions (auto-skip, autoplay next); a room authority denies these so clients never advance independently. */
    fun authorizeAutomatic(intent: PlaybackIntent): AuthorityDecision = authorize(intent)
}

object SoloAuthority : TransportAuthority {
    override fun authorize(intent: PlaybackIntent) = AuthorityDecision.Allow
}

class PlaybackIntentGate(
    private val authority: TransportAuthority,
    private val execute: (PlaybackIntent) -> Unit,
) {
    fun submitUserIntent(intent: PlaybackIntent): AuthorityDecision = dispatch(intent, authority.authorize(intent))

    fun submitAutomaticIntent(intent: PlaybackIntent): AuthorityDecision = dispatch(intent, authority.authorizeAutomatic(intent))

    private fun dispatch(intent: PlaybackIntent, decision: AuthorityDecision): AuthorityDecision {
        when (decision) {
            AuthorityDecision.Allow -> execute(intent)
            AuthorityDecision.Handled -> Unit
            is AuthorityDecision.Redirect -> execute(decision.intent)
            is AuthorityDecision.Deny -> Unit
        }
        return decision
    }

    fun applyState(block: () -> Unit) = block()
}

class ScrubController(
    private val baseStepMs: Long = 10_000,
) {
    private var originMs = 0L
    private var previewMs: Long? = null
    private var repeatCount = 0

    fun begin(positionMs: Long) {
        originMs = positionMs
        previewMs = positionMs
        repeatCount = 0
    }

    fun repeat(direction: Int, durationMs: Long): Long {
        require(direction == -1 || direction == 1)
        repeatCount += 1
        val multiplier = when {
            repeatCount >= 12 -> 6
            repeatCount >= 5 -> 3
            else -> 1
        }
        val next = (requireNotNull(previewMs) + direction * baseStepMs * multiplier).coerceIn(0, durationMs)
        previewMs = next
        return next
    }

    fun commit(): Long? = previewMs?.also { previewMs = null }
    fun cancel() { previewMs = null }
    fun preview(): Long? = previewMs
}

data class NextCountdown(val startedAtMs: Long, val deadlineMs: Long)

class BingePolicy(private val countdownDurationMs: Long = 10_000) {
    private val skippedMarkers = mutableSetOf<Pair<Long, Long>>()

    fun skipTarget(positionMs: Long, markers: List<Marker>, autoSkipIntro: Boolean): Long? {
        if (!autoSkipIntro) return null
        val marker = markers.firstOrNull { it.type == "intro" && positionMs in it.startMs until it.endMs } ?: return null
        return marker.endMs.takeIf { skippedMarkers.add(marker.startMs to marker.endMs) }
    }

    fun nextCountdown(
        positionMs: Long,
        durationMs: Long,
        markers: List<Marker>,
        hasNext: Boolean,
        autoPlayNext: Boolean,
        nowMs: Long,
    ): NextCountdown? {
        if (!hasNext || !autoPlayNext) return null
        val creditsStart = markers.filter { it.type == "credits" }.minOfOrNull(Marker::startMs)
            ?: (durationMs - 30_000).coerceAtLeast(0)
        return if (positionMs >= creditsStart) NextCountdown(nowMs, nowMs + countdownDurationMs) else null
    }
}

enum class RecoveryAction { DECODER_FALLBACK, RETRY_HLS, SHOW_ERROR }

class RecoveryPolicy {
    private var decoderFallbackUsed = false
    private var hlsRetryUsed = false

    fun onFailure(method: String): RecoveryAction = when {
        method == "direct_play" && !decoderFallbackUsed -> {
            decoderFallbackUsed = true
            RecoveryAction.DECODER_FALLBACK
        }
        method != "direct_play" && !hlsRetryUsed -> {
            hlsRetryUsed = true
            RecoveryAction.RETRY_HLS
        }
        else -> RecoveryAction.SHOW_ERROR
    }
}