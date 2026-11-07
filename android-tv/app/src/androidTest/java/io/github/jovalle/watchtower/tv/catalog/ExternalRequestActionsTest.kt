package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.api.RequestAvailability
import io.github.jovalle.watchtower.tv.api.RequestEntry
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class ExternalRequestActionsTest {
    @get:Rule val compose = createComposeRule()
    private fun available(status: String, allowed: Boolean, key: String? = null) =
        RequestAvailability(status, "available", emptyList(), emptyList(), allowed, key)

    @Test fun pendingMediaDoesNotClaimItIsWaitingForAnApprovalAlreadyGranted() {
        compose.setContent { MaterialTheme {
            ExternalRequestActions(RequestState(true, availability = available("pending", false).copy(
                requests = listOf(RequestEntry(1, "approved", false, true)))), "movie", {}, {}, {}, {}, {})
        } }
        compose.onNodeWithText("Pending", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithText("Awaiting Approval", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test fun availableMovieOffersItsLocalTitleInsteadOfARequest() {
        var opened = ""
        var requests = 0
        compose.setContent { MaterialTheme {
            ExternalRequestActions(RequestState(true, availability = available("available", false, "local-42")), "movie",
                { requests++ }, {}, {}, { opened = it }, {})
        } }
        compose.onNodeWithText("Available", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithContentDescription("Request").assertDoesNotExist()
        compose.onNodeWithContentDescription("Open in Library").assertIsFocused().performSemanticsAction(SemanticsActions.OnClick)
        assertEquals("local-42", opened); assertEquals(0, requests)
    }

    @Test fun partialTvExplainsMissingSeasonsAndKeepsLocalPlaybackReachable() {
        var requests = 0
        compose.setContent { MaterialTheme {
            ExternalRequestActions(RequestState(true, availability = available("partially_available", true, "show-42")), "tv",
                { requests++ }, {}, {}, {}, {})
        } }
        compose.onNodeWithText("Partially Available", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithContentDescription("Open in Library").assertIsDisplayed()
        compose.onNodeWithContentDescription("Request Missing Seasons").assertIsEnabled().performSemanticsAction(SemanticsActions.OnClick)
        assertEquals(1, requests)
    }

    @Test fun checkingAndFailedAvailabilityCannotSubmitARequest() {
        compose.setContent { MaterialTheme {
            ExternalRequestActions(RequestState(true, loading = true), "movie", {}, {}, {}, {}, {})
        } }
        compose.onNodeWithText("Checking availability…").assertIsDisplayed()
        compose.onNodeWithContentDescription("Request").assertIsNotEnabled()
    }

    @Test fun failedAvailabilityOffersFocusedRetry() {
        var retries = 0
        compose.setContent { MaterialTheme {
            ExternalRequestActions(RequestState(true, error = "Availability is temporarily unavailable."), "movie",
                {}, {}, { retries++ }, {}, {})
        } }
        compose.onNodeWithContentDescription("Request").assertDoesNotExist()
        compose.onNodeWithContentDescription("Retry").assertIsFocused().performSemanticsAction(SemanticsActions.OnClick)
        assertEquals(1, retries)
    }

    @Test fun anAlreadyRequestedUnknownTitleExplainsItsStateAndKeepsBackReachable() {
        compose.setContent { MaterialTheme {
            ExternalRequestActions(RequestState(true, availability = available("unknown", false)), "movie", {}, {}, {}, {}, {})
        } }
        compose.onNodeWithText("Already Requested", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithContentDescription("Request").assertDoesNotExist()
        compose.onNodeWithContentDescription("Back").assertIsFocused()
    }

    @Test fun mutationKeepsItsActionGeometryAndReportsTheActualOperation() {
        compose.setContent { MaterialTheme {
            ExternalRequestActions(RequestState(true, availability = available("unknown", true), mutationInFlight = true), "movie",
                {}, {}, {}, {}, {})
        } }
        compose.onNodeWithContentDescription("Request").assertIsDisplayed().assertIsNotEnabled()
        compose.onNodeWithText("Saving…").assertIsDisplayed()
    }
}
