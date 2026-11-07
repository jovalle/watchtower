package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.TvSymbol

enum class HeroAction { Watchlist, Watched, Dismiss }

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun HomeHero(
    graph: AppGraph, item: MediaSummary, state: HeroActionsState, continuing: Boolean,
    heroFocus: FocusRequester, onDown: () -> Unit, detailsEnabled: Boolean,
    onDetails: () -> Unit, onPlay: (PlayerRoute) -> Unit, onAction: (HeroAction) -> Unit,
) {
    val key = item.ratingKey?.takeIf { it.isNotBlank() && item.external == null }
    val playable = key != null && item.type in listOf("movie", "episode")
    val episodes = key != null && item.type in listOf("show", "season")
    val actions = state.takeIf { it.ratingKey == key } ?: HeroActionsState(busy = state.busy)
    val enabled = !actions.busy
    val compact = LocalDensity.current.fontScale > 1.1f
    val saving = stringResource(R.string.saving)
    Column(Modifier.widthIn(max = 520.dp).semantics { if (actions.busy) { stateDescription = saving;liveRegion = LiveRegionMode.Polite } }, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.width(420.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            CatalogTitle(graph, item.clearLogoUrl, item.showTitle ?: item.title, compact = compact)
            if (item.type == "episode") Text(item.title, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (item.type == "episode" && item.seasonNumber != null && item.episodeNumber != null)
                    Text(stringResource(R.string.hero_episode, item.seasonNumber, item.episodeNumber), fontSize = 11.sp)
                else item.year?.let { Text(it.toString(), fontSize = 11.sp) }
                item.durationMs?.takeIf { it > 0 }?.let { Text(heroDuration(it), fontSize = 11.sp) }
                item.contentRating?.takeIf(String::isNotBlank)?.let { Text(it, fontSize = 11.sp) }
            }
            if (item.genres.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                item.genres.filter(String::isNotBlank).distinct().take(3).forEach { Text(it, fontSize = 11.sp) }
            }
            val ratings = validProviderRatings(actions.ratings).ifEmpty { validProviderRatings(item.ratings) }
            if (ratings.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                ratings.distinctBy { it.source }.take(3).forEach { ProviderRatingBadge(it) }
            }
            item.summary?.takeIf(String::isNotBlank)?.let {
                Text(it, fontSize = 13.sp, lineHeight = 17.sp, maxLines = if (compact) 2 else 3, overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = .85f))
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(0.dp), verticalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.onPreviewKeyEvent { event ->
                if (event.key == Key.DirectionDown) { if (event.type == KeyEventType.KeyDown) onDown();true } else false
            }) {
            TvAction(stringResource(when {
                playable && (item.viewOffsetMs ?: 0) > 0 -> R.string.resume
                playable -> R.string.play
                episodes -> R.string.episodes
                else -> R.string.details
            }), if (playable) TvSymbol.Play else if (episodes) TvSymbol.List else TvSymbol.Info,
                { if (playable) onPlay(PlayerRoute(requireNotNull(key))) else onDetails() },
                Modifier.focusRequester(heroFocus), primary = true, enabled = enabled && detailsEnabled)
            if (playable) TvAction(stringResource(R.string.details), TvSymbol.Info, onDetails, enabled = enabled && detailsEnabled)
            if (playable && (item.viewOffsetMs ?: 0) > 0) TvAction(stringResource(R.string.start_over), TvSymbol.Restart,
                { onPlay(PlayerRoute(requireNotNull(key), startPositionMs = 0)) }, enabled = enabled)
            if (key != null && item.type in listOf("movie", "show")) TvAction(stringResource(when (actions.onWatchlist) {
                true -> R.string.remove_watchlist;false -> R.string.add_watchlist;null -> R.string.check_watchlist
            }), if (actions.onWatchlist == true) TvSymbol.BookmarkFilled else TvSymbol.Bookmark,
                { onAction(HeroAction.Watchlist) }, enabled = enabled, selected = actions.onWatchlist == true)
            if (playable) TvAction(stringResource(if (item.viewCount > 0) R.string.mark_unwatched else R.string.mark_watched), TvSymbol.Check,
                { onAction(HeroAction.Watched) }, enabled = enabled, selected = item.viewCount > 0)
            if (playable && continuing) TvAction(stringResource(R.string.hero_remove_continue), TvSymbol.Close,
                { heroFocus.requestFocus();onAction(HeroAction.Dismiss) }, enabled = enabled)
        }
        val duration = item.durationMs?.takeIf { it > 0 }
        val offset = item.viewOffsetMs?.takeIf { it > 0 }
        if (duration != null && offset != null) {
            val elapsed = offset.coerceAtMost(duration)
            val progress = elapsed.toFloat() / duration
            Column(Modifier.width(280.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.fillMaxWidth().height(2.dp).background(MaterialTheme.colorScheme.onSurface.copy(alpha = .25f))
                    .semantics { progressBarRangeInfo = ProgressBarRangeInfo(progress, 0f..1f) }) {
                    Box(Modifier.fillMaxWidth(progress).height(2.dp).background(MaterialTheme.colorScheme.primary))
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(stringResource(R.string.hero_elapsed_total, heroDuration(elapsed), heroDuration(duration)), fontSize = 10.sp)
                    Text(stringResource(R.string.hero_time_left, heroDuration(duration - elapsed)), fontSize = 10.sp)
                }
            }
        }
        actions.error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 11.sp,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
    }
}

@Composable
private fun heroDuration(ms: Long): String {
    val minutes = ms.coerceAtLeast(0) / 60_000
    return if (minutes >= 60) stringResource(R.string.hero_hours_minutes, minutes / 60, minutes % 60)
        else stringResource(R.string.hero_minutes, minutes)
}
