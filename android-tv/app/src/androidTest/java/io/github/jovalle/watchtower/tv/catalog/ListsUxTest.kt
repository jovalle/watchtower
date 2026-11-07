package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.runtime.mutableStateOf
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.pressKey
import androidx.test.platform.app.InstrumentationRegistry
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.WatchtowerApp
import io.github.jovalle.watchtower.tv.api.ExternalId
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.PlaylistItem
import io.github.jovalle.watchtower.tv.api.WatchlistCounts
import io.github.jovalle.watchtower.tv.api.WatchlistItem
import io.github.jovalle.watchtower.tv.api.WatchlistResponse
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class ListsUxTest {
    @get:Rule val compose = createComposeRule()

    @Test fun playlistRowShowsTheYearToDistinguishMatchingTitles() {
        compose.setContent {
            MaterialTheme { PlaylistItemActions(playlistItem(), false, onOpen = {}, onPlay = {}, onRemove = {}) }
        }
        compose.onNodeWithText("2026").assertIsDisplayed()
    }

    @Test fun playlistPlayActionsStaySquareAndAlignedForDifferentTitleLengths() {
        compose.setContent { MaterialTheme { Column {
            PlaylistItemActions(playlistItem(), false, onOpen = {}, onPlay = {}, onRemove = {})
            PlaylistItemActions(playlistItem().copy(title = "A much longer movie title"), false, onOpen = {}, onPlay = {}, onRemove = {})
        } } }
        val short = compose.onNodeWithContentDescription("Play Same title").fetchSemanticsNode().boundsInRoot
        val long = compose.onNodeWithContentDescription("Play A much longer movie title").fetchSemanticsNode().boundsInRoot
        assertEquals(short.height, short.width, 0.5f)
        assertEquals(short.width, long.width, 0.5f)
        assertEquals(short.left, long.left, 0.5f)
    }

    @Test fun loadingPlaylistDisablesRemovalButKeepsLoadedTitlesOpenable() {
        compose.setContent { MaterialTheme {
            PlaylistItemActions(playlistItem(), false, onOpen = {}, onPlay = {}, onRemove = {}, removalEnabled = false)
        } }
        compose.onNodeWithContentDescription("Remove from Playlist").assertIsNotEnabled()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Loading…"))
        compose.onNodeWithContentDescription("Details").assertIsEnabled()
        compose.onNodeWithContentDescription("Play Same title").assertIsEnabled()
    }

    @Test fun externalWatchlistDetailsRestoreTheLastFocusedCardOnBack() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        val showing = mutableStateOf(true)
        val opened = mutableListOf<MediaSummary>()
        val watchlist = mutableStateOf<LoadState<WatchlistResponse>>(LoadState.Content(response(listOf(watchlistItem("a"), watchlistItem("b")))))
        compose.setContent {
            MaterialTheme {
                val holder = rememberSaveableStateHolder()
                if (showing.value) holder.SaveableStateProvider("lists") {
                    MyListsContent(graph, LoadState.Content(emptyList()), watchlist.value,
                        "all", {}, {}, {}, {}, {}, { opened += it; showing.value = false })
                } else Text("Details fixture")
            }
        }
        compose.onNodeWithContentDescription("Title b", substring = true).performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onNodeWithText("Details fixture").assertIsDisplayed()
        compose.runOnIdle { assertEquals("b", opened.single().external?.id); watchlist.value = LoadState.Loading; showing.value = true }
        compose.onNodeWithText("Loading…").assertIsDisplayed()
        compose.runOnIdle { watchlist.value = LoadState.Content(response(listOf(watchlistItem("a"), watchlistItem("b")))) }
        compose.onNodeWithContentDescription("Title b", substring = true).assertIsFocused()
    }

    @Test fun returningAfterTheFocusedTitleDisappearsFocusesTheSelectedSource() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        val showing = mutableStateOf(true)
        val items = mutableStateOf(listOf(watchlistItem("a"), watchlistItem("b")))
        compose.setContent {
            MaterialTheme {
                val holder = rememberSaveableStateHolder()
                if (showing.value) holder.SaveableStateProvider("lists") {
                    MyListsContent(graph, LoadState.Content(emptyList()), LoadState.Content(response(items.value)),
                        "all", {}, {}, {}, {}, {}, { showing.value = false })
                } else Text("Details fixture")
            }
        }
        compose.onNodeWithContentDescription("Title b", substring = true).performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onNodeWithText("Details fixture").assertIsDisplayed()
        compose.runOnIdle { items.value = listOf(watchlistItem("a")); showing.value = true }
        compose.onNodeWithContentDescription("Title a", substring = true).assertIsDisplayed()
        compose.onNodeWithText("All").assertIsFocused()
    }

    @Test fun localMatchesUseLocalDetailsWithoutAnExternalBadge() {
        val opened = mutableListOf<String>()
        show(response(listOf(watchlistItem("local").copy(ratingKey = "42"))), onOpen = opened::add)
        compose.onNodeWithContentDescription("not in library", substring = true, ignoreCase = true).assertDoesNotExist()
        compose.onNodeWithContentDescription("Title local", substring = true).performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.runOnIdle { assertEquals(listOf("42"), opened) }
    }

    @Test fun watchlistTypeDisambiguatesRepeatedProviderIds() {
        show(response(listOf(watchlistItem("same").copy(title = "Movie"), watchlistItem("same").copy(type = "show", title = "Show"))))
        compose.onNodeWithContentDescription("Movie", substring = true).assertIsDisplayed()
        compose.onNodeWithContentDescription("Show", substring = true).assertIsDisplayed()
    }

    @Test fun partialSourceFailureKeepsTitlesAndOffersRetry() {
        var retries = 0
        show(response(listOf(watchlistItem("a")), listOf("Trakt could not refresh")), onRetry = { retries++ })
        compose.onNodeWithText("Trakt could not refresh").assertIsDisplayed()
        compose.onNodeWithContentDescription("Title a", substring = true).assertIsDisplayed()
        compose.onNodeWithContentDescription("Retry").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(1, retries) }
    }

    @Test fun emptyListsExplainTheirStateAndExposeSelectedSource() {
        show(response(emptyList()), source = "trakt")
        compose.onNodeWithText("No playlists yet.").assertIsDisplayed()
        compose.onNodeWithText("This watchlist is empty.").assertIsDisplayed()
        compose.onNodeWithText("Trakt").assertIsSelected()
    }

    @Test fun watchlistLoadErrorCanBeRetried() {
        var retries = 0
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        compose.setContent { MaterialTheme {
            MyListsContent(graph, LoadState.Content(emptyList()), LoadState.Error("Temporarily unavailable"), "all", {}, {}, { retries++ }, {}, {}, {})
        } }
        compose.onNodeWithText("Temporarily unavailable").assertIsDisplayed()
        compose.onNodeWithContentDescription("Retry").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(1, retries) }
    }

    private fun show(value: WatchlistResponse, source: String = "all", onOpen: (String) -> Unit = {}, onRetry: () -> Unit = {}) {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        compose.setContent { MaterialTheme {
            MyListsContent(graph, LoadState.Content(emptyList()), LoadState.Content(value), source, {}, {}, onRetry, onOpen, {}, {})
        } }
    }

    private fun response(items: List<WatchlistItem>, errors: List<String> = emptyList()) =
        WatchlistResponse(items, WatchlistCounts(items.size, items.size, 0, 0), errors)

    private fun watchlistItem(id: String) = WatchlistItem(id, "Title $id", "movie", 2026, null,
        listOf("plex"), null, null, ExternalId("tmdb", id, "movie"), null, null)

    private fun playlistItem() = PlaylistItem(
        ratingKey = "42", type = "movie", title = "Same title", year = 2026,
        posterUrl = null, backdropUrl = null, thumbUrl = null, durationMs = null, viewOffsetMs = null,
        viewCount = 0, leafCount = null, viewedLeafCount = null, contentRating = null, showTitle = null,
        seasonNumber = null, episodeNumber = null, parentRatingKey = null, grandparentRatingKey = null,
        external = null, playlistItemId = "item-42",
    )
}
