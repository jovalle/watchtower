package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.api.AudioTrack
import io.github.jovalle.watchtower.tv.api.MediaPart
import io.github.jovalle.watchtower.tv.api.MediaVersion
import io.github.jovalle.watchtower.tv.api.SubtitleTrack
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class TechnicalMediaDetailsTest {
    @get:Rule val compose = createComposeRule()

    @Test fun emptyAndUnknownVersionsDoNotRenderEmptyTechnicalSections() {
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(version()), null, {}) } }
        listOf("Picture", "Sound", "File", "Version").forEach { compose.onNodeWithText(it).assertDoesNotExist() }
    }

    @Test fun malformedNumbersAndUnknownStringsAreOmitted() {
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(version().copy(
            videoCodec = "unknown", videoProfile = " ", videoResolution = "unknown", container = "unknown",
            width = -1, height = 0, frameRate = Double.NaN, bitDepth = -10, hdr = "unknown",
            audioCodec = "unknown", audioChannels = -1, bitrateKbps = 0,
            parts = listOf(MediaPart("part", 0, null, null, -1)),
        )), null, {}) } }
        listOf("Picture", "Sound", "File", "NaN", "unknown").forEach { compose.onNodeWithText(it).assertDoesNotExist() }
    }

    @Test fun realPictureAndFileFactsIncludeMultipartTotalWithoutPathsOrGuessedSource() {
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(richVersion()), null, {}) } }
        listOf("Picture", "Sound", "File", "3840 × 2160", "HEVC", "Main 10", "10-bit", "HDR10",
            "23.976 fps", "MKV", "25 Mbps", "3 GiB", "2 parts", "2 tracks   English, Spanish").forEach {
            compose.onNodeWithText(it).assertExists()
        }
        compose.onAllNodes(hasText("WEB-DL", substring = true)).assertCountEquals(0)
        compose.onAllNodes(hasText("/media/", substring = true)).assertCountEquals(0)
        compose.onAllNodes(hasText("·", substring = true)).assertCountEquals(0)
        compose.onAllNodes(hasText("•", substring = true)).assertCountEquals(0)
    }

    @Test fun surroundChannelCountsAreLayoutsWithoutInferringAtmosFromTrueHd() {
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(version().copy(
            audioCodec = "truehd", audioChannels = 6,
            audioTracks = listOf(audio("English", "truehd", 6), audio("French", "dts", 8)),
        )), null, {}) } }
        compose.onNodeWithText("TRUEHD   5.1   English").assertIsDisplayed()
        compose.onNodeWithText("DTS   7.1   French").assertIsDisplayed()
        compose.onAllNodes(hasText("Atmos", substring = true)).assertCountEquals(0)
    }

    @Test fun monoStereoAndUnusualChannelCountsRemainAccurate() {
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(version().copy(audioTracks = listOf(
            audio("English", "aac", 1), audio("French", "aac", 2), audio("Spanish", "aac", 3),
        ))), null, {}) } }
        listOf("AAC   Mono   English", "AAC   Stereo   French", "AAC   3 channels   Spanish").forEach {
            compose.onNodeWithText(it).assertIsDisplayed()
        }
    }

    @Test fun audioDescriptionsAreKeptAndPlaceholderTitlesDoNotInventFacts() {
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(version().copy(audioTracks = listOf(
            audio("English", "eac3", 6).copy(description = "Dolby Atmos", audioDescription = true),
            audio(null, null, null).copy(title = "Unknown"),
        ))), null, {}) } }
        compose.onNodeWithText("EAC3   5.1   English   Dolby Atmos   Audio Description").assertExists()
        compose.onNodeWithText("Unknown").assertDoesNotExist()
    }

    @Test fun inspectingAnotherVersionOnlyCallsSelectionAndDoesNotMixFacts() {
        var selected by mutableStateOf<String?>("hd")
        val selections = mutableListOf<String>()
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(
            version().copy(mediaId = "hd", label = "HD", videoCodec = "h264"),
            version().copy(mediaId = "uhd", label = "UHD", container = "mkv", audioCodec = "flac", audioChannels = 2),
        ), selected, { selections += it; selected = it }) } }
        compose.onNodeWithText("H264").assertIsDisplayed()
        compose.onNodeWithContentDescription("UHD").performSemanticsAction(SemanticsActions.OnClick).assertIsSelected()
        compose.onNodeWithText("H264").assertDoesNotExist()
        compose.onNodeWithText("Picture").assertDoesNotExist()
        compose.onNodeWithText("FLAC   Stereo").assertIsDisplayed()
        compose.runOnIdle { assertEquals(listOf("uhd"), selections) }
    }

    @Test fun missingAndRemovedSelectedVersionFallBackToFirstRemainingVersion() {
        var versions by mutableStateOf(listOf(
            version().copy(mediaId = "first", label = "HD", videoCodec = "h264"),
            version().copy(mediaId = "second", label = "UHD", videoCodec = "hevc"),
        ))
        var selected by mutableStateOf<String?>("missing")
        compose.setContent { MaterialTheme { TechnicalMediaDetails(versions, selected, {}) } }
        compose.onNodeWithText("H264").assertIsDisplayed()
        compose.runOnIdle { selected = "second" }
        compose.onNodeWithText("HEVC").assertIsDisplayed()
        compose.runOnIdle { versions = versions.take(1) }
        compose.onNodeWithText("H264").assertIsDisplayed()
        compose.onNodeWithText("HEVC").assertDoesNotExist()
    }

    @Test fun partialMultipartSizeIsNotPresentedAsTotal() {
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(version().copy(parts = listOf(
            MediaPart("first", 0, null, null, 1_073_741_824L), MediaPart("second", 1, null, null, null),
        ))), null, {}) } }
        compose.onNodeWithText("2 parts").assertIsDisplayed()
        compose.onNodeWithText("Size").assertDoesNotExist()
    }

    @Test fun overflowingMultipartSizeIsOmittedInsteadOfWrappingNegative() {
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(version().copy(parts = listOf(
            MediaPart("first", 0, null, null, Long.MAX_VALUE), MediaPart("second", 1, null, null, 1),
        ))), null, {}) } }
        compose.onNodeWithText("2 parts").assertIsDisplayed()
        compose.onNodeWithText("Size").assertDoesNotExist()
    }

    @Test fun reportedAspectRatioAndDolbyVisionProfileAreKept() {
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(version().copy(
            aspectRatio = 2.39, dolbyVisionProfile = 8,
        )), null, {}) } }
        compose.onNodeWithText("2.39:1").assertIsDisplayed()
        compose.onNodeWithText("Profile 8").assertIsDisplayed()
    }

    @Test fun nonfiniteAspectAndFrameRateDoNotProducePictureFacts() {
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(version().copy(
            aspectRatio = Double.POSITIVE_INFINITY, frameRate = Double.NEGATIVE_INFINITY, dolbyVisionProfile = -1,
        )), null, {}) } }
        compose.onNodeWithText("Picture").assertDoesNotExist()
    }

    @Test fun pathLikeVersionLabelsNeverExposePrivatePaths() {
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(
            version().copy(label = "/media/private/movie.mkv", videoCodec = "hevc"),
            version().copy(mediaId = "second", label = "C:\\Private\\movie.mp4", videoCodec = "h264"),
            version().copy(mediaId = "third", label = "2160p · HEVC • HDR10", videoCodec = "hevc"),
        ), null, {}) } }
        compose.onNodeWithContentDescription("Version 1").assertIsDisplayed()
        compose.onNodeWithContentDescription("Version 2").assertIsDisplayed()
        compose.onNodeWithContentDescription("2160p   HEVC   HDR10").assertIsDisplayed()
        compose.onAllNodes(hasText("Private", substring = true, ignoreCase = true)).assertCountEquals(0)
    }

    @Test fun pictureSoundAndFileFlowWithoutClippingAtNormalText() = assertLayout(1f)
    @Test fun pictureSoundAndFileFlowWithoutClippingAtLargeText() = assertLayout(1.3f)

    @Test fun remoteCanPauseToReadEachTechnicalGroupAtLargeTextBeforeContinuing() {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                MaterialTheme { Column(Modifier.width(640.dp).height(420.dp).verticalScroll(rememberScrollState())) {
                    Spacer(Modifier.height(260.dp))
                    TechnicalMediaDetails(listOf(richVersion()), null, {})
                    CatalogTab("Cast target", false, {})
                } }
            }
        }
        compose.onNodeWithContentDescription("Picture").performSemanticsAction(SemanticsActions.RequestFocus)
            .assertIsFocused().assertIsDisplayed().performKeyInput { pressKey(Key.DirectionDown) }
        compose.onNodeWithContentDescription("Sound").assertIsFocused().assertIsDisplayed()
            .performKeyInput { pressKey(Key.DirectionDown) }
        compose.onNodeWithContentDescription("File").assertIsFocused().assertIsDisplayed()
            .performKeyInput { pressKey(Key.DirectionDown) }
        compose.onNodeWithContentDescription("Cast target").assertIsFocused().assertIsDisplayed()
    }

    @Test fun multipleAudioTracksHaveIndividualReadingStops() {
        compose.setContent { MaterialTheme { TechnicalMediaDetails(listOf(version().copy(audioTracks = listOf(
            audio("English", "truehd", 6), audio("French", "dts", 8),
        ))), null, {}) } }
        compose.onNodeWithContentDescription("Sound: TRUEHD   5.1   English")
            .performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused().assertIsDisplayed()
        compose.onNodeWithContentDescription("Sound: DTS   7.1   French")
            .performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused().assertIsDisplayed()
    }

    @Test fun focusedFileIsFullyVisibleInRealDetailScrollAtNormalText() = assertFileInDetailViewport(1f)
    @Test fun focusedFileIsFullyVisibleInRealDetailScrollAtLargeText() = assertFileInDetailViewport(1.3f)

    private fun assertFileInDetailViewport(scale: Float) {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, scale)) {
                MaterialTheme { Box(Modifier.width(800.dp).height(480.dp).testTag("detail-viewport")) {
                    DetailScrollColumn {
                        item { Column {
                            Spacer(Modifier.height(300.dp))
                            CatalogTab("Play target", false, {})
                        } }
                        item { TechnicalMediaDetails(listOf(richVersion().copy(audioTracks = listOf(
                            audio("English", "dca", 6).copy(description = "DTS-HD MA 5.1"),
                            audio("English", "flac", 2).copy(description = "FLAC 2.0"),
                            audio("English", "flac", 2).copy(description = "Commentary by Film Historian Tim Lucas"),
                        ))), null, {}, Modifier.width(800.dp)) }
                        item { CatalogTab("Cast target", false, {}) }
                        item { Spacer(Modifier.height(40.dp)) }
                    }
                } }
            }
        }
        compose.onNodeWithContentDescription("Play target").performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithContentDescription("File").performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused()
        compose.mainClock.advanceTimeBy(1_000)
        compose.waitForIdle()
        val viewport = compose.onNodeWithTag("detail-viewport").getUnclippedBoundsInRoot()
        val file = compose.onNodeWithContentDescription("File").getUnclippedBoundsInRoot()
        assertEquals("Reading stop bounds include the outer frame at the fixture gutter", viewport.left, file.left)
        assertTrue("Focused File must fully fit viewport $viewport after scroll settles; got $file",
            file.left >= viewport.left && file.top >= viewport.top &&
                file.right <= viewport.right && file.bottom <= viewport.bottom)
    }

    private fun assertLayout(scale: Float) {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, scale)) {
                MaterialTheme { TechnicalMediaDetails(listOf(richVersion()), null, {}, Modifier.width(640.dp).testTag("technical")) }
            }
        }
        val root = compose.onNodeWithTag("technical").getBoundsInRoot()
        listOf("Picture", "Sound", "File", "3840 × 2160", "23.976 fps", "TRUEHD   5.1   English", "3 GiB").forEach {
            val node = compose.onNodeWithText(it).assertIsDisplayed()
            val bounds = node.getBoundsInRoot()
            assertTrue("$it must fit $root; got $bounds", bounds.left >= root.left && bounds.right <= root.right && bounds.bottom <= root.bottom)
        }
        val picture = compose.onNodeWithText("Picture").getBoundsInRoot()
        val sound = compose.onNodeWithText("Sound").getBoundsInRoot()
        val file = compose.onNodeWithText("File").getBoundsInRoot()
        assertTrue(picture.bottom < sound.top && sound.bottom < file.top)
    }

    private fun version() = MediaVersion(
        mediaId = "first", label = "Version", container = null, videoCodec = null, videoProfile = null,
        videoResolution = null, width = null, height = null, frameRate = null, bitDepth = null, hdr = null,
        bitrateKbps = null, audioCodec = null, audioChannels = null, durationMs = null,
        parts = emptyList(), audioTracks = emptyList(), subtitleTracks = emptyList(),
    )

    private fun richVersion() = version().copy(
        label = "/media/private/movie.mkv", container = "mkv", videoCodec = "hevc", videoProfile = "Main 10",
        width = 3840, height = 2160, frameRate = 23.976, bitDepth = 10, hdr = "HDR10", bitrateKbps = 25_000,
        audioTracks = listOf(audio("English", "truehd", 6)),
        parts = listOf(MediaPart("a", 0, null, "mkv", 1_073_741_824), MediaPart("b", 1, null, "mkv", 2_147_483_648)),
        subtitleTracks = listOf(subtitle("English"), subtitle("Spanish")),
    )

    private fun audio(language: String?, codec: String?, channels: Int?) = AudioTrack(
        "audio", "Audio", language, null, codec, channels, false, false, false,
    )

    private fun subtitle(language: String) = SubtitleTrack(
        language, language, language, null, "srt", "text", false, false, false, false, false,
    )
}
