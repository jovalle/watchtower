package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.WatchtowerApp
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class CatalogCategoriesTest {
    @get:Rule val compose = createComposeRule()
    private val genres = listOf("Action", "Adventure", "Animation", "Anime", "Biography", "Children", "Comedy", "Crime")

    @Test fun categoriesUseFourColumnsAndMeasuredCardSpacing() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        compose.setContent { MaterialTheme {
            LibraryCategories(graph, genres, "Crime", {}, {}, Modifier.fillMaxSize().padding(start = 64.dp, end = 48.dp, top = 70.dp))
        } }
        val action = compose.onNodeWithText("Action").getBoundsInRoot()
        val adventure = compose.onNodeWithText("Adventure").getBoundsInRoot()
        val biography = compose.onNodeWithText("Biography").getBoundsInRoot()
        assertEquals(188f, (action.right - action.left).value, 1f)
        assertEquals(106f, (action.bottom - action.top).value, 1f)
        assertEquals(64f, action.left.value, 1f)
        assertEquals(70f, action.top.value, 1f)
        assertEquals(212f, adventure.left.value - action.left.value, 1f)
        assertEquals(156f, biography.top.value - action.top.value, 1f)
    }

    @Test fun choosingCategoryAndReturningRestoresThatRealGenreCard() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        compose.setContent { MaterialTheme {
            var selected by remember { mutableStateOf<String?>(null) }
            var focused by remember { mutableStateOf<String?>("Action") }
            if (selected == null) LibraryCategories(graph, genres, focused, { focused = it }, { selected = it })
            else Button(onClick = { selected = null }) { Text("Back from $selected") }
        } }
        val comedy = compose.onNodeWithText("Comedy")
        comedy.performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused()
        comedy.performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Back from Comedy").performSemanticsAction(SemanticsActions.OnClick)
        comedy.assertIsFocused()
    }
}
