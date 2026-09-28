package io.github.jovalle.watchtower.tv.playback

import io.github.jovalle.watchtower.tv.api.Delivery
import io.github.jovalle.watchtower.tv.api.PlaybackPart
import io.github.jovalle.watchtower.tv.api.TimelineMapping
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class TimelineMapperTest {
    private val parts = listOf(
        PlaybackPart("part-1", 0, 0, 3_600_000, "/one"),
        PlaybackPart("part-2", 1, 3_600_000, 3_660_000, "/two"),
    )

    @Test fun `file positions include the current part origin`() {
        val mapper = mapper("file", "absolute", 600_000)

        assertEquals(3_720_000, mapper.toAbsolute(1, 120_000))
    }

    @Test fun `file seek selects a part and clamps the item end`() {
        val mapper = mapper("file", "absolute", 0)

        assertEquals(PlayerPosition(1, 50_000), mapper.seekPlan(3_650_000).playerPosition)
        assertEquals(PlayerPosition(1, 3_660_000), mapper.seekPlan(9_000_000).playerPosition)
    }

    @Test fun `offset relative HLS adds the requested offset exactly once`() {
        val mapper = mapper("hls", "offset_relative", 1_200_000, activePartIndex = 0)

        assertEquals(1_210_000, mapper.toAbsolute(0, 10_000))
        assertEquals(PlayerPosition(0, 10_000), mapper.seekPlan(1_210_000).playerPosition)
    }

    @Test fun `absolute HLS adds the part origin and seeks within the full window`() {
        val mapper = mapper("hls", "absolute", 3_900_000, activePartIndex = 1)

        assertEquals(3_610_000, mapper.toAbsolute(0, 10_000))
        assertEquals(PlayerPosition(0, 310_000), mapper.seekPlan(3_910_000).playerPosition)
    }

    @Test fun `unknown HLS resolves an offset relative window at a nonzero offset`() {
        val resolution = mapper("hls", "unknown", 1_200_000, activePartIndex = 0)
            .resolveUnknownHls(2_400_750)

        assertEquals(HlsTimelineMapping.OFFSET_RELATIVE, resolution.mapper.hlsMapping)
        assertEquals(0, resolution.initialSeekMs)
        assertEquals(1_210_000, resolution.mapper.toAbsolute(0, 10_000))
    }

    @Test fun `unknown HLS resolves a full part window and requests one initial seek`() {
        val resolution = mapper("hls", "unknown", 3_900_000, activePartIndex = 1)
            .resolveUnknownHls(3_659_500)

        assertEquals(HlsTimelineMapping.ABSOLUTE, resolution.mapper.hlsMapping)
        assertEquals(300_000, resolution.initialSeekMs)
        assertEquals(3_900_000, resolution.mapper.toAbsolute(0, resolution.initialSeekMs))
    }

    @Test fun `unknown HLS fallback is deterministic and diagnostic`() {
        val resolution = mapper("hls", "unknown", 1_200_000, activePartIndex = 0)
            .resolveUnknownHls(900_000)

        assertEquals(HlsTimelineMapping.OFFSET_RELATIVE, resolution.mapper.hlsMapping)
        assertEquals(0, resolution.initialSeekMs)
        assertNotNull(resolution.diagnostic.takeIf { "fallback" in it })
    }

    @Test fun `HLS seeks outside the loaded range request the correct replacement`() {
        val mapper = mapper("hls", "offset_relative", 3_900_000, activePartIndex = 1)

        assertEquals("part_change", mapper.seekPlan(3_500_000).replacementReason)
        assertEquals("seek_reload", mapper.seekPlan(3_700_000).replacementReason)
        assertNull(mapper.seekPlan(4_000_000).replacementReason)
    }

    @Test fun `HLS exact multipart boundary loads the next part`() {
        val mapper = mapper("hls", "offset_relative", 1_200_000, activePartIndex = 0)

        assertEquals("part_change", mapper.seekPlan(3_600_000).replacementReason)
    }

    @Test fun `reported positions clamp to the item duration`() {
        val mapper = mapper("file", "absolute", 0)

        assertEquals(0, mapper.toAbsolute(0, -1_000))
        assertEquals(7_260_000, mapper.toAbsolute(1, 9_000_000))
    }

    private fun mapper(type: String, mapping: String, requestedOffsetMs: Long, activePartIndex: Int = 0) =
        TimelineMapper.from(
            Delivery(
                type = type,
                method = if (type == "file") "direct_play" else "transcode",
                plexDecision = null,
                mimeType = "video/test",
                parts = parts,
                activePartIndex = activePartIndex,
                timeline = TimelineMapping(mapping, requestedOffsetMs),
            ),
            durationMs = 7_260_000,
        )
}