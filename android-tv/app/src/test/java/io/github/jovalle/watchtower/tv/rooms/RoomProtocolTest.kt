package io.github.jovalle.watchtower.tv.rooms

import io.github.jovalle.watchtower.tv.api.WatchtowerJson
import java.io.File
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

class RoomProtocolTest {
    @Test fun `all golden fixture objects round trip without dropping fields`() {
        val fixtures = fixtureJson()
        val serializers = mapOf<String, KSerializer<*>>(
            "clock" to ClockSample.serializer(),
            "createRequest" to CreateRoomRequest.serializer(),
            "joinRequest" to JoinRoomRequest.serializer(),
            "takeoverRequest" to JoinRoomRequest.serializer(),
            "invitationRequest" to InvitationRequest.serializer(),
            "leaveRequest" to LeaveRequest.serializer(),
            "createResponse" to RoomEnvelope.serializer(),
            "playingSnapshot" to RoomSnapshot.serializer(),
            "seekCommand" to CommandEnvelope.serializer(),
            "selectNextCommand" to CommandEnvelope.serializer(),
            "presenceReady" to PresenceReport.serializer(),
            "presenceReplacingSource" to PresenceReport.serializer(),
            "heartbeatEvent" to HeartbeatEvent.serializer(),
            "endedMinimalEvent" to EndedEvent.serializer(),
            "staleRevisionError" to RoomErrorBody.serializer(),
        )
        serializers.forEach { (name, serializer) -> roundTrip(fixtures.getValue(name), serializer) }
        assertEquals(fixtures.getValue("sse"), WatchtowerJson.parseToJsonElement(WatchtowerJson.encodeToString(JsonElement.serializer(), fixtures.getValue("sse"))))
    }

    @Test fun `fixture copy matches WT source when present`() {
        val source = File(System.getProperty("watchtower.roomFixtures"))
        assumeTrue("WT fixture is not present on this branch", source.isFile)
        assertTrue(source.readBytes().contentEquals(resourceBytes()))
    }

    @Test fun `validates identifiers and snapshots used by client`() {
        assertTrue(RoomProtocol.isUuid("0b8a4c1e-2d3f-4a5b-8c6d-7e8f9a0b1c2d"))
        assertFalse(RoomProtocol.isUuid("0B8A4C1E-2D3F-4A5B-8C6D-7E8F9A0B1C2D"))
        assertTrue(RoomProtocol.isInviteSecret("A".repeat(43)))
        assertFalse(RoomProtocol.isInviteSecret("A".repeat(42)))
        assertTrue(RoomProtocol.isRatingKey("123456789012"))
        assertFalse(RoomProtocol.isRatingKey("not-a-rating-key"))
        val snapshot = WatchtowerJson.decodeFromJsonElement(RoomSnapshot.serializer(), fixtureJson().getValue("playingSnapshot"))
        assertTrue(RoomProtocol.validate(snapshot))
        assertFalse(RoomProtocol.validate(snapshot.copy(protocolVersion = 2)))
        assertFalse(RoomProtocol.validate(snapshot.copy(media = snapshot.media.copy(partId = ""))))
        assertFalse(RoomProtocol.validate(snapshot.copy(hostParticipantId = "host")))
        assertTrue(RoomProtocol.validate(snapshot.copy(hostParticipantId = null)))
        assertFalse(RoomProtocol.validate(snapshot.copy(participants = snapshot.participants.map { it.copy(participantId = "p1") })))
    }

    @Suppress("UNCHECKED_CAST")
    private fun roundTrip(element: JsonElement, serializer: KSerializer<*>) {
        val typed = WatchtowerJson.decodeFromJsonElement(serializer as KSerializer<Any>, element)
        assertEquals(element, WatchtowerJson.encodeToJsonElement(serializer, typed))
    }

    private fun fixtureJson(): JsonObject = WatchtowerJson.parseToJsonElement(resourceBytes().decodeToString()) as JsonObject

    private fun resourceBytes(): ByteArray = requireNotNull(javaClass.getResourceAsStream("/rooms/v1/fixtures.json")).readBytes()
}