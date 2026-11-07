package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.test.platform.app.InstrumentationRegistry
import io.github.jovalle.watchtower.tv.WatchtowerApp
import io.github.jovalle.watchtower.tv.api.ExternalId
import io.github.jovalle.watchtower.tv.api.Guids
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.api.ProviderRating
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class DetailMetadataTest {
    @get:Rule val compose = createComposeRule()

    @Test fun factsAreSpacedAndGenresWrapWithoutBulletDividersAtLargeText() {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                MaterialTheme { DetailMetadata(detail(), modifier = Modifier.width(300.dp)) }
            }
        }
        val year = compose.onNodeWithText("1966").assertIsDisplayed().getBoundsInRoot()
        val certificate = compose.onNodeWithText("R").assertIsDisplayed().getBoundsInRoot()
        val runtime = compose.onNodeWithText("2h 41m").assertIsDisplayed().getBoundsInRoot()
        assertTrue(certificate.left - year.right >= 12.dp)
        assertTrue(runtime.left - certificate.right >= 12.dp)
        listOf("Western", "Adventure", "Drama", "War").forEach { compose.onNodeWithText(it).assertIsDisplayed() }
        compose.onAllNodes(hasText("•", substring = true)).assertCountEquals(0)
        compose.onAllNodes(hasText("·", substring = true)).assertCountEquals(0)
    }

    @Test fun providerRatingsKeepTheirSourceScaleAndOmitUnratedProviders() {
        compose.setContent { MaterialTheme { DetailMetadata(detail(), listOf(
            ProviderRating("imdb", "rating", 8.8, 10), ProviderRating("tmdb", "rating", 8.2, 10),
            ProviderRating("rotten_tomatoes", "critic", 97.0, 100),
        )) } }
        compose.onNodeWithContentDescription("IMDb rating 8.8 out of 10").assertExists()
        compose.onNodeWithContentDescription("Rotten Tomatoes critics 97 percent").assertExists()
        compose.onNodeWithText("8.8/10").assertIsDisplayed()
        compose.onNodeWithText("8.2/10").assertIsDisplayed()
        compose.onNodeWithText("97%").assertIsDisplayed()
        compose.onNodeWithContentDescription("TVDB metadata").assertDoesNotExist()
        compose.onNodeWithText("TVDB").assertDoesNotExist()
        compose.onNodeWithContentDescription("TMDB metadata").assertDoesNotExist()
    }

    @Test fun identifiersAndInvalidValuesDoNotProduceBadges() {
        compose.setContent { MaterialTheme {
            androidx.compose.foundation.layout.Column {
                DetailMetadata(detail(), emptyList())
                DetailMetadata(detail(), listOf(
                    ProviderRating("imdb", "rating", Double.NaN, 10),
                    ProviderRating("tmdb", "rating", -1.0, 10),
                    ProviderRating("tvdb", "rating", 11.0, 10),
                    ProviderRating("rotten_tomatoes", "critic", 101.0, 100),
                ))
            }
        } }
        listOf("IMDb", "TMDB", "TVDB", "Rotten Tomatoes").forEach {
            compose.onAllNodes(hasContentDescription(it, substring = true)).assertCountEquals(0)
            compose.onAllNodes(hasText(it, substring = true)).assertCountEquals(0)
        }
    }

    @Test fun tvdbBadgeStillAppearsWhenASeriesHasARating() {
        compose.setContent { MaterialTheme { DetailMetadata(detail().copy(type = "show"), listOf(
            ProviderRating("tvdb", "rating", 7.9, 10),
        )) } }
        compose.onNodeWithContentDescription("TVDB rating 7.9 out of 10").assertExists()
        compose.onNodeWithText("7.9/10").assertIsDisplayed()
    }

    @Test fun externalAvailabilityBadgeRemainsSecondaryToThePosterAtLargeText() {
        val graph = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as WatchtowerApp).graph
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                MaterialTheme { MediaCard(graph, detail().toSummary().copy(ratingKey = null,
                    external = ExternalId("tmdb", "429", "movie"))) {} }
            }
        }
        val badge = compose.onNodeWithText("Not in library", useUnmergedTree = true).assertIsDisplayed().getBoundsInRoot()
        assertTrue("Availability is supporting metadata, not a cover-width banner", badge.right - badge.left <= 100.dp)
        assertTrue("The label must not obscure the poster artwork", badge.bottom - badge.top <= 24.dp)
        compose.onNodeWithContentDescription("Not in library", substring = true).assertExists()
    }

    private fun detail() = MediaDetail(
        ratingKey = "42", type = "movie", title = "Movie", year = 1966, posterUrl = null, backdropUrl = null,
        thumbUrl = null, durationMs = 161L * 60_000, viewOffsetMs = null, viewCount = 0, leafCount = null,
        viewedLeafCount = null, contentRating = "R", showTitle = null, seasonNumber = null, episodeNumber = null,
        parentRatingKey = null, grandparentRatingKey = null, external = null, summary = null, tagline = null,
        studio = null, genres = listOf("Western", "Adventure", "Drama", "War"), directors = emptyList(), cast = emptyList(),
        audienceRating = null, criticRating = null, userRating = null, originallyAvailableAt = null,
        editionTitle = null, editions = emptyList(), guids = Guids("tt0060196", "429", "123", null),
        versions = emptyList(), markers = emptyList(), onWatchlist = false, playable = true,
    )
}
