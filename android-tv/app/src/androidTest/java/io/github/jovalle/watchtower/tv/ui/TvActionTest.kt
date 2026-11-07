package io.github.jovalle.watchtower.tv.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.click
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class TvActionTest {
    @get:Rule val compose = createComposeRule()

    @Test fun focusedStartOverNeverMovesAdjacentButtons() = assertStableCaptionSlots(1f)

    @Test fun focusedLongCaptionsNeverMoveAdjacentButtonsAtLargeText() = assertStableCaptionSlots(1.3f)

    private fun assertStableCaptionSlots(fontScale: Float) {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
                MaterialTheme { Row {
                    TvAction("Start Over", TvSymbol.Restart, {})
                    TvAction("Add to Watchlist", TvSymbol.Bookmark, {})
                    TvAction("Mark as Watched", TvSymbol.Check, {})
                    TvAction("More", TvSymbol.More, {})
                } }
            }
        }
        val names = listOf("Start Over", "Add to Watchlist", "Mark as Watched", "More")
        val before = names.map { compose.onNodeWithContentDescription(it).getBoundsInRoot() }
        names.forEach { name ->
            compose.onNodeWithContentDescription(name).performSemanticsAction(SemanticsActions.RequestFocus)
            compose.onNodeWithText(name).assertIsDisplayed()
            assertEquals("Focus caption must not alter any button's position or size", before,
                names.map { compose.onNodeWithContentDescription(it).getBoundsInRoot() })
        }
    }

    @Test fun pointerClickActivatesTheSymbolOnce() {
        var calls = 0
        compose.setContent { MaterialTheme { Column {
            TvAction("Play", TvSymbol.Play, { calls++ })
            TvAction("Pause", TvSymbol.Pause, { calls++ })
            TvAction("Unavailable", TvSymbol.Close, { calls++ }, enabled = false)
        } } }
        compose.onNodeWithContentDescription("Play").performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithContentDescription("Pause").performTouchInput { click() }.assertIsFocused()
        compose.onNodeWithContentDescription("Unavailable").performTouchInput { click() }
        compose.runOnIdle { assertEquals(1, calls) }
    }

    @Test fun focusedCatalogActionsKeepUniform40dpFacesAndCaptions() {
        compose.setContent {
            MaterialTheme {
                Row {
                    TvAction("Play", TvSymbol.Play, {}, Modifier.testTag("play-cell"), primary = true)
                    TvAction("Details", TvSymbol.Info, {}, Modifier.testTag("details-cell"))
                }
            }
        }
        val play = compose.onNodeWithContentDescription("Play")
        val details = compose.onNodeWithContentDescription("Details")
        play.performSemanticsAction(SemanticsActions.RequestFocus)
        val playBounds = play.getBoundsInRoot()
        val detailsBounds = details.getBoundsInRoot()
        assertTrue("Primary action retains its readable label", playBounds.right - playBounds.left >= 64.dp)
        assertEquals(40.dp, playBounds.bottom - playBounds.top)
        assertEquals(40.dp, detailsBounds.right - detailsBounds.left)
        assertEquals(playBounds.bottom - playBounds.top, detailsBounds.bottom - detailsBounds.top)
        assertEquals(playBounds.top, detailsBounds.top)
        val cell = compose.onNodeWithTag("play-cell").getBoundsInRoot()
        assertTrue("The primary viewing action must remain compact", cell.right - cell.left <= 120.dp)
        assertTrue("Focus labels must not reserve a second button's worth of empty space", cell.bottom - cell.top <= 60.dp)
        details.performSemanticsAction(SemanticsActions.RequestFocus)
        assertEquals(playBounds, play.getBoundsInRoot())
        assertEquals(detailsBounds, details.getBoundsInRoot())
        assertEquals(cell, compose.onNodeWithTag("play-cell").getBoundsInRoot())
        compose.onNodeWithText("Details").assertIsDisplayed()
    }

    @Test fun playerIconControlsRetainTheirCompactFaceAndDisabledSemantics() {
        var calls = 0
        compose.setContent { MaterialTheme { Row {
            TvAction("Play Video", TvSymbol.Play, { calls++ }, iconOnly = true, primary = true)
            TvAction("Unavailable Track", TvSymbol.Audio, { calls++ }, iconOnly = true, enabled = false)
        } } }
        val play = compose.onNodeWithContentDescription("Play Video")
        val bounds = play.getBoundsInRoot()
        assertEquals(32.dp, bounds.right - bounds.left)
        assertEquals(32.dp, bounds.bottom - bounds.top)
        compose.onNodeWithContentDescription("Unavailable Track").assertIsNotEnabled().performTouchInput { click() }
        compose.runOnIdle { assertEquals(0, calls) }
    }

    @Test fun symbolHasAnAccessibleActionAndFocusLabelAtLargeText() {
        var calls = 0
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                MaterialTheme(colorScheme = darkColorScheme()) {
                    Column {
                        TvAction("Play", TvSymbol.Play, { calls++ })
                        TvAction("Unavailable", TvSymbol.Close, {}, enabled = false)
                    }
                }
            }
        }
        val action = compose.onNodeWithContentDescription("Play")
        action.performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithText("Play").assertIsDisplayed()
        val bounds = action.getBoundsInRoot()
        assertTrue(bounds.right - bounds.left >= 32.dp)
        assertTrue(bounds.bottom - bounds.top >= 32.dp)
        action.performKeyInput { pressKey(Key.DirectionCenter) }
        assertEquals(1, calls)
        compose.onNodeWithContentDescription("Unavailable").assertIsNotEnabled()
    }

    @Test fun longFocusCaptionFitsAtLargeTextWithoutGrowingTheControl() {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                MaterialTheme {
                    Row {
                        TvAction("Play", TvSymbol.Play, {})
                        TvAction("Add to Watchlist", TvSymbol.Bookmark, {})
                        TvAction("More", TvSymbol.More, {})
                    }
                }
            }
        }
        val action = compose.onNodeWithContentDescription("Add to Watchlist")
        action.performSemanticsAction(SemanticsActions.RequestFocus)
        val layouts = mutableListOf<TextLayoutResult>()
        compose.onNodeWithText("Add to Watchlist").assertIsDisplayed()
            .performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
        assertTrue("The focused action name must remain readable at 1.3× text", !layouts.single().hasVisualOverflow)
        val bounds = action.getBoundsInRoot()
        assertEquals(40.dp, bounds.bottom - bounds.top)
    }
}
