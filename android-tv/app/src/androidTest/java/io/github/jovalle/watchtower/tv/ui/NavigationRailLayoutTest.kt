package io.github.jovalle.watchtower.tv.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.api.LibrarySection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class NavigationRailLayoutTest {
    @get:Rule val compose = createComposeRule()

    /** Regression: fillMaxSize() before width() made the rail take the whole screen and hid all content. */
    @Test fun collapsedRailKeepsItsWidthAndLeavesTheScreenToContent() {
        compose.setContent {
            MaterialTheme {
                Row(Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxHeight().testTag("rail")) {
                        NavigationRail(expanded = false, currentRoute = null, libraries = emptyList(), navigate = {})
                    }
                    Box(Modifier.weight(1f).fillMaxHeight().testTag("content"))
                }
            }
        }

        val root = compose.onRoot().getBoundsInRoot()
        val rail = compose.onNodeWithTag("rail").getBoundsInRoot()
        val content = compose.onNodeWithTag("content").getBoundsInRoot()
        assertEquals(82.dp, rail.right - rail.left)
        assertTrue("content must fill the rest of the screen", content.right - content.left >= root.right - root.left - 82.dp)
    }

    @Test fun dpadFocusScrollsToSettingsAfterManyLibraries() {
        val libraries = List(30) { index -> LibrarySection("$index", "movie", "Library $index") }
        compose.setContent {
            MaterialTheme {
                NavigationRail(
                    expanded = false,
                    currentRoute = null,
                    libraries = libraries,
                    navigate = {},
                )
            }
        }

        compose.onNodeWithContentDescription("Home")
            .performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { repeat(34) { pressKey(Key.DirectionDown) } }

        compose.onNodeWithContentDescription("Settings").assertIsFocused().assertIsDisplayed()
    }
}
