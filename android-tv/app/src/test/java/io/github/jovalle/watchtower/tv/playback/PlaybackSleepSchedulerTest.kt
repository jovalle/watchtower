@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package io.github.jovalle.watchtower.tv.playback

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackSleepSchedulerTest {
    @Test fun timerExpiresOnceAtItsElapsedDeadline() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            var calls = 0
            backgroundScope.launchPlaybackSleepTimer(900_000, { testScheduler.currentTime }) { calls++ }
            runCurrent()
            advanceTimeBy(899_999)
            runCurrent()
            assertEquals(0, calls)
            advanceTimeBy(1)
            runCurrent()
            assertEquals(1, calls)
            advanceTimeBy(900_000)
            runCurrent()
            assertEquals(1, calls)
        } finally { Dispatchers.resetMain() }
    }

    @Test fun cancelledTimerNeverStopsTheNextPlayback() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            var calls = 0
            val job = backgroundScope.launchPlaybackSleepTimer(900_000, { testScheduler.currentTime }) { calls++ }
            runCurrent()
            job.cancel()
            advanceTimeBy(900_000)
            runCurrent()
            assertEquals(0, calls)
        } finally { Dispatchers.resetMain() }
    }
}
