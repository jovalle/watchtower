package io.github.jovalle.watchtower.tv.catalog

import io.github.jovalle.watchtower.tv.api.Edition
import io.github.jovalle.watchtower.tv.api.ExternalId
import io.github.jovalle.watchtower.tv.api.Guids
import io.github.jovalle.watchtower.tv.api.HomeResponse
import io.github.jovalle.watchtower.tv.api.LibrarySection
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.Page
import io.github.jovalle.watchtower.tv.api.SearchResponse
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.api.WatchlistCounts
import io.github.jovalle.watchtower.tv.api.WatchlistResponse
import io.github.jovalle.watchtower.tv.auth.IdentityChange
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class CatalogStateTest {
    private val server = MockWebServer()

    @Before fun setUp() {
        server.start()
    }

    @After fun tearDown() {
        Dispatchers.resetMain()
        server.close()
    }

    @Test fun staleHomeResponseFromPreviousIdentityIsDiscarded() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val old = snapshot(1)
        val current = arrayOf<SessionSnapshot?>(old)
        val changes = MutableSharedFlow<IdentityChange>(extraBufferCapacity = 1)
        val response = CompletableDeferred<HomeResponse>()
        val replacementHome = HomeResponse(listOf(summary("new")), emptyList(), emptyList())
        val data = FakeCatalogDataSource(homeBlock = { snapshot ->
            if (snapshot.identityVersion == 1L) response.await() else replacementHome
        })
        val viewModel = HomeViewModel(data, { current[0] }, changes)

        runCurrent()
        val replacement = snapshot(2)
        current[0] = replacement
        changes.emit(IdentityChange(old, replacement))
        response.complete(HomeResponse(emptyList(), emptyList(), emptyList()))
        advanceUntilIdle()

        assertEquals(LoadState.Content(replacementHome), viewModel.state.value)
    }

    @Test fun libraryUsesCursorDeduplicatesAndStopsAtEnd() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val cursors = mutableListOf<String?>()
        val pages = ArrayDeque(
            listOf(
                Page(listOf(summary("1"), summary("2")), "next", 3),
                Page(listOf(summary("2"), summary("3")), null, 3),
            ),
        )
        val data = FakeCatalogDataSource(libraryBlock = { _, _, cursor -> cursors += cursor; pages.removeFirst() })
        val viewModel = LibraryViewModel("movies", data, { snapshot(1) }, MutableSharedFlow())

        advanceUntilIdle()
        viewModel.loadNear(1)
        advanceUntilIdle()
        viewModel.loadNext()
        advanceUntilIdle()

        assertEquals(listOf(null, "next"), cursors)
        assertEquals(listOf("1", "2", "3"), viewModel.state.value.items.map { it.ratingKey })
        assertTrue(viewModel.state.value.endReached)
    }

    @Test fun searchDebouncesAndCancelsThePreviousQuery() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val completed = mutableListOf<String>()
        val data = FakeCatalogDataSource(searchBlock = { query ->
            if (query == "star") delay(1_000)
            completed += query
            SearchResponse(listOf(summary(query)), emptyList())
        })
        val viewModel = SearchViewModel(data, { snapshot(1) }, MutableSharedFlow())

        viewModel.search("star")
        advanceTimeBy(301)
        runCurrent()
        viewModel.search("star wars")
        advanceUntilIdle()

        assertEquals(listOf("star wars"), completed)
        assertEquals("star wars", viewModel.state.value.result?.library?.single()?.ratingKey)
    }

    @Test fun watchedMutationChangesStateOnlyAfterSuccessAndReportsFailure() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val confirmation = CompletableDeferred<Unit>()
        val data = FakeCatalogDataSource(
            detail = detail(),
            watchedBlock = { watched -> if (watched) confirmation.await() else throw IOException("Write failed") },
        )
        val viewModel = DetailViewModel("10", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()

        viewModel.setWatched(true)
        runCurrent()
        assertEquals(0, viewModel.state.value.detail?.viewCount)
        assertTrue(viewModel.state.value.mutationInFlight)
        confirmation.complete(Unit)
        advanceUntilIdle()
        assertEquals(1, viewModel.state.value.detail?.viewCount)
        assertEquals("Saved", viewModel.state.value.message)

        viewModel.setWatched(false)
        advanceUntilIdle()
        assertEquals(1, viewModel.state.value.detail?.viewCount)
        assertEquals("Write failed", viewModel.state.value.error)
        assertFalse(viewModel.state.value.mutationInFlight)
    }

    @Test fun specialsSortAfterRegularSeasonsAndFocusFallsBackToNearestIndex() {
        val seasons = listOf(summary("s0", season = 0), summary("s2", season = 2), summary("s1", season = 1))
        assertEquals(listOf(1, 2, 0), orderSeasons(seasons).map { it.seasonNumber })
        assertEquals(1, restoredFocusIndex("deleted", 1, listOf("a", "c")))
        assertEquals(0, restoredFocusIndex("a", 1, listOf("a", "c")))
        assertEquals(-1, restoredFocusIndex("a", 0, emptyList()))
    }

    private fun snapshot(version: Long) = SessionSnapshot(server.url("/"), "token", "device", version, Long.MAX_VALUE)

    private fun summary(key: String, season: Int? = null) = MediaSummary(
        ratingKey = key,
        type = if (season == null) "movie" else "season",
        title = key,
        year = null,
        posterUrl = null,
        backdropUrl = null,
        thumbUrl = null,
        durationMs = null,
        viewOffsetMs = null,
        viewCount = 0,
        leafCount = null,
        viewedLeafCount = null,
        contentRating = null,
        showTitle = null,
        seasonNumber = season,
        episodeNumber = null,
        parentRatingKey = null,
        grandparentRatingKey = null,
        external = null,
    )

    private fun detail() = MediaDetail(
        ratingKey = "10",
        type = "movie",
        title = "Movie",
        year = 2026,
        posterUrl = null,
        backdropUrl = null,
        thumbUrl = null,
        durationMs = 7_200_000,
        viewOffsetMs = null,
        viewCount = 0,
        leafCount = null,
        viewedLeafCount = null,
        contentRating = null,
        showTitle = null,
        seasonNumber = null,
        episodeNumber = null,
        parentRatingKey = null,
        grandparentRatingKey = null,
        external = null,
        summary = "Summary",
        tagline = null,
        studio = null,
        genres = emptyList(),
        directors = emptyList(),
        cast = emptyList(),
        audienceRating = null,
        criticRating = null,
        userRating = null,
        originallyAvailableAt = null,
        editionTitle = null,
        editions = emptyList<Edition>(),
        guids = Guids(null, null, null, null),
        versions = emptyList(),
        markers = emptyList(),
        onWatchlist = false,
        playable = true,
    )
}

