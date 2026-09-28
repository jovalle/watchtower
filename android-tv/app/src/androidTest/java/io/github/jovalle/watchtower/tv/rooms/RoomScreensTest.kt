package io.github.jovalle.watchtower.tv.rooms

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.tv.material3.MaterialTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class RoomScreensTest {
    @get:Rule val compose = createComposeRule()

    @Test fun joinScreenAcceptsRemoteTextEntryAndInvokesStubAction() {
        var joins = 0
        compose.setContent {
            var value by remember { mutableStateOf("") }
            MaterialTheme {
                JoinRoomForm(value, { value = it }, busy = false, error = null, onJoin = { joins++ })
            }
        }

        compose.onNodeWithContentDescription("Watch Together invitation").performTextInput("A".repeat(43))
        compose.onNodeWithText("Join room").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(1, joins) }
    }

    @Test fun lobbyRestoresFocusToOpenPlayerAndShowsParticipantState() {
        compose.setContent {
            MaterialTheme {
                RoomLobbyContent(
                    state = state(),
                    inviteUrl = null,
                    onOpenPlayer = {}, onPlay = {}, onRotate = {}, onRevoke = {}, onEnd = {}, onLeave = {},
                )
            }
        }

        compose.onNodeWithText("Open player").assertIsDisplayed().assertIsFocused()
        compose.onNodeWithText("Host Viewer", substring = true).assertIsDisplayed()
        compose.onNodeWithText("End for everyone").assertIsDisplayed()
    }

    private fun state(): RoomUiState {
        val participantId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
        return RoomUiState(
            status = RoomConnectionStatus.CONNECTED,
            membership = RoomMembership(participantId, 1, 1, 1),
            snapshot = RoomSnapshot(
                1, "8e2f7a64-5b1c-4d3e-9f80-1a2b3c4d5e6f", "6f1c1d52-3f0e-4c7a-9d51-0d1b2c3a4e5f",
                1, 1, 1, 1, 1, participantId, "lobby", "created", false, null, RoomPolicyState(true),
                MediaIdentity("server", "42", "7", "9"), 100_000, RoomAnchor(0, 1, 1),
                listOf(RoomParticipant(participantId, "Host Viewer", true, true, false, true, null)),
            ),
        )
    }
}