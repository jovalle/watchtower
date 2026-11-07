package io.github.jovalle.watchtower.tv.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.input.key.Key
import android.view.View
import androidx.compose.ui.platform.LocalView
import android.view.KeyEvent
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.semantics.SemanticsProperties
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
import org.junit.Rule
import org.junit.Test

class RemoteDialogTest {
    @get:Rule val compose = createComposeRule()

    @Test fun dpadMovesBetweenActionsAndBackClosesDialog() {
        var open by mutableStateOf(false)
        var dialogView: View? = null
        compose.setContent {
            MaterialTheme {
                Row {
                    Button(onClick = { open = true }) { Text("Open") }
                    Button(onClick = {}) { Text("Next") }
                }
                if (open) {
                    Dialog(onDismissRequest = { open = false }) {
                        dialogView = LocalView.current
                        Button(
                            onClick = { open = false },
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
        compose.waitUntil(timeoutMillis = 3_000) { dialogView?.hasWindowFocus() == true }
        compose.onNodeWithText("Close").performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused()
        compose.onNodeWithText("Close").assertIsDisplayed()
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitUntil(timeoutMillis = 3_000) {
            compose.onAllNodesWithText("Close").fetchSemanticsNodes().isEmpty()
        }
        compose.waitUntil(timeoutMillis = 3_000) {
            compose.onAllNodesWithText("Open").fetchSemanticsNodes().any {
                it.config.contains(SemanticsProperties.Focused) && it.config[SemanticsProperties.Focused]
            }
        }
        compose.onNodeWithText("Open").assertIsFocused()
    }
}