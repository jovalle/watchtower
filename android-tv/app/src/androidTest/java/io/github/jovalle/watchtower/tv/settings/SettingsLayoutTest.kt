package io.github.jovalle.watchtower.tv.settings

import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.click
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.performMouseInput
import androidx.compose.ui.unit.Density
import androidx.compose.ui.text.TextLayoutResult
import androidx.test.platform.app.InstrumentationRegistry
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.api.DeviceSummary
import io.github.jovalle.watchtower.tv.api.Preferences
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class SettingsLayoutTest {
    @get:Rule val compose = createComposeRule()

    @kotlin.OptIn(androidx.compose.ui.test.ExperimentalTestApi::class)
    @Test fun mouseBackRestoresChoiceAndCategoryWithoutSaving() {
        var writes = 0
        compose.setContent { MaterialTheme { SettingsContent(fixture(), null, null, { _, _ -> writes++ },
            { writes++ }, { writes++ }, { writes++ }, { writes++ }) } }
        compose.onNodeWithText("Video & Audio").performMouseInput { click() }
        compose.onNodeWithText("Quality").performMouseInput { click() }
        compose.onNodeWithContentDescription("Back").performMouseInput { click() }
        compose.onNodeWithText("Quality").assertIsFocused()
        compose.onNodeWithContentDescription("Back").performMouseInput { click() }
        compose.onNodeWithText("Video & Audio").assertIsFocused()
        compose.runOnIdle { assertEquals(0, writes) }
    }

    @Test fun pendingServerPreferenceDisablesOtherServerToggles() {
        var writes = 0
        compose.setContent { MaterialTheme { SettingsContent(fixture().copy(savingKey = "showContinueWatching"),
            null, null, { _, _ -> writes++ }, {}, {}, {}, {}) } }
        open("Experience")
        compose.onNodeWithText("Trending").assertIsNotEnabled().performTouchInput { click() }
        compose.runOnIdle { assertEquals(0, writes) }
    }

    @Test fun focusedLongDeviceNameAndDescriptionAreReadableAtLargeText() {
        val name = "Living Room Television With A Long Household Device Name"
        val model = "Android TV streaming device with an extended manufacturer model description"
        val device = DeviceSummary("long-device", name, "Android TV", model, "1", 0, 0, 60_000, false)
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                MaterialTheme { SettingsContent(fixture().copy(devices = listOf(device)), null, null, { _, _ -> }, {}, {}, {}, {}) }
            }
        }
        open("Advanced")
        compose.onNodeWithText(name).assertIsFocused()
        listOf(name, model).forEach { text ->
            val layouts = mutableListOf<TextLayoutResult>()
            compose.onNodeWithText(text, useUnmergedTree = true).assertIsDisplayed()
                .performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
            assertTrue("Focused settings text must remain readable: $text", !layouts.single().hasVisualOverflow)
        }
    }

    @Test fun qualityChoicesStayInsideTheRealPanelAtLargeText() {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 1.3f)) {
                MaterialTheme { SettingsContent(fixture(), null, null, { _, _ -> }, {}, {}, {}, {}) }
            }
        }
        open("Video & Audio")
        open("Quality")
        val panel = compose.onNodeWithContentDescription("Settings").getBoundsInRoot()
        listOf("Original", "1080p · 20 Mbps", "1080p · 12 Mbps", "1080p · 8 Mbps", "720p · 4 Mbps", "720p · 2 Mbps", "480p · 1.5 Mbps")
            .forEach { label ->
                val node = compose.onNodeWithText(label)
                val bounds = node.getBoundsInRoot()
                assertTrue("$label bounds $bounds must stay within panel $panel", bounds.left >= panel.left && bounds.top >= panel.top && bounds.right <= panel.right && bounds.bottom <= panel.bottom)
                node.assertIsDisplayed()
            }
        compose.onNodeWithText("Original").assertIsSelected()
    }

    @Test fun supportedCategoriesReplaceTheFlatFormWithoutUnsupportedDestinations() {
        compose.setContent { MaterialTheme { SettingsContent(fixture(), null, null, { _, _ -> }, {}, {}, {}, {}) } }
        compose.onNodeWithText("Account").assertIsFocused()
        listOf("Experience", "Player Experience", "Video & Audio", "Subtitles", "Advanced", "About").forEach {
            compose.onNodeWithText(it).assertIsDisplayed()
        }
        compose.onNodeWithText("Plex Home").assertDoesNotExist()
        compose.onNodeWithText("Privacy").assertDoesNotExist()
        compose.onNodeWithText("Continue Watching").assertDoesNotExist()
    }

    @Test fun hardwareBackRestoresChoiceThenCategoryBeforeLeavingSettings() {
        var outerBacks = 0
        compose.setContent {
            MaterialTheme {
                BackHandler { outerBacks++ }
                SettingsContent(fixture(), null, null, { _, _ -> }, {}, {}, {}, {})
            }
        }
        open("Video & Audio")
        open("Quality")
        compose.onNodeWithText("Original").assertIsFocused()
        hardwareBack()
        compose.onNodeWithText("Quality").assertIsFocused()
        hardwareBack()
        compose.onNodeWithText("Video & Audio").assertIsFocused()
        compose.runOnIdle { assertEquals(0, outerBacks) }
        hardwareBack()
        compose.runOnIdle { assertEquals(1, outerBacks) }
    }

    @Test fun categoryControlsKeepExistingServerAndLocalPreferenceCallbacks() {
        val serverWrites = mutableListOf<Pair<String, Boolean>>()
        var local = ProfilePlaybackPrefs()
        compose.setContent {
            MaterialTheme {
                var state by remember { mutableStateOf(fixture()) }
                SettingsContent(state, null, null, { key, value -> serverWrites += key to value },
                    { update -> local = update(state.local); state = state.copy(local = local) }, {}, {}, {})
            }
        }
        open("Experience")
        open("Continue Watching")
        hardwareBack()
        open("Player Experience")
        open("Auto-skip intros")
        hardwareBack()
        open("Video & Audio")
        open("Quality")
        open("720p · 4 Mbps")
        compose.runOnIdle {
            assertEquals(listOf("showContinueWatching" to false, "autoSkipIntro" to true), serverWrites)
            assertEquals("720p-4", local.defaultQuality)
        }
    }

    @Test fun busyPreferenceStaysDisabledAndItsErrorRemainsVisibleInTheCategory() {
        var writes = 0
        compose.setContent {
            MaterialTheme {
                SettingsContent(fixture().copy(savingKey = "showContinueWatching", error = "The setting was not saved."),
                    null, null, { _, _ -> writes++ }, {}, {}, {}, {})
            }
        }
        open("Experience")
        compose.onNodeWithText("Continue Watching").assertIsNotEnabled().performTouchInput { click() }
        compose.onNodeWithText("The setting was not saved.").assertIsDisplayed()
        compose.runOnIdle { assertEquals(0, writes) }
    }

    @Test fun accountAndAdvancedKeepSignOutServerAndDeviceActions() {
        val device = DeviceSummary("fixture-device", "Fixture TV", "Android TV", "Fixture", "1", 0, 0, 60_000, false)
        var signOuts = 0
        var changes = 0
        val revoked = mutableListOf<String>()
        compose.setContent {
            MaterialTheme {
                SettingsContent(fixture().copy(devices = listOf(device)), null, null, { _, _ -> }, {},
                    { revoked += it.deviceSessionId }, { signOuts++ }, { changes++ })
            }
        }
        open("Account")
        open("Sign Out")
        open("Change Server")
        hardwareBack()
        open("Advanced")
        compose.onNodeWithText("Fixture TV", substring = true).performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle {
            assertEquals(1, signOuts)
            assertEquals(1, changes)
            assertEquals(listOf("fixture-device"), revoked)
        }
    }

    @Test fun reenteringAdvancedStartsAtTheFirstDeviceAfterALongList() {
        val devices = List(30) { index ->
            DeviceSummary("fixture-$index", "Fixture Device ${index.toString().padStart(2, '0')}", "Android TV", "Fixture", "1", 0, 0, 60_000, false)
        }
        compose.setContent {
            MaterialTheme { SettingsContent(fixture().copy(devices = devices), null, null, { _, _ -> }, {}, {}, {}, {}) }
        }
        open("Advanced")
        compose.onNodeWithText("Fixture Device 00").assertIsFocused()
        compose.onNodeWithContentDescription("Settings").performScrollToIndex(31)
        compose.onNodeWithText("Fixture Device 29").performSemanticsAction(SemanticsActions.RequestFocus)
        hardwareBack()
        compose.onNodeWithText("Advanced").assertIsFocused()
        open("Advanced")
        compose.onNodeWithText("Fixture Device 00").assertIsFocused()
    }

    private fun open(label: String) = compose.onNodeWithText(label).performSemanticsAction(SemanticsActions.OnClick)

    private fun hardwareBack() {
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
    }

    private fun fixture() = SettingsState(loading = false, preferences = Preferences(false, true, true, true, true, true, false))
}
