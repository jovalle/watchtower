package io.github.jovalle.watchtower.tv.playback

import io.github.jovalle.watchtower.tv.api.ApiException
import io.github.jovalle.watchtower.tv.api.StopPlaybackRequest
import io.github.jovalle.watchtower.tv.api.TimelineRequest
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull

interface PlaybackProgressTransport {
    suspend fun timeline(playbackId: String, request: TimelineRequest)
    suspend fun heartbeat(playbackId: String)
    suspend fun stop(playbackId: String, request: StopPlaybackRequest)
}

class ProgressReporter(
    private val playbackId: String,
    private val durationMs: Long,
    private val timelineIntervalMs: Long,
    private val heartbeatIntervalMs: Long,
    private val scope: CoroutineScope,
    private val transport: PlaybackProgressTransport,
    private val positionMs: () -> Long,
    private val onSessionExpired: (Long) -> Unit = {},
    private val retryDelaysMs: List<Long> = listOf(250, 1_000),
) {
    private val mutex = Mutex()
    private var active = true
    private var state = "paused"
    private var sequence = 0L
    private var timelineJob: Job? = null
    private var heartbeatJob: Job? = null

    fun start() {
        timelineJob = scope.launch {
            while (isActive && active) {
                delay(timelineIntervalMs.coerceAtLeast(250))
                if (state == "playing") reportNow()
            }
        }
        heartbeatJob = scope.launch {
            while (isActive && active) {
                delay(heartbeatIntervalMs.coerceAtLeast(250))
                retry { transport.heartbeat(playbackId) }
            }
        }
    }

    suspend fun transition(newState: String) {
        require(newState == "playing" || newState == "paused")
        if (!active || state == newState) return
        state = newState
        reportNow()
    }

    suspend fun seekCompleted() = reportNow()

    suspend fun reportNow() {
        mutex.withLock {
            if (!active) return
            val observed = positionMs().coerceIn(0, durationMs)
            val request = TimelineRequest(state, observed, durationMs, ++sequence)
            retry {
                if (active) transport.timeline(playbackId, request)
            }
        }
    }

    fun markReplaced() {
        active = false
        timelineJob?.cancel()
        heartbeatJob?.cancel()
    }

    /** [finalPositionMs] must be read on the player thread before the player is released. */
    suspend fun stopFinal(finalPositionMs: Long, timeoutMs: Long = 5_000) {
        mutex.withLock {
            if (!active) return
            active = false
            timelineJob?.cancel()
            heartbeatJob?.cancel()
            val request = StopPlaybackRequest(finalPositionMs.coerceIn(0, durationMs), durationMs, ++sequence)
            withTimeoutOrNull(timeoutMs) { retry(stopping = true) { transport.stop(playbackId, request) } }
        }
    }

    private suspend fun retry(stopping: Boolean = false, block: suspend () -> Unit) {
        for (attempt in 0..retryDelaysMs.size) {
            if (!stopping && !active && attempt > 0) return
            try {
                block()
                return
            } catch (error: IOException) {
                if (error is ApiException && error.status == 409 && error.code == "playback_session_expired") {
                    if (!stopping && active) {
                        active = false
                        onSessionExpired(positionMs().coerceIn(0, durationMs))
                    }
                    return
                }
                if (error is ApiException && !error.retryable) return
                if (attempt == retryDelaysMs.size) return
                delay(maxOf(retryDelaysMs[attempt], (error as? ApiException)?.retryAfterMs ?: 0))
            }
        }
    }
}