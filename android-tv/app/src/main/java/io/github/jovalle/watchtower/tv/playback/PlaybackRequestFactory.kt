package io.github.jovalle.watchtower.tv.playback

import io.github.jovalle.watchtower.tv.api.AudioTrack
import io.github.jovalle.watchtower.tv.api.DeviceCapabilities
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.api.PlaybackRequest
import io.github.jovalle.watchtower.tv.api.SubtitleTrack
import io.github.jovalle.watchtower.tv.settings.ProfilePlaybackPrefs
import io.github.jovalle.watchtower.tv.settings.SubtitleMode

data class TrackIntent(
    val audioStreamId: String?,
    val subtitleStreamId: String?,
    val subtitlesOff: Boolean,
)

object PlaybackRequestFactory {
    fun selectTracks(detail: MediaDetail, mediaId: String?, prefs: ProfilePlaybackPrefs): TrackIntent {
        val version = detail.versions.firstOrNull { it.mediaId == mediaId } ?: detail.versions.firstOrNull()
        val audio = chooseAudio(version?.audioTracks.orEmpty(), prefs)
        val subtitle = chooseSubtitle(version?.subtitleTracks.orEmpty(), prefs, audio)
        return TrackIntent(audio?.streamId, subtitle?.streamId, prefs.subtitleMode == SubtitleMode.OFF)
    }

    fun create(
        detail: MediaDetail,
        mediaId: String?,
        startPositionMs: Long?,
        prefs: ProfilePlaybackPrefs,
        capabilities: DeviceCapabilities,
        quality: String = prefs.defaultQuality,
        forceTranscode: Boolean = false,
        replacesPlaybackId: String? = null,
        reason: String = "start",
        preservedIntent: TrackIntent? = null,
    ): PlaybackRequest {
        val selectedMediaId = mediaId ?: detail.versions.firstOrNull()?.mediaId
        val tracks = preservedIntent ?: selectTracks(detail, selectedMediaId, prefs)
        return PlaybackRequest(
            ratingKey = requireNotNull(detail.ratingKey),
            mediaId = selectedMediaId,
            startPositionMs = startPositionMs,
            audioStreamId = tracks.audioStreamId,
            subtitleStreamId = tracks.subtitleStreamId,
            subtitlesOff = tracks.subtitlesOff,
            quality = quality,
            forceTranscode = forceTranscode,
            capabilities = capabilities,
            replacesPlaybackId = replacesPlaybackId,
            reason = reason,
        )
    }

    private fun chooseAudio(tracks: List<AudioTrack>, prefs: ProfilePlaybackPrefs): AudioTrack? {
        val languageTracks = tracks.filter { matchesLanguage(it.languageCode, it.language, prefs.preferredAudioLanguage) }
        if (prefs.preferAudioDescription) {
            languageTracks.firstOrNull(AudioTrack::audioDescription)?.let { return it }
            tracks.firstOrNull(AudioTrack::audioDescription)?.let { return it }
        }
        return languageTracks.firstOrNull { it.selected } ?: languageTracks.firstOrNull { it.default }
            ?: languageTracks.firstOrNull() ?: tracks.firstOrNull { it.selected } ?: tracks.firstOrNull { it.default }
            ?: tracks.firstOrNull()
    }

    private fun chooseSubtitle(
        tracks: List<SubtitleTrack>,
        prefs: ProfilePlaybackPrefs,
        audio: AudioTrack?,
    ): SubtitleTrack? {
        if (prefs.subtitleMode == SubtitleMode.OFF) return null
        val preferred = prefs.preferredSubtitleLanguage ?: prefs.preferredAudioLanguage
        val matching = tracks.filter { matchesLanguage(it.languageCode, it.language, preferred) }
        return when (prefs.subtitleMode) {
            SubtitleMode.OFF -> null
            SubtitleMode.FORCED_ONLY -> matching.firstOrNull { it.forced } ?: tracks.firstOrNull { it.forced }
            SubtitleMode.ALWAYS -> matching.firstOrNull { it.selected } ?: matching.firstOrNull { it.default }
                ?: matching.firstOrNull() ?: tracks.firstOrNull { it.selected } ?: tracks.firstOrNull { it.default }
            SubtitleMode.AUTO -> {
                val audioLanguage = audio?.languageCode ?: audio?.language
                matching.firstOrNull { it.forced }
                    ?: tracks.firstOrNull { it.forced && matchesLanguage(it.languageCode, it.language, audioLanguage) }
                    ?: tracks.firstOrNull { it.selected }
            }
        }
    }

    internal fun matchesLanguage(code: String?, name: String?, preferred: String?): Boolean {
        val wanted = preferred?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return false
        return sequenceOf(code, name).filterNotNull().map { it.trim().lowercase() }
            .any { it == wanted || it.take(2) == wanted.take(2) }
    }
}