package io.github.jovalle.watchtower.tv.playback

import androidx.compose.runtime.Composable
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute

/**
 * Playback entry point called by the NavHost. Owned by the playback track; the signature is a shared contract:
 * onExit is invoked once after playback resources are released; onOpenItem navigates to another item's player
 * (next/previous episode) and replaces this destination.
 */
@Composable
fun PlayerScreen(graph: AppGraph, route: PlayerRoute, onExit: () -> Unit, onOpenItem: (PlayerRoute) -> Unit) {
}
