package io.github.jovalle.watchtower.tv.playback

enum class TrackKind { AUDIO, TEXT }

data class PlayerTrackFact(
    val groupIndex: Int,
    val trackIndex: Int,
    val kind: TrackKind,
    val language: String?,
)

data class TrackOverrideTarget(val groupIndex: Int, val trackIndex: Int)

object TrackMapper {
    fun mapByContainerOrder(
        streamId: String,
        plexTracks: List<PlexTrackFact>,
        playerTracks: List<PlayerTrackFact>,
        kind: TrackKind,
    ): TrackOverrideTarget? {
        val plexOfType = plexTracks.filter { it.kind == kind && !it.external }
        val selectedIndex = plexOfType.indexOfFirst { it.streamId == streamId }
        if (selectedIndex < 0) return null
        val playerOfType = playerTracks.filter { it.kind == kind }
        val candidate = playerOfType.getOrNull(selectedIndex) ?: return null
        val expectedLanguage = plexOfType[selectedIndex].language
        if (expectedLanguage != null && candidate.language != null &&
            !PlaybackRequestFactory.matchesLanguage(candidate.language, candidate.language, expectedLanguage)
        ) return null
        return TrackOverrideTarget(candidate.groupIndex, candidate.trackIndex)
    }
}

data class PlexTrackFact(
    val streamId: String,
    val kind: TrackKind,
    val language: String?,
    val external: Boolean,
)