package io.github.jovalle.watchtower.tv.platform

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

enum class DeepLinkAction { DETAILS, PLAY }

data class ResolvedDeepLink(val ratingKey: String, val action: DeepLinkAction)

sealed interface DeepLinkResult {
    data class Allowed(val link: ResolvedDeepLink) : DeepLinkResult
    data class Rejected(val message: String) : DeepLinkResult
}

object DeepLinkResolver {
    private val ratingKeyPattern = Regex("^[0-9]{1,12}$")

    fun resolve(rawUri: String, currentServerMachineId: String): DeepLinkResult {
        val uri = runCatching { URI(rawUri) }.getOrNull()
            ?: return DeepLinkResult.Rejected("This Watchtower link is invalid.")
        if (uri.scheme != "watchtower" || uri.host != "media") {
            return DeepLinkResult.Rejected("This Watchtower link is invalid.")
        }
        val ratingKey = uri.path?.removePrefix("/")?.takeIf { '/' !in it && ratingKeyPattern.matches(it) }
            ?: return DeepLinkResult.Rejected("This Watchtower link has an invalid media ID.")
        val query = uri.rawQuery.orEmpty().split('&').filter { it.isNotEmpty() }.associate { part ->
            val pieces = part.split('=', limit = 2)
            decode(pieces[0]) to decode(pieces.getOrElse(1) { "" })
        }
        if (query["server"] != currentServerMachineId) {
            return DeepLinkResult.Rejected("This link belongs to a different Watchtower server.")
        }
        val action = when (query["action"]) {
            "details" -> DeepLinkAction.DETAILS
            "play" -> DeepLinkAction.PLAY
            else -> return DeepLinkResult.Rejected("This Watchtower link has an unsupported action.")
        }
        return DeepLinkResult.Allowed(ResolvedDeepLink(ratingKey, action))
    }

    private fun decode(value: String): String = URLDecoder.decode(value, StandardCharsets.UTF_8.name())
}