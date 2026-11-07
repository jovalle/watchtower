package io.github.jovalle.watchtower.tv.ui

import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.platform.app.InstrumentationRegistry
import io.github.jovalle.watchtower.tv.WatchtowerApp
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class AppThemeTest {
    @get:Rule val compose = createComposeRule()

    @Test fun pairingHeadingHasReadableTextOnTheDarkBackground() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val graph = (instrumentation.targetContext.applicationContext as WatchtowerApp).graph
        instrumentation.runOnMainSync { graph.session.changeServer() }
        compose.setContent { AppRoot(graph) }
        val pixels = compose.onNodeWithText("Connect to Watchtower").captureToImage().toPixelMap()
        var brightPixels = 0
        for (y in 0 until pixels.height) for (x in 0 until pixels.width) {
            val color = pixels[x, y]
            if (color.red > 0.8f && color.green > 0.8f && color.blue > 0.8f) brightPixels++
        }
        assertTrue("Pairing heading must render light text on its dark background", brightPixels > 20)
    }
}
