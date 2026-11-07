package io.github.jovalle.watchtower.tv.catalog

import io.github.jovalle.watchtower.tv.api.Page
import io.github.jovalle.watchtower.tv.api.PlaylistItem
import io.github.jovalle.watchtower.tv.api.PlaylistSummary
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ListsStateTest {
    private val snapshot = SessionSnapshot("https://watchtower.test/".toHttpUrl(), "fixture-token", "device", 1, Long.MAX_VALUE)

    @After fun tearDown() { Dispatchers.resetMain() }

    @Test fun replacingAPlaylistLoadDoesNotExposeItsCancellationAsAnError() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val first = CompletableDeferred<List<PlaylistSummary>>()
        val replacement = CompletableDeferred<List<PlaylistSummary>>()
        var calls = 0
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun playlists(snapshot: SessionSnapshot) = if (calls++ == 0) first.await() else replacement.await()
        }
        val model = PlaylistsViewModel(data, { snapshot }, MutableSharedFlow())
        runCurrent()
        model.reload()
        runCurrent()
        assertEquals(LoadState.Loading, model.state.value)
        replacement.complete(emptyList())
        advanceUntilIdle()
    }

    @Test fun failedRemovalOnTheLastPageCanRetryItsRead() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun playlistItems(snapshot: SessionSnapshot, playlistId: String, cursor: String?) = Page(listOf(playlistItem(1)), null, 1)
            override suspend fun removeFromPlaylist(snapshot: SessionSnapshot, playlistId: String, playlistItemId: String) { throw IOException("Try again") }
        }
        val model = PlaylistItemsViewModel("list", data, { snapshot }, MutableSharedFlow())
        advanceUntilIdle()
        model.remove(playlistItem(1))
        advanceUntilIdle()
        assertEquals("Try again", model.state.value.error)
        model.retry()
        advanceUntilIdle()
        assertNull(model.state.value.error)
        assertEquals(listOf("item-1"), model.state.value.items.map { it.playlistItemId })
    }

    @Test fun playlistPageKeepsFocusMovedWhileLoading() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val next = CompletableDeferred<Page<PlaylistItem>>()
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun playlistItems(snapshot: SessionSnapshot, playlistId: String, cursor: String?) =
                if (cursor == null) Page((0..11).map(::playlistItem), "next", 14) else next.await()
        }
        val model = PlaylistItemsViewModel("list", data, { snapshot }, MutableSharedFlow())
        advanceUntilIdle()
        model.loadNext()
        runCurrent()
        model.rememberFocus(7)
        next.complete(Page(listOf(playlistItem(12), playlistItem(13)), null, 14))
        advanceUntilIdle()
        assertEquals(7, model.state.value.focusedIndex)
    }

    @Test fun removingFromAnOffsetPagedPlaylistReloadsBeforeContinuing() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val items = (0..5).map(::playlistItem).toMutableList()
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun playlistItems(snapshot: SessionSnapshot, playlistId: String, cursor: String?): Page<PlaylistItem> {
                val offset = cursor?.toInt() ?: 0
                return Page(items.drop(offset).take(3), (offset + 3).takeIf { it < items.size }?.toString(), items.size)
            }
            override suspend fun removeFromPlaylist(snapshot: SessionSnapshot, playlistId: String, playlistItemId: String) {
                items.removeAll { it.playlistItemId == playlistItemId }
            }
        }
        val model = PlaylistItemsViewModel("list", data, { snapshot }, MutableSharedFlow())
        advanceUntilIdle()
        model.rememberFocus(1)
        model.remove(items.first())
        advanceUntilIdle()
        model.loadNext()
        advanceUntilIdle()
        assertEquals(items.map { it.playlistItemId }, model.state.value.items.map { it.playlistItemId })
        assertEquals(1, model.state.value.focusedIndex)
    }

    private fun playlistItem(index: Int) = PlaylistItem(
        ratingKey = "$index", type = "movie", title = "Movie $index", year = 2026,
        posterUrl = null, backdropUrl = null, thumbUrl = null, durationMs = null, viewOffsetMs = null,
        viewCount = 0, leafCount = null, viewedLeafCount = null, contentRating = null, showTitle = null,
        seasonNumber = null, episodeNumber = null, parentRatingKey = null, grandparentRatingKey = null,
        external = null, playlistItemId = "item-$index",
    )
}
