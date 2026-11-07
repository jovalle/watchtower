package io.github.jovalle.watchtower.tv.playback

import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackOptionsPolicyTest {
    @Test fun supportedSpeedsMatchTheReferenceAndRejectCorruptPreferences() {
        val speeds = listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f)
        assertEquals(speeds, PLAYBACK_SPEEDS)
        speeds.forEach { assertEquals(it, validatedPlaybackSpeed(it)) }
        listOf(Float.NaN, Float.POSITIVE_INFINITY, -1f, 0f, 9f).forEach {
            assertEquals(1f, validatedPlaybackSpeed(it))
        }
    }

    @Test fun timedChoicesUseElapsedTimeAndExpireAtTheDeadline() {
        listOf(SleepTimerOption.FIFTEEN_MINUTES, SleepTimerOption.THIRTY_MINUTES, SleepTimerOption.ONE_HOUR, SleepTimerOption.TWO_HOURS).forEach { option ->
            val timer = SleepTimerState().select(option, 12_345)
            val deadline = 12_345 + requireNotNull(option.minutes) * 60_000L
            assertEquals(deadline, timer.deadlineElapsedMs)
            assertNull(timer.automaticIntent(deadline - 1))
            assertEquals(PlaybackIntent.Stop, timer.automaticIntent(deadline))
            assertFalse(timer.suppressAutoNext)
        }
    }

    @Test fun offCancelsATimerAndChangingItUsesTheNewSelectionTime() {
        val old = SleepTimerState(SleepTimerOption.FIFTEEN_MINUTES, 900_100)
        assertEquals(SleepTimerState(), old.select(SleepTimerOption.OFF, 500))
        assertEquals(1_800_500L, old.select(SleepTimerOption.THIRTY_MINUTES, 500).deadlineElapsedMs)
    }

    @Test fun afterThisItemSuppressesAutoplayAndStopsOnlyAtItemEnd() {
        val timer = SleepTimerState().select(SleepTimerOption.AFTER_THIS_ITEM, 500)
        assertTrue(timer.suppressAutoNext)
        assertNull(timer.deadlineElapsedMs)
        assertNull(timer.automaticIntent(Long.MAX_VALUE, itemEnded = false))
        assertEquals(PlaybackIntent.Stop, timer.automaticIntent(500, itemEnded = true))
    }

    @Test fun deadlineSurvivesNextPreviousRoutesWithoutRestartingTheTimer() {
        val timer = SleepTimerState(SleepTimerOption.FIFTEEN_MINUTES, 900_123)
        val next = timer.nextRoute("next")
        assertEquals(900_123L, next.sleepDeadlineElapsedMs)
        assertEquals(15, next.sleepTimerMinutes)
        val previous = next.restoredSleepTimer().nextRoute("previous")
        assertEquals(timer, previous.restoredSleepTimer())
        assertEquals(PlaybackIntent.Stop, previous.restoredSleepTimer().automaticIntent(900_123))
    }

    @Test fun afterThisItemDoesNotLeakIntoTheNextExplicitlySelectedItem() {
        val timer = SleepTimerState(SleepTimerOption.AFTER_THIS_ITEM)
        assertEquals(PlayerRoute("next"), timer.nextRoute("next"))
        assertEquals(SleepTimerState(), timer.nextRoute("next").restoredSleepTimer())
    }

    @Test fun timerExpiryUsesTheAutomaticAuthorityGate() {
        var automaticCalls = 0
        val executed = mutableListOf<PlaybackIntent>()
        val authority = object : TransportAuthority {
            override fun authorize(intent: PlaybackIntent) = AuthorityDecision.Allow
            override fun authorizeAutomatic(intent: PlaybackIntent): AuthorityDecision {
                automaticCalls++
                return AuthorityDecision.Deny("automatic transport disabled")
            }
        }
        val timer = SleepTimerState(SleepTimerOption.FIFTEEN_MINUTES, 100)
        val gate = PlaybackIntentGate(authority, executed::add)
        timer.automaticIntent(100)?.let(gate::submitAutomaticIntent)
        assertEquals(1, automaticCalls)
        assertTrue(executed.isEmpty())
    }

    @Test fun nestedOptionsBackRestoresEachParentAndOriginatingRow() {
        listOf(PlayerMenu.SPEED, PlayerMenu.SLEEP, PlayerMenu.DISPLAY, PlayerMenu.DIAGNOSTICS).forEach { child ->
            val nested = PlaybackUiState().togglePlayerMenu(PlayerMenu.MORE).togglePlayerMenu(PlayerMenu.OPTIONS).togglePlayerMenu(child)
            assertEquals(listOf(PlayerMenu.MORE, PlayerMenu.OPTIONS), nested.menuBackStack)
            val options = nested.backFromPlayerMenu()
            assertEquals(PlayerMenu.OPTIONS, options.menu)
            assertEquals(child, options.menuReturnFocus)
            val settings = options.backFromPlayerMenu()
            assertEquals(PlayerMenu.MORE, settings.menu)
            assertEquals(PlayerMenu.OPTIONS, settings.menuReturnFocus)
            assertNull(settings.backFromPlayerMenu().menu)
        }
    }
}
