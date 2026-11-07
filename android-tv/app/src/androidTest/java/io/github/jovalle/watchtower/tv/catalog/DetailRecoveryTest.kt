package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.semantics.SemanticsActions
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.api.PlaylistSummary
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class DetailRecoveryTest {
    @get:Rule val compose = createComposeRule()

    @Test fun playlistChooserSkipsLeadingSmartListAndScrollsToLastChoiceAndCancel() {
        val lists = (0..22).map { PlaylistSummary("list-$it", "Playlist $it", 1, null, it == 0, null) }
        compose.setContent { MaterialTheme { PlaylistChooserDialog(LoadState.Content(lists), {}, {}, {}) } }
        compose.onNodeWithText("Playlist 1").assertIsFocused()
        repeat(21) { compose.onNodeWithText("Playlist ${it + 1}").performKeyInput { pressKey(Key.DirectionDown) } }
        compose.onNodeWithText("Playlist 22").assertIsFocused().assertIsDisplayed()
            .performKeyInput { pressKey(Key.DirectionDown) }
        compose.onNodeWithContentDescription("Cancel").assertIsFocused().assertIsDisplayed()
    }

    @Test fun failedIssueSubmissionKeepsDraftAndTypeAndShowsRetryableError() {
        var submitted = ""
        var submittedType = 0
        compose.setContent {
            var error by remember { mutableStateOf<String?>(null) }
            MaterialTheme { IssueDialog(false, { type, message ->
                submittedType = type; submitted = message; error = "Report could not be saved. Try again."
            }, {}, error = error) }
        }
        compose.onNodeWithText("Audio").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNode(hasSetTextAction()).performTextInput("Dialogue is missing")
        compose.onNodeWithContentDescription("Submit").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Report could not be saved. Try again.").assertIsDisplayed()
        compose.onNodeWithText("Dialogue is missing").assertIsDisplayed()
        assertEquals("Dialogue is missing", submitted)
        assertEquals(2, submittedType)
    }
}
