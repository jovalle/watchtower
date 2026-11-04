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
import org.junit.Rule
import org.junit.Test

class PlayerOverlayFocusTest {
    @get:Rule val compose = createComposeRule()

    @Test fun countdownContainsDpadFocusAndBackRestoresItsOpener() {
        compose.setContent {
            MaterialTheme {
                var open by remember { mutableStateOf(false) }
                val opener = remember { FocusRequester() }
                LaunchedEffect(Unit) { opener.requestFocus() }
                RestoreFocusEffect(open, opener)
                Box(Modifier.fillMaxSize()) {
                    PlayerButton(
                        "Play",
                        "Play",
                        Modifier.focusRequester(opener),
                        canFocus = !open,
                    ) { open = true }
                    if (open) {
                        NextEpisodeCard(
                            seconds = 10,
                            onPlay = {},
                            onCancel = { open = false },
                            onBack = { open = false },
                            active = true,
                        )
                    }
                }
            }
        }

        compose.onNodeWithText("Play").performSemanticsAction(SemanticsActions.OnClick)
        waitForFocusedText("Play next")
        compose.onNodeWithText("Play next").performKeyInput {
            pressKey(Key.DirectionLeft)
            pressKey(Key.DirectionDown)
            pressKey(Key.DirectionRight)
        }
        compose.onNodeWithText("Play").assertIsNotFocused()
        compose.onAllNodes(isFocused()).onFirst().performKeyInput { pressKey(Key.Back) }
        waitForFocusedText("Play")
    }

    private fun waitForFocusedText(text: String) {
        compose.waitUntil(timeoutMillis = 3_000) {
            compose.onAllNodesWithText(text).fetchSemanticsNodes().any { node ->
                node.config.contains(SemanticsProperties.Focused) && node.config[SemanticsProperties.Focused]
            }
        }
        compose.onNodeWithText(text).assertIsFocused()
    }

}
