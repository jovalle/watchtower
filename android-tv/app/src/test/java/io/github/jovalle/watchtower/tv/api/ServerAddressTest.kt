package io.github.jovalle.watchtower.tv.api

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerAddressTest {
    private fun valid(input: String, cleartext: Boolean = false) =
        (ServerAddress.parse(input, cleartext) as ServerAddress.Result.Valid).baseUrl.toString()

    private fun invalid(input: String, cleartext: Boolean = false) =
        ServerAddress.parse(input, cleartext) is ServerAddress.Result.Invalid

    @Test fun defaultsToHttpsAndNormalizesToOrigin() {
        assertEquals("https://watchtower.example.test/", valid("watchtower.example.test"))
        assertEquals("https://watchtower.example.test:8443/", valid(" https://watchtower.example.test:8443/ "))
    }

    @Test fun rejectsCleartextOutsideDebug() {
        assertTrue(invalid("http://192.168.1.10:9001"))
        assertEquals("http://10.0.2.2:9031/", valid("http://10.0.2.2:9031", cleartext = true))
    }

    @Test fun rejectsCredentialsPathsQueriesAndGarbage() {
        assertTrue(invalid("https://user:pass@watchtower.example.test"))
        assertTrue(invalid("https://watchtower.example.test/app"))
        assertTrue(invalid("https://watchtower.example.test/?x=1"))
        assertTrue(invalid("https://watchtower.example.test/#frag"))
        assertTrue(invalid(""))
        assertTrue(invalid("ftp://watchtower.example.test"))
    }

    @Test fun sameOriginComparesSchemeHostAndPort() {
        val base = "https://tv.example.test/".toHttpUrl()
        assertTrue(ServerAddress.sameOrigin(base, "https://tv.example.test/api/v1/me".toHttpUrl()))
        assertFalse(ServerAddress.sameOrigin(base, "http://tv.example.test/api/v1/me".toHttpUrl()))
        assertFalse(ServerAddress.sameOrigin(base, "https://tv.example.test:8443/".toHttpUrl()))
        assertFalse(ServerAddress.sameOrigin(base, "https://evil.example.test/".toHttpUrl()))
    }
}
