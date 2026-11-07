package io.github.jovalle.watchtower.tv.ui

import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalTestApi::class)
class PointerRefinementTest {
    @get:Rule val compose = createComposeRule()

    @Test fun hoverRevealsActionAndDoesNotActivateOrMoveGeometry() {
        var clicks = 0
        compose.setContent { MaterialTheme { Row {
            TvAction("Play", TvSymbol.Play, { clicks++ })
            TvAction("Details", TvSymbol.Info, { clicks++ })
            TvAction("Unavailable", TvSymbol.Close, { clicks++ }, enabled = false)
        } } }
        val play = compose.onNodeWithContentDescription("Play")
        val details = compose.onNodeWithContentDescription("Details")
        play.performSemanticsAction(SemanticsActions.RequestFocus)
        val before = details.getBoundsInRoot()
        details.performMouseInput { moveTo(center) }
        details.assertIsFocused(); compose.onNodeWithText("Details").assertIsDisplayed()
        assertEquals(before, details.getBoundsInRoot())
        compose.runOnIdle { assertEquals(0, clicks) }
        val unavailable = compose.onNodeWithContentDescription("Unavailable")
        unavailable.performMouseInput { moveTo(center) }
        details.assertIsFocused()
        unavailable.performMouseInput { click() }.assertIsNotEnabled()
        compose.runOnIdle { assertEquals(0, clicks) }
        details.performMouseInput { moveTo(center); click() }
        compose.runOnIdle { assertEquals(1, clicks) }
    }

    @Test fun playerIconHasNonMeasuringHintOnFocusAndHover() {
        compose.setContent { MaterialTheme { Row {
            TvAction("Pause", TvSymbol.Pause, {}, iconOnly = true)
            TvAction("Subtitles", TvSymbol.Subtitles, {}, iconOnly = true)
        } } }
        val pause = compose.onNodeWithContentDescription("Pause")
        val subtitles = compose.onNodeWithContentDescription("Subtitles")
        val bounds = subtitles.getBoundsInRoot()
        pause.performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithText("Pause").assertIsDisplayed()
        subtitles.performMouseInput { moveTo(center) }
        compose.onNodeWithText("Subtitles").assertIsDisplayed()
        assertEquals(bounds, subtitles.getBoundsInRoot())
        assertEquals(32.dp, bounds.bottom - bounds.top)
    }
    @Test fun draggingAwayCancelsMouseActivation() {
        var clicks = 0
        compose.setContent { MaterialTheme { Box(Modifier.size(240.dp, 120.dp)) {
            TvAction("Details", TvSymbol.Info, { clicks++ }, Modifier.align(androidx.compose.ui.Alignment.Center))
        } } }
        compose.onNodeWithContentDescription("Details").performMouseInput {
            moveTo(center); press(); moveTo(Offset(-80f, -80f)); release()
        }
        compose.runOnIdle { assertEquals(0, clicks) }
    }

    @Test fun playerBackgroundHoverDoesNotStealControlFocus() {
        var opened = 0
        compose.setContent { MaterialTheme {
            Box(Modifier.size(240.dp, 120.dp).testTag("canvas")
                .pointerClick(onClick = { opened++ }, requestFocusOnHover = false).focusable()) {
                TvAction("Pause", TvSymbol.Pause, {}, Modifier.align(androidx.compose.ui.Alignment.Center), iconOnly = true)
            }
        } }
        val pause = compose.onNodeWithContentDescription("Pause")
        pause.performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithTag("canvas").performMouseInput { moveTo(Offset(8f, 8f)) }
        pause.assertIsFocused()
        compose.runOnIdle { assertEquals(0, opened) }
    }

    @Test fun longCatalogHintIsNotClippedAtTheLeftEdgeAtLargeText() {
        compose.setContent {
            val density = androidx.compose.ui.platform.LocalDensity.current
            CompositionLocalProvider(androidx.compose.ui.platform.LocalDensity provides androidx.compose.ui.unit.Density(density.density, 1.3f)) {
                MaterialTheme { Row { TvAction("Remove from Watchlist", TvSymbol.BookmarkFilled, {}) } }
            }
        }
        compose.onNodeWithContentDescription("Remove from Watchlist").performSemanticsAction(SemanticsActions.RequestFocus)
        val hint = compose.onNodeWithText("Remove from Watchlist").assertIsDisplayed()
        val clipped = hint.getBoundsInRoot(); val full = hint.getUnclippedBoundsInRoot()
        assertTrue("Hint must stay inside the window; left=${clipped.left}", clipped.left >= 0.dp)
        assertEquals("An edge hint must be fully visible", (full.right - full.left).value, (clipped.right - clipped.left).value, 1f)
    }

    @Test fun inactiveWindowHintIsHiddenBehindADialog() {
        var open by mutableStateOf(false)
        compose.setContent { MaterialTheme {
            TvAction("Details", TvSymbol.Info, { open = true })
            if (open) androidx.compose.ui.window.Dialog({ open = false }) {
                TvAction("Close panel", TvSymbol.Close, { open = false })
            }
        } }
        val details = compose.onNodeWithContentDescription("Details")
        details.performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithText("Details").assertIsDisplayed()
        details.performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithContentDescription("Close panel").assertIsDisplayed().performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithText("Close panel").assertIsDisplayed()
        compose.onNodeWithText("Details").assertDoesNotExist()
    }

}
