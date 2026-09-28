package io.github.jovalle.watchtower.tv

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import io.github.jovalle.watchtower.tv.ui.AppRoot

class MainActivity : ComponentActivity() {
    private val graph get() = (application as WatchtowerApp).graph

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) graph.acceptDeepLink(intent)
        setContent { AppRoot(graph) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        graph.acceptDeepLink(intent)
    }
}
