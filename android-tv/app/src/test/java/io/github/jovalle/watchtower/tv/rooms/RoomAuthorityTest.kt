package io.github.jovalle.watchtower.tv.rooms

import io.github.jovalle.watchtower.tv.playback.AuthorityDecision
import io.github.jovalle.watchtower.tv.playback.PlaybackIntent
import io.github.jovalle.watchtower.tv.playback.PlaybackIntentGate
import org.junit.Assert.assertEquals
import org.junit.Test

class RoomAuthorityTest {
    @Test fun `host intents become room commands and never execute locally`() {
        val commands = mutableListOf<RoomCommand>()
        val local = mutableListOf<PlaybackIntent>()
        val authority = RoomAuthority({ state(host = true) }, { 40_000 }, commands::add) {}
        val gate = PlaybackIntentGate(authority, local::add)

        assertEquals(AuthorityDecision.Handled, gate.submitUserIntent(PlaybackIntent.Play))
        gate.submitUserIntent(PlaybackIntent.SeekBy(5_000))
        gate.submitUserIntent(PlaybackIntent.Next)

        // A manual Next advances immediately (web parity); only auto-advance uses the countdown.
        assertEquals(listOf(RoomCommand.Play, RoomCommand.Seek(45_000), RoomCommand.SelectNext(0)), commands)
        assertEquals(emptyList<PlaybackIntent>(), local)
    }

    @Test fun `guest and automatic intents are denied`() {
        val commands = mutableListOf<RoomCommand>()
        val authority = RoomAuthority({ state(host = false) }, { 0 }, commands::add) {}

        assertEquals(
            AuthorityDecision.Deny("Only the room host controls playback."),
            authority.authorize(PlaybackIntent.Pause),
        )
        assertEquals(
            AuthorityDecision.Deny("Automatic skip and next are controlled by the room."),
            authority.authorizeAutomatic(PlaybackIntent.Next),
        )
        assertEquals(emptyList<RoomCommand>(), commands)
    }

    @Test fun `stop requests confirmed leave for host and guest`() {
        var leaveRequests = 0
        val authority = RoomAuthority({ state(host = false) }, { 0 }, {}, { leaveRequests++ })
        assertEquals(AuthorityDecision.Handled, authority.authorize(PlaybackIntent.Stop))
        assertEquals(1, leaveRequests)
    }

    @Test fun `authoritative state application does not echo a room command`() {
        val commands = mutableListOf<RoomCommand>()
        val local = mutableListOf<PlaybackIntent>()
        val gate = PlaybackIntentGate(RoomAuthority({ state(true) }, { 0 }, commands::add) {}, local::add)

        gate.applyState { local += PlaybackIntent.SeekTo(90_000) }

        assertEquals(emptyList<RoomCommand>(), commands)
        assertEquals(listOf(PlaybackIntent.SeekTo(90_000)), local)
    }

    private fun state(host: Boolean): RoomUiState {
        val participant = "11111111-1111-4111-8111-111111111111"
        return RoomUiState(
            status = RoomConnectionStatus.CONNECTED,
            snapshot = snapshot(hostParticipantId = if (host) participant else "22222222-2222-4222-8222-222222222222"),
            membership = RoomMembership(participant, 1, 1, 1),
        )
    }

    private fun snapshot(hostParticipantId: String) = RoomSnapshot(
        protocolVersion = 1,
        roomId = "33333333-3333-4333-8333-333333333333",
        epoch = "44444444-4444-4444-8444-444444444444",
        revision = 1,
        presenceRevision = 1,
        mediaGeneration = 1,
        preparationGeneration = 1,
        serverNowMs = 1,
        hostParticipantId = hostParticipantId,
        phase = "paused",
        reason = "created",
        resumeAfterPrepare = false,
        nextCountdown = null,
        policy = RoomPolicyState(true),
        media = MediaIdentity("server", "42", "7", "9"),
        durationMs = 100_000,
        anchor = RoomAnchor(0, 1, 1),
        participants = emptyList(),
    )
}