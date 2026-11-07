package io.github.jovalle.watchtower.tv.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CapabilityMapperTest {
    @Test fun `mapping merges decoders and intersects HDR with the display`() {
        val facts = CapabilityFacts(
            manufacturer = "Acme",
            model = "TV",
            sdkInt = 36,
            displayWidthPx = 3840,
            displayHeightPx = 2160,
            refreshRatesHz = setOf(60.0, 23.976),
            displayHdrTypes = setOf("hdr10"),
            videoDecoders = listOf(
                CodecFact("hevc", setOf("main"), 1920, 1080, 30.0, 20_000, tenBit = false),
                CodecFact("hevc", setOf("main 10"), 3840, 2160, 60.0, 80_000, tenBit = true, hdrTypes = setOf("hdr10", "hlg")),
            ),
            audioDecoders = listOf(CodecFact("eac3", maxChannels = 8), CodecFact("aac", maxChannels = 2)),
            passthroughCodecs = setOf("eac3"),
            audioOutputType = "hdmi",
            maxPcmChannels = 6,
        )

        val mapped = CapabilityMapper.map(facts, 40_000)

        val hevc = mapped.video.single()
        assertEquals(listOf("main", "main 10"), hevc.profiles)
        assertEquals(listOf("hdr10"), hevc.hdrTypes)
        assertTrue(hevc.tenBit)
        assertTrue(mapped.audio.first { it.codec == "eac3" }.passthrough)
        assertFalse(mapped.audio.first { it.codec == "aac" }.passthrough)
        assertEquals(40_000, mapped.maxVideoBitrateKbps)
        assertEquals(listOf(23.976, 60.0), mapped.display.refreshRatesHz)
    }
}