package io.github.jovalle.watchtower.tv.playback

import io.github.jovalle.watchtower.tv.api.StopPlaybackRequest
import io.github.jovalle.watchtower.tv.api.TimelineRequest
import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProgressReporterTest {
    @Test fun `transitions periodic reports seek and final stop use increasing sequence`() = runTest {
        val fake = FakeTransport()
        var position = 1_000L
        val reporter = ProgressReporter("p1", 10_000, 1_000, 5_000, this, fake, { position })
        reporter.start()

        reporter.transition("playing")
        position = 2_000
        advanceTimeBy(1_000)
        runCurrent()
        position = 3_000
        reporter.seekCompleted()
        reporter.transition("paused")
        reporter.stopFinal(3_500)

        assertEquals(listOf(1L, 2L, 3L, 4L), fake.timeline.map { it.sequence })
        assertEquals(listOf(1_000L, 2_000L, 3_000L, 3_000L), fake.timeline.map { it.positionMs })
        assertEquals(5L, fake.stops.single().sequence)
        assertEquals(3_500L, fake.stops.single().positionMs)
    }

    @Test fun `final stop uses the captured position and never reads the released player`() = runTest {
        val fake = FakeTransport(stopFailure = ApiExceptionFactory.expired())
        var expiredCallbacks = 0
        val reporter = ProgressReporter(
            "p1", 10_000, 1_000, 5_000, this, fake,
            positionMs = { error("player already released") },
            onSessionExpired = { expiredCallbacks += 1 },
        )

        reporter.stopFinal(9_000)

        assertEquals(9_000L, fake.stopAttempts.single().positionMs)
        assertEquals(0, expiredCallbacks)
    }

    @Test fun `replacement drops queued reports`() = runTest {
        val fake = FakeTransport()
        val reporter = ProgressReporter("p1", 10_000, 1_000, 5_000, this, fake, { 500 })
        reporter.start()
        reporter.markReplaced()

        advanceUntilIdle()
        reporter.reportNow()

        assertEquals(0, fake.timeline.size)
        assertEquals(0, fake.heartbeats)
    }

    @Test fun `transient timeline failure retries with the same sequence`() = runTest {
        val fake = FakeTransport(failTimeline = 1)
        val reporter = ProgressReporter("p1", 10_000, 1_000, 5_000, this, fake, { 500 }, retryDelaysMs = listOf(100))

        val report = async { reporter.transition("playing") }
        advanceUntilIdle()
        report.await()

        assertEquals(listOf(1L), fake.timeline.map { it.sequence })
        assertEquals(2, fake.timelineAttempts)
    }

    private object ApiExceptionFactory {
        fun expired() = io.github.jovalle.watchtower.tv.api.ApiException(409, "playback_session_expired", "expired", false, null, null)
    }

    private class FakeTransport(private var failTimeline: Int = 0, private val stopFailure: IOException? = null) : PlaybackProgressTransport {
        val timeline = mutableListOf<TimelineRequest>()
        val stops = mutableListOf<StopPlaybackRequest>()
        val stopAttempts = mutableListOf<StopPlaybackRequest>()
        var timelineAttempts = 0
        var heartbeats = 0

        override suspend fun timeline(playbackId: String, request: TimelineRequest) {
            timelineAttempts += 1
            if (failTimeline-- > 0) throw IOException("temporary")
            timeline += request
        }

        override suspend fun heartbeat(playbackId: String) {
            heartbeats += 1
        }

        override suspend fun stop(playbackId: String, request: StopPlaybackRequest) {
            stopAttempts += request
            stopFailure?.let { throw it }
            stops += request
        }
    }
}