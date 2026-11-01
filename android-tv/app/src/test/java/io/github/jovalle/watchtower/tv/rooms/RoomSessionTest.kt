package io.github.jovalle.watchtower.tv.rooms

import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.auth.IdentityChange
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RoomSessionTest {
    @Test fun `stale command refreshes snapshot and never resends stale command`() = runTest {
        val transport = FakeRoomTransport().apply { commandFailure = RoomApiException(409, "stale_revision", "changed", snapshot(revision = 2)) }
        val session = RoomSession(identity(), ROOM_ID, envelope(), transport, backgroundScope, { testScheduler.currentTime }, ::uuid)
        session.start()

        assertFalse(session.send(RoomCommand.Play))

        assertEquals(1, transport.commands.size)
        assertEquals(1L, transport.commands.single().commandSequence)
        assertEquals(1L, transport.commands.single().expectedRevision)
        assertEquals(2L, session.state.value.snapshot?.revision)
        assertEquals("stale_revision", session.state.value.errorCode)
        session.stop()
    }

    @Test fun `presence carries playback identity generations and recovered sequence`() = runTest {
        val transport = FakeRoomTransport()
        val session = RoomSession(identity(), ROOM_ID, envelope(), transport, backgroundScope, { testScheduler.currentTime }, ::uuid)
        session.start()

        assertTrue(
            session.reportPresence(
                PresenceObservation("c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f", 42_000, ready = true, buffering = false),
            ),
        )

        assertEquals(
            PresenceReport(EPOCH, 1, 1, 1, 7, "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f", 42_000, true, false, false, null),
            transport.presences.single(),
        )
        session.stop()
    }

    @Test fun `not host command rejection stays connected and applies returned snapshot`() = runTest {
        assertAnsweredCommandRejection(403, "not_host")
    }

    @Test fun `not found command rejection stays connected and applies returned snapshot`() = runTest {
        assertAnsweredCommandRejection(404, "not_found")
    }

    @Test fun `membership ended command rejection terminates the session`() = runTest {
        val transport = FakeRoomTransport().apply {
            commandFailure = RoomApiException(410, "membership_ended", "ended")
        }
        val session = RoomSession(identity(), ROOM_ID, envelope(), transport, backgroundScope, { testScheduler.currentTime }, ::uuid)
        session.start()

        assertFalse(session.send(RoomCommand.Play))

        assertEquals(RoomConnectionStatus.ENDED, session.state.value.status)
        assertEquals("membership_ended", session.state.value.endedReason)
        assertTrue(requireNotNull(transport.stream).cancelled)
    }

    @Test fun `invitation rejection stays connected and applies returned snapshot`() = runTest {
        val transport = FakeRoomTransport().apply {
            invitationFailure = RoomApiException(403, "not_host", "host only", snapshot(revision = 2))
        }
        val session = RoomSession(identity(), ROOM_ID, envelope(), transport, backgroundScope, { testScheduler.currentTime }, ::uuid)
        session.start()

        assertFalse(session.updateInvitation("rotate"))

        assertEquals(RoomConnectionStatus.CONNECTED, session.state.value.status)
        assertEquals("not_host", session.state.value.errorCode)
        assertEquals(2L, session.state.value.snapshot?.revision)
        assertFalse(requireNotNull(transport.stream).cancelled)
        session.stop()
    }

    @Test fun `presence rate limit retries latest observation without reconnecting`() = runTest {
        val transport = FakeRoomTransport().apply {
            presenceFailures += RoomApiException(429, "rate_limited", "slow down", retryAfterMs = 1_500)
        }
        val session = RoomSession(identity(), ROOM_ID, envelope(), transport, backgroundScope, { testScheduler.currentTime }, ::uuid)
        session.start()

        assertFalse(session.reportPresence(PresenceObservation(positionMs = 1_000)))
        session.observePresence(PresenceObservation(positionMs = 2_000))
        advanceTimeBy(1_499)
        runCurrent()
        assertEquals(1, transport.presences.size)

        advanceTimeBy(1)
        runCurrent()

        assertEquals(listOf(1_000L, 2_000L), transport.presences.map { it.positionMs })
        assertEquals(RoomConnectionStatus.CONNECTED, session.state.value.status)
        assertEquals(0, session.state.value.reconnects)
        assertEquals(0, transport.recoverCalls)
        session.stop()
    }

    @Test fun `manager replacement leaves previous membership`() = runTest {
        val changes = MutableSharedFlow<IdentityChange>(extraBufferCapacity = 1)
        val transport = FakeRoomTransport()
        val manager = RoomManager(transport, backgroundScope, ::identity, { true }, changes, { testScheduler.currentTime }, ::uuid)
        manager.recover(ROOM_ID)

        manager.create(CreateMedia("42", "7", "9"), 0, true)

        assertEquals(1, transport.leaveCalls)
        assertEquals(RoomConnectionStatus.CONNECTED, requireNotNull(manager.activeSession()).state.value.status)
        manager.leave()
    }

    @Test fun `control and presence revisions advance independently and older events are dropped`() = runTest {
        val transport = FakeRoomTransport()
        val session = RoomSession(identity(), ROOM_ID, envelope(), transport, backgroundScope, { testScheduler.currentTime }, ::uuid)
        session.start()

        assertTrue(session.applySnapshot(snapshot(revision = 2, presenceRevision = 1, participantName = "control")))
        assertTrue(session.applySnapshot(snapshot(revision = 1, presenceRevision = 3, participantName = "presence")))
        assertFalse(session.applySnapshot(snapshot(revision = 1, presenceRevision = 2, participantName = "old")))

        assertEquals(2L, session.state.value.snapshot?.revision)
        assertEquals(3L, session.state.value.snapshot?.presenceRevision)
        assertEquals("presence", session.state.value.snapshot?.participants?.single()?.displayName)
        session.stop()
    }

    @Test fun `identity change cancels stream before old session can send again`() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val changes = MutableSharedFlow<IdentityChange>(extraBufferCapacity = 1)
        val transport = FakeRoomTransport()
        val old = identity(1)
        val current = arrayOf<SessionSnapshot?>(old)
        val manager = RoomManager(transport, backgroundScope, { current[0] }, { true }, changes, { testScheduler.currentTime }, ::uuid)
        manager.recover(ROOM_ID)
        runCurrent()
        val openedStream = requireNotNull(transport.stream)

        val replacement = identity(2)
        current[0] = replacement
        changes.emit(IdentityChange(old, replacement))
        runCurrent()

        assertTrue(openedStream.cancelled)
        assertEquals("identity_changed", manager.state.value.endedReason)
        assertNull(manager.activeSession())
        assertEquals(listOf(old), transport.requestIdentities.distinct())
    }

    @Test fun `stale connection recovers membership clock and event stream with virtual time`() = runTest {
        val transport = FakeRoomTransport().apply { presenceBlock = CompletableDeferred() }
        val session = RoomSession(identity(), ROOM_ID, envelope(), transport, backgroundScope, { testScheduler.currentTime }, ::uuid)
        session.start()
        runCurrent()
        val first = requireNotNull(transport.stream)

        advanceTimeBy(RoomPolicy.CLIENT_STALE_MS)
        runCurrent()

        assertTrue(first.cancelled)
        assertEquals(1, session.state.value.reconnects)
        assertEquals(RoomConnectionStatus.CONNECTED, session.state.value.status)
        assertEquals(1, transport.recoverCalls)
        assertTrue(transport.stream !== first)
        session.stop()
    }

    @Test fun `event for a new epoch terminates instead of applying stale room state`() = runTest {
        val transport = FakeRoomTransport()
        val session = RoomSession(identity(), ROOM_ID, envelope(), transport, backgroundScope, { testScheduler.currentTime }, ::uuid)
        session.start()

        requireNotNull(transport.listener).onEvent(
            RoomEvent.Heartbeat(HeartbeatEvent(1, ROOM_ID, "99999999-9999-4999-8999-999999999999", 1, 1, 1)),
        )
        runCurrent()

        assertEquals(RoomConnectionStatus.ENDED, session.state.value.status)
        assertEquals("server_restarted", session.state.value.endedReason)
        assertTrue(requireNotNull(transport.stream).cancelled)
    }

    private suspend fun kotlinx.coroutines.test.TestScope.assertAnsweredCommandRejection(status: Int, code: String) {
        val transport = FakeRoomTransport().apply {
            commandFailure = RoomApiException(status, code, "rejected", snapshot(revision = 2))
        }
        val session = RoomSession(identity(), ROOM_ID, envelope(), transport, backgroundScope, { testScheduler.currentTime }, ::uuid)
        session.start()

        assertFalse(session.send(RoomCommand.Play))

        assertEquals(RoomConnectionStatus.CONNECTED, session.state.value.status)
        assertEquals(code, session.state.value.errorCode)
        assertEquals(2L, session.state.value.snapshot?.revision)
        assertFalse(requireNotNull(transport.stream).cancelled)
        session.stop()
    }

    private class FakeRoomTransport : RoomTransport {
        val commands = mutableListOf<CommandEnvelope>()
        val presences = mutableListOf<PresenceReport>()
        val requestIdentities = mutableListOf<SessionSnapshot>()
        var commandFailure: RoomApiException? = null
        var invitationFailure: RoomApiException? = null
        var stream: FakeStream? = null
        var listener: RoomEventListener? = null
        var recoverCalls = 0
        var leaveCalls = 0
        var presenceBlock: CompletableDeferred<Unit>? = null
        val presenceFailures = ArrayDeque<RoomApiException>()

        override suspend fun sampleClock(snapshot: SessionSnapshot, samples: Int): ClockEstimate {
            requestIdentities += snapshot
            return ClockEstimate(EPOCH, 0.0, 1.0, 0.5, 0)
        }
        override suspend fun create(snapshot: SessionSnapshot, media: CreateMedia, startPositionMs: Long, autoAdvance: Boolean, requestId: String) = envelope()
        override suspend fun join(snapshot: SessionSnapshot, invite: String, requestId: String) = envelope()
        override suspend fun takeover(snapshot: SessionSnapshot, roomId: String, requestId: String) = envelope()
        override suspend fun recover(snapshot: SessionSnapshot, roomId: String): RoomEnvelope {
            requestIdentities += snapshot
            recoverCalls++
            return envelope()
        }
        override suspend fun command(snapshot: SessionSnapshot, roomId: String, body: CommandEnvelope): CommandResult {
            requestIdentities += snapshot
            commands += body
            commandFailure?.let { throw it }
            return CommandResult(true, snapshot(revision = body.expectedRevision + 1))
        }
        override suspend fun presence(snapshot: SessionSnapshot, roomId: String, body: PresenceReport): PresenceResult {
            requestIdentities += snapshot
            presences += body
            if (presenceFailures.isNotEmpty()) throw presenceFailures.removeFirst()
            presenceBlock?.await()
            return PresenceResult(PresenceAck(body.presenceSequence, EPOCH, 1, false), snapshot())
        }
        override suspend fun invitation(
            snapshot: SessionSnapshot,
            roomId: String,
            membershipVersion: Long,
            action: String,
            requestId: String,
        ): RoomEnvelope {
            invitationFailure?.let { throw it }
            return envelope()
        }
        override suspend fun leave(snapshot: SessionSnapshot, roomId: String, body: LeaveRequest) {
            requestIdentities += snapshot
            leaveCalls++
        }
        override fun events(snapshot: SessionSnapshot, roomId: String, listener: RoomEventListener): RoomEventStream {
            requestIdentities += snapshot
            this.listener = listener
            return FakeStream().also { stream = it }
        }
    }

    private class FakeStream : RoomEventStream {
        var cancelled = false
        override fun cancel() { cancelled = true }
    }

    companion object {
        private const val ROOM_ID = "8e2f7a64-5b1c-4d3e-9f80-1a2b3c4d5e6f"
        private const val EPOCH = "6f1c1d52-3f0e-4c7a-9d51-0d1b2c3a4e5f"
        private var idCounter = 0
        private fun uuid() = "00000000-0000-4000-8000-${(++idCounter).toString().padStart(12, '0')}"
        private fun identity(version: Long = 1) = SessionSnapshot("https://watchtower.test/".toHttpUrl(), "token-$version", "device", version, Long.MAX_VALUE)
        private fun envelope() = RoomEnvelope(snapshot(), RoomMembership("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", 1, 1, 7), null)
        private fun snapshot(revision: Long = 1, presenceRevision: Long = 1, participantName: String = "Host") = RoomSnapshot(
            1, ROOM_ID, EPOCH, revision, presenceRevision, 1, 1, 1,
            "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "paused", "created", false, null,
            RoomPolicyState(true), MediaIdentity("server", "42", "7", "9"), 100_000, RoomAnchor(0, 1, 1),
            listOf(RoomParticipant("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", participantName, true, true, false, true, null)),
        )
    }
}