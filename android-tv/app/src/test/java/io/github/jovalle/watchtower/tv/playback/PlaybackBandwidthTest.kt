package io.github.jovalle.watchtower.tv.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class PlaybackBandwidthTest {
    @Test fun throughputTracksCurrentWeightedAverageAndExtremes() {
        val result = PlaybackBandwidth().sample(1_000, 125_000).sample(3_000, 750_000)
        assertEquals(2_000_000L, result.currentBps)
        assertEquals(1_750_000L, result.averageBps)
        assertEquals(1_000_000L, result.minimumBps)
        assertEquals(2_000_000L, result.maximumBps)
    }

    @Test fun emptyOrInvalidMeasurementsDoNotEraseTheLastSample() {
        val result = PlaybackBandwidth().sample(1_000, 125_000)
        assertEquals(1_000_000L, result.currentBps)
        assertSame(result, result.sample(0, 500))
        assertSame(result, result.sample(-1, 500))
        assertSame(result, result.sample(100, 0))
        assertSame(result, result.sample(100, -1))
    }
}
