package io.github.jovalle.watchtower.tv.rooms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RoomSyncTest {
    @Test fun `selects valid lowest RTT sample and retains uncertainty`() {
        val epoch = "22222222-2222-4222-8222-222222222222"
        val estimate = selectClockEstimate(
            listOf(
                ClockProbe(ClockSample(1, epoch, 130, 135), 100, 165),
                ClockProbe(ClockSample(1, epoch, 225, 230), 200, 245),
                ClockProbe(ClockSample(1, epoch, 1, 2), 100, 90),
            ),
        )
        assertEquals(ClockEstimate(epoch, 5.0, 40.0, 20.0, 245), estimate)
        assertNull(selectClockEstimate(listOf(ClockProbe(ClockSample(1, epoch, 0, 0), 0, 10_001))))
    }

    @Test fun `does nothing inside deadband`() {
        assertEquals(ReconciliationAction.None, reconcileRoomPlayback(snapshot(), observed(10_900), clock(), 2_000).action)
    }

    @Test fun `uses bounded rate correction inside hard seek band`() {
        assertEquals(ReconciliationAction.Rate(1.01), reconcileRoomPlayback(snapshot(), observed(10_500), clock(), 2_000).action)
    }

    @Test fun `hard seeks large drift and respects cooldown`() {
        val first = reconcileRoomPlayback(snapshot(), observed(8_000), clock(), 2_000)
        assertEquals(ReconciliationAction.Seek(11_000), first.action)
        assertEquals(ReconciliationAction.Rate(1.03), reconcileRoomPlayback(snapshot(), observed(8_000), clock(), 3_000, first.memory).action)
        assertEquals(
            ReconciliationAction.Seek(12_000),
            reconcileRoomPlayback(snapshot(reason = "host_seeked"), observed(8_000), clock(), 3_000, first.memory).action,
        )
    }

    @Test fun `holds and seeks fixed target while paused`() {
        val paused = snapshot(phase = "paused", anchor = RoomAnchor(30_000, 1_000, 1))
        assertEquals(ReconciliationAction.HoldPaused, reconcileRoomPlayback(paused, observed(30_000), clock(), 4_000).action)
        assertEquals(
            ReconciliationAction.Seek(30_000),
            reconcileRoomPlayback(paused, observed(28_000, paused = true), clock(), 4_000).action,
        )
    }

    @Test fun `maps future server anchor to local time without starting early`() {
        val future = snapshot(anchor = RoomAnchor(10_000, 5_000, 1))
        assertEquals(
            ReconciliationAction.SchedulePlay(4_500.0),
            reconcileRoomPlayback(future, observed(10_000, paused = true), clock(offsetMs = 500.0), 4_000).action,
        )
    }

    @Test fun `restores playback rate on pause buffering and replacement`() {
        val cases = listOf(
            snapshot(phase = "paused") to observed(10_000, paused = true, playbackRate = 1.02),
            snapshot() to observed(11_000, buffering = true, playbackRate = 1.02),
            snapshot() to observed(11_000, replacingSource = true, playbackRate = 1.02),
        )
        cases.forEach { (room, media) ->
            assertEquals(ReconciliationAction.Rate(1.0), reconcileRoomPlayback(room, media, clock(), 2_000).action)
        }
    }

    private fun clock(offsetMs: Double = 0.0) = ClockEstimate("22222222-2222-4222-8222-222222222222", offsetMs, 0.0, 0.0, 0)

    private fun observed(
        positionMs: Long,
        paused: Boolean = false,
        buffering: Boolean = false,
        replacingSource: Boolean = false,
        playbackRate: Double = 1.0,
    ) = ObservedMediaState(positionMs, paused, buffering, false, playbackRate, replacingSource)

    private fun snapshot(
        phase: String = "playing",
        reason: String? = "host_played",
        anchor: RoomAnchor = RoomAnchor(10_000, 1_000, 1),
    ) = RoomSnapshot(
        protocolVersion = 1,
        roomId = "11111111-1111-4111-8111-111111111111",
        epoch = "22222222-2222-4222-8222-222222222222",
        revision = 1,
        presenceRevision = 1,
        mediaGeneration = 1,
        preparationGeneration = 1,
        serverNowMs = 1_000,
        hostParticipantId = "33333333-3333-4333-8333-333333333333",
        phase = phase,
        reason = reason,
        resumeAfterPrepare = false,
        nextCountdown = null,
        policy = RoomPolicyState(true),
        media = MediaIdentity("server", "42", "7", "9"),
        durationMs = 120_000,
        anchor = anchor,
        participants = emptyList(),
    )
}