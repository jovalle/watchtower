package io.github.jovalle.watchtower.tv.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class MediaStatusTest {
    @Test fun serverStatusesHaveConsistentSemanticTonesAndUnknownRemainsNeutral() {
        mapOf(
            StatusTone.Success to listOf("Available", "resolved"),
            StatusTone.Pending to listOf("pending", "Awaiting approval", "partially_available"),
            StatusTone.Progress to listOf("Approved", "Processing", "Completed; library availability pending"),
            StatusTone.Attention to listOf("open", "Failed", "Declined", "Blocked", "blocklisted"),
            StatusTone.Neutral to listOf("unknown", "Deleted from library", "future-status"),
        ).forEach { (tone, statuses) -> statuses.forEach { assertEquals(it, tone, statusTone(it)) } }
    }
}
