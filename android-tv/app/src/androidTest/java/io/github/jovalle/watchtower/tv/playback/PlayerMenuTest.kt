package io.github.jovalle.watchtower.tv.playback

import android.view.KeyEvent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.performMouseInput
import androidx.compose.ui.test.click
import androidx.test.platform.app.InstrumentationRegistry
import androidx.tv.material3.MaterialTheme
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.common.util.UnstableApi
import io.github.jovalle.watchtower.tv.api.AudioTrack
import io.github.jovalle.watchtower.tv.api.Autoplay
import io.github.jovalle.watchtower.tv.api.Delivery
import io.github.jovalle.watchtower.tv.api.MediaIdentity
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.PlaybackDescriptor
import io.github.jovalle.watchtower.tv.api.PlaybackTracks
import io.github.jovalle.watchtower.tv.api.QualityInfo
import io.github.jovalle.watchtower.tv.api.QualityOption
import io.github.jovalle.watchtower.tv.api.SourceInfo
import io.github.jovalle.watchtower.tv.api.TimelineMapping
import io.github.jovalle.watchtower.tv.settings.LocalPlaybackPreferences
import io.github.jovalle.watchtower.tv.settings.ProfilePlaybackPrefs
import io.github.jovalle.watchtower.tv.settings.VideoDisplayMode
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue

class PlayerMenuTest {
    @get:Rule val compose = createComposeRule()

    @kotlin.OptIn(androidx.compose.ui.test.ExperimentalTestApi::class)
    @Test fun mouseBackReturnsThroughMenusWithoutChangingPlayback() {
        var writes = 0
        compose.setContent { MaterialTheme { MenuHarness(fixture(), onWrite = { writes++ }) } }
        compose.onNodeWithContentDescription("Player Settings").performMouseInput { click() }
        compose.onNodeWithText("Playback Options").performMouseInput { click() }
        compose.onNodeWithText("Playback Speed").performMouseInput { click() }
        compose.onNodeWithContentDescription("Back").performMouseInput { click() }
        compose.onNodeWithText("Playback Speed").assertIsFocused()
        compose.onNodeWithContentDescription("Back").performMouseInput { click() }
        compose.onNodeWithText("Playback Options").assertIsFocused()
        compose.onNodeWithContentDescription("Back").performMouseInput { click() }
        compose.onNodeWithContentDescription("Player Settings").assertIsFocused()
        compose.runOnIdle { assertEquals(0, writes) }
    }

