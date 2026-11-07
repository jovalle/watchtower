package io.github.jovalle.watchtower.tv.playback

import android.content.Context
import android.hardware.display.DisplayManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build
import android.view.Display
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.audio.AudioCapabilities
import io.github.jovalle.watchtower.tv.api.DeviceCapabilities

@androidx.annotation.OptIn(UnstableApi::class)
class DeviceCapabilityDetector(private val context: Context) {
    fun detect(maxVideoBitrateKbps: Int?): DeviceCapabilities =
        CapabilityMapper.map(collectFacts(), maxVideoBitrateKbps)

    private fun collectFacts(): CapabilityFacts {
        val display = context.getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)
        val audioManager = context.getSystemService(AudioManager::class.java)
        val output = selectAudioOutput(audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList())
        val audioCapabilities = AudioCapabilities.getCapabilities(context, MEDIA_AUDIO_ATTRIBUTES, output)
        val passthrough = PASSTHROUGH_ENCODINGS.mapNotNull { (codec, encoding) ->
            codec.takeIf { audioCapabilities.supportsEncoding(encoding) }
        }.toSet()
        val codecFacts = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos
            .asSequence().filterNot(MediaCodecInfo::isEncoder).flatMap { info ->
                info.supportedTypes.asSequence().mapNotNull { type -> codecFact(info, type) }
            }.toList()
        val audioFacts = codecFacts.filter { it.codec in AUDIO_CODECS }.toMutableList()
        passthrough.filter { codec -> audioFacts.none { it.codec == codec } }.forEach { codec ->
            audioFacts += CodecFact(codec, maxChannels = audioCapabilities.maxChannelCount)
        }
        val mode = display?.mode
        return CapabilityFacts(
            manufacturer = Build.MANUFACTURER.orEmpty(),
            model = Build.MODEL.orEmpty(),
            sdkInt = Build.VERSION.SDK_INT,
            displayWidthPx = mode?.physicalWidth ?: 0,
            displayHeightPx = mode?.physicalHeight ?: 0,
            refreshRatesHz = display?.supportedModes?.map { it.refreshRate.toDouble() }?.toSet().orEmpty(),
            displayHdrTypes = display?.hdrCapabilities?.supportedHdrTypes?.map { hdrType(it) }?.filterNotNull()?.toSet().orEmpty(),
            videoDecoders = codecFacts.filter { it.codec in VIDEO_CODECS },
            audioDecoders = audioFacts,
            passthroughCodecs = passthrough,
            audioOutputType = audioOutputType(output),
            maxPcmChannels = audioCapabilities.maxChannelCount.coerceAtLeast(2),
        )
    }

    private fun codecFact(info: MediaCodecInfo, mimeType: String): CodecFact? {
        val codec = CODEC_NAMES[mimeType.lowercase()] ?: return null
        val capabilities = runCatching { info.getCapabilitiesForType(mimeType) }.getOrNull() ?: return null
        if (codec in VIDEO_CODECS) {
            val video = capabilities.videoCapabilities ?: return null
            val profiles = capabilities.profileLevels.mapNotNull { profileName(codec, it.profile) }.toSet()
            val maxWidth = video.supportedWidths.upper
            val maxHeight = video.supportedHeights.upper
            val frameRate = (runCatching { video.getSupportedFrameRatesFor(maxWidth, maxHeight).upper }.getOrNull()
                ?: video.supportedFrameRates.upper).toDouble()
            val hdrTypes = buildSet {
                if (codec == "hevc" && profiles.any { it == "main 10" }) addAll(listOf("hdr10", "hlg"))
                if (codec == "vp9" && profiles.any { it.contains("10") || it.contains("hdr") }) addAll(listOf("hdr10", "hlg"))
                if (codec == "av1" && profiles.any { it.contains("10") || it.contains("hdr") }) addAll(listOf("hdr10", "hlg"))
                if (codec == "dolby-vision") add("dolby_vision")
            }
            return CodecFact(
                codec = codec,
                profiles = profiles,
                maxWidth = maxWidth,
                maxHeight = maxHeight,
                maxFrameRate = frameRate,
                maxBitrateKbps = video.bitrateRange.upper / 1_000,
                tenBit = profiles.any { it.contains("10") } || codec == "dolby-vision",
                hdrTypes = hdrTypes,
            )
        }
        return CodecFact(codec = codec, maxChannels = capabilities.audioCapabilities?.maxInputChannelCount ?: 2)
    }

    @Suppress("DEPRECATION")
    private fun profileName(codec: String, profile: Int): String? = when (codec) {
        "h264" -> when (profile) {
            MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline -> "baseline"
            MediaCodecInfo.CodecProfileLevel.AVCProfileMain -> "main"
            MediaCodecInfo.CodecProfileLevel.AVCProfileHigh -> "high"
            MediaCodecInfo.CodecProfileLevel.AVCProfileHigh10 -> "high 10"
            else -> null
        }
        "hevc" -> when (profile) {
            MediaCodecInfo.CodecProfileLevel.HEVCProfileMain -> "main"
            MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10,
            MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10,
            MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10Plus -> "main 10"
            else -> null
        }
        "vp9" -> when (profile) {
            MediaCodecInfo.CodecProfileLevel.VP9Profile0 -> "profile 0"
            MediaCodecInfo.CodecProfileLevel.VP9Profile1 -> "profile 1"
            MediaCodecInfo.CodecProfileLevel.VP9Profile2,
            MediaCodecInfo.CodecProfileLevel.VP9Profile2HDR,
            MediaCodecInfo.CodecProfileLevel.VP9Profile2HDR10Plus -> "profile 2 10-bit"
            MediaCodecInfo.CodecProfileLevel.VP9Profile3,
            MediaCodecInfo.CodecProfileLevel.VP9Profile3HDR,
            MediaCodecInfo.CodecProfileLevel.VP9Profile3HDR10Plus -> "profile 3 10-bit"
            else -> null
        }
        "av1" -> when (profile) {
            MediaCodecInfo.CodecProfileLevel.AV1ProfileMain8 -> "main 8"
            MediaCodecInfo.CodecProfileLevel.AV1ProfileMain10,
            MediaCodecInfo.CodecProfileLevel.AV1ProfileMain10HDR10,
            MediaCodecInfo.CodecProfileLevel.AV1ProfileMain10HDR10Plus -> "main 10"
            else -> null
        }
        "mpeg2" -> when (profile) {
            MediaCodecInfo.CodecProfileLevel.MPEG2ProfileSimple -> "simple"
            MediaCodecInfo.CodecProfileLevel.MPEG2ProfileMain -> "main"
            else -> null
        }
        "dolby-vision" -> "dolby vision"
        else -> null
    }

    private fun selectAudioOutput(devices: List<AudioDeviceInfo>): AudioDeviceInfo? =
        devices.maxByOrNull { AUDIO_DEVICE_PRIORITY[it.type] ?: 0 }

    private fun audioOutputType(device: AudioDeviceInfo?): String = when (device?.type) {
        AudioDeviceInfo.TYPE_HDMI, AudioDeviceInfo.TYPE_HDMI_ARC, AudioDeviceInfo.TYPE_HDMI_EARC -> "hdmi"
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLE_SPEAKER -> "bluetooth"
        AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usb"
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET -> "headphones"
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
        else -> "unknown"
    }

    private fun hdrType(type: Int): String? = when (type) {
        Display.HdrCapabilities.HDR_TYPE_HDR10 -> "hdr10"
        Display.HdrCapabilities.HDR_TYPE_HLG -> "hlg"
        Display.HdrCapabilities.HDR_TYPE_DOLBY_VISION -> "dolby_vision"
        Display.HdrCapabilities.HDR_TYPE_HDR10_PLUS -> "hdr10_plus"
        else -> null
    }

    companion object {
        val MEDIA_AUDIO_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        private val VIDEO_CODECS = setOf("h264", "hevc", "vp9", "av1", "mpeg2", "dolby-vision")
        private val AUDIO_CODECS = setOf("aac", "ac3", "eac3", "eac3-joc", "dts", "dts-hd", "truehd", "flac", "opus", "vorbis", "mp3")
        private val CODEC_NAMES = mapOf(
            "video/avc" to "h264", "video/hevc" to "hevc", "video/x-vnd.on2.vp9" to "vp9",
            "video/av01" to "av1", "video/mpeg2" to "mpeg2", "video/dolby-vision" to "dolby-vision",
            "audio/mp4a-latm" to "aac", "audio/ac3" to "ac3", "audio/eac3" to "eac3",
            "audio/eac3-joc" to "eac3-joc", "audio/vnd.dts" to "dts", "audio/vnd.dts.hd" to "dts-hd",
            "audio/true-hd" to "truehd", "audio/flac" to "flac", "audio/opus" to "opus",
            "audio/vorbis" to "vorbis", "audio/mpeg" to "mp3",
        )
        private val PASSTHROUGH_ENCODINGS = mapOf(
            "ac3" to C.ENCODING_AC3,
            "eac3" to C.ENCODING_E_AC3,
            "eac3-joc" to C.ENCODING_E_AC3_JOC,
            "dts" to C.ENCODING_DTS,
            "dts-hd" to C.ENCODING_DTS_HD,
            "truehd" to C.ENCODING_DOLBY_TRUEHD,
        )
        private val AUDIO_DEVICE_PRIORITY = mapOf(
            AudioDeviceInfo.TYPE_HDMI_EARC to 7,
            AudioDeviceInfo.TYPE_HDMI_ARC to 6,
            AudioDeviceInfo.TYPE_HDMI to 5,
            AudioDeviceInfo.TYPE_USB_DEVICE to 4,
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP to 3,
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES to 2,
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER to 1,
        )
    }
}