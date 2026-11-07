package io.github.jovalle.watchtower.tv.playback

import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.isFocused
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.pressKey
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.click
import androidx.compose.ui.unit.dp
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

        compose.onNodeWithContentDescription("Play").performSemanticsAction(SemanticsActions.OnClick)
        waitForFocusedDescription("Play the next episode now")
        compose.onNodeWithContentDescription("Play the next episode now").performKeyInput {
            pressKey(Key.DirectionLeft)
            pressKey(Key.DirectionDown)
            pressKey(Key.DirectionRight)
        }
        compose.onNodeWithContentDescription("Play").assertIsNotFocused()
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.onNodeWithContentDescription("Play the next episode now").assertDoesNotExist()
        waitForFocusedDescription("Play")
    }


    @Test fun hardwareBackClosesOnlyTheOverlay() {
        var backgroundBacks = 0
        compose.setContent {
            MaterialTheme {
                var open by remember { mutableStateOf(false) }
                val opener = remember { FocusRequester() }
                LaunchedEffect(Unit) { opener.requestFocus() }
                BackHandler { backgroundBacks += 1 }
                RestoreFocusEffect(open, opener)
                Box(Modifier.fillMaxSize()) {
                    PlayerButton("Play", "Play", Modifier.focusRequester(opener), canFocus = !open) { open = true }
                    if (open) NextEpisodeCard(10, {}, { open = false }, { open = false }, active = true)
                }
            }
        }
        compose.onNodeWithContentDescription("Play").performSemanticsAction(SemanticsActions.OnClick)
        waitForFocusedDescription("Play the next episode now")
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Play the next episode now").assertDoesNotExist()
        compose.runOnIdle { assertEquals("Back must not also reach the player", 0, backgroundBacks) }
        waitForFocusedDescription("Play")
    }

    @Test fun timelineScrubsBothDirectionsAndCommitsOnRelease() {
        val directions = mutableListOf<Int>()
        var commits = 0
        compose.setContent {
            MaterialTheme {
                val primary = remember { FocusRequester() }
                OverlayFocusEffect(true, primary)
                PlayerTimeline(30_000, 60_000, true, { directions += it }, { commits++ }, Modifier.width(400.dp).focusRequester(primary))
            }
        }
        compose.onNodeWithContentDescription("Playback Position").performKeyInput {
            pressKey(Key.DirectionLeft)
            pressKey(Key.DirectionRight)
        }
        compose.runOnIdle {
            assertEquals(listOf(-1, 1), directions)
            assertEquals(2, commits)
        }
    }

    @Test fun selectedTrackRowKeepsDetailsAndRemoteActivation() {
        var selections = 0
        compose.setContent {
            MaterialTheme {
                val primary = remember { FocusRequester() }
                OverlayFocusEffect(true, primary)
                MenuButton("English\nFLAC 2.0", Modifier.width(256.dp).focusRequester(primary), selected = true) { selections++ }
            }
        }
        compose.onNodeWithText("English").assertIsSelected().assertIsFocused()
            .performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onNodeWithText("FLAC 2.0").assertIsSelected()
        compose.runOnIdle { assertEquals(1, selections) }
    }

    @Test fun inactiveMenuRowRejectsPointerActivation() {
        var selections = 0
        compose.setContent {
            MaterialTheme { MenuButton("Audio", Modifier.width(256.dp), canFocus = false) { selections++ } }
        }
        compose.onNodeWithText("Audio").assertIsNotEnabled().performTouchInput { click() }
        compose.runOnIdle { assertEquals(0, selections) }
    }

    private fun waitForFocusedDescription(text: String) {
        compose.waitUntil(timeoutMillis = 3_000) {
            compose.onAllNodesWithContentDescription(text).fetchSemanticsNodes().any { node ->
                node.config.contains(SemanticsProperties.Focused) && node.config[SemanticsProperties.Focused]
            }
        }
        compose.onNodeWithContentDescription(text).assertIsFocused()
    }

}
