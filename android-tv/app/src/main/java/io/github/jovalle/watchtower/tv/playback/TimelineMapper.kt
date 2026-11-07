package io.github.jovalle.watchtower.tv.playback

import io.github.jovalle.watchtower.tv.api.Delivery
import io.github.jovalle.watchtower.tv.api.PlaybackPart
import kotlin.math.abs

enum class HlsTimelineMapping {
    ABSOLUTE,
    OFFSET_RELATIVE,
    UNKNOWN,
}

data class PlayerPosition(val mediaItemIndex: Int, val positionMs: Long)

data class SeekPlan(
    val playerPosition: PlayerPosition?,
    val replacementReason: String?,
)

data class HlsResolution(
    val mapper: TimelineMapper,
    val initialSeekMs: Long,
    val diagnostic: String,
)

/** Maps Media3 window positions to the item's absolute timeline. */
class TimelineMapper private constructor(
    private val deliveryType: String,
    private val parts: List<PlaybackPart>,
    private val activePartIndex: Int,
    private val requestedOffsetMs: Long,
    val hlsMapping: HlsTimelineMapping,
    val durationMs: Long,
) {
    init {
        require(parts.isNotEmpty()) { "Playback must contain at least one part." }
        require(activePartIndex in parts.indices) { "Active part index is out of range." }
    }

    fun toAbsolute(mediaItemIndex: Int, positionMs: Long): Long {
        val originMs = when (deliveryType) {
            "file" -> parts.getOrElse(mediaItemIndex) { parts.last() }.startMs
            "hls" -> when (hlsMapping) {
                HlsTimelineMapping.ABSOLUTE -> activePart.startMs
                HlsTimelineMapping.OFFSET_RELATIVE, HlsTimelineMapping.UNKNOWN -> requestedOffsetMs
            }
            else -> error("Unsupported delivery type: $deliveryType")
        }
        return (originMs + positionMs.coerceAtLeast(0)).coerceIn(0, durationMs)
    }

    fun seekPlan(absolutePositionMs: Long): SeekPlan {
        val targetMs = absolutePositionMs.coerceIn(0, durationMs)
        if (deliveryType == "file") {
            val index = partIndexAt(targetMs)
            return SeekPlan(PlayerPosition(index, targetMs - parts[index].startMs), null)
        }

        val loadedStartMs = when (hlsMapping) {
            HlsTimelineMapping.ABSOLUTE -> activePart.startMs
            HlsTimelineMapping.OFFSET_RELATIVE, HlsTimelineMapping.UNKNOWN -> requestedOffsetMs
        }
        val loadedEndMs = activePart.startMs + activePart.durationMs
        if (targetMs == loadedEndMs && activePartIndex < parts.lastIndex) {
            return SeekPlan(null, "part_change")
        }
        if (targetMs < loadedStartMs || targetMs > loadedEndMs) {
            val reason = if (partIndexAt(targetMs) != activePartIndex) "part_change" else "seek_reload"
            return SeekPlan(null, reason)
        }
        return SeekPlan(PlayerPosition(0, targetMs - loadedStartMs), null)
    }

    fun resolveUnknownHls(windowDurationMs: Long, toleranceMs: Long = DEFAULT_HLS_TOLERANCE_MS): HlsResolution {
        require(deliveryType == "hls") { "Only HLS timelines require resolution." }
        if (hlsMapping != HlsTimelineMapping.UNKNOWN) {
            val initialSeekMs = if (hlsMapping == HlsTimelineMapping.ABSOLUTE) requestedOffsetInPartMs else 0
            return HlsResolution(this, initialSeekMs, "HLS timeline mapping supplied by server: ${hlsMapping.wireName}.")
        }

        val remainingDurationMs = (activePart.durationMs - requestedOffsetInPartMs).coerceAtLeast(0)
        val mapping = when {
            abs(windowDurationMs - remainingDurationMs) <= toleranceMs -> HlsTimelineMapping.OFFSET_RELATIVE
            abs(windowDurationMs - activePart.durationMs) <= toleranceMs -> HlsTimelineMapping.ABSOLUTE
            else -> HlsTimelineMapping.OFFSET_RELATIVE
        }
        val diagnostic = if (mapping == HlsTimelineMapping.OFFSET_RELATIVE &&
            abs(windowDurationMs - remainingDurationMs) > toleranceMs
        ) {
            "HLS window duration $windowDurationMs ms matched neither remaining $remainingDurationMs ms nor part ${activePart.durationMs} ms; using offset_relative fallback."
        } else {
            "HLS window duration resolved to ${mapping.wireName}."
        }
        return HlsResolution(copy(hlsMapping = mapping), if (mapping == HlsTimelineMapping.ABSOLUTE) requestedOffsetInPartMs else 0, diagnostic)
    }

    private val activePart: PlaybackPart get() = parts[activePartIndex]
    private val requestedOffsetInPartMs: Long get() = (requestedOffsetMs - activePart.startMs).coerceIn(0, activePart.durationMs)

    private fun partIndexAt(positionMs: Long): Int =
        parts.indexOfLast { positionMs >= it.startMs }.coerceAtLeast(0)

    private fun copy(hlsMapping: HlsTimelineMapping) =
        TimelineMapper(deliveryType, parts, activePartIndex, requestedOffsetMs, hlsMapping, durationMs)

    companion object {
        const val DEFAULT_HLS_TOLERANCE_MS = 2_000L

        fun from(delivery: Delivery, durationMs: Long): TimelineMapper = TimelineMapper(
            deliveryType = delivery.type,
            parts = delivery.parts.sortedBy(PlaybackPart::index),
            activePartIndex = delivery.activePartIndex,
            requestedOffsetMs = delivery.timeline.requestedOffsetMs.coerceIn(0, durationMs),
            hlsMapping = when (delivery.timeline.mapping) {
                "absolute" -> HlsTimelineMapping.ABSOLUTE
                "offset_relative" -> HlsTimelineMapping.OFFSET_RELATIVE
                "unknown" -> HlsTimelineMapping.UNKNOWN
                else -> error("Unsupported timeline mapping: ${delivery.timeline.mapping}")
            },
            durationMs = durationMs.coerceAtLeast(0),
        )
    }
}

private val HlsTimelineMapping.wireName: String
    get() = name.lowercase()