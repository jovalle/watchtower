package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.api.Guids
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class DetailsActionsTest {
    @get:Rule val compose = createComposeRule()

    @Test fun playAndStartOverProduceDistinctRoutes() {
        val routes = mutableListOf<PlayerRoute>()
        compose.setContent { MaterialTheme { DetailsPlaybackActions(detail(), routes::add) } }

        compose.onNodeWithText("Play").assertIsFocused()

        compose.onNodeWithText("Play").performSemanticsAction(SemanticsActions.OnClick)
        compose.onNodeWithText("Start over").performSemanticsAction(SemanticsActions.OnClick)

        compose.runOnIdle {
            assertEquals(PlayerRoute("42", startPositionMs = null), routes[0])
            assertEquals(PlayerRoute("42", startPositionMs = 0), routes[1])
        }
    }

    @Test fun everyDetailsActionStaysInsideTheRootAtLargeText() {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 1.3f)) {
                MaterialTheme {
                    Box(Modifier.fillMaxSize().testTag("root").padding(36.dp)) {
                        DetailsActionRow(
                            detail = detail(),
                            enabled = true,
                            issueEnabled = true,
                            onPlay = {},
                            onSetWatched = {},
                            onSetWatchlist = {},
                            onAddToPlaylist = {},
                            onReportIssue = {},
                            modifier = Modifier.fillMaxWidth(0.78f),
                        )
                    }
                }
            }
        }

        val root = compose.onNodeWithTag("root").getBoundsInRoot()
        listOf("Play", "Start over", "Mark watched", "Add to watchlist", "Add to playlist", "Report issue")
            .forEach { label ->
                val node = compose.onNodeWithText(label)
                val bounds = node.getBoundsInRoot()
                assertTrue("$label bounds $bounds must stay within root $root", bounds.left >= root.left && bounds.top >= root.top && bounds.right <= root.right && bounds.bottom <= root.bottom)
                node.assertIsDisplayed()
            }
    }

    private fun detail() = MediaDetail(
        ratingKey = "42", type = "movie", title = "Movie", year = null, posterUrl = null, backdropUrl = null,
        thumbUrl = null, durationMs = null, viewOffsetMs = null, viewCount = 0, leafCount = null,
        viewedLeafCount = null, contentRating = null, showTitle = null, seasonNumber = null, episodeNumber = null,
        parentRatingKey = null, grandparentRatingKey = null, external = null, summary = null, tagline = null,
        studio = null, genres = emptyList(), directors = emptyList(), cast = emptyList(), audienceRating = null,
        criticRating = null, userRating = null, originallyAvailableAt = null, editionTitle = null, editions = emptyList(),
        guids = Guids(null, null, null, null),
        versions = emptyList(),
        markers = emptyList(), onWatchlist = false, playable = true,
    )
}