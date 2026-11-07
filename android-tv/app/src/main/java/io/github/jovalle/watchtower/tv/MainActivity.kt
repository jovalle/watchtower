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
        val launchUri = launchDeepLinkUri(intent)
        if (shouldAcceptLaunchDeepLink(launchUri, savedInstanceState?.getString(STATE_CONSUMED_LAUNCH_URI))) {
            graph.acceptDeepLink(intent)
        }
        setContent { AppRoot(graph) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        graph.acceptDeepLink(intent)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        val launchUri = launchDeepLinkUri(intent)
        if (launchUri != null && graph.deepLinks.value?.toString() != launchUri) {
            // A digest, not the link: join links carry an invite secret in their fragment.
            outState.putString(STATE_CONSUMED_LAUNCH_URI, launchLinkDigest(launchUri))
        }
        super.onSaveInstanceState(outState)
    }

    private companion object {
        const val STATE_CONSUMED_LAUNCH_URI = "consumed_launch_uri"
    }
}

internal fun launchDeepLinkUri(intent: Intent?): String? =
    intent?.takeIf { it.action == Intent.ACTION_VIEW }?.data?.toString()

internal fun shouldAcceptLaunchDeepLink(launchUri: String?, consumedLaunchDigest: String?): Boolean =
    launchUri != null && launchLinkDigest(launchUri) != consumedLaunchDigest

internal fun launchLinkDigest(uri: String): String =
    java.security.MessageDigest.getInstance("SHA-256").digest(uri.encodeToByteArray()).joinToString("") { "%02x".format(it) }
