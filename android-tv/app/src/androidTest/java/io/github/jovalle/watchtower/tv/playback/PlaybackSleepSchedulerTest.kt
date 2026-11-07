package io.github.jovalle.watchtower.tv.playback

import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackSleepSchedulerTest {
    @Test fun expiredRestoredTimerDoesNotExitDuringControllerCreation() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val expired = CountDownLatch(1)
        val calledInline = AtomicBoolean(false)
        lateinit var scope: CoroutineScope
        try {
            instrumentation.runOnMainSync {
                scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
                var returned = false
                scope.launchPlaybackSleepTimer(0, { 0 }) {
                    calledInline.set(!returned)
                    expired.countDown()
                }
                returned = true
            }
            assertTrue("Expired timer must still stop playback", expired.await(2, TimeUnit.SECONDS))
            assertFalse("Navigation must wait until player construction returns", calledInline.get())
        } finally { instrumentation.runOnMainSync { scope.cancel() } }
    }
}
