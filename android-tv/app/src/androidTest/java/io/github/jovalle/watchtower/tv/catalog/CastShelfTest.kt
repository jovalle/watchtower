package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.WatchtowerApp
import io.github.jovalle.watchtower.tv.api.Person
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.TvSymbol
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class CastShelfTest {
    @get:Rule val compose = createComposeRule()
    private val graph get() = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
    private val cast = (0..8).map { Person("Cast Member $it", "Character $it", null, "cast-$it") }

    @Test fun initialShelfDoesNotStealPlaybackFocus() {
        compose.setContent {
            val playback = remember { FocusRequester() }
            LaunchedEffect(Unit) { playback.requestFocus() }
            MaterialTheme { Column {
                TvAction("Play", TvSymbol.Play, {}, Modifier.focusRequester(playback))
                CastShelf(graph, cast, false, {}, {})
            } }
        }
        compose.onNodeWithContentDescription("Play").assertIsFocused()
    }

    @Test fun backRestoresSecondCastAfterHorizontalScrollAtLargeText() {
        compose.setContent {
            var personPage by remember { mutableStateOf(false) }
            val pages = rememberSaveableStateHolder()
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                MaterialTheme {
                    if (personPage) TvAction("Back to Details", TvSymbol.Back, { personPage = false })
                    else pages.SaveableStateProvider("details") {
                        var returning by rememberSaveable { mutableStateOf(false) }
                        val playback = remember { FocusRequester() }
                        LaunchedEffect(Unit) { if (!returning) playback.requestFocus() }
                        Column(Modifier.width(180.dp)) {
                            TvAction("Play", TvSymbol.Play, {}, Modifier.focusRequester(playback))
                            CastShelf(graph, cast, returning, { returning = false }, { returning = true; personPage = true })
                        }
                    }
                }
            }
        }
        compose.onNode(hasScrollToIndexAction()).performScrollToIndex(1)
        compose.onNodeWithText("Cast Member 1").performTouchInput { click() }
        compose.onNodeWithContentDescription("Back to Details").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Cast Member 1").assertIsFocused().assertIsDisplayed()
    }

    @Test fun settingReturnFlagBeforeNavigationDoesNotConsumeRestoration() {
        var restored = 0
        compose.setContent {
            var returning by remember { mutableStateOf(false) }
            MaterialTheme { Column(Modifier.width(180.dp)) {
                CastShelf(graph, cast, returning, { restored++; returning = false }, { returning = true })
            } }
        }
        compose.onNode(hasScrollToIndexAction()).performScrollToIndex(1)
        compose.onNodeWithText("Cast Member 1").performTouchInput { click() }
        compose.onNodeWithText("Cast Member 1").assertIsFocused()
        compose.runOnIdle { assertEquals(0, restored) }
    }
}
