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
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertIsNotSelected
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
import androidx.tv.material3.ModalNavigationDrawer
import io.github.jovalle.watchtower.tv.catalog.LibraryRoute
import io.github.jovalle.watchtower.tv.catalog.ListsRoute
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
                ModalNavigationDrawer(drawerContent = {
                    Box(Modifier.fillMaxHeight().testTag("rail")) {
                        NavigationRail(expanded = false, currentRoute = null, libraries = emptyList(), navigate = {})
                    }
                }) {
                    Box(Modifier.fillMaxSize().testTag("content"))
                }
            }
        }

        val root = compose.onRoot().getBoundsInRoot()
        val rail = compose.onNodeWithTag("rail").getBoundsInRoot()
        val content = compose.onNodeWithTag("content").getBoundsInRoot()
        assertEquals(56.dp, rail.right - rail.left)
        assertEquals("Drawer must overlay the page without shifting it", root.left, content.left)
        assertTrue("content must fill the rest of the screen", content.right - content.left >= root.right - root.left)
    }

    @Test fun compactRailExposesDirectLibrariesListsAndServices() {
        var destination: Any? = null
        compose.setContent { MaterialTheme {
            NavigationRail(false, "LibraryRoute", listOf(LibrarySection("movies", "movie", "Movies"),
                LibrarySection("shows", "show", "Shows")), { destination = it }, currentLibraryId = "shows")
        } }
        compose.onNodeWithContentDescription("Shows").assertIsSelected().assertIsDisplayed()
            .performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals("shows", (destination as LibraryRoute).sectionId) }
        compose.onNodeWithContentDescription("My Lists").assertIsDisplayed().performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(ListsRoute, destination) }
        compose.onNodeWithContentDescription("Requests").assertIsDisplayed()
        compose.onNodeWithContentDescription("Issues").assertIsDisplayed()
    }

    @Test fun selectedCustomLibraryStaysReachableInTheCompactRail() {
        val libraries = List(30) { LibrarySection("$it", "movie", "Library $it") }
        compose.setContent { MaterialTheme {
            NavigationRail(false, "LibraryRoute", libraries, {}, currentLibraryId = "29")
        } }
        compose.onNodeWithContentDescription("Library 29").assertIsSelected().assertIsDisplayed()
    }

    @Test fun selectedLibraryAndServiceDestinationsAreExplicit() {
        compose.setContent {
            MaterialTheme {
                NavigationRail(true, "LibraryRoute", listOf(
                    LibrarySection("movies", "movie", "Movies"), LibrarySection("shows", "show", "Shows"),
                ), {}, currentLibraryId = "shows")
            }
        }
        compose.onNodeWithContentDescription("Movies").assertIsNotSelected()
        compose.onNodeWithContentDescription("Shows").assertIsSelected()
        compose.onNodeWithContentDescription("Requests").assertExists()
        compose.onNodeWithContentDescription("Issues").assertExists()
    }

    @Test fun openingTheRailFocusesTheCurrentLibrary() {
        compose.setContent { MaterialTheme {
            NavigationRail(true, "LibraryRoute", listOf(LibrarySection("movies", "movie", "Movies"), LibrarySection("shows", "show", "Shows")), {}, currentLibraryId = "shows")
        } }
        compose.onNodeWithContentDescription("Shows").assertIsFocused()
    }

    @Test fun unavailableRestoredLibraryFallsBackToHome() {
        compose.setContent { MaterialTheme {
            NavigationRail(true, "LibraryRoute", emptyList(), {}, currentLibraryId = "removed-or-loading")
        } }
        compose.onNodeWithContentDescription("Home").assertIsFocused()
    }

    @Test fun dpadFocusScrollsToTheLastServiceAfterManyLibraries() {
        val libraries = List(30) { index -> LibrarySection("$index", "movie", "Library $index") }
        compose.setContent {
            MaterialTheme {
                NavigationRail(
                    expanded = true,
                    currentRoute = null,
                    libraries = libraries,
                    navigate = {},
                )
            }
        }

        compose.onNodeWithContentDescription("Home")
            .performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { repeat(36) { pressKey(Key.DirectionDown) } }

        compose.onNodeWithContentDescription("Issues").assertIsFocused().assertIsDisplayed()
    }
}
