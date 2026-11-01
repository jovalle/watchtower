package io.github.jovalle.watchtower.tv.playback

import io.github.jovalle.watchtower.tv.api.AudioCapability
import io.github.jovalle.watchtower.tv.api.AudioOutputCapability
import io.github.jovalle.watchtower.tv.api.CapabilityDevice
import io.github.jovalle.watchtower.tv.api.CapabilityDisplay
import io.github.jovalle.watchtower.tv.api.DeviceCapabilities
import io.github.jovalle.watchtower.tv.api.VideoCapability

data class CodecFact(
    val codec: String,
    val profiles: Set<String> = emptySet(),
    val maxWidth: Int = 0,
    val maxHeight: Int = 0,
    val maxFrameRate: Double? = null,
    val maxBitrateKbps: Int? = null,
    val maxChannels: Int = 0,
    val tenBit: Boolean = false,
    val hdrTypes: Set<String> = emptySet(),
)

data class CapabilityFacts(
    val manufacturer: String,
    val model: String,
    val sdkInt: Int,
    val displayWidthPx: Int,
    val displayHeightPx: Int,
    val refreshRatesHz: Set<Double>,
    val displayHdrTypes: Set<String>,
    val videoDecoders: List<CodecFact>,
    val audioDecoders: List<CodecFact>,
    val passthroughCodecs: Set<String>,
    val audioOutputType: String,
    val maxPcmChannels: Int,
)

object CapabilityMapper {
    val containers = listOf("mp4", "mkv", "mov", "webm", "mpegts", "avi")
    val subtitles = listOf("srt", "vtt", "ass", "ssa", "pgs", "vobsub", "mov_text", "dvb")

    fun map(facts: CapabilityFacts, maxVideoBitrateKbps: Int?): DeviceCapabilities = DeviceCapabilities(
        device = CapabilityDevice(facts.manufacturer, facts.model, facts.sdkInt),
        display = CapabilityDisplay(
            facts.displayWidthPx,
            facts.displayHeightPx,
            facts.refreshRatesHz.sorted(),
            facts.displayHdrTypes.sorted(),
        ),
        video = facts.videoDecoders.groupBy(CodecFact::codec).map { (codec, entries) ->
            VideoCapability(
                codec = codec,
                profiles = entries.flatMap { it.profiles }.distinct().sorted(),
                maxWidth = entries.maxOfOrNull { it.maxWidth } ?: 0,
                maxHeight = entries.maxOfOrNull { it.maxHeight } ?: 0,
                maxFrameRate = entries.mapNotNull { it.maxFrameRate }.maxOrNull(),
                maxBitrateKbps = entries.mapNotNull { it.maxBitrateKbps }.maxOrNull(),
                tenBit = entries.any(CodecFact::tenBit),
                hdrTypes = entries.flatMap { it.hdrTypes }.toSet().intersect(facts.displayHdrTypes).sorted(),
            )
        }.sortedBy(VideoCapability::codec),
        audio = facts.audioDecoders.groupBy(CodecFact::codec).map { (codec, entries) ->
            AudioCapability(
                codec = codec,
                maxChannels = maxOf(entries.maxOfOrNull { it.maxChannels } ?: 0, if (codec in facts.passthroughCodecs) facts.maxPcmChannels else 0),
                passthrough = codec in facts.passthroughCodecs,
            )
        }.sortedBy(AudioCapability::codec),
        containers = containers,
        subtitles = subtitles,
        audioOutput = AudioOutputCapability(facts.audioOutputType, facts.maxPcmChannels),
        maxVideoBitrateKbps = maxVideoBitrateKbps,
    )
}