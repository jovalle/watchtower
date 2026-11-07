package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.api.ProviderRating
import java.text.NumberFormat

@Composable
internal fun EnrichedDetailMetadata(graph: AppGraph, data: CatalogDataSource, detail: MediaDetail) {
    val fallback = validProviderRatings(detail.ratings).ifEmpty { validProviderRatings(listOfNotNull(
        detail.audienceRating?.let { ProviderRating("plex", "audience", it, 10) },
        detail.criticRating?.let { ProviderRating("plex", "critic", it, 10) },
    )) }
    if (detail.ratingKey != null && detail.type in listOf("movie", "show")) {
        val owner = graph.session.current()
        val model: MediaRatingsViewModel = viewModel(key = "ratings:${detail.ratingKey}:${owner?.deviceSessionId}:${owner?.identityVersion}") {
            MediaRatingsViewModel(detail.ratingKey, data, graph.session::current, graph.session.identityChanges)
        }
        val state by model.state.collectAsStateWithLifecycle()
        DetailMetadata(detail, validProviderRatings(state.ratings).ifEmpty { fallback })
    } else DetailMetadata(detail, fallback)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun DetailMetadata(detail: MediaDetail, ratings: List<ProviderRating> = detail.ratings, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp),
            itemVerticalAlignment = Alignment.CenterVertically) {
            detail.year?.let { Text(it.toString(), fontSize = 11.sp, color = Color.LightGray) }
            detail.contentRating?.takeIf(String::isNotBlank)?.let {
                Text(it, fontSize = 11.sp, color = Color.LightGray,
                    modifier = Modifier.border(1.dp, Color(0xFF777777), RoundedCornerShape(2.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
            }
            detail.durationMs?.takeIf { it > 0 }?.let {
                val minutes = it / 60_000
                Text(if (minutes >= 60) stringResource(R.string.details_runtime_hours_minutes, minutes / 60, minutes % 60)
                    else stringResource(R.string.details_runtime_minutes, minutes), fontSize = 11.sp, color = Color.LightGray)
            }
        }
        if (detail.genres.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            detail.genres.filter(String::isNotBlank).distinct().forEach { Text(it, fontSize = 11.sp, color = Color.LightGray) }
        }
        val validRatings = validProviderRatings(ratings)
        if (validRatings.isNotEmpty()) FlowRow(
            horizontalArrangement = Arrangement.spacedBy(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            validRatings.forEach { ProviderRatingBadge(it) }
        }
    }
}

@Composable
internal fun ProviderRatingBadge(rating: ProviderRating) {
    val locale = LocalConfiguration.current.locales[0]
    val number = NumberFormat.getNumberInstance(locale).apply { maximumFractionDigits = 1 }.format(rating.value)
    val name = providerName(rating.source)
    val kind = stringResource(when (rating.kind) {
        "audience" -> R.string.details_rating_audience
        "critic" -> R.string.details_rating_critics
        else -> R.string.details_rating_score
    })
    val description = stringResource(if (rating.maxValue == 100) R.string.details_rating_percent_description else R.string.details_rating_ten_description,
        name, kind.lowercase(locale), number)
    Row(Modifier.semantics(mergeDescendants = true) { contentDescription = description },
        horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        ProviderMark(rating.source)
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(if (rating.maxValue == 100) "$number%" else "$number/10", color = Color.White, fontSize = 11.sp, lineHeight = 13.sp)
            if (rating.kind != "rating") Text(kind, color = Color.LightGray, fontSize = 9.sp, lineHeight = 11.sp)
        }
    }
}

@Composable
private fun ProviderMark(source: String) {
    val resource = when (source) {
        "imdb" -> R.drawable.provider_imdb
        "tmdb" -> R.drawable.provider_tmdb
        "tvdb" -> R.drawable.provider_tvdb
        "rotten_tomatoes" -> R.drawable.provider_rottentomatoes
        else -> null
    }
    if (resource != null) Image(painterResource(resource), contentDescription = null, modifier = when (source) {
        "rotten_tomatoes" -> Modifier.width(50.dp).height(22.dp)
        "tmdb" -> Modifier.width(30.dp).height(22.dp)
        else -> Modifier.size(22.dp)
    })
    else Text(stringResource(R.string.details_rating_plex), fontSize = 10.sp, color = Color.LightGray)
}

private fun providerName(source: String) = when (source) {
    "imdb" -> "IMDb"
    "tmdb" -> "TMDB"
    "tvdb" -> "TVDB"
    "rotten_tomatoes" -> "Rotten Tomatoes"
    else -> "Plex"
}

internal fun validProviderRatings(ratings: List<ProviderRating>?): List<ProviderRating> = ratings.orEmpty().filter {
    it.value.isFinite() && it.maxValue in listOf(10, 100) && it.value in 0.0..it.maxValue.toDouble()
}
