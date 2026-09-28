package io.github.jovalle.watchtower.tv.rooms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class InviteParserTest {
    private val secret = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

    @Test fun `accepts raw secret and fragment invite links`() {
        assertEquals(secret, InviteParser.parse(secret))
        assertEquals(secret, InviteParser.parse("https://watchtower.test/join#i=$secret"))
        assertEquals(secret, InviteParser.parse("watchtower://join#i=$secret"))
    }

    @Test fun `rejects malformed and query-string invitations`() {
        assertNull(InviteParser.parse("https://watchtower.test/join?i=$secret"))
        assertNull(InviteParser.parse("https://watchtower.test/join#i=short"))
        assertNull(InviteParser.parse("not-an-invite"))
    }
}