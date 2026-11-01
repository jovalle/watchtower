package io.github.jovalle.watchtower.tv.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TrackMapperTest {
    private val plex = listOf(
        PlexTrackFact("a1", TrackKind.AUDIO, "eng", false),
        PlexTrackFact("a2", TrackKind.AUDIO, "spa", false),
        PlexTrackFact("s1", TrackKind.TEXT, "eng", false),
        PlexTrackFact("s2", TrackKind.TEXT, "eng", true),
    )

    @Test fun `maps embedded tracks by order within type`() {
        val player = listOf(
            PlayerTrackFact(2, 0, TrackKind.TEXT, "eng"),
            PlayerTrackFact(0, 0, TrackKind.AUDIO, "eng"),
            PlayerTrackFact(1, 0, TrackKind.AUDIO, "spa"),
        )

        assertEquals(TrackOverrideTarget(1, 0), TrackMapper.mapByContainerOrder("a2", plex, player, TrackKind.AUDIO))
        assertEquals(TrackOverrideTarget(2, 0), TrackMapper.mapByContainerOrder("s1", plex, player, TrackKind.TEXT))
        assertNull(TrackMapper.mapByContainerOrder("s2", plex, player, TrackKind.TEXT))
    }

    @Test fun `language mismatch rejects an unsafe order match`() {
        val player = listOf(
            PlayerTrackFact(0, 0, TrackKind.AUDIO, "eng"),
            PlayerTrackFact(1, 0, TrackKind.AUDIO, "fra"),
        )

        assertNull(TrackMapper.mapByContainerOrder("a2", plex, player, TrackKind.AUDIO))
    }
}