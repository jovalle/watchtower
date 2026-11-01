package io.github.jovalle.watchtower.tv.playback

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotFocused
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.isFocused
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.pressKey
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.rooms.MediaIdentity
import io.github.jovalle.watchtower.tv.rooms.RoomAnchor
import io.github.jovalle.watchtower.tv.rooms.RoomConnectionStatus
import io.github.jovalle.watchtower.tv.rooms.RoomMembership
import io.github.jovalle.watchtower.tv.rooms.RoomParticipant
import io.github.jovalle.watchtower.tv.rooms.RoomPolicyState
import io.github.jovalle.watchtower.tv.rooms.RoomSnapshot
import io.github.jovalle.watchtower.tv.rooms.RoomUiState
import org.junit.Rule
import org.junit.Test

class PlayerOverlayFocusTest {
    @get:Rule val compose = createComposeRule()

    @Test fun roomPanelContainsDpadFocusAndBackRestoresItsOpener() {
        compose.setContent {
            MaterialTheme {
                var open by remember { mutableStateOf(false) }
                val opener = remember { FocusRequester() }
                val leaveOpener = remember { FocusRequester() }
                LaunchedEffect(Unit) { opener.requestFocus() }
                RestoreFocusEffect(open, opener)
                Box(Modifier.fillMaxSize()) {
                    PlayerButton(
                        "Room opener",
                        "Room opener",
                        Modifier.focusRequester(opener),
                        canFocus = !open,
                    ) { open = true }
                    if (open) {
                        RoomPanel(
                            PlaybackUiState(room = roomState(host = true)),
                            RoomPanelActions({}, {}, {}, {}, {}, { open = false }),
                            active = true,
                            leaveOpener = leaveOpener,
                        )
                    }
                }
            }
        }

        compose.onNodeWithText("Room opener").performSemanticsAction(SemanticsActions.OnClick)
        waitForFocusedText("Leave")
        compose.onNodeWithText("Leave").performKeyInput {
            pressKey(Key.DirectionLeft)
            pressKey(Key.DirectionDown)
            pressKey(Key.DirectionRight)
        }
        compose.onNodeWithText("Room opener").assertIsNotFocused()
        compose.onAllNodes(isFocused()).onFirst().performKeyInput { pressKey(Key.Back) }
        waitForFocusedText("Room opener")
    }

    @Test fun leaveConfirmationContainsDpadFocusAndBackRestoresItsOpener() {
        compose.setContent {
            MaterialTheme {
                var open by remember { mutableStateOf(false) }
                val opener = remember { FocusRequester() }
                LaunchedEffect(Unit) { opener.requestFocus() }
                RestoreFocusEffect(open, opener)
                Box(Modifier.fillMaxSize()) {
                    PlayerButton(
                        "Leave opener",
                        "Leave opener",
                        Modifier.focusRequester(opener),
                        canFocus = !open,
                    ) { open = true }
                    if (open) LeaveConfirmation({}, { open = false }, { open = false })
                }
            }
        }

        compose.onNodeWithText("Leave opener").performSemanticsAction(SemanticsActions.OnClick)
        waitForFocusedText("Leave")
        compose.onNodeWithText("Leave").performKeyInput {
            pressKey(Key.DirectionLeft)
            pressKey(Key.DirectionDown)
        }
        compose.onNodeWithText("Leave opener").assertIsNotFocused()
        compose.onAllNodes(isFocused()).onFirst().performKeyInput { pressKey(Key.Back) }
        waitForFocusedText("Leave opener")
    }

    @Test fun guestCountdownDoesNotExposePlayNowOrCancelActions() {
        compose.setContent {
            MaterialTheme {
                NextEpisodeCard(
                    seconds = 10,
                    onPlay = {},
                    onCancel = {},
                    onBack = {},
                    showActions = roomState(host = false).isHost,
                    active = false,
                )
            }
        }

        compose.onNodeWithText("Play next").assertDoesNotExist()
        compose.onNodeWithText("Cancel").assertDoesNotExist()
    }

    private fun waitForFocusedText(text: String) {
        compose.waitUntil(timeoutMillis = 3_000) {
            compose.onAllNodesWithText(text).fetchSemanticsNodes().any { node ->
                node.config.contains(SemanticsProperties.Focused) && node.config[SemanticsProperties.Focused]
            }
        }
        compose.onNodeWithText(text).assertIsFocused()
    }

    private fun roomState(host: Boolean): RoomUiState {
        val participantId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
        return RoomUiState(
            status = RoomConnectionStatus.CONNECTED,
            membership = RoomMembership(participantId, 1, 1, 1),
            snapshot = RoomSnapshot(
                1,
                "8e2f7a64-5b1c-4d3e-9f80-1a2b3c4d5e6f",
                "6f1c1d52-3f0e-4c7a-9d51-0d1b2c3a4e5f",
                1,
                1,
                1,
                1,
                1,
                if (host) participantId else "b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
                "playing",
                "host_played",
                false,
                null,
                RoomPolicyState(true),
                MediaIdentity("server", "42", "7", "9"),
                100_000,
                RoomAnchor(0, 1, 1),
                listOf(RoomParticipant(participantId, "Viewer", true, true, false, true, null)),
            ),
        )
    }
}