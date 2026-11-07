package io.github.jovalle.watchtower.tv.services

import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performSemanticsAction
import androidx.test.platform.app.InstrumentationRegistry
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.WatchtowerApp
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class StatusFeedbackTest {
    @get:Rule val compose = createComposeRule()

    @Test fun availableStatusKeepsItsGreenTextWhenItsRowIsFocused() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        compose.setContent { MaterialTheme { ServiceTitleRow(graph, "Available Movie", "Available", null, "movie") {} } }
        compose.onNodeWithContentDescription("Available Movie, Available").performSemanticsAction(SemanticsActions.RequestFocus)
        val pixels = compose.onNodeWithText("Available", useUnmergedTree = true).captureToImage().toPixelMap()
        var green = 0
        for (y in 0 until pixels.height) for (x in 0 until pixels.width) {
            val p = pixels[x, y]
            if (p.green > 0.7f && p.green > p.red * 1.25f && p.green > p.blue * 1.1f) green++
        }
        assertTrue("Available status must remain visibly green on a focused row", green > 12)
    }
}
