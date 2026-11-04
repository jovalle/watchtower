package io.github.jovalle.watchtower.tv.navigation

import kotlinx.serialization.Serializable

/**
 * Shared navigation contract between the catalog UI (owner of the NavHost) and playback.
 * startPositionMs: null resumes from the saved offset, 0 starts over.
 */
@Serializable
data class PlayerRoute(
    val ratingKey: String,
    val mediaId: String? = null,
    val startPositionMs: Long? = null,
)
