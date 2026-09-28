package io.github.jovalle.watchtower.tv.rooms

import androidx.media3.exoplayer.ExoPlayer
import androidx.test.platform.app.InstrumentationRegistry
import io.github.jovalle.watchtower.tv.playback.GatedPlayer
import io.github.jovalle.watchtower.tv.playback.PlaybackIntent
import io.github.jovalle.watchtower.tv.playback.PlaybackIntentGate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class RoomGatedPlayerTest {
    @Test fun mediaSessionFacingCommandsBecomeRoomCommandsWithoutLocalPlayback() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val commands = mutableListOf<RoomCommand>()
        var leaveRequests = 0
        var localExecutions = 0

        instrumentation.runOnMainSync {
            val underlying = ExoPlayer.Builder(instrumentation.targetContext).build()
            try {
                val authority = RoomAuthority(
                    state = ::hostState,
                    positionMs = { 20_000 },
                    send = commands::add,
                    requestLeave = { leaveRequests++ },
                )
                val gated = GatedPlayer(
                    underlying,
                    PlaybackIntentGate(authority) { _: PlaybackIntent -> localExecutions++ },
                ) { _, position -> position }

                gated.play()
                gated.seekTo(42_000)
                gated.stop()

                assertFalse(underlying.playWhenReady)
            } finally {
                underlying.release()
            }
        }

        assertEquals(listOf(RoomCommand.Play, RoomCommand.Seek(42_000)), commands)
        assertEquals(1, leaveRequests)
        assertEquals(0, localExecutions)
    }

    private fun hostState(): RoomUiState {
        val participantId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
        return RoomUiState(
            status = RoomConnectionStatus.CONNECTED,
            membership = RoomMembership(participantId, 1, 1, 1),
            snapshot = RoomSnapshot(
                1, "8e2f7a64-5b1c-4d3e-9f80-1a2b3c4d5e6f", "6f1c1d52-3f0e-4c7a-9d51-0d1b2c3a4e5f",
                1, 1, 1, 1, 1, participantId, "paused", "created", false, null, RoomPolicyState(true),
                MediaIdentity("server", "42", "7", "9"), 100_000, RoomAnchor(0, 1, 1), emptyList(),
            ),
        )
    }
}