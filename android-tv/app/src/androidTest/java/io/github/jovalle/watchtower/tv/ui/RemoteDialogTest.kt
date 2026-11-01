package io.github.jovalle.watchtower.tv.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class RemoteDialogTest {
    @get:Rule val compose = createComposeRule()

    @Test fun dpadMovesBetweenActionsAndBackClosesDialog() {
        var open by mutableStateOf(false)
        compose.setContent {
            MaterialTheme {
                Row {
                    Button(onClick = { open = true }) { Text("Open") }
                    Button(onClick = {}) { Text("Next") }
                }
                if (open) {
                    Dialog(onDismissRequest = { open = false }) {
                        Button(
                            onClick = { open = false },
                            modifier = Modifier.onPreviewKeyEvent {
                                if (it.key == Key.Back && it.type == KeyEventType.KeyDown) {
                                    open = false
                                    true
                                } else {
                                    false
                                }
                            },
                        ) { Text("Close") }
                    }
                }
            }
        }

        compose.onNodeWithText("Open").performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithText("Open").performKeyInput { pressKey(Key.DirectionRight) }
        compose.onNodeWithText("Next").assertIsFocused()
        compose.onNodeWithText("Open").performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithText("Open").performSemanticsAction(SemanticsActions.OnClick)
        compose.waitForIdle()
        compose.onNodeWithText("Close").assertIsDisplayed().performKeyInput { pressKey(Key.Back) }
        compose.waitForIdle()
        assertTrue(compose.onAllNodesWithText("Close").fetchSemanticsNodes().isEmpty())
        compose.onNodeWithText("Open").assertIsFocused()
    }
}