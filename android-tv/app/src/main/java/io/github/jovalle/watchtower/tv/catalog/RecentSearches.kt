package io.github.jovalle.watchtower.tv.catalog

import android.content.Context
import java.security.MessageDigest
import org.json.JSONArray

class RecentSearches(context: Context) {
    private val prefs = context.getSharedPreferences("search_history", Context.MODE_PRIVATE)

    fun get(serverMachineId: String, profileUserId: String): List<String> = runCatching {
        val array = JSONArray(prefs.getString(key(serverMachineId, profileUserId), "[]") ?: "[]")
        (0 until array.length()).mapNotNull { array.opt(it) as? String }.filter { it.isNotBlank() && it.length <= 100 }.distinct().take(10)
    }.getOrDefault(emptyList())

    fun remember(serverMachineId: String, profileUserId: String, query: String) {
        val value = query.trim().take(100).let { if (it.lastOrNull()?.isHighSurrogate() == true) it.dropLast(1) else it }
        if (value.isBlank()) return
        val queries = (listOf(value) + get(serverMachineId, profileUserId)).distinct().take(10)
        prefs.edit().putString(key(serverMachineId, profileUserId), JSONArray(queries).toString()).apply()
    }

    fun clear(serverMachineId: String, profileUserId: String) {
        prefs.edit().remove(key(serverMachineId, profileUserId)).apply()
    }

    private fun key(serverMachineId: String, profileUserId: String): String =
        MessageDigest.getInstance("SHA-256").digest("$serverMachineId:$profileUserId".encodeToByteArray())
            .take(12).joinToString("") { "%02x".format(it) }
}
