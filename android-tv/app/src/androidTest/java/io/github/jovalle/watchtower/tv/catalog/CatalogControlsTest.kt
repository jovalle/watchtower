package io.github.jovalle.watchtower.tv.catalog

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.onRoot
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import androidx.tv.material3.darkColorScheme
import io.github.jovalle.watchtower.tv.WatchtowerApp
import org.junit.Assert.assertTrue
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.pressKey
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import io.github.jovalle.watchtower.tv.api.ExternalId
import io.github.jovalle.watchtower.tv.api.HomeResponse
import io.github.jovalle.watchtower.tv.api.HomeRow
import io.github.jovalle.watchtower.tv.platform.WatchNextManager
import io.github.jovalle.watchtower.tv.platform.WatchNextSink
import io.github.jovalle.watchtower.tv.platform.WatchNextEntry
import io.github.jovalle.watchtower.tv.api.LibraryLetter
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.PlaylistItem
import org.junit.Assert.assertEquals
import coil3.ImageLoader
import coil3.intercept.Interceptor
import coil3.request.ErrorResult
import coil3.request.ImageResult
import java.io.IOException
import org.junit.Rule
import org.junit.Test

class CatalogControlsTest {
    @get:Rule val compose = createComposeRule()

    @Test fun ratingControlExposesItsValueAndChangesWithDpad() {
        val ratings = mutableListOf<Double?>()
        compose.setContent { MaterialTheme { RatingControl(6.0, true, ratings::add) } }

        val rating = compose.onNodeWithContentDescription("Star rating")
        rating.performSemanticsAction(SemanticsActions.RequestFocus)
        rating.assertIsFocused()
        rating.performKeyInput { pressKey(Key.DirectionRight); pressKey(Key.DirectionCenter) }

        compose.runOnIdle { assertEquals(listOf(7.0), ratings) }
    }

    @Test fun smartPlaylistExposesPlayAndDetailsButDisablesRemoval() {
        compose.setContent {
            MaterialTheme {
                PlaylistItemActions(
                    item = playlistItem(),
                    smart = true,
                    onOpen = {},
                    onPlay = {},
                    onRemove = {},
                )
            }
        }

        compose.onNodeWithContentDescription("Play Episode one").performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithContentDescription("Play Episode one").assertIsFocused()
        compose.onNodeWithContentDescription("Details").assertExists()
        compose.onNodeWithContentDescription("Remove from Playlist").assertIsNotEnabled()
    }

    @Test fun homeRowRestoresTheLastFocusedCardWhenItReturns() {
        lateinit var showing: MutableState<Boolean>
        val items = List(8) { index -> media("$index") }
        compose.setContent {
            MaterialTheme {
                showing = remember { mutableStateOf(true) }
                var focusedKey by rememberSaveable { mutableStateOf<String?>(items.first().stableKey) }
                if (showing.value) {
                    FocusRestoringHomeRow(items, focusedKey, { focusedKey = it }) { item, modifier ->
                        Button(onClick = {}, modifier = modifier) { Text(item.title) }
                    }
                }
            }
        }

        compose.onNodeWithText("Item 0").assertIsFocused()
        compose.onNodeWithText("Item 6").performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused()
        compose.runOnIdle { showing.value = false }
        compose.runOnIdle { showing.value = true }

        compose.onNodeWithText("Item 6").assertIsFocused()
    }

