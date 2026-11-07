package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.api.MediaVersion
import java.text.NumberFormat
import java.util.Locale

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TechnicalMediaDetails(
    versions: List<MediaVersion>,
    selectedMediaId: String?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (versions.isEmpty()) return
    val facts = versions.map { mediaFacts(it) }
    if (facts.all { groups -> groups.all { it.isEmpty() } }) return
    val index = versions.indexOfFirst { it.mediaId == selectedMediaId }.takeIf { it >= 0 } ?: 0
    Column(modifier, verticalArrangement = Arrangement.spacedBy(18.dp)) {
        if (versions.size > 1) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TechnicalHeading(stringResource(R.string.media_technical_version))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                versions.forEachIndexed { position, version ->
                    val label = version.label.known()?.takeUnless { '/' in it || '\\' in it }
                        ?.replace(Regex("\\s*[·•]\\s*"), "   ")
                        ?: stringResource(R.string.media_technical_version_number, position + 1)
                    CatalogTab(label, position == index, { onSelect(version.mediaId) })
                }
            }
        }
        val headings = listOf(R.string.media_technical_picture, R.string.media_technical_sound, R.string.media_technical_file)
        facts[index].forEachIndexed { group, values ->
            val title = stringResource(headings[group])
            val focusTracks = group == 1 && values.size > 1
            if (values.isNotEmpty()) Column(
                if (focusTracks) Modifier else Modifier.technicalReadingStop(title),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                TechnicalHeading(title)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    values.forEach { (label, value) ->
                        Column(Modifier.widthIn(min = 96.dp, max = 280.dp)
                            .then(if (focusTracks) Modifier.technicalReadingStop("$title: $value") else Modifier),
                            verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(label, fontSize = 11.sp, color = Color.LightGray)
                            Text(value, fontSize = 13.sp, lineHeight = 17.sp, color = Color.White)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Modifier.technicalReadingStop(label: String): Modifier {
    var focused by remember(label) { mutableStateOf(false) }
    return border(1.dp, if (focused) MaterialTheme.colorScheme.primary else Color.Transparent, RoundedCornerShape(4.dp))
        .semantics(mergeDescendants = true) { contentDescription = label }
        .onFocusChanged { focused = it.isFocused }
        .focusable()
        .padding(8.dp)
}

@Composable
private fun TechnicalHeading(text: String) = Text(
    text, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.White,
    modifier = Modifier.semantics { heading() },
)

@Composable
private fun mediaFacts(version: MediaVersion): List<List<Pair<String, String>>> {
    val locale = LocalConfiguration.current.locales[0]
    val number = NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = 3; isGroupingUsed = false }
    val picture = buildList {
        val resolution = if ((version.width ?: 0) > 0 && (version.height ?: 0) > 0) "${version.width} × ${version.height}"
            else version.videoResolution.known()?.uppercase(Locale.ROOT)
        resolution?.let { add(stringResource(R.string.media_technical_resolution) to it) }
        version.videoCodec.known()?.let { add(stringResource(R.string.media_technical_codec) to it.uppercase(Locale.ROOT)) }
        version.videoProfile.known()?.let { add(stringResource(R.string.media_technical_profile) to it) }
        version.bitDepth?.takeIf { it > 0 }?.let {
            add(stringResource(R.string.media_technical_bit_depth) to stringResource(R.string.media_technical_bits, it))
        }
        version.hdr.known()?.let { add(stringResource(R.string.media_technical_hdr) to it.uppercase(Locale.ROOT)) }
        version.dolbyVisionProfile?.takeIf { it > 0 }?.let {
            add(stringResource(R.string.media_technical_dolby_vision) to stringResource(R.string.media_technical_profile_number, it))
        }
        version.frameRate?.takeIf { it.isFinite() && it > 0 }?.let {
            add(stringResource(R.string.media_technical_frame_rate) to stringResource(R.string.media_technical_fps, number.format(it)))
        }
        version.aspectRatio?.takeIf { it.isFinite() && it > 0 }?.let {
            add(stringResource(R.string.media_technical_aspect_ratio) to stringResource(R.string.media_technical_ratio, number.format(it)))
        }
    }
    val sound = version.audioTracks.mapNotNull { track ->
        listOfNotNull(
            track.codec.known()?.uppercase(Locale.ROOT), audioChannels(track.channels),
            track.language.known() ?: track.languageCode.known(), track.description.known(),
            stringResource(R.string.media_technical_audio_description).takeIf { track.audioDescription },
        ).distinct().takeIf { it.isNotEmpty() }?.joinToString("   ")
    }.distinct().ifEmpty {
        listOfNotNull(version.audioCodec.known()?.uppercase(Locale.ROOT), audioChannels(version.audioChannels))
            .takeIf { it.isNotEmpty() }?.let { listOf(it.joinToString("   ")) }.orEmpty()
    }.map { stringResource(R.string.media_technical_audio) to it }
    val file = buildList {
        val container = version.container.known() ?: version.parts.mapNotNull { it.container.known() }.distinct()
            .takeIf { it.isNotEmpty() }?.joinToString(", ")
        container?.let { add(stringResource(R.string.media_technical_container) to it.uppercase(Locale.ROOT)) }
        version.bitrateKbps?.takeIf { it > 0 }?.let {
            add(stringResource(R.string.media_technical_bitrate) to stringResource(R.string.media_technical_mbps, number.format(it / 1000.0)))
        }
        totalSize(version)?.let { size ->
            val units = listOf("B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB")
            var value = size.toDouble()
            var unit = 0
            while (value >= 1024 && unit < units.lastIndex) { value /= 1024; unit++ }
            val sizeNumber = NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = 2 }.format(value)
            add(stringResource(R.string.media_technical_size) to "$sizeNumber ${units[unit]}")
        }
        if (version.parts.size > 1) add(stringResource(R.string.media_technical_parts) to
            stringResource(R.string.media_technical_parts_count, version.parts.size))
        if (version.subtitleTracks.isNotEmpty()) {
            val languages = version.subtitleTracks.mapNotNull { it.language.known() ?: it.languageCode.known() }.distinct()
            val count = stringResource(if (version.subtitleTracks.size == 1) R.string.media_technical_one_track
                else R.string.media_technical_tracks_count, version.subtitleTracks.size)
            add(stringResource(R.string.media_technical_subtitles) to
                listOf(count, languages.joinToString(", ")).filter(String::isNotBlank).joinToString("   "))
        }
    }
    return listOf(picture, sound, file)
}

@Composable
private fun audioChannels(channels: Int?): String? = when {
    channels == null || channels <= 0 -> null
    channels == 1 -> stringResource(R.string.media_technical_mono)
    channels == 2 -> stringResource(R.string.media_technical_stereo)
    channels == 6 -> "5.1"
    channels == 8 -> "7.1"
    else -> stringResource(R.string.media_technical_channels, channels)
}

private fun String?.known(): String? = this?.trim()?.takeIf {
    it.isNotEmpty() && it.lowercase(Locale.ROOT) !in setOf("unknown", "und", "n/a", "none", "null", "undefined", "-")
}

private fun totalSize(version: MediaVersion): Long? {
    if (version.parts.isEmpty()) return null
    var total = 0L
    for (part in version.parts) {
        val size = part.sizeBytes?.takeIf { it > 0 } ?: return null
        if (total > Long.MAX_VALUE - size) return null
        total += size
    }
    return total
}
