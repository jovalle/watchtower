package io.github.jovalle.watchtower.tv.playback

import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackBufferPolicyTest {
    @Test fun smallHeapsKeepTheMinimumPlayableBuffer() {
        assertEquals(16 * MIB, playbackBufferTargetBytes(48L * MIB))
        assertEquals(16 * MIB, playbackBufferTargetBytes(96L * MIB))
    }

    @Test fun emulatorHeapReservesFiveSixthsForTheRestOfTheApp() {
        assertEquals(32 * MIB, playbackBufferTargetBytes(192L * MIB))
    }

    @Test fun largeHeapsDoNotGrowTheBufferBeyondTheCap() {
        assertEquals(64 * MIB, playbackBufferTargetBytes(384L * MIB))
        assertEquals(64 * MIB, playbackBufferTargetBytes(2_048L * MIB))
        assertEquals(64 * MIB, playbackBufferTargetBytes(Long.MAX_VALUE))
    }

    private companion object { const val MIB = 1024 * 1024 }
}
