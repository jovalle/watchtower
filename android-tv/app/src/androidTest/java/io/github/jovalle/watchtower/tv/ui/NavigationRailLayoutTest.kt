package io.github.jovalle.watchtower.tv.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
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
                        NavigationRail(expanded = false, currentRoute = null, libraries = emptyList(), roomsEnabled = true, navigate = {})
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
}
