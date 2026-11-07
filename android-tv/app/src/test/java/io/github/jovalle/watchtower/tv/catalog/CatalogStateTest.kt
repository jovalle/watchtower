package io.github.jovalle.watchtower.tv.catalog

import io.github.jovalle.watchtower.tv.api.ArtworkColors
import io.github.jovalle.watchtower.tv.api.Edition
import io.github.jovalle.watchtower.tv.api.ExternalId
import io.github.jovalle.watchtower.tv.api.Guids
import io.github.jovalle.watchtower.tv.api.HomeRow
import io.github.jovalle.watchtower.tv.api.HomeResponse
import io.github.jovalle.watchtower.tv.api.LibraryRecommendationsResponse
import io.github.jovalle.watchtower.tv.api.LibraryFiltersResponse
import io.github.jovalle.watchtower.tv.api.LibraryLetter
import io.github.jovalle.watchtower.tv.api.LibrarySection
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.Page
import io.github.jovalle.watchtower.tv.api.PlaylistItem
import io.github.jovalle.watchtower.tv.api.PlaylistSummary
import io.github.jovalle.watchtower.tv.api.CollectionSummary
import io.github.jovalle.watchtower.tv.api.RequestAvailability
import io.github.jovalle.watchtower.tv.api.RequestEntry
import io.github.jovalle.watchtower.tv.api.SearchResponse
import io.github.jovalle.watchtower.tv.api.SeasonAvailability
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.api.WatchlistCounts
import io.github.jovalle.watchtower.tv.api.WatchlistResponse
import io.github.jovalle.watchtower.tv.auth.IdentityChange
import java.io.IOException
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
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
import mockwebserver3.MockResponse
import io.github.jovalle.watchtower.tv.api.WatchtowerApi
import io.github.jovalle.watchtower.tv.api.HttpClients
import org.junit.After
import org.junit.Assert.assertArrayEquals
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

    @Test fun homeHeroTracksTheFocusedRowItemAndFallsBackWhenItDisappears() {
        val featured = summary("featured")
        val first = summary("first")
        val second = summary("second")
        val home = HomeResponse(listOf(featured), listOf(HomeRow("row", "recent", "Recent", listOf(first, second))), emptyList())
        assertEquals(second, focusedHomeItem(home, "second"))
        assertEquals(first, focusedHomeItem(home, "removed"))
        assertEquals(featured, focusedHomeItem(home.copy(rows = emptyList()), null))
        assertNull(focusedHomeItem(home.copy(hero = emptyList(), rows = emptyList()), null))
    }

    @Test fun returningToLoadedEpisodeSupersedesAnUnfinishedPreview() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val first = detail("episode").copy(ratingKey = "a")
        val second = first.copy(ratingKey = "b")
        var pending: Continuation<MediaDetail>? = null
        val data = FakeCatalogDataSource(detailBlock = { key ->
            if (key == "b") suspendCoroutine { pending = it } else first
        })
        val model = DetailViewModel("a", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        model.selectEpisode("b")
        runCurrent()
        model.selectEpisode("a")
        requireNotNull(pending).resume(second)
        advanceUntilIdle()
        assertEquals("a", model.state.value.detail?.ratingKey)
        assertEquals("a", model.state.value.selectedEpisodeKey)
        assertTrue(model.state.value.actionsReady)
    }

    @Test fun pendingEpisodePreviewBlocksEveryMutationUntilItsMetadataMatches() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val first = detail("episode").copy(ratingKey = "a")
        val pending = CompletableDeferred<MediaDetail>()
        val writes = mutableListOf<String>()
        val data = FakeCatalogDataSource(detailBlock = { key -> if (key == "b") pending.await() else first },
            watchedBlock = { writes += "watched" }, ratingBlock = { writes += "rating" },
            watchlistBlock = { _, _ -> writes += "watchlist" }, addToPlaylistBlock = { writes += "playlist" })
        val model = DetailViewModel("a", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        model.selectEpisode("b")
        runCurrent()
        val preview = model.state.value
        model.setWatched(true); runCurrent()
        model.setRating(8.0); runCurrent()
        model.setWatchlist(true); runCurrent()
        model.addToPlaylist("list"); runCurrent()
        pending.complete(first.copy(ratingKey = "b"))
        advanceUntilIdle()
        assertEquals("b", preview.selectedEpisodeKey)
        assertTrue(preview.episodeLoading)
        assertFalse(preview.actionsReady)
        assertEquals(emptyList<String>(), writes)
        assertEquals("b", model.state.value.detail?.ratingKey)
        assertTrue(model.state.value.actionsReady)
    }

    @Test fun episodeRouteRestoresRealShowOverviewAndKeepsItsSeasonDestinations() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val episode = detail("episode").copy(ratingKey = "a", parentRatingKey = "s1", grandparentRatingKey = "series")
        val series = detail("show").copy(ratingKey = "series", title = "Real show", summary = "Real series synopsis", playable = false)
        val seasons = listOf(summary("s1", 1), summary("s2", 2))
        val data = FakeCatalogDataSource(detailBlock = { key -> if (key == "series") series else episode },
            childrenBlock = { key, _ -> Page(if (key == "series") seasons else listOf(episode.toSummary()), null, 2) })
        val model = DetailViewModel("a", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        assertEquals(series, model.state.value.seriesDetail)
        model.selectShowOverview()
        assertEquals(series, model.state.value.detail)
        assertNull(model.state.value.selectedSeasonKey)
        assertNull(model.state.value.selectedEpisodeKey)
        assertEquals(seasons, model.state.value.seasons)
        model.loadSeason(seasons.first())
        assertEquals("s1", model.state.value.selectedSeasonKey)
        model.selectEpisode("a")
        advanceUntilIdle()
        assertEquals(episode, model.state.value.detail)
        assertTrue(model.state.value.actionsReady)
    }

    @Test fun episodeRouteLoadsItsSeasonAndSiblingEpisodes() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val episode = detail("episode").copy(parentRatingKey = "s2", grandparentRatingKey = "show")
        val data = FakeCatalogDataSource(
            detailBlock = { key -> if (key == "show") detail("show") else episode },
            childrenBlock = { key, _ -> when (key) {
                "show" -> Page(listOf(summary("s1", 1), summary("s2", 2)), null, 2)
                "s2" -> Page(listOf(summary("e1"), summary("10")), null, 2)
                else -> error("Unexpected children: $key")
            } },
        )
        val model = DetailViewModel("10", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        assertEquals("s2", model.state.value.selectedSeasonKey)
        assertEquals(listOf("s1", "s2"), model.state.value.seasons.map { it.ratingKey })
        assertEquals(listOf("e1", "10"), model.state.value.episodes.getValue("s2").items.map { it.ratingKey })
    }

    @Test fun episodeOutsideTheFirstPageKeepsItsRouteSelectionAndOrderedPagination() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val selected = detail("episode").copy(ratingKey = "e150", parentRatingKey = "season", episodeNumber = 150)
        val data = FakeCatalogDataSource(detail = selected, childrenBlock = { _, cursor ->
            if (cursor == null) Page(listOf(summary("e1").copy(type = "episode", episodeNumber = 1)), "next", 3)
            else Page(listOf(summary("e2").copy(type = "episode", episodeNumber = 2), selected.toSummary()), null, 3)
        })
        val model = DetailViewModel("e150", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        assertEquals(listOf("e1", "e150"), model.state.value.episodes.getValue("season").items.map { it.ratingKey })
        model.loadEpisodesNear("season", 1)
        advanceUntilIdle()
        assertEquals(listOf("e1", "e2", "e150"), model.state.value.episodes.getValue("season").items.map { it.ratingKey })
    }

    @Test fun watchlistMembershipLoadsWithoutBlockingPlayableDetails() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val membership = CompletableDeferred<Boolean?>()
        val model = DetailViewModel("10", FakeCatalogDataSource(detail = detail().copy(onWatchlist = null),
            watchlistStatusBlock = { membership.await() }), { snapshot(1) }, MutableSharedFlow())
        runCurrent()
        assertTrue(model.state.value.actionsReady)
        assertNull(model.state.value.detail?.onWatchlist)
        membership.complete(true)
        advanceUntilIdle()
        assertEquals(true, model.state.value.detail?.onWatchlist)
    }

    @Test fun unavailableWatchlistStaysUnknownAndCanBeRetried() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var attempts = 0
        val model = DetailViewModel("10", FakeCatalogDataSource(detail = detail().copy(onWatchlist = null),
            watchlistStatusBlock = { if (++attempts == 1) throw IOException("unavailable") else false }),
            { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        assertTrue(model.state.value.actionsReady)
        assertNull(model.state.value.detail?.onWatchlist)
        model.loadWatchlist()
        advanceUntilIdle()
        assertEquals(false, model.state.value.detail?.onWatchlist)
        assertEquals(2, attempts)
    }

    @Test fun oldWatchlistMembershipCannotOverrideAnotherIdentity() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val previous = CompletableDeferred<Boolean?>()
        val active = arrayOf(snapshot(1))
        var reads = 0
        val changes = MutableSharedFlow<IdentityChange>(extraBufferCapacity = 1)
        val model = DetailViewModel("10", FakeCatalogDataSource(detail = detail().copy(onWatchlist = null),
            watchlistStatusBlock = { if (++reads == 1) withContext(NonCancellable) { previous.await() } else false }),
            { active[0] }, changes)
        runCurrent()
        val old = active[0]; active[0] = snapshot(2)
        changes.emit(IdentityChange(old, active[0])); runCurrent()
        previous.complete(true); advanceUntilIdle()
        assertEquals(false, model.state.value.detail?.onWatchlist)
    }

    @Test fun oldWatchlistReadCannotUndoAConfirmedMutation() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val membership = CompletableDeferred<Boolean?>()
        val model = DetailViewModel("10", FakeCatalogDataSource(detail = detail().copy(onWatchlist = null),
            watchlistStatusBlock = { withContext(NonCancellable) { membership.await() } }),
            { snapshot(1) }, MutableSharedFlow())
        runCurrent()
        model.setWatchlist(false); runCurrent()
        membership.complete(true); advanceUntilIdle()
        assertEquals(false, model.state.value.detail?.onWatchlist)
    }

    @Test fun showWatchlistStateSurvivesEpisodeNavigation() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val show = detail("show").copy(onWatchlist = null)
        val episode = detail("episode").copy(ratingKey = "episode", parentRatingKey = "season", grandparentRatingKey = show.ratingKey)
        val model = DetailViewModel("10", FakeCatalogDataSource(
            detailBlock = { if (it == "episode") episode else show }, watchlistStatusBlock = { true }),
            { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        assertEquals(true, model.state.value.detail?.onWatchlist)
        model.selectEpisode("episode"); advanceUntilIdle(); model.selectShowOverview(); advanceUntilIdle()
        assertEquals(true, model.state.value.detail?.onWatchlist)
    }

    @Test fun episodeEntryLoadsWatchlistWhenReturningToShow() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val show = detail("show").copy(onWatchlist = null)
        val episode = detail("episode").copy(ratingKey = "episode", parentRatingKey = "season", grandparentRatingKey = show.ratingKey)
        val model = DetailViewModel("episode", FakeCatalogDataSource(
            detailBlock = { if (it == "episode") episode else show }, watchlistStatusBlock = { true }),
            { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle(); model.selectShowOverview(); advanceUntilIdle()
        assertEquals(true, model.state.value.detail?.onWatchlist)
    }

    @Test fun confirmedWatchlistChangeSurvivesShowOverview() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val model = DetailViewModel("10", FakeCatalogDataSource(detail = detail("show").copy(onWatchlist = true)),
            { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle(); model.setWatchlist(false); advanceUntilIdle(); model.selectShowOverview(); advanceUntilIdle()
        assertEquals(false, model.state.value.detail?.onWatchlist)
    }

    @Test fun failedWatchlistWriteKeepsConfirmedMembership() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val model = DetailViewModel("10", FakeCatalogDataSource(detail = detail().copy(onWatchlist = true),
            watchlistBlock = { _, _ -> throw IOException("Not saved") }), { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle(); model.setWatchlist(false); advanceUntilIdle()
        assertEquals(true, model.state.value.detail?.onWatchlist)
        assertFalse(model.state.value.mutationInFlight)
        assertEquals("Not saved", model.state.value.error)
    }

    @Test fun selectedEpisodeWritesTargetThatEpisodeAndCannotChangeTheNextPreview() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val release = CompletableDeferred<Unit>()
        val writes = mutableListOf<String>()
        val data = FakeCatalogDataSource(
            detailBlock = { key -> detail("episode").copy(ratingKey = key, parentRatingKey = "season") },
            watchlistBlock = { key, _ -> writes += key; release.await() },
        )
        val model = DetailViewModel("original", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        model.selectEpisode("selected")
        advanceUntilIdle()
        model.setWatchlist(true)
        runCurrent()
        model.selectEpisode("next")
        runCurrent()
        release.complete(Unit)
        advanceUntilIdle()
        assertEquals(listOf("selected"), writes)
        assertEquals("next", model.state.value.detail?.ratingKey)
        assertEquals(false, model.state.value.detail?.onWatchlist)
    }

    @Test fun libraryRecommendationsDiscardThePreviousIdentity() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val old = snapshot(1)
        val replacement = snapshot(2)
        val current = arrayOf<SessionSnapshot?>(old)
        val changes = MutableSharedFlow<IdentityChange>(extraBufferCapacity = 1)
        val oldRows = CompletableDeferred<LibraryRecommendationsResponse>()
        val fresh = LibraryRecommendationsResponse(listOf(HomeRow("fresh", "recent", "Recent", listOf(summary("new")))))
        val data = FakeCatalogDataSource(recommendationsBlock = { session -> if (session == old) oldRows.await() else fresh })
        val model = LibraryRecommendationsViewModel("movies", data, { current[0] }, changes)
        runCurrent()
        current[0] = replacement
        changes.emit(IdentityChange(old, replacement))
        oldRows.complete(LibraryRecommendationsResponse(emptyList()))
        advanceUntilIdle()
        assertEquals(LoadState.Content(fresh.rows), model.state.value)
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

    @Test fun artworkColorsKeepTheirCornerOrderAndRejectMalformedMetadata() {
        assertArrayEquals(intArrayOf(0xFF112233.toInt(), 0xFFAABBCC.toInt(), 0xFF334455.toInt(), 0xFF223344.toInt()),
            artworkColorPixels(ArtworkColors("112233", "aabbcc", "223344", "334455")))
        assertNull(artworkColorPixels(ArtworkColors("#112233", "aabbcc", "223344", "334455")))
        assertNull(artworkColorPixels(ArtworkColors("-12345", "aabbcc", "223344", "334455")))
        assertNull(artworkColorPixels(null))
    }

    @Test fun releaseDateBrowseSortUsesTheSupportedNativeQuery() = runTest {
        server.enqueue(MockResponse.Builder().code(200).addHeader("Content-Type", "application/json")
            .body("""{"items":[],"nextCursor":null,"totalCount":0}""").build())
        val data = ApiCatalogDataSource(WatchtowerApi(HttpClients("android-tv/test")))
        data.libraryItems(snapshot(1), "movies", LIBRARY_RELEASE_DATE_SORT, "all", null)
        assertEquals("originallyAvailableAt:desc", server.takeRequest().url.queryParameter("sort"))
    }

    @Test fun libraryLettersCannotPublishAnOlderFiltersFacet() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val oldLetters = CompletableDeferred<List<LibraryLetter>>()
        val fresh = listOf(LibraryLetter("M", "unwatched-m"))
        val data = FakeCatalogDataSource(lettersBlock = { _, _, filter ->
            if (filter == "all") withContext(NonCancellable) { oldLetters.await() } else fresh
        })
        val model = LibraryViewModel("movies", data, { snapshot(1) }, MutableSharedFlow())
        runCurrent()
        model.setFilter("unwatched")
        runCurrent()
        assertEquals(fresh, model.state.value.letters)
        oldLetters.complete(listOf(LibraryLetter("A", "old-a")))
        advanceUntilIdle()
        assertEquals(fresh, model.state.value.letters)
    }

    @Test fun libraryLettersCannotPublishThePreviousIdentitysFacet() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val old = snapshot(1)
        val replacement = snapshot(2)
        val current = arrayOf<SessionSnapshot?>(old)
        val changes = MutableSharedFlow<IdentityChange>(extraBufferCapacity = 1)
        val oldLetters = CompletableDeferred<List<LibraryLetter>>()
        val fresh = listOf(LibraryLetter("M", "new-m"))
        val data = FakeCatalogDataSource(lettersBlock = { session, _, _ ->
            if (session == old) withContext(NonCancellable) { oldLetters.await() } else fresh
        })
        val model = LibraryViewModel("movies", data, { current[0] }, changes)
        runCurrent()
        current[0] = replacement
        changes.emit(IdentityChange(old, replacement))
        runCurrent()
        oldLetters.complete(listOf(LibraryLetter("A", "old-a")))
        advanceUntilIdle()
        assertEquals(fresh, model.state.value.letters)
    }

    @Test fun libraryLetterJumpReplacesThePageAndContinuesFromItsOwnCursor() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val cursors = mutableListOf<String?>()
        val data = FakeCatalogDataSource(libraryBlock = { _, _, cursor ->
            cursors += cursor
            when (cursor) {
                null -> Page(listOf(summary("a")), "after-a", 3)
                "letter-m" -> Page(listOf(summary("m")), "after-m", 3)
                "after-m" -> Page(listOf(summary("z")), null, 3)
                else -> error("Unexpected cursor: $cursor")
            }
        })
        val model = LibraryViewModel("movies", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        model.rememberFocus("a", 0)
        model.jumpToLetter("letter-m")
        advanceUntilIdle()
        assertEquals(listOf("m"), model.state.value.items.map { it.ratingKey })
        assertNull(model.state.value.focusedKey)
        model.loadNear(0)
        advanceUntilIdle()
        assertEquals(listOf("m", "z"), model.state.value.items.map { it.ratingKey })
        assertEquals(listOf(null, "letter-m", "after-m"), cursors)
    }

    @Test fun aLetterJumpCannotPublishThePreviousIdentitysPage() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val old = snapshot(1)
        val replacement = snapshot(2)
        val current = arrayOf<SessionSnapshot?>(old)
        val changes = MutableSharedFlow<IdentityChange>(extraBufferCapacity = 1)
        val oldPage = CompletableDeferred<Page<MediaSummary>>()
        val data = FakeCatalogDataSource(libraryBlock = { _, _, cursor ->
            if (cursor == "letter-m") oldPage.await()
            else Page(listOf(summary(if (current[0] == old) "old" else "new")), null, 1)
        })
        val model = LibraryViewModel("movies", data, { current[0] }, changes)
        advanceUntilIdle()
        model.jumpToLetter("letter-m")
        runCurrent()
        assertTrue(model.state.value.loading)
        current[0] = replacement
        changes.emit(IdentityChange(old, replacement))
        oldPage.complete(Page(listOf(summary("stale")), null, 1))
        advanceUntilIdle()
        assertEquals(listOf("new"), model.state.value.items.map { it.ratingKey })
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

    @Test fun categorySelectionLoadsRealGenresOpensBrowseAndClearsBackToAll() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val requests = mutableListOf<String?>()
        val data = FakeCatalogDataSource(filtersBlock = { LibraryFiltersResponse(listOf("Action", "Comedy"), emptyList()) },
            genreLibraryBlock = { genre, _ -> requests += genre; Page(listOf(summary(genre ?: "all")), null, 1) })
        val model = LibraryViewModel("movies", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        model.setSource("categories")
        advanceUntilIdle()
        assertEquals(listOf("Action", "Comedy"), model.state.value.genres)
        model.selectGenre("Action")
        advanceUntilIdle()
        assertEquals("browse", model.state.value.source)
        assertEquals("Action", model.state.value.genre)
        assertEquals("Action", model.state.value.focusedGenre)
        assertEquals(listOf("Action"), model.state.value.items.map { it.ratingKey })
        model.clearGenre()
        advanceUntilIdle()
        assertNull(model.state.value.genre)
        assertEquals("all", model.state.value.filter)
        assertEquals(listOf("all"), model.state.value.items.map { it.ratingKey })
        assertEquals(listOf(null, "Action", null), requests)
    }

    @Test fun genreChangesRejectAnOlderPageAndAlphabetForThePreviousCategory() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val oldPage = CompletableDeferred<Page<MediaSummary>>()
        val oldLetters = CompletableDeferred<List<LibraryLetter>>()
        val data = FakeCatalogDataSource(filtersBlock = { LibraryFiltersResponse(listOf("Action", "Comedy"), emptyList()) },
            genreLibraryBlock = { genre, _ -> if (genre == "Action") withContext(NonCancellable) { oldPage.await() }
                else Page(listOf(summary(genre ?: "all")), null, 1) },
            genreLettersBlock = { genre -> if (genre == "Action") withContext(NonCancellable) { oldLetters.await() }
                else listOf(LibraryLetter("C", "${genre ?: "all"}-cursor")) })
        val model = LibraryViewModel("movies", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        model.setSource("categories"); advanceUntilIdle()
        model.selectGenre("Action"); runCurrent()
        model.selectGenre("Comedy"); runCurrent()
        oldPage.complete(Page(listOf(summary("stale")), null, 1))
        oldLetters.complete(listOf(LibraryLetter("A", "stale-cursor")))
        advanceUntilIdle()
        assertEquals("Comedy", model.state.value.genre)
        assertEquals(listOf("Comedy"), model.state.value.items.map { it.ratingKey })
        assertEquals(listOf(LibraryLetter("C", "Comedy-cursor")), model.state.value.letters)
    }

    @Test fun genreScopeIsSentToBothBrowseAndAlphabetRequests() = runTest {
        val api = ApiCatalogDataSource(WatchtowerApi(HttpClients("android-tv/test")))
        server.enqueue(MockResponse.Builder().code(200).body("""{"items":[],"nextCursor":null,"totalCount":0}""").build())
        server.enqueue(MockResponse.Builder().code(200).body("""{"letters":[]}""").build())
        api.libraryItems(snapshot(1), "movies", "titleSort:asc", "all", null, "Action")
        assertEquals("Action", server.takeRequest().url.queryParameter("genre"))
        api.libraryLetters(snapshot(1), "movies", "titleSort:asc", "all", "Action")
        val letters = server.takeRequest()
        assertEquals("Action", letters.url.queryParameter("genre"))
        assertEquals("50", letters.url.queryParameter("limit"))
    }

    @Test fun televisionSearchEditingKeepsSpacesAndDeletesWholeCharacters() {
        assertEquals("ab", editSearchQuery("a", "b"))
        assertEquals("a ", editSearchQuery("a", "space"))
        assertEquals("a", editSearchQuery("a😀", "backspace"))
        assertEquals("", editSearchQuery("", "backspace"))
        assertEquals("", editSearchQuery("resident", "clear"))
    }

    @Test fun searchResultFiltersHonorMediaTypeAndRealSources() {
        val library = listOf(summary("owned-movie"), summary("owned-show").copy(type = "show"))
        val external = listOf(summary("external-movie").copy(external = ExternalId("tmdb", "1", "movie")),
            summary("external-show").copy(type = "show", external = ExternalId("tmdb", "2", "show")))
        val state = SearchState(result = SearchResponse(library, external), mediaFilter = "tv", showLibrary = false)
        assertEquals(listOf("external-show"), filteredSearchResults(state).map { it.ratingKey })
        assertEquals(listOf("owned-movie"), filteredSearchResults(state.copy(mediaFilter = "movies", showLibrary = true, showExternal = false)).map { it.ratingKey })
    }

    @Test fun searchDisplaySettingsSurviveDebouncedResponses() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val model = SearchViewModel(FakeCatalogDataSource(), { snapshot(1) }, MutableSharedFlow())
        model.setMediaFilter("tv")
        model.setShowLibrary(false)
        model.setUseSystemKeyboard(true)
        model.search("resident")
        advanceUntilIdle()
        assertEquals("tv", model.state.value.mediaFilter)
        assertFalse(model.state.value.showLibrary)
        assertTrue(model.state.value.useSystemKeyboard)
    }

    @Test fun openedSearchesRememberFocusAndClearVisibleHistoryOnIdentityChange() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val old = snapshot(1)
        val replacement = snapshot(2)
        val current = arrayOf<SessionSnapshot?>(old)
        val changes = MutableSharedFlow<IdentityChange>(extraBufferCapacity = 1)
        val model = SearchViewModel(FakeCatalogDataSource(), { current[0] }, changes)
        model.search("resident")
        advanceUntilIdle()
        model.rememberResult(summary("show"))
        assertEquals(listOf("resident"), model.state.value.recentQueries)
        assertEquals("show", model.state.value.focusedResultKey)
        current[0] = replacement
        changes.emit(IdentityChange(old, replacement))
        advanceUntilIdle()
        assertEquals(emptyList<String>(), model.state.value.recentQueries)
        assertNull(model.state.value.focusedResultKey)
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
        assertFalse(viewModel.state.value.mutationInFlight)

        viewModel.setWatched(false)
        advanceUntilIdle()
        assertEquals(1, viewModel.state.value.detail?.viewCount)
        assertEquals("Write failed", viewModel.state.value.error)
        assertFalse(viewModel.state.value.mutationInFlight)
    }

    @Test fun collectionPagingDropsAStaleIdentityResponse() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val old = snapshot(1)
        val replacement = snapshot(2)
        val current = arrayOf<SessionSnapshot?>(old)
        val changes = MutableSharedFlow<IdentityChange>(extraBufferCapacity = 1)
        val oldPage = CompletableDeferred<Page<MediaSummary>>()
        val data = FakeCatalogDataSource(collectionItemsBlock = { snapshot, _ ->
            if (snapshot == old) oldPage.await() else Page(listOf(summary("new")), null, 1)
        })
        val viewModel = CollectionItemsViewModel("collection", data, { current[0] }, changes)

        runCurrent()
        current[0] = replacement
        changes.emit(IdentityChange(old, replacement))
        oldPage.complete(Page(listOf(summary("old")), null, 1))
        advanceUntilIdle()

        assertEquals(listOf("new"), viewModel.state.value.items.map { it.ratingKey })
    }

    @Test fun childrenContinuePastTheFirstPageForSeasonsAndEpisodes() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val cursors = mutableListOf<Pair<String, String?>>()
        val data = FakeCatalogDataSource(
            detail = detail("show"),
            childrenBlock = { key, cursor ->
                cursors += key to cursor
                when (key to cursor) {
                    "10" to null -> Page(listOf(summary("s1", 1)), "more-seasons", 2)
                    "10" to "more-seasons" -> Page(listOf(summary("s2", 2)), null, 2)
                    "s1" to null -> Page(listOf(summary("e1")), "more-episodes", 2)
                    "s1" to "more-episodes" -> Page(listOf(summary("e2")), null, 2)
                    else -> error("unexpected page")
                }
            },
        )
        val viewModel = DetailViewModel("10", data, { snapshot(1) }, MutableSharedFlow())

        advanceUntilIdle()
        viewModel.loadSeasonsNear(0)
        advanceUntilIdle()
        viewModel.loadSeason(viewModel.state.value.seasons.first())
        advanceUntilIdle()
        viewModel.loadEpisodesNear("s1", 0)
        advanceUntilIdle()

        assertEquals(listOf("s1", "s2"), viewModel.state.value.seasons.map { it.ratingKey })
        assertEquals(listOf("e1", "e2"), viewModel.state.value.episodes.getValue("s1").items.map { it.ratingKey })
        assertEquals(listOf("10" to null, "s1" to null, "10" to "more-seasons", "s1" to "more-episodes"), cursors)
    }

    @Test fun episodeIssueTargetUsesTheSeriesTmdbIdentity() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val child = detail("episode").copy(grandparentRatingKey = "show", guids = Guids(null, "999", null, null))
        val show = detail("show").copy(guids = Guids(null, "123", null, null))
        val data = FakeCatalogDataSource(detailBlock = { key -> if (key == "show") show else child })
        val viewModel = DetailViewModel("10", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        assertEquals(123, viewModel.state.value.requestTmdbId)
    }

    @Test fun failedSeriesLookupDoesNotUseAnEpisodeTmdbIdForReports() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val child = detail("episode").copy(grandparentRatingKey = "show", guids = Guids(null, "999", null, null))
        val data = FakeCatalogDataSource(detailBlock = { key -> if (key == "show") throw IOException("Unavailable") else child })
        val viewModel = DetailViewModel("10", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        assertNull(viewModel.state.value.requestTmdbId)
        assertEquals(child, viewModel.state.value.detail)
    }

    @Test fun openingASeasonLoadsItsOwnEpisodesAndPagesThem() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val cursors = mutableListOf<Pair<String, String?>>()
        val data = FakeCatalogDataSource(
            detail = detail("season"),
            childrenBlock = { key, cursor ->
                cursors += key to cursor
                if (cursor == null) Page(listOf(summary("e1")), "next", 2)
                else Page(listOf(summary("e2")), null, 2)
            },
        )
        val viewModel = DetailViewModel("10", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()
        assertEquals(listOf("e1"), viewModel.state.value.episodes.getValue("10").items.map { it.ratingKey })
        viewModel.loadEpisodesNear("10", 0)
        advanceUntilIdle()
        assertEquals(listOf("e1", "e2"), viewModel.state.value.episodes.getValue("10").items.map { it.ratingKey })
        assertEquals(listOf("10" to null, "10" to "next"), cursors)
    }

    @Test fun ratingIsOptimisticAndRollsBackOnFailure() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val release = CompletableDeferred<Unit>()
        val data = FakeCatalogDataSource(
            detail = detail(),
            ratingBlock = { release.await(); throw IOException("Rating failed") },
        )
        val viewModel = DetailViewModel("10", data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()

        viewModel.setRating(8.0)
        runCurrent()
        assertEquals(8.0, viewModel.state.value.detail?.userRating)
        release.complete(Unit)
        advanceUntilIdle()

        assertNull(viewModel.state.value.detail?.userRating)
        assertEquals("Rating failed", viewModel.state.value.error)
        assertFalse(viewModel.state.value.mutationInFlight)
    }

    @Test fun requestAvailabilityIsNeverLoadedWhenFeatureIsDisabled() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var calls = 0
        val data = FakeCatalogDataSource(requestAvailabilityBlock = {
            calls += 1
            RequestAvailability("available", "available", emptyList(), emptyList())
        })

        val viewModel = RequestActionsViewModel("movie", 12, false, data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle()

        assertFalse(viewModel.state.value.enabled)
        assertEquals(0, calls)
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

    private fun detail(type: String = "movie") = MediaDetail(
        ratingKey = "10",
        type = type,
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

internal class FakeCatalogDataSource(
    private val ratingsBlock: suspend (String) -> io.github.jovalle.watchtower.tv.api.MediaRatingsResponse = { io.github.jovalle.watchtower.tv.api.MediaRatingsResponse() },
    private val dismissBlock: suspend () -> Unit = {},
    private val homeBlock: suspend (SessionSnapshot) -> HomeResponse = { HomeResponse(emptyList(), emptyList(), emptyList()) },
    private val libraryBlock: suspend (String, String, String?) -> Page<MediaSummary> = { _, _, _ -> Page(emptyList(), null, 0) },
    private val searchBlock: suspend (String) -> SearchResponse = { SearchResponse(emptyList(), emptyList()) },
    private val detail: MediaDetail? = null,
    private val watchedBlock: suspend (Boolean) -> Unit = {},
    private val childrenBlock: suspend (String, String?) -> Page<MediaSummary> = { _, _ -> Page(emptyList(), null, 0) },
    private val collectionItemsBlock: suspend (SessionSnapshot, String?) -> Page<MediaSummary> = { _, _ -> Page(emptyList(), null, 0) },
    private val ratingBlock: suspend (Double?) -> Unit = {},
    private val requestAvailabilityBlock: suspend () -> RequestAvailability = {
        RequestAvailability("available", "available", emptyList<RequestEntry>(), emptyList<SeasonAvailability>())
    },
    private val detailBlock: (suspend (String) -> MediaDetail)? = null,
    private val watchlistBlock: suspend (String, Boolean) -> Unit = { _, _ -> },
    private val watchlistStatusBlock: suspend () -> Boolean? = { null },
    private val addToPlaylistBlock: suspend (String) -> Unit = {},
    private val recommendationsBlock: suspend (SessionSnapshot) -> LibraryRecommendationsResponse = { LibraryRecommendationsResponse(emptyList()) },
    private val lettersBlock: suspend (SessionSnapshot, String, String) -> List<LibraryLetter> = { _, _, _ -> emptyList() },
    private val filtersBlock: suspend (SessionSnapshot) -> LibraryFiltersResponse = { LibraryFiltersResponse(emptyList(), emptyList()) },
    private val genreLibraryBlock: (suspend (String?, String?) -> Page<MediaSummary>)? = null,
    private val genreLettersBlock: (suspend (String?) -> List<LibraryLetter>)? = null,
) : CatalogDataSource {
    override suspend fun home(snapshot: SessionSnapshot) = homeBlock(snapshot)
    override suspend fun libraries(snapshot: SessionSnapshot) = emptyList<LibrarySection>()
    override suspend fun libraryRecommendations(snapshot: SessionSnapshot, sectionId: String) = recommendationsBlock(snapshot)
    override suspend fun libraryLetters(snapshot: SessionSnapshot, sectionId: String, sort: String, filter: String, genre: String?) =
        genreLettersBlock?.invoke(genre) ?: lettersBlock(snapshot, sort, filter)
    override suspend fun libraryFilters(snapshot: SessionSnapshot, sectionId: String) = filtersBlock(snapshot)
    override suspend fun libraryItems(
        snapshot: SessionSnapshot,
        sectionId: String,
        sort: String,
        filter: String,
        cursor: String?,
        genre: String?,
    ) = genreLibraryBlock?.invoke(genre, cursor) ?: libraryBlock(sort, filter, cursor)
    override suspend fun libraryCollections(snapshot: SessionSnapshot, sectionId: String) = emptyList<CollectionSummary>()
    override suspend fun collectionItems(snapshot: SessionSnapshot, collectionId: String, cursor: String?) =
        collectionItemsBlock(snapshot, cursor)
    override suspend fun media(snapshot: SessionSnapshot, ratingKey: String) = detailBlock?.invoke(ratingKey) ?: requireNotNull(detail)
    override suspend fun children(snapshot: SessionSnapshot, ratingKey: String, cursor: String?) = childrenBlock(ratingKey, cursor)
    override suspend fun search(snapshot: SessionSnapshot, query: String) = searchBlock(query)
    override suspend fun watchlist(snapshot: SessionSnapshot, source: String) =
        WatchlistResponse(emptyList(), WatchlistCounts(0, 0, 0, 0), emptyList())
    override suspend fun dismissContinueWatching(snapshot: SessionSnapshot, ratingKey: String) = dismissBlock()
    override suspend fun setWatched(snapshot: SessionSnapshot, ratingKey: String, watched: Boolean) = watchedBlock(watched)
    override suspend fun setRating(snapshot: SessionSnapshot, ratingKey: String, rating: Double?) = ratingBlock(rating)
    override suspend fun mediaRatings(snapshot: SessionSnapshot, ratingKey: String) = ratingsBlock(ratingKey)
    override suspend fun watchlistStatus(snapshot: SessionSnapshot, ratingKey: String) = watchlistStatusBlock()
    override suspend fun setWatchlist(snapshot: SessionSnapshot, ratingKey: String, add: Boolean) = watchlistBlock(ratingKey, add)
    override suspend fun playlists(snapshot: SessionSnapshot) = emptyList<PlaylistSummary>()
    override suspend fun playlistItems(snapshot: SessionSnapshot, playlistId: String, cursor: String?) =
        Page(emptyList<PlaylistItem>(), null, 0)
    override suspend fun addToPlaylist(snapshot: SessionSnapshot, playlistId: String, ratingKey: String) = addToPlaylistBlock(ratingKey)
    override suspend fun removeFromPlaylist(snapshot: SessionSnapshot, playlistId: String, playlistItemId: String) = Unit
    override suspend fun requestAvailability(snapshot: SessionSnapshot, type: String, tmdbId: Int) = requestAvailabilityBlock()
    override suspend fun createRequest(snapshot: SessionSnapshot, type: String, tmdbId: Int) = requestAvailabilityBlock()
    override suspend fun createIssue(snapshot: SessionSnapshot, type: String, tmdbId: Int, issueType: Int, message: String) = Unit
}
