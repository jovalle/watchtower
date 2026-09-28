package io.github.jovalle.watchtower.tv.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.AppGraph

/** Placeholder root; the catalog/navigation owner replaces this with the NavHost. */
@Composable
fun AppRoot(graph: AppGraph) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text("Watchtower")
    }
}