    @Test fun focusedMediaTitleRemainsReadableOnItsDarkCard() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        compose.setContent { MaterialTheme(colorScheme = darkColorScheme()) { MediaCard(graph, media("1")) {} } }
        compose.onNodeWithText("Item 1").performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused()
        compose.mainClock.advanceTimeBy(1_000)
        val layouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
        compose.onNodeWithText("Item 1", useUnmergedTree = true)
            .performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
        val color = layouts.single().layoutInput.style.color
        assertTrue("Focused title color was $color", color.red > 0.8f && color.green > 0.8f && color.blue > 0.8f)
    }

    @Test fun homeStartsOnTheFirstPosterAndFocusUpdatesTheHero() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        val home = HomeResponse(listOf(media("featured")), listOf(HomeRow("row", "recent", "Recent", listOf(media("first"), media("second")))), emptyList())
        val watchNext = WatchNextManager(object : WatchNextSink {
            override suspend fun publish(entry: WatchNextEntry) = Unit
            override suspend fun remove(ratingKey: String) = Unit
            override suspend fun removeAll() = Unit
        })
        compose.setContent { MaterialTheme { HomeContent(graph, home, watchNext, {}, {}) } }
        compose.onNodeWithContentDescription("Item first", substring = true).assertIsFocused()
        compose.onNodeWithContentDescription("Item second", substring = true).performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithContentDescription("Item second", substring = true).assertIsFocused()
        compose.onNode(hasText("Item second") and SemanticsMatcher.expectValue(SemanticsProperties.Heading, Unit)).assertExists()
        compose.onNodeWithText("Item featured").assertDoesNotExist()
    }

    @Test fun homeHeroPlaysTheFocusedMovieAndResumesTheFocusedEpisode() {
        val routes = mutableListOf<PlayerRoute>()
        val movie = media("movie")
        val episode = media("episode").copy(type = "episode", viewOffsetMs = 50_000)
        showHome(listOf(movie, episode), onPlay = routes::add)

        compose.onNodeWithContentDescription("Play").performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onNodeWithContentDescription("Item episode", substring = true)
            .performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithContentDescription("Resume").performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }

        compose.runOnIdle { assertEquals(listOf(PlayerRoute("movie"), PlayerRoute("episode")), routes) }
    }

    @Test fun rapidHomeFocusChangeDispatchesTheCurrentHeroForPlayAndDetails() {
        val routes = mutableListOf<PlayerRoute>()
        val details = mutableListOf<String>()
        showHome(listOf(media("a"), media("b")), onDetails = details::add, onPlay = routes::add)
        compose.onNodeWithContentDescription("Item a", substring = true)
            .performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithContentDescription("Item b", substring = true)
            .performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithContentDescription("Play").performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onNodeWithContentDescription("Details").performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.runOnIdle {
            assertEquals(listOf(PlayerRoute("b")), routes)
            assertEquals(listOf("b"), details)
        }
    }

    @Test fun homeHeroOpensShowSeasonAndExternalDetailsWithoutPlayingTheirKeys() {
        val routes = mutableListOf<PlayerRoute>()
        val details = mutableListOf<String>()
        val externalDetails = mutableListOf<MediaSummary>()
        val external = media("external").copy(ratingKey = null, external = ExternalId("tmdb", "99", "movie"))
        showHome(listOf(media("show").copy(type = "show"), media("season").copy(type = "season"), external),
            onDetails = details::add, onPlay = routes::add, onExternalDetails = externalDetails::add)
        compose.onNodeWithContentDescription("Episodes").performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onNodeWithContentDescription("Item season", substring = true)
            .performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithContentDescription("Episodes").performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onNodeWithContentDescription("Item external", substring = true)
            .performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithContentDescription("Play").assertDoesNotExist()
        compose.onNodeWithContentDescription("Details").performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.runOnIdle {
            assertEquals(emptyList<PlayerRoute>(), routes)
            assertEquals(listOf("show", "season"), details)
            assertEquals(listOf(external), externalDetails)
        }
    }

    @Test fun homeHeroWithoutALocalKeyOrExternalDestinationCannotLaunchPlayback() {
        val routes = mutableListOf<PlayerRoute>()
        showHome(listOf(media("unavailable").copy(ratingKey = null)), onPlay = routes::add)
        compose.onNodeWithContentDescription("Play").assertDoesNotExist()
        compose.onNodeWithContentDescription("Details").assertIsNotEnabled()
        compose.runOnIdle { assertTrue(routes.isEmpty()) }
    }

    @Test fun homeRemoteReturnsFromHeroAndDetailsToTheSavedPoster() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        val home = HomeResponse(emptyList(), listOf(
            HomeRow("row", "recent", "Recent", listOf(media("a"), media("b"))),
            HomeRow("next", "recommended", "Next shelf", listOf(media("c"), media("d"))),
        ), emptyList())
        compose.setContent { MaterialTheme {
            val saved = rememberSaveableStateHolder()
            var details by remember { mutableStateOf<String?>(null) }
            if (details == null) saved.SaveableStateProvider("home") {
                HomeContent(graph, home, quietWatchNext(), { details = it }, {})
            } else {
                BackHandler { details = null }
                Button(onClick = { details = null }) { Text("Return from detail") }
            }
        } }
        val poster = compose.onNodeWithContentDescription("Item b", substring = true)
        poster.performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionDown) }
        compose.mainClock.advanceTimeBy(1_000)
        compose.onNodeWithContentDescription("Item d", substring = true).assertIsFocused().assertIsDisplayed()
            .performKeyInput { pressKey(Key.DirectionUp) }
        compose.mainClock.advanceTimeBy(1_000)
        poster.assertIsFocused().assertIsDisplayed().performKeyInput { pressKey(Key.DirectionUp) }
        val play = compose.onNodeWithContentDescription("Play")
        play.assertIsFocused().performKeyInput { pressKey(Key.DirectionDown) }
        poster.assertIsFocused().performKeyInput { pressKey(Key.DirectionUp) }
        play.assertIsFocused().performKeyInput { pressKey(Key.DirectionRight) }
        compose.onNodeWithContentDescription("Details").assertIsFocused()
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onNodeWithText("Return from detail").assertIsDisplayed()
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
        poster.assertIsFocused()
    }

    @Test fun homeLongEpisodeAtLargeTextKeepsHeroCaptionAndFullPosterReachable() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        val episode = media("long").copy(
            type = "episode",
            title = "An exceptionally long episode title that must remain bounded above the shelf",
            showTitle = "The remarkably long name of a television series that wraps across two lines",
            seasonNumber = 12,
            episodeNumber = 24,
            summary = "A detailed synopsis keeps this episode understandable while leaving its viewing actions and discovery shelf reachable. ".repeat(4),
        )
        val home = HomeResponse(emptyList(), listOf(HomeRow("row", "recent", "Continue Watching", listOf(episode))), emptyList())
        val density = InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density
        compose.setContent {
            val currentDensity = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(currentDensity.density, fontScale = 1.3f)) {
                MaterialTheme { HomeContent(graph, home, quietWatchNext(), {}, {}) }
            }
        }
        val poster = compose.onNodeWithContentDescription(episode.title, substring = true)
        poster.assertIsFocused().performKeyInput { pressKey(Key.DirectionUp) }
        compose.onNodeWithContentDescription("Play").assertIsFocused()
            .performKeyInput { pressKey(Key.DirectionRight) }
        val details = compose.onNodeWithContentDescription("Details")
        details.assertIsFocused().assertIsDisplayed()
        compose.mainClock.advanceTimeBy(1_000)
        val heading = compose.onNodeWithText("Continue Watching")
        val headingBounds = heading.fetchSemanticsNode().boundsInRoot
        val headingFullBounds = heading.getUnclippedBoundsInRoot()
        assertTrue("Shelf heading is vertically clipped: $headingBounds versus $headingFullBounds",
            headingBounds.height >= (headingFullBounds.bottom - headingFullBounds.top).value * density - 1f)
        val caption = compose.onNodeWithText("Details", useUnmergedTree = true)
        caption.assertIsDisplayed()
        val captionBounds = caption.fetchSemanticsNode().boundsInRoot
        val playBounds = compose.onNodeWithContentDescription("Play").fetchSemanticsNode().boundsInRoot
        assertTrue("Hero Details caption overlaps the shelf heading", captionBounds.bottom <= headingBounds.top)
        assertTrue("Hero Play overlaps the shelf heading", playBounds.bottom <= headingBounds.top)
        details.performKeyInput { pressKey(Key.DirectionDown) }
        compose.mainClock.advanceTimeBy(1_000)
        poster.assertIsFocused().assertIsDisplayed()
        val posterBounds = poster.fetchSemanticsNode().boundsInRoot
        val rootBounds = compose.onRoot().fetchSemanticsNode().boundsInRoot
        assertEquals(112f, posterBounds.width / density, 1f)
        assertEquals(168f, posterBounds.height / density, 1f)
        assertTrue("Full poster must remain inside the viewport", posterBounds.top >= rootBounds.top && posterBounds.bottom <= rootBounds.bottom)
    }

    private fun showHome(
        items: List<MediaSummary>,
        onDetails: (String) -> Unit = {},
        onPlay: (PlayerRoute) -> Unit = {},
        onExternalDetails: ((MediaSummary) -> Unit)? = null,
    ) {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        val home = HomeResponse(emptyList(), listOf(HomeRow("row", "recent", "Recent", items)), emptyList())
        compose.setContent { MaterialTheme { HomeContent(graph, home, quietWatchNext(), onDetails, onPlay, onExternalDetails) } }
    }

    private fun quietWatchNext() = WatchNextManager(object : WatchNextSink {
        override suspend fun publish(entry: WatchNextEntry) = Unit
        override suspend fun remove(ratingKey: String) = Unit
        override suspend fun removeAll() = Unit
    })

    @Test fun homePosterFocusKeepsTheHeroAndRowsApart() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        val synopsis = "A readable summary that stays above the focused row."
        val first = media("first").copy(summary = synopsis)
        val next = media("next").copy(summary = synopsis)
        val home = HomeResponse(emptyList(), listOf(
            HomeRow("recent", "recent", "Recent", listOf(first)),
            HomeRow("next", "next", "Next", listOf(next)),
        ), emptyList())
        val watchNext = WatchNextManager(object : WatchNextSink {
            override suspend fun publish(entry: WatchNextEntry) = Unit
            override suspend fun remove(ratingKey: String) = Unit
            override suspend fun removeAll() = Unit
        })
        val density = InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density
        compose.setContent { MaterialTheme { HomeContent(graph, home, watchNext, {}, {}) } }
        compose.mainClock.advanceTimeBy(1_000)
        val firstPoster = compose.onNodeWithContentDescription("Item first", substring = true)
        firstPoster.assertIsFocused()
        val firstTop = firstPoster.fetchSemanticsNode().boundsInRoot.top / density
        assertTrue("First focused poster must fit the viewport; top was $firstTop dp", firstTop >= 0f && firstTop + 168f <= 541f)
        val posterBounds = firstPoster.fetchSemanticsNode().boundsInRoot
        assertEquals(112f, posterBounds.width / density, 1f)
        assertEquals(168f, posterBounds.height / density, 1f)
        val heroBottom = compose.onNodeWithContentDescription("Play").fetchSemanticsNode().boundsInRoot.bottom
        val headingTop = compose.onNodeWithText("Recent").fetchSemanticsNode().boundsInRoot.top
        assertTrue("Home hero overlaps the row heading", heroBottom <= headingTop)

        val nextPoster = compose.onNodeWithContentDescription("Item next", substring = true)
        nextPoster.performSemanticsAction(SemanticsActions.RequestFocus)
        compose.mainClock.advanceTimeBy(1_000)
        val nextTop = nextPoster.fetchSemanticsNode().boundsInRoot.top / density
        assertTrue("Next focused poster must fit the viewport; top was $nextTop dp", nextTop >= 0f && nextTop + 168f <= 541f)
    }

    @Test fun alphabetIndexSelectsTheRealCursorWithTheRemote() {
        val selections = mutableListOf<String>()
        compose.setContent { MaterialTheme {
            LibraryLetterBar(listOf(LibraryLetter("A", "cursor-a"), LibraryLetter("M", "cursor-m")), selections::add)
        } }
        val letter = compose.onNodeWithContentDescription("Jump to M")
        letter.performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused()
        letter.performKeyInput { pressKey(Key.DirectionCenter) }
        compose.runOnIdle { assertEquals(listOf("cursor-m"), selections) }
        compose.onNodeWithContentDescription("Jump to B").assertDoesNotExist()
    }

    @Test fun recommendedDuplicateMediaRestoresOnlyItsSavedShelf() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        lateinit var showing: MutableState<Boolean>
        val rows = listOf(HomeRow("one", "recent", "Shelf one", listOf(media("shared"))),
            HomeRow("two", "popular", "Shelf two", listOf(media("shared"))))
        compose.setContent { MaterialTheme {
            showing = remember { mutableStateOf(true) }
            if (showing.value) RecommendedRows(graph, rows, "one", "shared", { _, _ -> }, {})
        } }
        val savedCard = compose.onNode(hasContentDescription("Item shared", substring = true) and
            hasAnyAncestor(hasContentDescription("Shelf one")))
        savedCard.performSemanticsAction(SemanticsActions.RequestFocus)
        compose.runOnIdle { showing.value = false }
        compose.runOnIdle { showing.value = true }
        savedCard.assertIsFocused()
    }

    @Test fun failedPosterRequestKeepsTheFullMediaTitleReadable() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val loader = ImageLoader.Builder(context).components {
            add(object : Interceptor {
                override suspend fun intercept(chain: Interceptor.Chain): ImageResult =
                    ErrorResult(null, chain.request, IOException("HTTP 404"))
            })
        }.build()
        try {
            compose.setContent { MaterialTheme {
                CatalogImageContent("https://example.invalid/poster.jpg", loader, "A missing poster still has a title",
                    Modifier.width(120.dp).height(180.dp), ContentScale.Crop)
            } }
            compose.waitUntil(timeoutMillis = 5_000) {
                compose.onAllNodes(hasText("A missing poster still has a title")).fetchSemanticsNodes().isNotEmpty()
            }
            compose.onNodeWithText("A missing poster still has a title").assertIsDisplayed()
        } finally { loader.shutdown() }
    }

    @Test fun showTabPrecedesSeasonsAndRemainsReachableOnTheOverview() {
        val show = minimalShow()
        val season = media("season").copy(type = "season", title = "Season 1")
        val actions = mutableListOf<String>()
        compose.setContent { MaterialTheme {
            var state by remember { mutableStateOf(DetailState(detail = show.copy(type = "episode"), seriesDetail = show,
                selectedSeasonKey = "season", seasons = listOf(season), loading = false)) }
            DetailSeasonTabs(state, { actions += "show"; state = state.copy(detail = show, selectedSeasonKey = null) },
                { actions += it.ratingKey.orEmpty() })
        } }
        val showTab = compose.onNodeWithContentDescription("Show")
        showTab.performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused()
        showTab.performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onNodeWithContentDescription("Season 1").assertIsDisplayed()
        showTab.assertIsDisplayed()
        compose.runOnIdle { assertEquals(listOf("show"), actions) }
    }

    private fun minimalShow() = io.github.jovalle.watchtower.tv.api.MediaDetail(
        ratingKey = "show", type = "show", title = "Show", year = null, posterUrl = null, backdropUrl = null,
        thumbUrl = null, durationMs = null, viewOffsetMs = null, viewCount = 0, leafCount = null, viewedLeafCount = null,
        contentRating = null, showTitle = null, seasonNumber = null, episodeNumber = null, parentRatingKey = null,
        grandparentRatingKey = null, external = null, summary = null, tagline = null, studio = null, genres = emptyList(),
        directors = emptyList(), cast = emptyList(), audienceRating = null, criticRating = null, userRating = null,
        originallyAvailableAt = null, editionTitle = null, editions = emptyList(),
        guids = io.github.jovalle.watchtower.tv.api.Guids(null, null, null, null), versions = emptyList(), markers = emptyList(),
        onWatchlist = false, playable = false)

    private fun playlistItem() = PlaylistItem(
        ratingKey = "42",
        type = "episode",
        title = "Episode one",
        year = 2026,
        posterUrl = null,
        backdropUrl = null,
        thumbUrl = null,
        durationMs = 1_800_000,
        viewOffsetMs = 0,
        viewCount = 0,
        leafCount = null,
        viewedLeafCount = null,
        contentRating = null,
        showTitle = "Show",
        seasonNumber = 1,
        episodeNumber = 1,
        parentRatingKey = "season",
        grandparentRatingKey = "show",
        external = null,
        playlistItemId = "playlist-item-42",
    )

    @Test fun resumedHeroExposesStartOverWatchedAndWatchlist() {
        showHome(listOf(media("resume").copy(durationMs = 600_000, viewOffsetMs = 120_000)))
        compose.onNodeWithContentDescription("Start Over").assertIsDisplayed()
        compose.onNodeWithContentDescription("Mark Watched").assertIsDisplayed()
        compose.onNodeWithContentDescription("Check Watchlist").assertIsDisplayed()
    }

    @Test fun heroShowsElapsedAndRemainingTime() {
        showHome(listOf(media("resume").copy(durationMs = 600_000, viewOffsetMs = 120_000)))
        compose.onNodeWithText("2m / 10m").assertIsDisplayed()
        compose.onNodeWithText("8m left").assertIsDisplayed()
    }

    @Test fun heroShowsListingGenresAndProviderBadges() {
        showHome(listOf(media("rich").copy(durationMs = 9_660_000, genres = listOf("Western", "Adventure"),
            ratings = listOf(io.github.jovalle.watchtower.tv.api.ProviderRating("imdb", "rating", 8.8, 10)))))
        compose.onNodeWithText("Western").assertIsDisplayed()
        compose.onNodeWithText("2h 41m").assertIsDisplayed()
        compose.onNodeWithContentDescription("IMDb rating 8.8 out of 10").assertIsDisplayed()
    }

    @Test fun heroAndFirstShelfUseAConsistentGap() {
        showHome(listOf(media("short")))
        val bottom = compose.onNodeWithContentDescription("Details").getUnclippedBoundsInRoot().bottom
        val shelf = compose.onNodeWithText("Recent").getUnclippedBoundsInRoot().top
        assertTrue("Expected reserved caption and32dp gap; got ${shelf-bottom}", (shelf-bottom).value in 48f..56f)
    }

    @Test fun dismissingTheLastContinueItemLeavesAFocusedRecoveryControl() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        var home by mutableStateOf(HomeResponse(emptyList(), listOf(HomeRow("cw", "continue_watching", "Continue Watching", listOf(media("last")))), emptyList()))
        compose.setContent { MaterialTheme { HomeContent(graph, home, quietWatchNext(), {}, {}, onHeroAction = {
            if (it == HeroAction.Dismiss) home = home.copy(rows = emptyList())
        }) } }
        compose.onNodeWithContentDescription("Remove from Continue Watching").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithContentDescription("Refresh Home").assertIsFocused().assertIsDisplayed()
    }

    @Test fun homeStartOverRoutesToZeroWithoutMutatingTheSavedProgress() {
        val routes = mutableListOf<PlayerRoute>()
        showHome(listOf(media("resume").copy(durationMs = 600_000, viewOffsetMs = 120_000)), onPlay = routes::add)
        compose.onNodeWithContentDescription("Start Over").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(listOf(PlayerRoute("resume", startPositionMs = 0)), routes) }
        compose.onNodeWithText("2m / 10m").assertIsDisplayed()
    }

    @Test fun pendingHeroActionsKeepTheShelfInPlaceWithoutSavedOrSavingBodyLines() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        var busy by mutableStateOf(false)
        val home = HomeResponse(emptyList(), listOf(HomeRow("row", "recent", "Recent", listOf(media("pending")))), emptyList())
        compose.setContent { MaterialTheme { HomeContent(graph, home, quietWatchNext(), {}, {},
            heroActions = HeroActionsState("pending", false, busy)) } }
        val top = compose.onNodeWithText("Recent").getUnclippedBoundsInRoot().top
        compose.runOnIdle { busy = true }
        compose.onNodeWithContentDescription("Play").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Add to Watchlist").assertIsNotEnabled()
        assertEquals(top, compose.onNodeWithText("Recent").getUnclippedBoundsInRoot().top)
        compose.onNodeWithText("Saved").assertDoesNotExist()
        compose.onNodeWithText("Saving…").assertDoesNotExist()
    }

    @Test fun richHeroAtLargeTextKeepsItsTitleAndFocusedFirstPosterVisible() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        val item = media("rich-large").copy(title = "A very long featured movie title that wraps onto two lines",
            durationMs = 600_000, viewOffsetMs = 120_000, genres = listOf("Western", "Adventure"),
            ratings = listOf(io.github.jovalle.watchtower.tv.api.ProviderRating("imdb", "rating", 8.8, 10),
                io.github.jovalle.watchtower.tv.api.ProviderRating("rotten_tomatoes", "critic", 97.0, 100)),
            summary = "A detailed synopsis that provides useful context without hiding the selected title or the first shelf. ".repeat(4))
        val home = HomeResponse(emptyList(), listOf(HomeRow("cw", "continue_watching", "Continue Watching", listOf(item))), emptyList())
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                MaterialTheme { HomeContent(graph, home, quietWatchNext(), {}, {}) }
            }
        }
        compose.mainClock.advanceTimeBy(1_000)
        val title = compose.onNode(hasText(item.title) and SemanticsMatcher.expectValue(SemanticsProperties.Heading, Unit)).getUnclippedBoundsInRoot()
        assertTrue("Hero title clipped above viewport: $title", title.top.value >= 0f)
        val poster = compose.onNodeWithContentDescription(item.title, substring = true)
        poster.assertIsFocused()
        val rect = poster.getUnclippedBoundsInRoot()
        assertTrue("Focused poster must remain fully visible: $rect", rect.top.value >= 0f && rect.bottom.value <= 541f)
    }

    @Test fun activeHeroUsesEnrichedRatingsInsteadOfAnOlderListingScore() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        val item = media("rating").copy(ratings = listOf(io.github.jovalle.watchtower.tv.api.ProviderRating("imdb", "rating", 8.4, 10)))
        val home = HomeResponse(emptyList(), listOf(HomeRow("row", "recent", "Recent", listOf(item))), emptyList())
        val enriched = listOf(io.github.jovalle.watchtower.tv.api.ProviderRating("imdb", "rating", 8.8, 10))
        compose.setContent { MaterialTheme { HomeContent(graph, home, quietWatchNext(), {}, {},
            heroActions = HeroActionsState(ratingKey = "rating", ratings = enriched)) } }
        compose.onNodeWithContentDescription("IMDb rating 8.8 out of 10").assertIsDisplayed()
        compose.onNodeWithContentDescription("IMDb rating 8.4 out of 10").assertDoesNotExist()
    }

    @Test fun malformedEnrichmentKeepsTheValidListingRating() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        val item = media("rating-fallback").copy(ratings = listOf(io.github.jovalle.watchtower.tv.api.ProviderRating("imdb", "rating", 8.4, 10)))
        val home = HomeResponse(emptyList(), listOf(HomeRow("row", "recent", "Recent", listOf(item))), emptyList())
        compose.setContent { MaterialTheme { HomeContent(graph, home, quietWatchNext(), {}, {},
            heroActions = HeroActionsState(ratingKey = "rating-fallback", ratings = listOf(
                io.github.jovalle.watchtower.tv.api.ProviderRating("imdb", "rating", 11.0, 10)))) } }
        compose.onNodeWithContentDescription("IMDb rating 8.4 out of 10").assertIsDisplayed()
        compose.onNodeWithContentDescription("IMDb rating 11 out of 10").assertDoesNotExist()
    }

    private fun media(id: String) = MediaSummary(
        ratingKey = id, type = "movie", title = "Item $id", year = 2026, posterUrl = null, backdropUrl = null,
        thumbUrl = null, durationMs = null, viewOffsetMs = null, viewCount = 0, leafCount = null,
        viewedLeafCount = null, contentRating = null, showTitle = null, seasonNumber = null, episodeNumber = null,
        parentRatingKey = null, grandparentRatingKey = null, external = null,
    )
}