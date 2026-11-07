package io.github.jovalle.watchtower.tv.services

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.pressKey
import androidx.test.platform.app.InstrumentationRegistry
import io.github.jovalle.watchtower.tv.WatchtowerApp
import io.github.jovalle.watchtower.tv.api.IssueDetail
import io.github.jovalle.watchtower.tv.api.IssueComment
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import androidx.tv.material3.Button
import androidx.compose.runtime.mutableStateOf
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class SeerrInboxScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test fun emptyInboxKeepsFiltersAndExplainsWhereRequestsAppear() {
        compose.setContent {
            MaterialTheme {
                SeerrInboxContent("Requests", "Track requested titles.", "No Requests Here", "Request a missing title from Search.",
                    SeerrInboxState<String>(loading = false), listOf("all" to "All", "pending" to "Pending"), {}, {}, {}) { Text(it) }
            }
        }
        compose.onNodeWithText("No Requests Here").assertIsDisplayed()
        compose.onNodeWithText("Request a missing title from Search.").assertIsDisplayed()
        compose.onNodeWithContentDescription("Filter").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Pending").assertIsDisplayed()
    }

    @Test fun failedInboxOffersAWorkingRetry() {
        var retries = 0
        compose.setContent {
            MaterialTheme {
                SeerrInboxContent("Issues", "Review reports.", "No Issues Here", "", SeerrInboxState<String>(loading = false, error = "Seerr is unavailable."),
                    listOf("all" to "All"), {}, { retries++ }, {}) { Text(it) }
            }
        }
        compose.onNodeWithText("Seerr is unavailable.").assertIsDisplayed()
        compose.onNodeWithContentDescription("Try Again").performSemanticsAction(SemanticsActions.OnClick)
        assertEquals(1, retries)
    }

    @Test fun retryTransfersFocusToRefreshBeforeTheErrorActionDisappears() {
        val state = mutableStateOf(SeerrInboxState<String>(loading = false, error = "Seerr is unavailable."))
        compose.setContent { MaterialTheme {
            SeerrInboxContent("Requests", "Track requested titles.", "No Requests Here", "", state.value,
                listOf("all" to "All"), {}, { state.value = state.value.copy(loading = true, error = null) }, {}) { Text(it) }
        } }
        compose.onNodeWithContentDescription("Try Again").performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.Enter) }
        compose.onNodeWithContentDescription("Try Again").assertDoesNotExist()
        compose.onNodeWithContentDescription("Refresh").assertIsFocused().assertIsNotEnabled().assertIsDisplayed()
    }

    @Test fun filterOptionsExposeTheCurrentSelection() {
        compose.setContent { MaterialTheme {
            SeerrInboxContent("Requests", "Track requested titles.", "No Requests Here", "",
                SeerrInboxState<String>(filter = "pending", loading = false),
                listOf("all" to "All", "pending" to "Pending"), {}, {}, {}) { Text(it) }
        } }
        compose.onNodeWithContentDescription("Filter").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNode(hasText("Pending") and hasAnyAncestor(isDialog())).assertIsSelected()
        compose.onNode(hasText("All") and hasAnyAncestor(isDialog())).assertIsNotSelected()
    }

    @Test fun choosingFilterWithRemoteClosesPanelAndRestoresTriggerFocus() {
        var filter = "all"
        compose.setContent {
            MaterialTheme {
                SeerrInboxContent("Requests", "Track requested titles.", "No Requests Here", "",
                    SeerrInboxState<String>(loading = false), listOf("all" to "All", "pending" to "Pending"),
                    { filter = it }, {}, {}) { Text(it) }
            }
        }
        compose.onNodeWithContentDescription("Filter").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Pending")
            .performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { pressKey(Key.DirectionCenter) }

        assertEquals("pending", filter)
        compose.onNodeWithText("Pending").assertDoesNotExist()
        compose.onNodeWithContentDescription("Filter").assertIsFocused()
    }

    @Test fun sameQueryRefreshKeepsTheFocusedInboxRowMounted() {
        val state = mutableStateOf(SeerrInboxState(items = listOf(1, 2, 3), loading = false))
        compose.setContent {
            MaterialTheme {
                SeerrInboxContent("Requests", "Track requested titles.", "No Requests Here", "", state.value,
                    listOf("all" to "All"), {}, {}, {}, itemKey = { it }) { id ->
                    Button(onClick = {}) { Text("Request $id") }
                }
            }
        }
        compose.onNodeWithText("Request 2").performSemanticsAction(SemanticsActions.RequestFocus)
        compose.runOnIdle { state.value = state.value.copy(loading = true) }
        compose.onNodeWithText("Request 2").assertIsDisplayed().assertIsFocused()
        compose.runOnIdle { state.value = state.value.copy(loading = false, error = "Refresh temporarily unavailable") }
        compose.onNodeWithText("Request 2").assertIsDisplayed().assertIsFocused()
        compose.onNodeWithText("Refresh temporarily unavailable").assertIsDisplayed()
        compose.onNodeWithContentDescription("Try Again").assertIsDisplayed()
    }

    @Test fun insertingAnInboxRowBeforeFocusKeepsTheFocusedIdentity() {
        val state = mutableStateOf(SeerrInboxState(items = listOf(1, 2, 3), loading = false))
        compose.setContent {
            MaterialTheme {
                SeerrInboxContent("Requests", "Track requested titles.", "No Requests Here", "", state.value,
                    listOf("all" to "All"), {}, {}, {}, itemKey = { it }) { id ->
                    Button(onClick = {}) { Text("Request $id") }
                }
            }
        }
        compose.onNodeWithText("Request 2").performSemanticsAction(SemanticsActions.RequestFocus)
        compose.runOnIdle { state.value = state.value.copy(items = listOf(0, 1, 2, 3)) }
        compose.onNodeWithText("Request 2").assertIsFocused()
    }

    @Test fun remoteCanReadCommentsBelowALongReport() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        val issue = IssueDetail(1, "movie", 1, "A Long Report", null, null, "open", 1,
            "A report that extends beyond the visible screen. ".repeat(250), "2026-11-04", List(12) {
                IssueComment(it, if (it == 11) "Final Conversation Entry" else "Comment $it", "2026-11-04", "Viewer")
            })
        compose.setContent { MaterialTheme { IssueDetailContent(graph, issue, {}, {}) } }
        compose.onNodeWithContentDescription("Title Details")
            .performSemanticsAction(SemanticsActions.RequestFocus)
            .performKeyInput { repeat(45) { pressKey(Key.DirectionDown) } }
        compose.onNodeWithText("Final Conversation Entry").assertIsDisplayed()
    }

    @Test fun unconfiguredIntegrationShowsSettingsRecovery() {
        var settings = 0
        compose.setContent { MaterialTheme { ServiceUnavailable { settings++ } } }
        compose.onNodeWithText("Seerr Is Not Configured").assertIsDisplayed()
        compose.onNodeWithContentDescription("Settings").performSemanticsAction(SemanticsActions.OnClick)
        assertEquals(1, settings)
    }
}
