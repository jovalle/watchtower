package io.github.jovalle.watchtower.tv.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.R
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class SettingsLayoutTest {
    @get:Rule val compose = createComposeRule()

    @Test fun qualityChoicesWrapInsideTheRootAtLargeText() {
        val options = listOf(
            ChoiceOption("original", R.string.quality_original),
            ChoiceOption("1080p-20", R.string.quality_1080p_20),
            ChoiceOption("1080p-12", R.string.quality_1080p_12),
            ChoiceOption("1080p-8", R.string.quality_1080p_8),
            ChoiceOption("720p-4", R.string.quality_720p_4),
            ChoiceOption("720p-2", R.string.quality_720p_2),
            ChoiceOption("480p-1.5", R.string.quality_480p_15),
        )
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 1.3f)) {
                MaterialTheme {
                    Box(Modifier.fillMaxSize().testTag("root").padding(32.dp)) {
                        ChoiceRow("Quality", options, "original", update = {})
                    }
                }
            }
        }

        val root = compose.onNodeWithTag("root").getBoundsInRoot()
        listOf("Original, selected", "1080p · 20 Mbps", "1080p · 12 Mbps", "1080p · 8 Mbps", "720p · 4 Mbps", "720p · 2 Mbps", "480p · 1.5 Mbps")
            .forEach { label ->
                val node = compose.onNodeWithText(label)
                val bounds = node.getBoundsInRoot()
                assertTrue("$label bounds $bounds must stay within root $root", bounds.left >= root.left && bounds.top >= root.top && bounds.right <= root.right && bounds.bottom <= root.bottom)
                node.assertIsDisplayed()
            }
    }
}