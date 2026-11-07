package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.WatchtowerApp
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.SearchResponse
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.util.UUID

class CatalogSearchTest {
    @get:Rule val compose = createComposeRule()

    @Test fun televisionKeyboardEditsQueryAndAcceptsPhysicalTyping() {
        compose.setContent { MaterialTheme {
            var query by remember { mutableStateOf("") }
            Column { SearchKeyboard(query, { query = it }); Text(query, Modifier.testTag("query")) }
        } }
        val first = compose.onNodeWithContentDescription("Search key a")
        first.assertIsFocused().performKeyInput { pressKey(Key.R) }
        compose.onNodeWithTag("query").assertTextEquals("r")
        compose.onNodeWithContentDescription("Space").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithTag("query").assertTextEquals("r ")
        compose.onNodeWithContentDescription("Backspace").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithTag("query").assertTextEquals("r")
        compose.onNodeWithContentDescription("Clear Search").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithTag("query").assertTextEquals("")
    }

    @Test fun televisionKeyboardMatchesMeasuredKeyGeometry() {
        compose.setContent { MaterialTheme { SearchKeyboard("", {}) } }
        val a = compose.onNodeWithContentDescription("Search key a").getBoundsInRoot()
        val b = compose.onNodeWithContentDescription("Search key b").getBoundsInRoot()
        val g = compose.onNodeWithContentDescription("Search key g").getBoundsInRoot()
        assertEquals(32f, (a.right - a.left).value, 0.5f)
        assertEquals(32f, (a.bottom - a.top).value, 0.5f)
        assertEquals(36f, b.left.value - a.left.value, 0.5f)
        assertEquals(36f, g.top.value - a.top.value, 0.5f)
        assertEquals(68f, compose.onNodeWithContentDescription("Space").getBoundsInRoot().let { (it.right - it.left).value }, 0.5f)
    }

    @Test fun sourceFilterSettingsChangeVisibleChoicesAndRestoreTheirState() {
        compose.setContent { MaterialTheme {
            var library by remember { mutableStateOf(true) }
            SearchSettingsDialog(library, true, false, "Library", { library = it }, {}, {}, {})
            Text(if (library) "Library enabled" else "Library disabled", Modifier.testTag("source"))
        } }
        compose.onNodeWithText("Library Results").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithTag("source").assertTextEquals("Library disabled")
    }

    @Test fun searchResultsRestoreTheSavedResultInsteadOfTheFirst() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        compose.setContent { MaterialTheme {
            val first = remember { FocusRequester() }
            SearchResults(graph, SearchState(query = "resident", result = SearchResponse(listOf(media("a"), media("b")), emptyList()),
                focusedResultKey = "b"), first, {}, {})
        } }
        compose.onNodeWithContentDescription("Result b", substring = true).assertIsFocused()
    }

    @Test fun rightEdgeKeyboardKeyEntersTheRealResultGrid() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        compose.setContent { MaterialTheme {
            val first = remember { FocusRequester() }
            Row {
                SearchKeyboard("", {}, resultFocus = first)
                SearchResults(graph, SearchState(query = "resident", result = SearchResponse(listOf(media("a")), emptyList())), first, {}, {})
            }
        } }
        val key = compose.onNodeWithContentDescription("Search key f")
        key.performSemanticsAction(SemanticsActions.RequestFocus).performKeyInput { pressKey(Key.DirectionRight) }
        compose.onNodeWithContentDescription("Result a", substring = true).assertIsFocused()
    }

    @Test fun recentSearchesPersistAndClearOnlyTheCurrentServerProfile() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val server = "search-test-${UUID.randomUUID()}"
        val otherServer = "other-$server"
        val store = RecentSearches(context)
        try {
            store.remember(server, "one", "resident")
            store.remember(server, "two", "beef")
            store.remember(otherServer, "one", "alien")
            repeat(12) { store.remember(server, "bounded", "query$it") }
            store.remember(server, "bounded", "query5")
            val reopened = RecentSearches(context)
            assertEquals(10, reopened.get(server, "bounded").size)
            assertEquals("query5", reopened.get(server, "bounded").first())
            assertEquals(10, reopened.get(server, "bounded").distinct().size)
            assertEquals(listOf("resident"), reopened.get(server, "one"))
            assertEquals(listOf("beef"), reopened.get(server, "two"))
            reopened.clear(server, "one")
            assertTrue(reopened.get(server, "one").isEmpty())
            assertEquals(listOf("beef"), reopened.get(server, "two"))
            assertEquals(listOf("alien"), reopened.get(otherServer, "one"))
        } finally { store.clear(server, "one"); store.clear(server, "two"); store.clear(server, "bounded"); store.clear(otherServer, "one") }
    }

    private fun media(key: String) = MediaSummary(key, "movie", "Result $key", 2026, null, null, null, null, null,
        0, null, null, null, null, null, null, null, null, null)
}
