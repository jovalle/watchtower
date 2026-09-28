package io.github.jovalle.watchtower.tv.platform

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DeepLinkResolverTest {
    @Test fun acceptsDetailsAndPlayForCurrentServer() {
        assertEquals(
            DeepLinkResult.Allowed(ResolvedDeepLink("12345", DeepLinkAction.DETAILS)),
            DeepLinkResolver.resolve("watchtower://media/12345?server=server-1&action=details", "server-1"),
        )
        assertEquals(
            DeepLinkResult.Allowed(ResolvedDeepLink("9", DeepLinkAction.PLAY)),
            DeepLinkResolver.resolve("watchtower://media/9?server=server-1&action=play", "server-1"),
        )
    }

    @Test fun rejectsOtherServersAndMalformedRatingKeys() {
        assertTrue(
            DeepLinkResolver.resolve("watchtower://media/123?server=server-2&action=details", "server-1")
                is DeepLinkResult.Rejected,
        )
        listOf("", "abc", "1234567890123", "12/34").forEach { ratingKey ->
            assertTrue(
                DeepLinkResolver.resolve("watchtower://media/$ratingKey?server=server-1&action=play", "server-1")
                    is DeepLinkResult.Rejected,
            )
        }
    }

    @Test fun rejectsUnknownActionsAndNonWatchtowerUris() {
        assertTrue(
            DeepLinkResolver.resolve("watchtower://media/123?server=server-1&action=delete", "server-1")
                is DeepLinkResult.Rejected,
        )
        assertTrue(DeepLinkResolver.resolve("https://example.com/123", "server-1") is DeepLinkResult.Rejected)
    }
}