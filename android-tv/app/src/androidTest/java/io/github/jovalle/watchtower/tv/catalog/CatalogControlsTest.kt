package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.pressKey
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.api.PlaylistItem
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class CatalogControlsTest {
    @get:Rule val compose = createComposeRule()

    @Test fun ratingControlExposesItsValueAndChangesWithDpad() {
        val ratings = mutableListOf<Double?>()
        compose.setContent { MaterialTheme { RatingControl(6.0, true, ratings::add) } }

        val rating = compose.onNodeWithContentDescription("Rated 6 out of 10. Use left and right to change.")
        rating.performSemanticsAction(SemanticsActions.RequestFocus)
        rating.assertIsFocused()
        rating.performKeyInput { pressKey(Key.DirectionRight) }

        compose.runOnIdle { assertEquals(listOf(7.0), ratings) }
    }

    @Test fun smartPlaylistExposesPlayAndDetailsButDisablesRemoval() {
        compose.setContent {
            MaterialTheme {
                PlaylistItemActions(
                    item = playlistItem(),
                    smart = true,
                    onOpen = {},
                    onPlay = {},
                    onRemove = {},
                )
            }
        }

        compose.onNodeWithText("Play Episode one").performSemanticsAction(SemanticsActions.RequestFocus)
        compose.onNodeWithText("Play Episode one").assertIsFocused()
        compose.onNodeWithText("Details").assertExists()
        compose.onNodeWithText("Remove from playlist").assertIsNotEnabled()
    }

    private fun playlistItem() = PlaylistItem(
        ratingKey = "42",
        type = "episode",
        title = "Episode one",
        year = 2026,
        posterUrl = null,
        backdropUrl = null,
        thumbUrl = null,
        durationMs = 1_800_000,
        viewOffsetMs = 0,
        viewCount = 0,
        leafCount = null,
        viewedLeafCount = null,
        contentRating = null,
        showTitle = "Show",
        seasonNumber = 1,
        episodeNumber = 1,
        parentRatingKey = "season",
        grandparentRatingKey = "show",
        external = null,
        playlistItemId = "playlist-item-42",
    )
}