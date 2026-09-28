package io.github.jovalle.watchtower.tv.playback

import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import io.github.jovalle.watchtower.tv.api.PlaybackDescriptor
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import okhttp3.OkHttpClient

@androidx.annotation.OptIn(UnstableApi::class)
class PlaybackMediaSourceFactory(
    private val snapshot: SessionSnapshot,
    client: OkHttpClient,
) {
    private val dataSourceFactory = OkHttpDataSource.Factory(client)

    fun create(descriptor: PlaybackDescriptor): List<MediaSource> {
        val subtitle = descriptor.tracks.sidecarUrl?.let { url ->
            MediaItem.SubtitleConfiguration.Builder(android.net.Uri.parse(snapshot.resolve(url).toString()))
                .setMimeType(MimeTypes.TEXT_VTT)
                .setLanguage(descriptor.tracks.subtitles.firstOrNull { it.streamId == descriptor.tracks.selectedSubtitleStreamId }?.languageCode)
                .setSelectionFlags(C.SELECTION_FLAG_DEFAULT)
                .build()
        }
        fun item(url: String, withSidecar: Boolean) = MediaItem.Builder()
            .setUri(snapshot.resolve(url).toString())
            .setMimeType(descriptor.delivery.mimeType)
            .setMediaId(descriptor.playbackId)
            .setMediaMetadata(
                androidx.media3.common.MediaMetadata.Builder()
                    .setTitle(descriptor.item.title)
                    .setArtist(descriptor.item.showTitle)
                    .build(),
            )
            .apply { if (subtitle != null && withSidecar) setSubtitleConfigurations(listOf(subtitle)) }
            .build()

        return when (descriptor.delivery.type) {
            // Plex sidecar subtitles belong to the part whose streams were validated (the first part).
            "file" -> descriptor.delivery.parts.map { part ->
                ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(item(requireNotNull(part.url), part.index == 0))
            }
            "hls" -> {
                val active = descriptor.delivery.parts.firstOrNull { it.index == descriptor.delivery.activePartIndex }
                    ?: error("HLS descriptor has no active part.")
                listOf(HlsMediaSource.Factory(dataSourceFactory).createMediaSource(item(requireNotNull(active.url), true)))
            }
            else -> error("Unsupported delivery type: ${descriptor.delivery.type}")
        }
    }
}