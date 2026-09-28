package io.github.jovalle.watchtower.tv.rooms

import io.github.jovalle.watchtower.tv.api.HttpClients
import io.github.jovalle.watchtower.tv.api.IDENTITY_VERSION_HEADER
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.api.WatchtowerJson
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.SocketEffect
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class RoomApiTest {
    private val server = MockWebServer()
    private lateinit var snapshot: SessionSnapshot

    @Before fun setUp() {
        server.start()
        snapshot = SessionSnapshot(server.url("/"), "room_token", "device", 9, Long.MAX_VALUE)
    }

    @After fun tearDown() = server.close()

    @Test fun `mutation retry sends identical body and required authentication headers`() = runTest {
        val now = AtomicLong(100)
        val api = RoomApi(HttpClients("rooms/test"), clock = MonotonicClock { now.getAndAdd(10) })
        val epoch = "6f1c1d52-3f0e-4c7a-9d51-0d1b2c3a4e5f"
        repeat(3) { server.enqueue(json(clockJson(epoch, 1_000 + it * 10L))) }
        server.enqueue(MockResponse.Builder().onResponseStart(SocketEffect.CloseSocket()).build())
        server.enqueue(json(fixtureObject("createResponse")))

        val result = api.create(
            snapshot,
            CreateMedia("4242", "9001", "9101"),
            0,
            true,
            "0b8a4c1e-2d3f-4a5b-8c6d-7e8f9a0b1c2d",
        )

        assertEquals("8e2f7a64-5b1c-4d3e-9f80-1a2b3c4d5e6f", result.snapshot.roomId)
        repeat(3) { assertEquals("/api/v1/clock", server.takeRequest().url.encodedPath) }
        val first = server.takeRequest()
        val retry = server.takeRequest()
        assertEquals(first.body?.utf8(), retry.body?.utf8())
        listOf(first, retry).forEach { request ->
            assertEquals("Bearer room_token", request.headers["Authorization"])
            assertEquals("9", request.headers[IDENTITY_VERSION_HEADER])
            assertEquals("/api/v1/rooms", request.url.encodedPath)
        }
        val expiresAt = WatchtowerJson.parseToJsonElement(requireNotNull(first.body).utf8()).jsonObject.getValue("expiresAtMs").toString().toLong()
        assertTrue(expiresAt <= 61_100)
    }

    @Test fun `stale revision error carries authorized snapshot without retry`() = runTest {
        val api = RoomApi(HttpClients("rooms/test"), clock = MonotonicClock { 0 })
        val stale = fixtureObject("playingSnapshot")
        server.enqueue(json("""{"error":{"code":"stale_revision","message":"The room changed."},"snapshot":$stale}""", 409))
        val command = CommandEnvelope(
            "4fce8a5c-6b7d-4e9f-8a0b-1c2d3e4f5a6b", 3, 1,
            "6f1c1d52-3f0e-4c7a-9d51-0d1b2c3a4e5f", 1, 3, "play",
            kotlinx.serialization.json.JsonObject(emptyMap()),
        )

        val error = runCatching { api.command(snapshot, "8e2f7a64-5b1c-4d3e-9f80-1a2b3c4d5e6f", command) }.exceptionOrNull() as RoomApiException

        assertEquals("stale_revision", error.code)
        assertEquals(4L, error.snapshot?.revision)
        assertEquals(1, server.requestCount)
    }

    @Test fun `presence rate limit exposes retry after delay`() = runTest {
        val api = RoomApi(HttpClients("rooms/test"), clock = MonotonicClock { 0 })
        server.enqueue(
            json("""{"error":{"code":"rate_limited","message":"Slow down."}}""", 429)
                .newBuilder()
                .addHeader("Retry-After", "3")
                .build(),
        )
        val report = PresenceReport(
            epoch = "6f1c1d52-3f0e-4c7a-9d51-0d1b2c3a4e5f",
            membershipVersion = 1,
            mediaGeneration = 1,
            preparationGeneration = 1,
            presenceSequence = 7,
            playbackSessionId = null,
            positionMs = 42_000,
            ready = false,
            buffering = false,
            replacingSource = false,
            error = null,
        )

        val error = runCatching {
            api.presence(snapshot, "8e2f7a64-5b1c-4d3e-9f80-1a2b3c4d5e6f", report)
        }.exceptionOrNull() as RoomApiException

        assertEquals(429, error.status)
        assertEquals(3_000L, error.retryAfterMs)
    }

    private fun json(body: String, code: Int = 200) = MockResponse.Builder()
        .code(code)
        .addHeader("Content-Type", "application/json")
        .body(body)
        .build()

    private fun clockJson(epoch: String, serverMs: Long) =
        """{"protocolVersion":1,"epoch":"$epoch","receivedAtMs":$serverMs,"sentAtMs":$serverMs}"""

    private fun fixtureObject(name: String): String {
        val text = requireNotNull(javaClass.getResource("/rooms/v1/fixtures.json")).readText()
        return WatchtowerJson.parseToJsonElement(text).jsonObject.getValue(name).toString()
    }
}