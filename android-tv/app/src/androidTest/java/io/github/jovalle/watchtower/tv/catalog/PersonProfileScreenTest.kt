package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.test.platform.app.InstrumentationRegistry
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.WatchtowerApp
import io.github.jovalle.watchtower.tv.api.ExternalId
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.Person
import io.github.jovalle.watchtower.tv.api.PersonProfile
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.TvSymbol
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class PersonProfileScreenTest {
    @get:Rule val compose = createComposeRule()
    private val graph get() = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
    private fun work(key: String?, title: String, external: ExternalId? = null) = MediaSummary(
        key, "movie", title, 2026, null, null, null, null, null, 0, null, null, null, null, null, null, null, null, external,
    )
    private fun profile() = PersonProfile("person-7", "A Long Actor Name That Must Wrap Within The Person Header", "Lead", null,
        "A biography with enough words to remain readable and reachable. ".repeat(50), "1970-01-01", null, "A long place of birth", "Acting",
        listOf(work("local-42", "Local Work")), emptyList(), listOf(work(null, "External Work", ExternalId("tmdb", "7", "movie"))),
        listOf("Some credits could not be loaded."))

    @Test fun worksRemainSelectableDuringPartialFailureAndBackIsReachableAtLargeText() {
        val opened = mutableListOf<MediaSummary>()
        var backs = 0
        var retries = 0
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                MaterialTheme { PersonProfileContent(graph, PersonProfileState(profile(), loading = false), "Actor", opened::add, { retries++ }, { backs++ }) }
            }
        }
        compose.onNodeWithContentDescription("Back").assertIsFocused().performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(1, backs) }
        compose.onNodeWithTag("person-page").performScrollToNode(hasText("Local Work"))
        compose.onNodeWithText("Local Work").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithTag("person-page").performScrollToNode(hasText("External Work"))
        compose.onNodeWithText("External Work").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithContentDescription("Retry").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle {
            assertEquals(listOf("local-42", null), opened.map { it.ratingKey })
            assertEquals("tmdb", opened.last().external?.provider)
            assertEquals(1, retries)
        }
    }

    @Test fun refreshingKeepsTheFocusedWorkMounted() {
        var refresh: (() -> Unit)? = null
        compose.setContent {
            var state by remember { mutableStateOf(PersonProfileState(profile().copy(biography = null), false)) }
            refresh = { state = state.copy(loading = true, error = "Credits unavailable") }
            MaterialTheme { PersonProfileContent(graph, state, "Actor", {}, {}, {}) }
        }
        compose.onNodeWithTag("person-page").performScrollToNode(hasText("Local Work"))
        compose.onNodeWithText("Local Work").performTouchInput { click() }
        compose.onNodeWithText("Local Work").assertIsFocused()
        compose.runOnIdle { requireNotNull(refresh).invoke() }
        compose.onNodeWithText("Local Work").assertIsFocused().assertIsDisplayed()
        compose.onNodeWithContentDescription("Retry").assertExists()
    }

    @Test fun retryTransfersFocusToBackBeforeTheErrorActionDisappears() {
        val state = mutableStateOf(PersonProfileState(loading = false, error = "Person details unavailable"))
        compose.setContent { MaterialTheme {
            PersonProfileContent(graph, state.value, "Actor", {}, { state.value = PersonProfileState(loading = true) }, {})
        } }
        compose.onNodeWithContentDescription("Retry").performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.Enter) }
        compose.onNodeWithContentDescription("Retry").assertDoesNotExist()
        compose.onNodeWithContentDescription("Back").assertIsFocused().assertIsDisplayed()
    }

    @Test fun castCardActivatesOncePerEnterAndPointer() {
        var clicks = 0
        compose.setContent { MaterialTheme { CastPersonCard(graph, Person("Actor", "Lead", null, "person-7"), onClick = { clicks++ }) } }
        compose.onNodeWithText("Actor").performTouchInput { click() }
        compose.runOnIdle { assertEquals(1, clicks) }
        compose.onNodeWithText("Actor").performKeyInput { pressKey(Key.Enter) }
        compose.runOnIdle { assertEquals(2, clicks) }
    }

    @Test fun legacyCastHasAnExplanationAndNoClickAction() {
        compose.setContent { MaterialTheme { CastPersonCard(graph, Person("Legacy Actor", "Lead", null), onClick = { error("Legacy cast must not open a profile") }) } }
        compose.onNodeWithText("Legacy Actor").assertHasNoClickAction()
        compose.onNodeWithText("Profile unavailable").assertExists()
    }

    @Test fun returningFromWorkDetailsRestoresTheSelectedWork() {
        compose.setContent {
            var details by remember { mutableStateOf(false) }
            val pages = rememberSaveableStateHolder()
            MaterialTheme {
                if (details) TvAction("Back to Person", TvSymbol.Back, { details = false })
                else pages.SaveableStateProvider("person") {
                    PersonProfileContent(graph, PersonProfileState(profile().copy(biography = null), false), "Actor", { details = true }, {}, {})
                }
            }
        }
        compose.onNodeWithTag("person-page").performScrollToNode(hasText("External Work"))
        compose.onNodeWithText("External Work").performTouchInput { click() }
        compose.onNodeWithContentDescription("Back to Person").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("External Work").assertIsFocused().assertIsDisplayed()
    }

    @Test fun emptyFactsAndShelvesExplainTheirAbsenceWithoutInventingABiography() {
        compose.setContent { MaterialTheme {
            PersonProfileContent(graph, PersonProfileState(profile().copy(biography = null, birthday = null, placeOfBirth = null,
                knownForDepartment = null, knownFor = emptyList(), filmography = emptyList(), warnings = emptyList()), false), "Actor", {}, {}, {})
        } }
        compose.onNodeWithText("Biography unavailable.").assertExists()
        compose.onNodeWithTag("person-page").performScrollToNode(hasText("No filmography is available."))
        compose.onNodeWithText("No filmography is available.").assertIsDisplayed()
    }

    @Test fun longBiographyScrollsWithTheRemoteBeforeMovingIntoTheWorks() {
        compose.setContent { MaterialTheme { PersonProfileContent(graph, PersonProfileState(profile(), false), "Actor", {}, {}, {}) } }
        compose.onNodeWithTag("person-page").performScrollToNode(hasTestTag("person-biography"))
        compose.onNodeWithTag("person-biography").performSemanticsAction(SemanticsActions.RequestFocus)
        repeat(3) { compose.onNodeWithTag("person-biography").performKeyInput { pressKey(Key.DirectionDown) } }
        compose.onNodeWithTag("person-biography").assertIsFocused()
        var steps = 0
        while (steps++ < 80 && compose.onAllNodes(hasTestTag("person-biography") and isFocused()).fetchSemanticsNodes().isNotEmpty()) {
            compose.onNodeWithTag("person-biography").performKeyInput { pressKey(Key.DirectionDown) }
        }
        compose.onNodeWithText("Local Work").assertIsFocused().assertIsDisplayed()
    }
}
