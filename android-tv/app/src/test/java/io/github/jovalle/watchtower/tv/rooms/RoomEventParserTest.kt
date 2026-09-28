package io.github.jovalle.watchtower.tv.rooms

import io.github.jovalle.watchtower.tv.api.WatchtowerJson
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RoomEventParserTest {
    private val fixtures = WatchtowerJson.parseToJsonElement(
        requireNotNull(javaClass.getResource("/rooms/v1/fixtures.json")).readText(),
    ).jsonObject

    @Test fun `parses every named SSE payload and ignores unknown event names`() {
        val snapshot = parseRoomEvent("snapshot", fixtures.getValue("playingSnapshot").toString()) as RoomEvent.Snapshot
        val heartbeat = parseRoomEvent("heartbeat", fixtures.getValue("heartbeatEvent").toString()) as RoomEvent.Heartbeat
        val ended = parseRoomEvent("ended", fixtures.getValue("endedMinimalEvent").toString()) as RoomEvent.Ended

        assertEquals(4L, snapshot.value.revision)
        assertEquals(135_000L, heartbeat.value.serverNowMs)
        assertEquals("access_denied", ended.value.reason)
        assertNull(parseRoomEvent("future-event", "{}"))
    }
}