    @Test fun focusedLongMenuTitleAndHelperAreReadableAtLargeText() {
        val title = "English commentary with the complete original audio presentation"
        val helper = "Commentary by film historians discussing the restoration and original theatrical release"
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                MaterialTheme { Column(Modifier.width(256.dp)) { MenuButton("$title\n$helper") {} } }
            }
        }
        compose.onNodeWithText(title).performSemanticsAction(SemanticsActions.RequestFocus)
        listOf(title, helper).forEach { text ->
            val layouts = mutableListOf<TextLayoutResult>()
            compose.onNodeWithText(text, useUnmergedTree = true).assertIsDisplayed()
                .performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
            assertTrue("Focused menu text must remain readable: $text", !layouts.single().hasVisualOverflow)
        }
    }

    @Test fun emptyAudioMenuKeepsAttachedInitialFocus() {
        var backs = 0
        showMenu(PlayerMenu.AUDIO, fixture(audio = emptyList())) { backs++ }
        compose.onNodeWithText("No Audio Tracks").assertIsFocused().performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(1, backs) }
    }

    @Test fun emptyQualityMenuKeepsAttachedInitialFocus() {
        var backs = 0
        showMenu(PlayerMenu.QUALITY, fixture(quality = emptyList())) { backs++ }
        compose.onNodeWithText("No Quality Options").assertIsFocused().performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(1, backs) }
    }

    @Test fun silentMediaDoesNotOfferAnAudioDestination() {
        showMenu(PlayerMenu.MORE, fixture(audio = emptyList()))
        compose.onNodeWithText("Audio").assertDoesNotExist()
    }

    @Test fun subtitleNoneIsSelectedAndDispatchesTheNullTrack() {
        var selected: String? = "not selected"
        compose.setContent {
            MaterialTheme {
                PlayerMenuContent(PlayerMenu.SUBTITLES, PlaybackUiState(descriptor = fixture()), true, {}, {}, {}, {},
                    { selected = it?.streamId }, {}, {})
            }
        }
        compose.onNodeWithText("None").assertIsFocused().assertIsSelected().performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(null, selected) }
    }

    @Test fun commentaryKeepsItsPrimaryTitleAndDistinctDescription() {
        val track = AudioTrack("commentary", "English (FLAC Stereo)", "English", "en", "flac", 2, false, false, false,
            description = "Commentary by Film Historian Tim Lucas")
        var selected: AudioTrack? = null
        compose.setContent {
            MaterialTheme {
                PlayerMenuContent(PlayerMenu.AUDIO, PlaybackUiState(descriptor = fixture(audio = listOf(track))), true,
                    {}, {}, {}, { selected = it }, {}, {}, {})
            }
        }
        compose.onNodeWithText("English (FLAC Stereo)").assertIsDisplayed()
        compose.onNodeWithText("Commentary by Film Historian Tim Lucas").assertIsDisplayed().performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(track, selected) }
    }

    @Test fun qualityDescriptionUsesTheRealBitrateAndKeepsTheOptionCallback() {
        var selected: String? = null
        val option = QualityOption("1080p-20", "1080p · 20 Mbps", 20_000, "1920x1080")
        val lowBitrate = QualityOption("480p-1.5", "480p · 1.5 Mbps", 1_500, "720x480")
        compose.setContent {
            MaterialTheme {
                PlayerMenuContent(PlayerMenu.QUALITY, PlaybackUiState(descriptor = fixture(quality = listOf(option, lowBitrate))), true,
                    {}, {}, {}, {}, {}, { selected = it }, {})
            }
        }
        compose.onNodeWithText("20 Mbps (About 9 GB per hour)").assertIsDisplayed().performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals("1080p-20", selected) }
        compose.onNodeWithText("1.5 Mbps (About 675 MB per hour)").assertIsDisplayed().performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals("480p-1.5", selected) }
    }

    @Test
    @androidx.annotation.OptIn(UnstableApi::class)
    fun statisticsUseSevenPanesInThreeNonoverlappingColumns() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        lateinit var player: ExoPlayer
        instrumentation.runOnMainSync { player = ExoPlayer.Builder(instrumentation.targetContext).build() }
        try {
            compose.setContent { MaterialTheme { StatisticsOverlay(PlaybackUiState(descriptor = fixture()), player) } }
            val panes = listOf("Session", "Memory", "Engine", "Audio", "Video", "Bandwidth", "Display").associateWith { title ->
                compose.onNodeWithText(title).assertIsDisplayed().getBoundsInRoot()
            }
            fun aligned(first: String, second: String) {
                assertTrue("$first and $second must share a column", kotlin.math.abs(panes.getValue(first).left.value - panes.getValue(second).left.value) < 1f)
                assertTrue("$first and $second must not overlap vertically", panes.getValue(first).bottom <= panes.getValue(second).top)
            }
            aligned("Session", "Memory")
            aligned("Engine", "Audio")
            aligned("Video", "Bandwidth")
            aligned("Bandwidth", "Display")
            assertTrue(panes.getValue("Session").right <= panes.getValue("Engine").left)
            assertTrue(panes.getValue("Memory").right <= panes.getValue("Audio").left)
            assertTrue(panes.getValue("Engine").right <= panes.getValue("Video").left)
            assertTrue(panes.getValue("Audio").right <= panes.getValue("Bandwidth").left)
        } finally {
            instrumentation.runOnMainSync { player.release() }
        }
    }

    @Test fun hardwareBackReturnsToSettingsAudioRowThenPlayerGear() {
        compose.setContent { MaterialTheme { MenuHarness(fixture()) } }
        compose.onNodeWithContentDescription("Player Settings").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Audio").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("English").assertIsFocused()

        hardwareBack()
        compose.onNodeWithText("Audio").assertIsFocused()
        hardwareBack()
        compose.onNodeWithContentDescription("Player Settings").assertIsFocused()
    }

    @Test fun directSubtitlesBackReturnsToItsPlayerButton() {
        compose.setContent { MaterialTheme { MenuHarness(fixture(), directSubtitles = true) } }
        compose.onNodeWithContentDescription("Direct Subtitles").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("None").assertIsFocused()
        hardwareBack()
        compose.onNodeWithContentDescription("Direct Subtitles").assertIsFocused()
    }

    @Test fun settingsKeepsOnlyTheFourReferenceDestinations() {
        showMenu(PlayerMenu.MORE, fixture())
        listOf("Quality", "Subtitles", "Audio", "Playback Options").forEach { compose.onNodeWithText(it).assertIsDisplayed() }
        compose.onNodeWithText("Start Over").assertDoesNotExist()
        compose.onNodeWithText("Diagnostics").assertDoesNotExist()
    }

    @Test fun unavailableAudioProcessingIsDisabledAndStatisticsDispatchesItsToggle() {
        var showStatistics = false
        compose.setContent {
            MaterialTheme {
                PlayerMenuContent(PlayerMenu.OPTIONS, PlaybackUiState(descriptor = fixture()), true, {}, {}, {}, {}, {}, {}, {},
                    onStatistics = { showStatistics = it })
            }
        }
        compose.onNodeWithText("Boost Dialog").assertIsNotEnabled()
        compose.onNodeWithText("Normalize Loudness").assertIsNotEnabled()
        compose.onNodeWithText("Dialog boost is unavailable in Watchtower.").assertIsDisplayed()
        compose.onNodeWithText("Loudness analysis is unavailable in Watchtower.").assertIsDisplayed()
        compose.onNodeWithText("Nerd Statistics").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(true, showStatistics) }
    }

    @Test fun playbackSpeedStartsOnFirstChoiceAndDispatchesTheChosenRate() {
        var selected = 1f
        compose.setContent {
            MaterialTheme {
                PlayerMenuContent(PlayerMenu.SPEED, PlaybackUiState(descriptor = fixture()), true, {}, {}, {}, {}, {}, {}, {}, onSpeed = { selected = it })
            }
        }
        compose.onNodeWithText("0.5x").assertIsFocused()
        compose.onNodeWithText("Normal").assertIsSelected()
        compose.onNodeWithText("1.5x").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(1.5f, selected) }
    }

    @Test fun sleepTimerStartsOffAndDispatchesAfterThisItem() {
        var selected = SleepTimerOption.OFF
        compose.setContent {
            MaterialTheme {
                PlayerMenuContent(PlayerMenu.SLEEP, PlaybackUiState(descriptor = fixture()), true, {}, {}, {}, {}, {}, {}, {}, onSleep = { selected = it })
            }
        }
        compose.onNodeWithText("Off").assertIsFocused().assertIsSelected()
        compose.onNodeWithText("Stop After This Item").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(SleepTimerOption.AFTER_THIS_ITEM, selected) }
    }

    @Test fun displayModeStartsLetterboxedAndDispatchesZoom() {
        var selected = VideoDisplayMode.LETTERBOX
        compose.setContent {
            MaterialTheme {
                PlayerMenuContent(PlayerMenu.DISPLAY, PlaybackUiState(descriptor = fixture()), true, {}, {}, {}, {}, {}, {}, {}, onDisplay = { selected = it })
            }
        }
        compose.onNodeWithText("Letterbox").assertIsFocused().assertIsSelected()
        compose.onNodeWithText("Zoom").performSemanticsAction(SemanticsActions.OnClick)
        compose.runOnIdle { assertEquals(VideoDisplayMode.ZOOM, selected) }
    }

    @Test fun backFromSpeedRestoresBothOptionsAndSettingsRows() {
        compose.setContent { MaterialTheme { MenuHarness(fixture()) } }
        compose.onNodeWithContentDescription("Player Settings").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Playback Options").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Playback Speed").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("0.5x").assertIsFocused()
        hardwareBack()
        compose.onNodeWithText("Playback Speed").assertIsFocused()
        hardwareBack()
        compose.onNodeWithText("Playback Options").assertIsFocused()
        hardwareBack()
        compose.onNodeWithContentDescription("Player Settings").assertIsFocused()
    }

    @Test fun returningFromDisplayKeepsTheOptionsHeadingVisible() {
        compose.setContent { MaterialTheme { MenuHarness(fixture()) } }
        compose.onNodeWithContentDescription("Player Settings").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Playback Options").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Display Mode").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Zoom").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Display Mode").assertIsFocused()
        compose.onNodeWithText("Playback Options").assertIsDisplayed()
    }

    @Test fun reopeningAScrolledTrackMenuReattachesItsInitialFocus() {
        val descriptor = fixture(audio = (1..30).map { AudioTrack("audio-$it", "Track $it", "en", "en", "aac", 2, true, true, false) })
        compose.setContent { MaterialTheme { MenuHarness(descriptor) } }
        compose.onNodeWithContentDescription("Player Settings").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Audio").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("Track 30"))
        hardwareBack()
        compose.onNodeWithText("Audio").assertIsFocused().performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Track 1").assertIsFocused()
    }

    @Test fun playerChoicesPersistOnlyForTheirProfile() {
        val prefs = LocalPlaybackPreferences(InstrumentationRegistry.getInstrumentation().targetContext)
        val server = "player-options-test"
        try {
            prefs.clear(server, "first")
            prefs.clear(server, "second")
            prefs.set(server, "first", ProfilePlaybackPrefs(playbackSpeed = 1.5f, videoDisplayMode = VideoDisplayMode.ZOOM))
            assertEquals(1.5f, prefs.get(server, "first").playbackSpeed)
            assertEquals(VideoDisplayMode.ZOOM, prefs.get(server, "first").videoDisplayMode)
            assertEquals(ProfilePlaybackPrefs(), prefs.get(server, "second"))
        } finally {
            prefs.clear(server, "first")
            prefs.clear(server, "second")
        }
    }

    private fun hardwareBack() {
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitForIdle()
    }

    private fun showMenu(menu: PlayerMenu, descriptor: PlaybackDescriptor, onBack: () -> Unit = {}) {
        compose.setContent {
            MaterialTheme {
                PlayerMenuContent(menu, PlaybackUiState(descriptor = descriptor), true, onBack, {}, {}, {}, {}, {}, {})
            }
        }
    }

    @Composable
    private fun MenuHarness(descriptor: PlaybackDescriptor, directSubtitles: Boolean = false, onWrite: () -> Unit = {}) {
        var state by remember { mutableStateOf(PlaybackUiState(descriptor = descriptor)) }
        val opener = remember { FocusRequester() }
        LaunchedEffect(Unit) { opener.requestFocus() }
        RestoreFocusEffect(state.menu != null, opener)
        Box(Modifier.fillMaxSize()) {
            PlayerButton(if (directSubtitles) "Subtitles" else "Settings", if (directSubtitles) "Direct Subtitles" else "Player Settings",
                Modifier.focusRequester(opener), canFocus = state.menu == null) {
                state = state.togglePlayerMenu(if (directSubtitles) PlayerMenu.SUBTITLES else PlayerMenu.MORE)
            }
            state.menu?.let { menu ->
                PlayerMenuContent(menu, state, true,
                    onBack = { state = state.backFromPlayerMenu() }, onMenu = { state = state.togglePlayerMenu(it) },
                    onIntent = { onWrite() }, onAudio = { onWrite() }, onSubtitle = { onWrite() }, onQuality = { onWrite() }, onSkipIntro = onWrite,
                    onSpeed = { onWrite() }, onSleep = { onWrite() }, onStatistics = { onWrite() },
                    onDisplay = { onWrite(); state = state.copy(videoDisplayMode = it).backFromPlayerMenu() })
            }
        }
    }

    private fun fixture(
        audio: List<AudioTrack> = listOf(AudioTrack("audio-1", "English", "en", "en", "aac", 2, true, true, false)),
        quality: List<QualityOption> = listOf(QualityOption("original", "Original", null, null)),
    ) = PlaybackDescriptor(
        playbackId = "fixture", expiresInMs = 60_000,
        media = MediaIdentity("server", "item", "media", "part"),
        item = MediaSummary("item", "movie", "Fixture", null, null, null, null, 120_000, 0, 0,
            null, null, null, null, null, null, null, null, null),
        durationMs = 120_000, startPositionMs = 0, resumeSource = "request",
        delivery = Delivery("file", "direct_play", null, "video/mp4", emptyList(), 0, TimelineMapping("absolute", 0)),
        source = SourceInfo(null, null, null, null, null, null, null, null),
        quality = QualityInfo("original", quality, null),
        tracks = PlaybackTracks(audio, emptyList(), audio.firstOrNull()?.streamId, null, "none", null),
        markers = emptyList(), nextItem = null, previousItem = null, autoplay = Autoplay(false, false),
        heartbeatIntervalMs = 30_000, timelineIntervalMs = 10_000, diagnostics = emptyList(),
    )
}
