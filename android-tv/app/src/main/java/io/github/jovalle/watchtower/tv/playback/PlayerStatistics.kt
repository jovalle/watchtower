package io.github.jovalle.watchtower.tv.playback

import android.os.Debug
import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.Format
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.R
import java.util.Locale

@Composable
@androidx.annotation.OptIn(UnstableApi::class)
internal fun StatisticsOverlay(state: PlaybackUiState, player: Player, modifier: Modifier = Modifier) {
    val descriptor = state.descriptor ?: return
    val unknown = stringResource(R.string.stats_unavailable)
    val exo = player as? ExoPlayer
    val videoCounters = exo?.videoDecoderCounters?.apply { ensureUpdated() }
    val audioCounters = exo?.audioDecoderCounters?.apply { ensureUpdated() }
    val runtime = Runtime.getRuntime()
    val display = LocalView.current.display?.mode
    val label = stringResource(R.string.player_nerd_statistics)
    Row(modifier.fillMaxWidth().semantics { contentDescription = label }, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            StatisticsPanel(stringResource(R.string.stats_session)) {
                StatisticsLine(stringResource(R.string.stats_delivery), "${descriptor.delivery.method} (${descriptor.delivery.type.uppercase(Locale.ROOT)})")
                if (descriptor.diagnostics.isNotEmpty()) StatisticsLine(stringResource(R.string.stats_reasons), descriptor.diagnostics.joinToString("\n"))
            }
            StatisticsPanel(stringResource(R.string.stats_memory)) {
                StatisticsLine(stringResource(R.string.stats_usage), stringResource(R.string.stats_memory_value,
                    (runtime.totalMemory() - runtime.freeMemory()) / 1_000_000.0, Debug.getNativeHeapAllocatedSize() / 1_000_000.0))
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            StatisticsPanel(stringResource(R.string.stats_engine)) {
                StatisticsLine(stringResource(R.string.stats_state), stringResource(when (player.playbackState) {
                    Player.STATE_BUFFERING -> R.string.player_buffering
                    Player.STATE_READY -> R.string.stats_ready
                    Player.STATE_ENDED -> R.string.stats_ended
                    else -> R.string.stats_idle
                }))
                StatisticsLine(stringResource(R.string.stats_buffer), stringResource(R.string.stats_buffer_value, player.totalBufferedDuration / 1_000.0))
                StatisticsLine(stringResource(R.string.stats_position), "${statisticTime(state.positionMs)} / ${statisticTime(state.durationMs)}")
            }
            StatisticsPanel(stringResource(R.string.player_audio)) {
                StatisticsLine(stringResource(R.string.stats_decoder), state.audioDecoderName ?: unknown)
                StatisticsLine(stringResource(R.string.stats_format), audioFormat(exo?.audioFormat) ?: unknown)
                StatisticsLine(stringResource(R.string.stats_packets), audioCounters?.let {
                    stringResource(R.string.stats_packets_value, it.renderedOutputBufferCount, it.queuedInputBufferCount, it.skippedOutputBufferCount)
                } ?: unknown)
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            StatisticsPanel(stringResource(R.string.stats_video)) {
                StatisticsLine(stringResource(R.string.stats_decoder), state.videoDecoderName ?: unknown)
                StatisticsLine(stringResource(R.string.stats_format), videoFormat(exo?.videoFormat) ?: unknown)
                StatisticsLine(stringResource(R.string.stats_frames), videoCounters?.let {
                    stringResource(R.string.stats_frames_value, it.renderedOutputBufferCount, it.queuedInputBufferCount, it.droppedBufferCount)
                } ?: unknown)
            }
            StatisticsPanel(stringResource(R.string.stats_bandwidth)) {
                StatisticsLine(stringResource(R.string.stats_current), bandwidthLabel(state.bandwidth.currentBps) ?: unknown)
                StatisticsLine(stringResource(R.string.stats_average), state.bandwidth.averageBps?.let {
                    stringResource(R.string.stats_bandwidth_average, bandwidthLabel(it).orEmpty(), bandwidthLabel(state.bandwidth.minimumBps).orEmpty(), bandwidthLabel(state.bandwidth.maximumBps).orEmpty())
                } ?: unknown)
            }
            StatisticsPanel(stringResource(R.string.stats_display)) {
                StatisticsLine(stringResource(R.string.stats_mode), display?.let {
                    stringResource(R.string.stats_display_value, it.physicalWidth, it.physicalHeight, it.refreshRate)
                } ?: unknown)
            }
        }
    }
}

@Composable
private fun StatisticsPanel(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.7f), RoundedCornerShape(4.dp)).padding(8.dp)) {
        Text(title, color = Color.White, fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(4.dp))
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) { content() }
    }
}

@Composable
private fun StatisticsLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, color = Color(0xFFAAAAAA), fontWeight = FontWeight.SemiBold, fontSize = 12.sp, lineHeight = 16.sp)
        Text(value, color = Color.White, fontSize = 12.sp, lineHeight = 16.sp, modifier = Modifier.weight(1f))
    }
}

private fun statisticTime(ms: Long): String = DateUtils.formatElapsedTime(ms.coerceAtLeast(0) / 1_000)
private fun bandwidthLabel(bps: Long?): String? = bps?.let { String.format(Locale.getDefault(), "%.1f Mbps", it / 1_000_000.0) }

private fun codecLabel(mime: String?): String? = when (mime) {
    MimeTypes.AUDIO_AAC -> "AAC"
    MimeTypes.VIDEO_H264 -> "H264"
    MimeTypes.VIDEO_H265 -> "HEVC"
    else -> mime?.substringAfter('/')?.uppercase(Locale.ROOT)
}

@androidx.annotation.OptIn(UnstableApi::class)
private fun audioFormat(format: Format?): String? = format?.let {
    listOfNotNull(codecLabel(it.sampleMimeType), it.channelCount.takeIf { channels -> channels > 0 }?.let { channels -> "${channels}ch" },
        it.sampleRate.takeIf { rate -> rate > 0 }?.let { rate -> String.format(Locale.getDefault(), "%.1fkHz", rate / 1_000.0) }).joinToString(", ")
}

@androidx.annotation.OptIn(UnstableApi::class)
private fun videoFormat(format: Format?): String? = format?.let {
    listOfNotNull(codecLabel(it.sampleMimeType), "${it.width}x${it.height}".takeIf { _ -> it.width > 0 && it.height > 0 },
        it.frameRate.takeIf { rate -> rate > 0 && rate.isFinite() }?.let { rate -> String.format(Locale.getDefault(), "%.2ffps", rate) },
        it.bitrate.takeIf { rate -> rate > 0 }?.let { rate -> bandwidthLabel(rate.toLong()) }).joinToString(", ")
}