private class FakeCatalogDataSource(
    private val homeBlock: suspend (SessionSnapshot) -> HomeResponse = { HomeResponse(emptyList(), emptyList(), emptyList()) },
    private val libraryBlock: suspend (String, String, String?) -> Page<MediaSummary> = { _, _, _ -> Page(emptyList(), null, 0) },
    private val searchBlock: suspend (String) -> SearchResponse = { SearchResponse(emptyList(), emptyList()) },
    private val detail: MediaDetail? = null,
    private val watchedBlock: suspend (Boolean) -> Unit = {},
) : CatalogDataSource {
    override suspend fun home(snapshot: SessionSnapshot) = homeBlock(snapshot)
    override suspend fun libraries(snapshot: SessionSnapshot) = emptyList<LibrarySection>()
    override suspend fun libraryItems(
        snapshot: SessionSnapshot,
        sectionId: String,
        sort: String,
        filter: String,
        cursor: String?,
    ) = libraryBlock(sort, filter, cursor)
    override suspend fun media(snapshot: SessionSnapshot, ratingKey: String) = requireNotNull(detail)
    override suspend fun children(snapshot: SessionSnapshot, ratingKey: String) = emptyList<MediaSummary>()
    override suspend fun search(snapshot: SessionSnapshot, query: String) = searchBlock(query)
    override suspend fun watchlist(snapshot: SessionSnapshot, source: String) =
        WatchlistResponse(emptyList(), WatchlistCounts(0, 0, 0, 0), emptyList())
    override suspend fun setWatched(snapshot: SessionSnapshot, ratingKey: String, watched: Boolean) = watchedBlock(watched)
    override suspend fun setRating(snapshot: SessionSnapshot, ratingKey: String, rating: Double?) = Unit
    override suspend fun setWatchlist(snapshot: SessionSnapshot, ratingKey: String, add: Boolean) = Unit
}