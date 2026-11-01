package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
import androidx.tv.material3.Button
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.api.MediaSummary
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

    @Test fun homeRowRestoresTheLastFocusedCardWhenItReturns() {
        lateinit var showing: MutableState<Boolean>
        val items = List(8) { index -> media("$index") }
        compose.setContent {
            MaterialTheme {
                showing = remember { mutableStateOf(true) }
                var focusedKey by rememberSaveable { mutableStateOf<String?>(items.first().stableKey) }
                if (showing.value) {
                    FocusRestoringHomeRow(items, focusedKey, { focusedKey = it }) { item, modifier ->
                        Button(onClick = {}, modifier = modifier) { Text(item.title) }
                    }
                }
            }
        }

        compose.onNodeWithText("Item 0").assertIsFocused()
        compose.onNodeWithText("Item 6").performSemanticsAction(SemanticsActions.RequestFocus).assertIsFocused()
        compose.runOnIdle { showing.value = false }
        compose.runOnIdle { showing.value = true }

        compose.onNodeWithText("Item 6").assertIsFocused()
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

    private fun media(id: String) = MediaSummary(
        ratingKey = id, type = "movie", title = "Item $id", year = 2026, posterUrl = null, backdropUrl = null,
        thumbUrl = null, durationMs = null, viewOffsetMs = null, viewCount = 0, leafCount = null,
        viewedLeafCount = null, contentRating = null, showTitle = null, seasonNumber = null, episodeNumber = null,
        parentRatingKey = null, grandparentRatingKey = null, external = null,
    )
}