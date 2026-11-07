package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.TvSymbol
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class InteractionRefinementTest {
    @get:Rule val compose = createComposeRule()
    private val ratingDescription = "Star rating"

    @Test fun ratingCaptionAndScoreStayAligned() = assertRatingGeometry(1f)
    @Test fun ratingCaptionAndScoreStayAlignedAtLargeText() = assertRatingGeometry(1.3f)
    private fun assertRatingGeometry(scale: Float) {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, scale)) {
                MaterialTheme { RatingControl(7.0, true, {}, Modifier.width(256.dp).testTag("rating")) }
            }
        }
        val action = compose.onNodeWithContentDescription(ratingDescription)
        action.performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithText(ratingDescription).assertDoesNotExist()
        val button = action.getBoundsInRoot()
        val value = compose.onNodeWithText("3.5 / 5").getBoundsInRoot()
        assertEquals(200.dp, button.right - button.left)
        assertEquals(40.dp, button.bottom - button.top)
        assertTrue("Score must center under the five stars", kotlin.math.abs(((button.left + button.right) / 2f - (value.left + value.right) / 2f).value) <= 1f)
        val container = compose.onNodeWithTag("rating").getBoundsInRoot()
        assertEquals("Inline rating must reserve the same height as ordinary actions", 60.dp, container.bottom - container.top)
    }

    @Test fun dialogCloseSupportsPointerAndRestoresTheOpener() {
        var open by mutableStateOf(false)
        compose.setContent { MaterialTheme {
            TvAction("Search Settings", TvSymbol.Settings, { open = true })
            if (open) CatalogDialogPanel("Search Settings", { open = false }) { Text("Choices remain unchanged") }
        } }
        val opener = compose.onNodeWithContentDescription("Search Settings")
        opener.performTouchInput { click() }
        compose.onNodeWithContentDescription("Close").performTouchInput { click() }
        opener.assertIsFocused()
        compose.onNodeWithText("Choices remain unchanged").assertDoesNotExist()
    }

    @Test fun dialogBackdropDismissesButBlankPanelSpaceDoesNot() {
        var closed = 0
        compose.setContent { MaterialTheme { CatalogDialogPanel("Options", { closed++ }) { Text("Choice") } } }
        compose.onNodeWithTag("catalog-dialog-panel").performTouchInput { click(Offset(center.x, height - 16f)) }
        compose.runOnIdle { assertEquals(0, closed) }
        compose.onNodeWithTag("catalog-dialog-scrim").performTouchInput { click(Offset(8f, center.y)) }
        compose.runOnIdle { assertEquals(1, closed) }
    }
    @Test fun maximumRatingDoesNotWrapOrSubmitRepeatedWrites() {
        val writes = mutableListOf<Double?>()
        compose.setContent { MaterialTheme { RatingControl(10.0, true, writes::add) } }
        val rating = compose.onNodeWithContentDescription("Star rating")
        rating.performSemanticsAction(SemanticsActions.RequestFocus)
        rating.performKeyInput { pressKey(Key.DirectionRight); pressKey(Key.DirectionCenter) }
        compose.runOnIdle { assertTrue("Maximum must remain ten without wrapping to zero", writes.isEmpty()) }
    }

}
