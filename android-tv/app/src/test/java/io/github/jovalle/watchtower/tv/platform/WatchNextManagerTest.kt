package io.github.jovalle.watchtower.tv.platform

import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.ProfileSummary
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchNextManagerTest {
    @Test fun restrictedAndProtectedProfilesNeverPublishAndRemoveExistingEntries() = runTest {
        listOf(
            ProfileSummary("restricted", "Child", restricted = true, owner = false, protected = false),
            ProfileSummary("protected", "Adult", restricted = false, owner = false, protected = true),
        ).forEach { profile ->
            val sink = FakeWatchNextSink()
            WatchNextManager(sink).sync(profile, "server", listOf(item("1")))
            assertEquals(1, sink.removeAllCount)
            assertTrue(sink.published.isEmpty())
        }
    }

    @Test fun publishesCurrentProfileProgressAndRemovesCompletedItems() = runTest {
        val sink = FakeWatchNextSink()
        val manager = WatchNextManager(sink)
        val profile = ProfileSummary("user", "User", restricted = false, owner = true, protected = false)

        manager.sync(profile, "machine", listOf(item("1"), item("2", watched = true)))

        assertEquals(listOf("1"), sink.published.map { it.ratingKey })
        assertEquals("watchtower://media/1?server=machine&action=play", sink.published.single().intentUri)
        assertEquals(listOf("2"), sink.removed)
    }

    @Test fun identityChangeRemovesAllPublishedEntries() = runTest {
        val sink = FakeWatchNextSink()
        WatchNextManager(sink).identityChanged()
        assertEquals(1, sink.removeAllCount)
    }

    private fun item(key: String, watched: Boolean = false) = MediaSummary(
        ratingKey = key,
        type = "movie",
        title = "Title $key",
        year = 2026,
        posterUrl = "/poster/$key",
        backdropUrl = null,
        thumbUrl = null,
        durationMs = 100_000,
        viewOffsetMs = 20_000,
        viewCount = if (watched) 1 else 0,
        leafCount = null,
        viewedLeafCount = null,
        contentRating = null,
        showTitle = null,
        seasonNumber = null,
        episodeNumber = null,
        parentRatingKey = null,
        grandparentRatingKey = null,
        external = null,
    )
}

private class FakeWatchNextSink : WatchNextSink {
    val published = mutableListOf<WatchNextEntry>()
    val removed = mutableListOf<String>()
    var removeAllCount = 0

    override suspend fun publish(entry: WatchNextEntry) { published += entry }
    override suspend fun remove(ratingKey: String) { removed += ratingKey }
    override suspend fun removeAll() { removeAllCount++ }
}