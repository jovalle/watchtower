package io.github.jovalle.watchtower.tv.playback

import io.github.jovalle.watchtower.tv.api.Marker
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlaybackPoliciesTest {
    @Test fun `solo authority allows transport intents`() {
        val executed = mutableListOf<PlaybackIntent>()
        val gate = PlaybackIntentGate(SoloAuthority, executed::add)

        assertEquals(AuthorityDecision.Allow, gate.submitUserIntent(PlaybackIntent.SeekTo(42)))
        assertEquals(listOf(PlaybackIntent.SeekTo(42)), executed)
    }

    @Test fun `denied authority blocks keys and media session commands`() {
        val executed = mutableListOf<PlaybackIntent>()
        val gate = PlaybackIntentGate(TransportAuthority { AuthorityDecision.Deny("host only") }, executed::add)

        assertEquals(AuthorityDecision.Deny("host only"), gate.submitUserIntent(PlaybackIntent.Play))
        assertEquals(AuthorityDecision.Deny("host only"), gate.submitUserIntent(PlaybackIntent.SeekBy(10_000)))
        assertEquals(emptyList<PlaybackIntent>(), executed)
    }

    @Test fun `state application does not emit an intent`() {
        val executed = mutableListOf<PlaybackIntent>()
        var applied = false
        val gate = PlaybackIntentGate(SoloAuthority, executed::add)

        gate.applyState { applied = true }

        assertEquals(true, applied)
        assertEquals(emptyList<PlaybackIntent>(), executed)
    }

    @Test fun `automatic skip and next are authorized separately from user intents`() {
        val executed = mutableListOf<PlaybackIntent>()
        val restricted = object : TransportAuthority {
            override fun authorize(intent: PlaybackIntent) = AuthorityDecision.Allow
            override fun authorizeAutomatic(intent: PlaybackIntent) = AuthorityDecision.Deny("automatic advance disabled")
        }
        val gate = PlaybackIntentGate(restricted, executed::add)

        assertEquals(AuthorityDecision.Deny("automatic advance disabled"), gate.submitAutomaticIntent(PlaybackIntent.Next))
        assertEquals(AuthorityDecision.Deny("automatic advance disabled"), gate.submitAutomaticIntent(PlaybackIntent.SeekTo(90_000)))
        assertEquals(AuthorityDecision.Allow, gate.submitUserIntent(PlaybackIntent.Next))
        assertEquals(listOf<PlaybackIntent>(PlaybackIntent.Next), executed)
    }

    @Test fun `solo authority allows automatic intents by default`() {
        val executed = mutableListOf<PlaybackIntent>()
        PlaybackIntentGate(SoloAuthority, executed::add).submitAutomaticIntent(PlaybackIntent.SeekTo(90_000))
        assertEquals(listOf<PlaybackIntent>(PlaybackIntent.SeekTo(90_000)), executed)
    }

    @Test fun `repeat acceleration commits one final seek`() {
        val scrub = ScrubController()
        scrub.begin(60_000)
        repeat(5) { scrub.repeat(1, 300_000) }

        assertEquals(130_000L, scrub.preview())
        assertEquals(130_000L, scrub.commit())
        assertNull(scrub.commit())
    }

    @Test fun `intro marker auto skips only once`() {
        val policy = BingePolicy()
        val markers = listOf(Marker("intro", 30_000, 90_000, false))

        assertEquals(90_000L, policy.skipTarget(45_000, markers, true))
        assertNull(policy.skipTarget(50_000, markers, true))
        assertNull(policy.skipTarget(45_000, markers, false))
    }

    @Test fun `next countdown uses credits or final thirty seconds`() {
        val policy = BingePolicy(10_000)

        assertEquals(110_000L, policy.nextCountdown(91_000, 120_000, emptyList(), true, true, 100_000)?.deadlineMs)
        assertNull(policy.nextCountdown(89_000, 120_000, emptyList(), true, true, 100_000))
        assertEquals(110_000L, policy.nextCountdown(81_000, 120_000, listOf(Marker("credits", 80_000, 120_000, true)), true, true, 100_000)?.deadlineMs)
    }

    @Test fun `fallback chain is bounded`() {
        val direct = RecoveryPolicy()
        assertEquals(RecoveryAction.DECODER_FALLBACK, direct.onFailure("direct_play"))
        assertEquals(RecoveryAction.SHOW_ERROR, direct.onFailure("direct_play"))

        val hls = RecoveryPolicy()
        assertEquals(RecoveryAction.RETRY_HLS, hls.onFailure("transcode"))
        assertEquals(RecoveryAction.SHOW_ERROR, hls.onFailure("transcode"))
    }

    @Test fun `back from settings children returns to their originating row before the player`() {
        listOf(PlayerMenu.QUALITY, PlayerMenu.AUDIO, PlayerMenu.SUBTITLES, PlayerMenu.DIAGNOSTICS).forEach { child ->
            val nested = PlaybackUiState(controlsVisible = false).togglePlayerMenu(PlayerMenu.MORE).togglePlayerMenu(child)
            assertEquals(PlayerMenu.MORE, nested.menuParent)

            val returned = nested.backFromPlayerMenu()
            assertEquals(PlayerMenu.MORE, returned.menu)
            assertEquals(child, returned.menuReturnFocus)
            assertNull(returned.menuParent)
            assertEquals(true, returned.controlsVisible)

            val closed = returned.backFromPlayerMenu()
            assertNull(closed.menu)
            assertNull(closed.menuReturnFocus)
            assertNull(closed.menuParent)
        }
    }

    @Test fun `direct subtitles back returns straight to the player`() {
        val opened = PlaybackUiState().togglePlayerMenu(PlayerMenu.SUBTITLES)
        assertNull(opened.menuParent)
        val closed = opened.backFromPlayerMenu()
        assertNull(closed.menu)
        assertNull(closed.menuReturnFocus)
        assertEquals(true, closed.controlsVisible)
    }
}
