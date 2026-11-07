package io.github.jovalle.watchtower.tv.ui

import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ActionHintPositionTest {
    @Test fun ordinaryHintUsesCaptionBandInsteadOfCoveringTheNextAction() = checkCaptionBand(1, 16)
    @Test fun largeTextHintUsesCaptionBandInsteadOfCoveringTheNextAction() = checkCaptionBand(2, 40)

    private fun checkCaptionBand(density: Int, hintHeight: Int) {
        val cell = IntRect(100, 100, 100 + 48 * density, 100 + 60 * density)
        val gap = 8 * density
        val caption = 20 * density
        val hint = IntSize(120 * density, hintHeight)
        val position = ActionHintPosition(gap, true, caption).calculatePosition(cell, IntSize(1920, 1080), LayoutDirection.Ltr, hint)
        assertEquals("Place the hint after the 40dp face", cell.bottom - caption, position.y)
        assertTrue("Hint must end before the next row's Clear action", position.y + hint.height <= cell.bottom + gap)
    }
}
