package io.github.jovalle.watchtower.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MainActivityDeepLinkTest {
    @Test fun restoredPendingLaunchLinkIsAccepted() {
        assertTrue(shouldAcceptLaunchDeepLink("watchtower://media/42", consumedLaunchDigest = null))
    }

    @Test fun restoredConsumedLaunchLinkIsNotReplayed() {
        assertFalse(shouldAcceptLaunchDeepLink("watchtower://media/42", launchLinkDigest("watchtower://media/42")))
    }

    @Test fun restoredActivityWithoutLaunchLinkDoesNothing() {
        assertFalse(shouldAcceptLaunchDeepLink(launchUri = null, consumedLaunchDigest = null))
    }

    @Test fun savedStateKeepsOnlyADigestOfTheLink() {
        val link = "watchtower://join#i=${"A".repeat(43)}"
        val digest = launchLinkDigest(link)
        assertEquals(64, digest.length)
        assertFalse(digest.contains("A".repeat(8)))
    }
}
