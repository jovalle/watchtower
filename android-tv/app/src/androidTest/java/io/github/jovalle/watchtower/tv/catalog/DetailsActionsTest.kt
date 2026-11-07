package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.graphics.luminance
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.assertIsNotFocused
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.isDialog
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import androidx.tv.material3.Button
import androidx.compose.ui.unit.sp
import io.github.jovalle.watchtower.tv.WatchtowerApp
import io.github.jovalle.watchtower.tv.api.Guids
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class DetailsActionsTest {
    @get:Rule val compose = createComposeRule()

    @Test fun playAndStartOverProduceDistinctRoutes() {
        val routes = mutableListOf<PlayerRoute>()
        compose.setContent { MaterialTheme { FlowRow { DetailsPlaybackActions(detail(), routes::add) } } }

        compose.onNodeWithContentDescription("Play").assertIsFocused()

        compose.onNodeWithContentDescription("Play").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithContentDescription("Start Over").performSemanticsAction(SemanticsActions.OnClick)

        compose.runOnIdle {
            assertEquals(PlayerRoute("42", startPositionMs = null), routes[0])
            assertEquals(PlayerRoute("42", startPositionMs = 0), routes[1])
        }
    }

    @Test fun everyDetailsActionStaysInsideTheRootAtLargeText() {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 1.3f)) {
                MaterialTheme {
                    Box(Modifier.fillMaxSize().testTag("root").padding(36.dp)) {
                        DetailsActionRow(
                            detail = detail(),
                            enabled = true,
                            issueEnabled = true,
                            onPlay = {},
                            onSetWatched = {},
                            onSetWatchlist = {},
                            onAddToPlaylist = {},
                            onReportIssue = {},
                            modifier = Modifier.fillMaxWidth(0.78f),
                        )
                    }
                }
            }
        }

        val root = compose.onNodeWithTag("root").getBoundsInRoot()
        listOf("Play", "Start Over", "Add to Watchlist", "Add to Playlist", "Report Issue")
            .forEach { label ->
                val node = compose.onNodeWithContentDescription(label)
                val bounds = node.getBoundsInRoot()
                assertTrue("$label bounds $bounds must stay within root $root", bounds.left >= root.left && bounds.top >= root.top && bounds.right <= root.right && bounds.bottom <= root.bottom)
                node.assertIsDisplayed()
            }
    }

    @Test fun surplusActionsAndBackRestoreTheMoreOpener() {
        compose.setContent {
            MaterialTheme {
                DetailsActionRow(detail(), true, true, {}, {}, {}, {}, {}, Modifier.width(360.dp))
            }
        }
        compose.onNodeWithContentDescription("More").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNode(hasContentDescription("Mark Watched") and hasAnyAncestor(isDialog())).assertIsFocused().assertIsDisplayed()
        compose.onNodeWithContentDescription("Add to Playlist").assertIsDisplayed()
        compose.onNodeWithContentDescription("Report Issue").assertIsDisplayed()
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
        compose.onNodeWithContentDescription("More").assertIsFocused()
    }

    @Test fun pendingEpisodeMetadataDisablesPlayAndStartOver() {
        val routes = mutableListOf<PlayerRoute>()
        compose.setContent { MaterialTheme { FlowRow { DetailsPlaybackActions(detail(), routes::add, enabled = false) } } }
        compose.onNodeWithContentDescription("Play").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Start Over").assertIsNotEnabled()
        compose.runOnIdle { assertTrue(routes.isEmpty()) }
    }

    @Test fun initialDetailPlayFocusKeepsTheHeroVisibleAndAllowsCastScrolling() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        compose.setContent { MaterialTheme {
            DetailScrollColumn {
                item {
                    Column(Modifier.padding(start = 64.dp, top = 60.dp).width(420.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.testTag("detail-title")) { CatalogTitle(graph, null, "A movie title long enough to wrap onto a second line") }
                        Text("2026 • 2h 10m • Drama", fontSize = 11.sp)
                        Text("Audience 8.5 • Critics 9.0", fontSize = 11.sp)
                        Text("A long synopsis with real detail typography. ".repeat(12), fontSize = 13.sp, maxLines = 3)
                        Text("Directed by A Director", fontSize = 12.sp)
                        FlowRow { DetailsPlaybackActions(detail(), {}) }
                    }
                }
                item {
                    Column { Spacer(Modifier.height(240.dp)); Button(onClick = {}) { Text("Cast target") } }
                }
            }
        } }
        compose.onNodeWithContentDescription("Play").assertIsFocused()
        compose.onNodeWithContentDescription("Start Over").performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithContentDescription("Play").performSemanticsAction(SemanticsActions.RequestFocus)
        compose.mainClock.advanceTimeBy(1_000)
        val top = compose.onNodeWithTag("detail-title").getBoundsInRoot().top.value
        assertTrue("Detail title top was $top dp", top >= 52f)
        val cast = compose.onNodeWithText("Cast target")
        cast.performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused().assertIsDisplayed()
    }

    @Test fun savedWatchlistUsesAFilledBookmarkAndTogglesAfterConfirmation() {
        var saved by mutableStateOf(true)
        compose.setContent { MaterialTheme(colorScheme = androidx.tv.material3.darkColorScheme(surface = androidx.compose.ui.graphics.Color(0xFF242527))) {
            DetailsActionRow(detail().copy(onWatchlist = saved), true, true, {}, {}, { saved = !saved }, {}, {})
        } }
        compose.onNodeWithContentDescription("Play").performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused()
        val remove = compose.onNodeWithContentDescription("Remove from Watchlist").assertIsSelected()
        val filled = remove.captureToImage().toPixelMap()
        assertTrue("Saved bookmark center must be filled", filled[filled.width / 2, filled.height / 2].luminance() > 0.8f)
        remove.performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithContentDescription("Play").performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused()
        val add = compose.onNodeWithContentDescription("Add to Watchlist").assertIsNotSelected()
        val outline = add.captureToImage().toPixelMap()
        assertTrue("Unsaved bookmark center must remain hollow", outline[outline.width / 2, outline.height / 2].luminance() < 0.6f)
    }

    @Test fun unknownWatchlistChecksMembershipInsteadOfAdding() {
        var checks = 0
        var writes = 0
        compose.setContent { MaterialTheme {
            DetailsActionRow(detail().copy(onWatchlist = null), true, true, {}, {}, { writes++ }, {}, {},
                onRetryWatchlist = { checks++ })
        } }
        compose.onNodeWithContentDescription("Check Watchlist").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(1, checks); assertEquals(0, writes) }
    }

    @Test fun inlineRatingBackRestoresTheRatingButton() {
        compose.setContent { MaterialTheme { DetailsActionRow(detail(), true, true, {}, {}, {}, {}, {}) } }
        val rate = compose.onNodeWithContentDescription("Rate")
        rate.performSemanticsAction(SemanticsActions.RequestFocus)
        rate.performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithContentDescription("Star rating").assertIsFocused()
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        compose.waitForIdle(); rate.assertIsFocused()
    }

    @Test fun ratingSaveStatusIsVisibleOnTheInlineButton() {
        var pending by mutableStateOf(false)
        compose.setContent { MaterialTheme { DetailsActionRow(detail(), !pending, true, {}, {}, {}, {}, {}, pending = pending) } }
        compose.onNodeWithContentDescription("Rate").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { pending = true }
        compose.onNodeWithText("Saving…").assertIsDisplayed()
        compose.onNodeWithContentDescription("Star rating").assertIsNotEnabled()
    }

    @Test fun ratingSaveErrorRemainsVisibleOnThePage() {
        compose.setContent { MaterialTheme { DetailsActionRow(detail(), true, true, {}, {}, {}, {}, {}, actionError = "Rating could not be saved.") } }
        compose.onNodeWithContentDescription("Rate").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Rating could not be saved.").assertIsDisplayed()
    }

    @Test fun surplusRatingExpandsInlineAndCancelReturnsToMoreWhenCompactButtonDoesNotFit() {
        compose.setContent { MaterialTheme { DetailsActionRow(detail(), true, true, {}, {}, {}, {}, {}, Modifier.width(280.dp)) } }
        compose.onNodeWithContentDescription("More").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNode(hasAnyAncestor(isDialog()) and hasContentDescription("Rate")).performSemanticsAction(SemanticsActions.OnClick)
        compose.onAllNodes(isDialog()).assertCountEquals(0)
        compose.onNodeWithContentDescription("Star rating").assertIsFocused()
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        compose.waitForIdle(); compose.onNodeWithContentDescription("More").assertIsFocused()
    }

    @Test fun inlineRatingExpandsWithoutOpeningADialogOrMovingTheNextRow() {
        compose.setContent { MaterialTheme { Column {
            DetailsActionRow(detail(), true, true, {}, {}, {}, {}, {})
            Text("Below actions", Modifier.testTag("below"))
        } } }
        val top = compose.onNodeWithTag("below").getBoundsInRoot().top
        compose.onNodeWithContentDescription("Rate").performSemanticsAction(SemanticsActions.OnClick)
        compose.onAllNodes(isDialog()).assertCountEquals(0)
        compose.onNodeWithContentDescription("Star rating").assertIsFocused().assertIsDisplayed()
        assertEquals(top, compose.onNodeWithTag("below").getBoundsInRoot().top)
    }

    @Test fun existingRatingDisplaysFiveStarsWithoutOpeningAnEditor() {
        compose.setContent { MaterialTheme { DetailsActionRow(detail().copy(userRating = 7.0), true, true, {}, {}, {}, {}, {}) } }
        compose.onNodeWithContentDescription("Star rating").assertIsDisplayed()
        compose.onNodeWithText("3.5 / 5").assertIsDisplayed()
        compose.onNodeWithContentDescription("Rate").assertDoesNotExist()
        (1..5).forEach { compose.onNodeWithTag("rating-star-$it", useUnmergedTree = true).assertIsDisplayed() }
    }

    @Test fun fullWidthActionsAreInlineWithoutRedundantMore() {
        compose.setContent { MaterialTheme { DetailsActionRow(detail(), true, true, {}, {}, {}, {}, {}, Modifier.width(800.dp)) } }
        listOf("Mark Watched", "Add to Playlist", "Report Issue").forEach { compose.onNodeWithContentDescription(it).assertIsDisplayed() }
        compose.onNodeWithContentDescription("More").assertDoesNotExist()
    }

    @Test fun overflowContainsOnlySurplusActionsAndRestoresItsOpener() {
        compose.setContent { MaterialTheme { DetailsActionRow(detail(), true, true, {}, {}, {}, {}, {}, Modifier.width(360.dp)) } }
        compose.onNodeWithContentDescription("Play").assertIsDisplayed()
        compose.onNodeWithContentDescription("More").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNode(hasContentDescription("Add to Playlist") and hasAnyAncestor(isDialog())).assertIsDisplayed()
        compose.onAllNodes(hasContentDescription("Mark Watched")).assertCountEquals(1)
        compose.onAllNodes(hasContentDescription("Rate")).assertCountEquals(1)
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        compose.waitForIdle();compose.onNodeWithContentDescription("More").assertIsFocused()
    }

    @Test fun ratedButtonAllowsNavigationUntilSelectedAndBackDiscardsEditing() {
        val writes = mutableListOf<Double?>()
        compose.setContent { MaterialTheme { DetailsActionRow(detail().copy(userRating = 7.0), true, true, {}, {}, {}, {}, {}, onRating = writes::add) } }
        val stars = compose.onNodeWithContentDescription("Star rating")
        stars.performSemanticsAction(SemanticsActions.RequestFocus).performKeyInput { pressKey(Key.DirectionRight) }
        stars.assertIsNotFocused()
        stars.performSemanticsAction(SemanticsActions.RequestFocus).performKeyInput { pressKey(Key.DirectionCenter);pressKey(Key.DirectionRight) }
        compose.onNodeWithText("4 / 5").assertIsDisplayed()
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK)
        compose.waitForIdle();compose.onNodeWithText("3.5 / 5").assertIsDisplayed()
        compose.runOnIdle { assertTrue(writes.isEmpty()) }
    }

    @Test fun clearReturnsFocusToTheCollapsedRatingButton() {
        var rating by mutableStateOf<Double?>(7.0)
        compose.setContent { MaterialTheme { DetailsActionRow(detail().copy(userRating = rating), true, true, {}, {}, {}, {}, {}, onRating = { rating = it }) } }
        compose.onNodeWithContentDescription("Remove Rating").performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onNodeWithContentDescription("Remove Rating").assertDoesNotExist()
        compose.onNodeWithContentDescription("Rate").assertIsFocused()
    }

    @Test fun moreAppearsOnlyBelowTheMeasuredFitBoundary() {
        var width by mutableStateOf(800.dp)
        compose.setContent { MaterialTheme { DetailsActionRow(detail(), true, true, {}, {}, {}, {}, {}, Modifier.width(width)) } }
        val fit = compose.onNodeWithContentDescription("Report Issue").getBoundsInRoot().right + 8.dp
        compose.runOnIdle { width = fit }
        compose.onNodeWithContentDescription("More").assertDoesNotExist()
        compose.runOnIdle { width = fit - 1.dp }
        compose.onNodeWithContentDescription("More").assertIsDisplayed()
    }

    @Test fun growingTheRowClosesObsoleteOverflowAndRestoresVisibleFocus() {
        var width by mutableStateOf(360.dp)
        compose.setContent { MaterialTheme { DetailsActionRow(detail(), true, true, {}, {}, {}, {}, {}, Modifier.width(width)) } }
        compose.onNodeWithContentDescription("More").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { width = 800.dp }
        compose.onAllNodes(isDialog()).assertCountEquals(0)
        compose.onNodeWithContentDescription("More").assertDoesNotExist()
        compose.onNodeWithContentDescription("Rate").assertIsFocused()
        compose.onNodeWithContentDescription("Report Issue").assertIsDisplayed()
    }

    @Test fun pendingAndFailedRatingStayInlineWithoutSavedFeedbackAtLargeText() {
        var rating by mutableStateOf<Double?>(7.0)
        var pending by mutableStateOf(false)
        var error by mutableStateOf<String?>(null)
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) { MaterialTheme { Column {
                DetailsActionRow(detail().copy(userRating = rating), !pending, true, {}, {}, {}, {}, {},
                    Modifier.width(800.dp), onRating = { rating = it; pending = true }, pending = pending, actionError = error)
                Text("Below actions", Modifier.testTag("below"))
            } } }
        }
        compose.onNodeWithContentDescription("More").assertDoesNotExist()
        val top = compose.onNodeWithTag("below").getBoundsInRoot().top
        compose.onNodeWithContentDescription("Star rating").performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter); pressKey(Key.DirectionRight); pressKey(Key.DirectionCenter) }
        compose.onNodeWithContentDescription("Star rating").assertIsNotEnabled()
        compose.onNodeWithText("Saving…").assertIsDisplayed()
        assertEquals(top, compose.onNodeWithTag("below").getBoundsInRoot().top)
        compose.runOnIdle { pending = false; rating = 7.0; error = "Rating could not be saved." }
        compose.onNodeWithText("3.5 / 5").assertIsDisplayed()
        compose.onNodeWithText("Rating could not be saved.").assertIsDisplayed()
        compose.onNodeWithText("Saved").assertDoesNotExist()
    }

    @Test fun compactRatedRowKeepsStarsAndMoreInsideItsBounds() {
        compose.setContent { MaterialTheme { DetailsActionRow(detail().copy(userRating = 7.0), true, true, {}, {}, {}, {}, {},
            Modifier.width(240.dp).testTag("row")) } }
        val row = compose.onNodeWithTag("row").getBoundsInRoot()
        listOf("Star rating", "More").forEach {
            val bounds = compose.onNodeWithContentDescription(it).getBoundsInRoot()
            assertTrue("$it must fit $row; got $bounds", bounds.left >= row.left && bounds.right <= row.right)
        }
    }

    @Test fun failedClearRestoresTheRatingWithoutLosingFocus() {
        var rating by mutableStateOf<Double?>(7.0)
        var pending by mutableStateOf(false)
        var error by mutableStateOf<String?>(null)
        val writes = mutableListOf<Double?>()
        compose.setContent { MaterialTheme { DetailsActionRow(detail().copy(userRating = rating), !pending, true, {}, {}, {}, {}, {},
            onRating = { writes.add(it);rating = it;pending = true }, pending = pending, actionError = error) } }
        compose.onNodeWithContentDescription("Remove Rating").performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onNodeWithContentDescription("Rate").assertIsFocused()
        compose.runOnIdle { rating = 7.0;pending = false;error = "Rating could not be removed." }
        compose.onNodeWithContentDescription("Star rating").assertIsFocused()
        compose.onNodeWithText("3.5 / 5").assertIsDisplayed()
        compose.onNodeWithText("Rating could not be removed.").assertIsDisplayed()
        compose.runOnIdle { assertEquals(listOf<Double?>(null), writes) }
    }

    @Test fun failedClearDoesNotStealFocusAfterTheUserMovesAway() {
        var rating by mutableStateOf<Double?>(7.0)
        var pending by mutableStateOf(false)
        compose.setContent { MaterialTheme { Column {
            DetailsActionRow(detail().copy(userRating = rating), !pending, true, {}, {}, {}, {}, {},
                onRating = { rating = it;pending = true }, pending = pending)
            io.github.jovalle.watchtower.tv.ui.TvAction("Outside actions", io.github.jovalle.watchtower.tv.ui.TvSymbol.Info, {})
        } } }
        compose.onNodeWithContentDescription("Remove Rating").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithContentDescription("Rate").assertIsFocused()
        compose.onNodeWithContentDescription("Outside actions").performSemanticsAction(SemanticsActions.RequestFocus)
        compose.runOnIdle { rating = 7.0;pending = false }
        compose.onNodeWithContentDescription("Outside actions").assertIsFocused()
        compose.onNodeWithContentDescription("Star rating").assertIsNotFocused()
    }

    @Test fun selectedFileAppliesToPlayAndStartOverRoutes() {
        val routes = mutableListOf<PlayerRoute>()
        compose.setContent { MaterialTheme { DetailsActionRow(detail(), true, true, routes::add, {}, {}, {}, {}, mediaId = "version-b") } }
        compose.onNodeWithContentDescription("Play").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithContentDescription("Start Over").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(listOf(PlayerRoute("42", mediaId = "version-b"), PlayerRoute("42", mediaId = "version-b", startPositionMs = 0)), routes) }
    }

    private fun detail() = MediaDetail(
        ratingKey = "42", type = "movie", title = "Movie", year = null, posterUrl = null, backdropUrl = null,
        thumbUrl = null, durationMs = null, viewOffsetMs = null, viewCount = 0, leafCount = null,
        viewedLeafCount = null, contentRating = null, showTitle = null, seasonNumber = null, episodeNumber = null,
        parentRatingKey = null, grandparentRatingKey = null, external = null, summary = null, tagline = null,
        studio = null, genres = emptyList(), directors = emptyList(), cast = emptyList(), audienceRating = null,
        criticRating = null, userRating = null, originallyAvailableAt = null, editionTitle = null, editions = emptyList(),
        guids = Guids(null, null, null, null),
        versions = emptyList(),
        markers = emptyList(), onWatchlist = false, playable = true,
    )
}