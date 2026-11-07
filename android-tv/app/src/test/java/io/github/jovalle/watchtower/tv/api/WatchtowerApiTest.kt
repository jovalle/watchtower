package io.github.jovalle.watchtower.tv.api

import java.io.IOException
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class WatchtowerApiTest {
    private val server = MockWebServer()
    private lateinit var api: WatchtowerApi
    private lateinit var snapshot: SessionSnapshot
    private val failures = mutableListOf<ApiException>()

    @Before fun setUp() {
        server.start()
        api = WatchtowerApi(HttpClients("android-tv/test"))
        api.events = ApiEvents { _, error -> failures += error }
        snapshot = SessionSnapshot(server.url("/"), "wtd_test_token", "ds_1", 7, Long.MAX_VALUE)
    }

    @After fun tearDown() = server.close()

    private fun json(code: Int, body: String, vararg headers: Pair<String, String>) = MockResponse.Builder()
        .code(code).body(body).addHeader("Content-Type", "application/json").apply { headers.forEach { addHeader(it.first, it.second) } }.build()

    @Test fun sendsBearerAndIdentityVersionToOwnOriginOnly() = runTest {
        server.enqueue(json(200, """{"items":[]}"""))
        api.libraries(snapshot)
        val request = server.takeRequest()
        assertEquals("/api/v1/libraries", request.url.encodedPath)
        assertEquals("Bearer wtd_test_token", request.headers["Authorization"])
        assertEquals("7", request.headers[IDENTITY_VERSION_HEADER])
        assertEquals("android-tv/test", request.headers["X-Watchtower-Client"])
    }

    @Test fun libraryLettersBindToTheBrowseQueryAndPageLimit() = runTest {
        server.enqueue(json(200, """{"letters":[]}"""))
        assertTrue(api.libraryLetters(snapshot, "4", "titleSort:desc", "unwatched", genre = "Drama", limit = 50).letters.isEmpty())
        val request = server.takeRequest()
        assertEquals("/api/v1/libraries/4/letters", request.url.encodedPath)
        assertEquals("titleSort:desc", request.url.queryParameter("sort"))
        assertEquals("unwatched", request.url.queryParameter("filter"))
        assertEquals("Drama", request.url.queryParameter("genre"))
        assertEquals("50", request.url.queryParameter("limit"))
        assertEquals("7", request.headers[IDENTITY_VERSION_HEADER])
    }

    @Test fun libraryRecommendationsUseAuthenticatedSectionEndpoint() = runTest {
        server.enqueue(json(200, """{"rows":[]}"""))
        assertTrue(api.libraryRecommendations(snapshot, "4").rows.isEmpty())
        val request = server.takeRequest()
        assertEquals("/api/v1/libraries/4/recommendations", request.url.encodedPath)
        assertEquals("Bearer wtd_test_token", request.headers["Authorization"])
        assertEquals("7", request.headers[IDENTITY_VERSION_HEADER])
    }

    @Test fun continueWatchingDismissalUsesAnAuthenticatedDedicatedDelete() = runTest {
        server.enqueue(MockResponse.Builder().code(204).build())
        api.dismissContinueWatching(snapshot, "42")
        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/v1/media/42/continue-watching", request.url.encodedPath)
        assertEquals("Bearer wtd_test_token", request.headers["Authorization"])
        assertEquals("7", request.headers[IDENTITY_VERSION_HEADER])
    }

    @Test fun meAndRevocationOmitIdentityVersion() = runTest {
        server.enqueue(json(200, java.io.File(System.getProperty("watchtower.contracts") ?: "../../contracts", "native/v1/me.json").readText()))
        server.enqueue(MockResponse.Builder().code(204).build())
        api.me(snapshot)
        api.signOut(snapshot)
        assertNull(server.takeRequest().headers[IDENTITY_VERSION_HEADER])
        val signOut = server.takeRequest()
        assertEquals("DELETE", signOut.method)
        assertNull(signOut.headers[IDENTITY_VERSION_HEADER])
    }

    @Test fun mapsErrorEnvelopeAndNotifiesAuthFailures() = runTest {
        server.enqueue(json(401, """{"error":{"code":"session_revoked","message":"Signed out","retryable":false,"requestId":"req_1"}}"""))
        try {
            api.home(snapshot)
            fail("expected ApiException")
        } catch (e: ApiException) {
            assertEquals(401, e.status)
            assertEquals("session_revoked", e.code)
            assertEquals("req_1", e.requestId)
        }
        assertEquals(listOf("session_revoked"), failures.map { it.code })
    }

    @Test fun retryAfterIsParsedAndHtmlNotFoundMeansIncompatibleServer() = runTest {
        server.enqueue(json(429, """{"error":{"code":"slow_down","message":"Slow down","retryable":true,"requestId":"r"}}""", "Retry-After" to "7"))
        server.enqueue(MockResponse.Builder().code(404).addHeader("Content-Type", "text/html").body("<html>").build())
        val slow = runCatching { api.pollDeviceAuthorization(server.url("/"), "wtp_x") }.exceptionOrNull() as ApiException
        assertEquals(7000L, slow.retryAfterMs)
        val old = runCatching { api.instance(server.url("/")) }.exceptionOrNull() as ApiException
        assertEquals(ApiException.INCOMPATIBLE_SERVER, old.code)
        assertTrue(failures.isEmpty())
    }

    @Test fun redirectsAreNotFollowed() = runTest {
        server.enqueue(MockResponse.Builder().code(302).addHeader("Location", "https://evil.example.test/steal").build())
        val error = runCatching { api.home(snapshot) }.exceptionOrNull() as ApiException
        assertEquals("unexpected_redirect", error.code)
        assertEquals(1, server.requestCount)
    }

    @Test fun credentialedClientRefusesOtherOrigins() {
        val client = HttpClients("t").forSession(snapshot)
        try {
            client.newCall(okhttp3.Request.Builder().url("https://evil.example.test/image.jpg").build()).execute()
            fail("expected IOException")
        } catch (e: IOException) {
            assertTrue(e.message!!.contains("Blocked"))
        }
        assertEquals(0, server.requestCount)
    }
}
