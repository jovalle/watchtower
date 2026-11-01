package io.github.jovalle.watchtower.tv.playback

import io.github.jovalle.watchtower.tv.api.AudioTrack
import io.github.jovalle.watchtower.tv.api.Edition
import io.github.jovalle.watchtower.tv.api.Guids
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.api.MediaVersion
import io.github.jovalle.watchtower.tv.api.SubtitleTrack
import io.github.jovalle.watchtower.tv.settings.ProfilePlaybackPrefs
import io.github.jovalle.watchtower.tv.settings.SubtitleMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackRequestFactoryTest {
    @Test fun `preferred language and audio description select real track IDs`() {
        val prefs = ProfilePlaybackPrefs(
            preferredAudioLanguage = "eng",
            preferredSubtitleLanguage = "spa",
            subtitleMode = SubtitleMode.ALWAYS,
            preferAudioDescription = true,
        )

        val selected = PlaybackRequestFactory.selectTracks(detail(), "m1", prefs)

        assertEquals("a2", selected.audioStreamId)
        assertEquals("s2", selected.subtitleStreamId)
        assertEquals(false, selected.subtitlesOff)
    }

    @Test fun `forced only never selects a non-forced subtitle`() {
        val selected = PlaybackRequestFactory.selectTracks(
            detail(),
            "m1",
            ProfilePlaybackPrefs(preferredSubtitleLanguage = "eng", subtitleMode = SubtitleMode.FORCED_ONLY),
        )

        assertEquals("s3", selected.subtitleStreamId)
    }

    @Test fun `off sends no subtitle ID and an explicit off flag`() {
        val selected = PlaybackRequestFactory.selectTracks(
            detail(),
            "m1",
            ProfilePlaybackPrefs(subtitleMode = SubtitleMode.OFF),
        )

        assertNull(selected.subtitleStreamId)
        assertTrue(selected.subtitlesOff)
    }

    private fun detail(): MediaDetail = MediaDetail(
        ratingKey = "r1",
        type = "movie",
        title = "Movie",
        year = null,
        posterUrl = null,
        backdropUrl = null,
        thumbUrl = null,
        durationMs = 100_000,
        viewOffsetMs = null,
        viewCount = 0,
        leafCount = null,
        viewedLeafCount = null,
        contentRating = null,
        showTitle = null,
        seasonNumber = null,
        episodeNumber = null,
        parentRatingKey = null,
        grandparentRatingKey = null,
        external = null,
        summary = null,
        tagline = null,
        studio = null,
        genres = emptyList(),
        directors = emptyList(),
        cast = emptyList(),
        audienceRating = null,
        criticRating = null,
        userRating = null,
        originallyAvailableAt = null,
        editionTitle = null,
        editions = emptyList<Edition>(),
        guids = Guids(null, null, null, null),
        versions = listOf(
            MediaVersion(
                mediaId = "m1",
                label = "Original",
                container = "mkv",
                videoCodec = "h264",
                videoProfile = "high",
                videoResolution = "1080p",
                width = 1920,
                height = 1080,
                frameRate = 23.976,
                bitDepth = 8,
                hdr = null,
                bitrateKbps = 8_000,
                audioCodec = "aac",
                audioChannels = 2,
                durationMs = 100_000,
                parts = emptyList(),
                audioTracks = listOf(
                    AudioTrack("a1", "English", "English", "eng", "aac", 2, true, true, false),
                    AudioTrack("a2", "English AD", "English", "eng", "aac", 2, false, false, true),
                    AudioTrack("a3", "Spanish", "Spanish", "spa", "aac", 2, false, false, false),
                ),
                subtitleTracks = listOf(
                    SubtitleTrack("s1", "English", "English", "eng", "srt", "text", false, false, false, true, true),
                    SubtitleTrack("s2", "Spanish", "Spanish", "spa", "srt", "text", true, false, false, false, false),
                    SubtitleTrack("s3", "English forced", "English", "eng", "srt", "text", false, true, false, false, false),
                ),
            ),
        ),
        markers = emptyList(),
        onWatchlist = false,
        playable = true,
    )
}