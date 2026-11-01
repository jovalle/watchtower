package io.github.jovalle.watchtower.tv.settings

import android.content.Context
import android.content.SharedPreferences
import java.security.MessageDigest

enum class SubtitleMode { AUTO, ALWAYS, FORCED_ONLY, OFF }

/** Device-local playback choices for one server profile. Server-side preferences live in /api/v1/preferences. */
data class ProfilePlaybackPrefs(
    val preferredAudioLanguage: String? = null,
    val preferredSubtitleLanguage: String? = null,
    val subtitleMode: SubtitleMode = SubtitleMode.AUTO,
    val preferAudioDescription: Boolean = false,
    val defaultQuality: String = "original",
    val maxBitrateKbps: Int? = null,
    val matchFrameRate: Boolean = true,
)

/**
 * Shared by settings (writer) and playback (reader). Keyed by server + effective profile, so switching
 * profiles never applies another profile's choices; cleared for a profile on sign-out.
 */
class LocalPlaybackPreferences(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("playback_prefs", Context.MODE_PRIVATE)

    fun get(serverMachineId: String, profileUserId: String): ProfilePlaybackPrefs {
        val k = key(serverMachineId, profileUserId)
        return ProfilePlaybackPrefs(
            preferredAudioLanguage = prefs.getString("$k.audioLanguage", null),
            preferredSubtitleLanguage = prefs.getString("$k.subtitleLanguage", null),
            subtitleMode = prefs.getString("$k.subtitleMode", null)?.let { runCatching { SubtitleMode.valueOf(it) }.getOrNull() } ?: SubtitleMode.AUTO,
            preferAudioDescription = prefs.getBoolean("$k.audioDescription", false),
            defaultQuality = prefs.getString("$k.quality", null) ?: "original",
            maxBitrateKbps = prefs.getInt("$k.maxBitrateKbps", 0).takeIf { it > 0 },
            matchFrameRate = prefs.getBoolean("$k.matchFrameRate", true),
        )
    }

    fun set(serverMachineId: String, profileUserId: String, value: ProfilePlaybackPrefs) {
        val k = key(serverMachineId, profileUserId)
        prefs.edit()
            .putString("$k.audioLanguage", value.preferredAudioLanguage)
            .putString("$k.subtitleLanguage", value.preferredSubtitleLanguage)
            .putString("$k.subtitleMode", value.subtitleMode.name)
            .putBoolean("$k.audioDescription", value.preferAudioDescription)
            .putString("$k.quality", value.defaultQuality)
            .putInt("$k.maxBitrateKbps", value.maxBitrateKbps ?: 0)
            .putBoolean("$k.matchFrameRate", value.matchFrameRate)
            .apply()
    }

    fun clear(serverMachineId: String, profileUserId: String) {
        val k = key(serverMachineId, profileUserId)
        prefs.edit().apply { prefs.all.keys.filter { it.startsWith("$k.") }.forEach(::remove) }.apply()
    }

    private fun key(serverMachineId: String, profileUserId: String): String =
        MessageDigest.getInstance("SHA-256").digest("$serverMachineId:$profileUserId".encodeToByteArray())
            .take(12).joinToString("") { "%02x".format(it) }
}
