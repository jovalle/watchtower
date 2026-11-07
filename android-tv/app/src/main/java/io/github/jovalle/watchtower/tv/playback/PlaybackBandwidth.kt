package io.github.jovalle.watchtower.tv.playback

data class PlaybackBandwidth(
    val currentBps: Long? = null,
    val averageBps: Long? = null,
    val minimumBps: Long? = null,
    val maximumBps: Long? = null,
    private val totalElapsedMs: Double = 0.0,
    private val totalBytes: Double = 0.0,
) {
    fun sample(elapsedMs: Int, bytes: Long): PlaybackBandwidth {
        if (elapsedMs <= 0 || bytes <= 0) return this
        val current = (bytes.toDouble() * 8_000 / elapsedMs).toLong()
        val elapsed = totalElapsedMs + elapsedMs
        val loaded = totalBytes + bytes
        return PlaybackBandwidth(current, (loaded * 8_000 / elapsed).toLong(),
            minimumBps?.coerceAtMost(current) ?: current, maximumBps?.coerceAtLeast(current) ?: current,
            elapsed, loaded)
    }
}
