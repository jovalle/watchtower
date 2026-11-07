package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.layout.width
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalTestApi::class)
class FiveStarRatingTest {
    @get:Rule val compose = createComposeRule()
    private var rootView: android.view.View? = null
    private fun editor(writes: MutableList<Double?>, rating: Double? = 7.0, enabled: Boolean = true) {
        compose.setContent { MaterialTheme(colorScheme = darkColorScheme(primary = androidx.compose.ui.graphics.Color(0xFFFDBE02))) {
            val view = androidx.compose.ui.platform.LocalView.current
            SideEffect { rootView = view }
            var editing by remember { mutableStateOf(true) }
            RatingControl(rating, enabled, writes::add, Modifier.width(256.dp), editing = editing,
                onEdit = { editing = true }, onDone = { editing = false })
        } }
    }

    @Test fun storedSevenDisplaysThreeAndAHalfStars() {
        editor(mutableListOf())
        (1..5).forEach { compose.onNodeWithTag("rating-star-$it", useUnmergedTree = true).assertIsDisplayed() }
        compose.onNodeWithText("3.5 / 5").assertIsDisplayed()
        val pixels = compose.onNodeWithTag("rating-star-4", useUnmergedTree = true).captureToImage().toPixelMap()
        val left = pixels[pixels.width * 2 / 5, pixels.height / 2]
        val right = pixels[pixels.width * 3 / 5, pixels.height / 2]
        assertTrue("Left half of fourth star must be gold", left.red > .8f && left.green > .5f && left.blue < .3f)
        assertFalse("Right half must remain unfilled", right.red > .8f && right.green > .5f && right.blue < .3f)
    }

    @Test fun remoteChoosesHalfStarsAndSelectConfirmsThePlexScale() {
        val writes = mutableListOf<Double?>(); editor(writes, 6.0)
        val control = compose.onNode(hasContentDescription("Star rating"))
        control.performSemanticsAction(SemanticsActions.RequestFocus)
        control.performKeyInput { pressKey(Key.DirectionRight) }
        compose.runOnIdle { assertTrue("Choosing must not save before Select", writes.isEmpty()) }
        compose.onNodeWithText("3.5 / 5").assertIsDisplayed()
        compose.onNode(hasContentDescription("Star rating")).performKeyInput { pressKey(Key.DirectionCenter) }
        compose.runOnIdle { assertEquals(listOf(7.0), writes) }
    }

    @Test fun mouseSelectsBothHalvesWithoutDoubleSubmitting() {
        val writes = mutableListOf<Double?>(); editor(writes, 6.0)
        val control = compose.onNode(hasContentDescription("Star rating"))
        control.performMouseInput { click(Offset(width * .25f, height / 2f)) }
        compose.runOnIdle { assertEquals(listOf(3.0), writes) }
        control.performMouseInput { click(Offset(width * .35f, height / 2f)) }
        compose.runOnIdle { assertEquals("First click re-enters editing without a write", listOf(3.0), writes) }
        control.performMouseInput { click(Offset(width * .35f, height / 2f)) }
        compose.runOnIdle { assertEquals(listOf(3.0, 4.0), writes) }
    }

    @Test fun hoverPreviewsWithoutSavingAndExitRestoresStoredRating() {
        val writes = mutableListOf<Double?>(); editor(writes, 6.0)
        val control = compose.onNode(hasContentDescription("Star rating"))
        control.performMouseInput { moveTo(Offset(width * .85f, height / 2f)) }
        compose.onNodeWithText("4.5 / 5").assertIsDisplayed()
        compose.runOnIdle { assertTrue(writes.isEmpty()) }
        control.performMouseInput { moveTo(Offset(-40f, -40f)) }
        compose.onNodeWithText("3 / 5").assertIsDisplayed()
        compose.runOnIdle { assertTrue(writes.isEmpty()) }
    }

    @Test fun accessibilityProgressUsesFiveStarsAndSavesTheMatchingPlexValue() {
        val writes = mutableListOf<Double?>(); editor(writes)
        compose.onNode(hasContentDescription("Star rating"))
            .performSemanticsAction(SemanticsActions.SetProgress) { assertTrue(it(4.5f)) }
        compose.runOnIdle { assertEquals(listOf(9.0), writes) }
    }

    @Test fun readonlyAccessibilityCannotSaveUntilEditingStarts() {
        val writes = mutableListOf<Double?>()
        compose.setContent { MaterialTheme {
            var editing by remember { mutableStateOf(false) }
            RatingControl(7.0, true, writes::add, editing = editing,
                onEdit = { editing = true }, onDone = { editing = false })
        } }
        val stars = compose.onNodeWithContentDescription("Star rating")
        stars.performSemanticsAction(SemanticsActions.SetProgress) { assertFalse(it(4.5f)) }
        compose.runOnIdle { assertTrue(writes.isEmpty()) }
        stars.performSemanticsAction(SemanticsActions.OnClick)
        stars.performSemanticsAction(SemanticsActions.SetProgress) { assertTrue(it(4.5f)) }
        compose.runOnIdle { assertEquals(listOf(9.0), writes) }
    }

    @Test fun disabledStarsCannotChangeOrPreviewTheRating() {
        val writes = mutableListOf<Double?>(); editor(writes, 7.0, false)
        compose.onNode(hasContentDescription("Star rating")).assertIsNotEnabled()
            .performMouseInput { moveTo(Offset(width * .1f, height / 2f)); click() }
        compose.onNodeWithText("3.5 / 5").assertIsDisplayed()
        compose.runOnIdle { assertTrue(writes.isEmpty()) }
    }
    @Test fun clickingTheStarCenterChoosesTheWholeStar() {
        val writes = mutableListOf<Double?>(); editor(writes, 7.0)
        compose.onNodeWithContentDescription("Star rating").performMouseInput { click(Offset(width * .3f, height / 2f)) }
        compose.runOnIdle { assertEquals("The second star center selects two whole stars", listOf(4.0), writes) }
    }

    @Test fun draggingAwayCancelsAnUnconfirmedMouseRating() {
        val writes = mutableListOf<Double?>(); editor(writes, 6.0)
        compose.onNodeWithContentDescription("Star rating").performMouseInput {
            moveTo(Offset(width * .85f, height / 2f)); press(); moveTo(Offset(-40f, -40f)); release()
        }
        compose.onNodeWithText("3 / 5").assertIsDisplayed()
        compose.runOnIdle { assertTrue(writes.isEmpty()) }
    }

    @Test fun rapidRemoteStepsCommitTheLatestPreviewBeforeRedraw() {
        val writes = mutableListOf<Double?>(); editor(writes, 6.0)
        val control = compose.onNodeWithContentDescription("Star rating")
        control.performSemanticsAction(SemanticsActions.RequestFocus)
        compose.runOnIdle {
            // Dispatch in one UI turn so no composition can refresh the handlers between keys.
            val view = requireNotNull(rootView)
            listOf(android.view.KeyEvent.KEYCODE_DPAD_RIGHT, android.view.KeyEvent.KEYCODE_DPAD_RIGHT,
                android.view.KeyEvent.KEYCODE_DPAD_CENTER).forEach { key ->
                view.dispatchKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, key))
                view.dispatchKeyEvent(android.view.KeyEvent(android.view.KeyEvent.ACTION_UP, key))
            }
        }
        compose.runOnIdle { assertEquals("Both half-star steps must survive before redraw", listOf(8.0), writes) }
    }

}
