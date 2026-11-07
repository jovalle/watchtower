package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.SubcomposeLayout
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.TvSymbol

private enum class DetailAction { Play, Restart, Watchlist, Rating, ClearRating, Watched, Playlist, Issue }

@Composable
internal fun DetailsActionRow(
    detail: MediaDetail, enabled: Boolean, issueEnabled: Boolean,
    onPlay: (PlayerRoute) -> Unit, onSetWatched: () -> Unit, onSetWatchlist: () -> Unit,
    onAddToPlaylist: () -> Unit, onReportIssue: () -> Unit, modifier: Modifier = Modifier,
    onRating: (Double?) -> Unit = {}, initialPlaybackFocus: Boolean = true,
    onRetryWatchlist: () -> Unit = {}, pending: Boolean = false, actionError: String? = null, mediaId: String? = null,
) {
    var more by remember(detail.ratingKey) { mutableStateOf(false) }
    var editing by remember(detail.ratingKey) { mutableStateOf(false) }
    var returnFocus by remember { mutableStateOf<FocusRequester?>(null) }
    var initialFocusPending by remember(detail.ratingKey) { mutableStateOf(initialPlaybackFocus) }
    val rateFocus = remember { FocusRequester() }
    val moreFocus = remember { FocusRequester() }
    val view = LocalView.current
    val expanded = detail.userRating != null || editing
    LaunchedEffect(more, expanded) {
        if (!more && returnFocus != null) {
            while (!view.hasWindowFocus()) withFrameNanos { }
            val restored = runCatching { returnFocus?.requestFocus() == true }.getOrDefault(false)
            if (!restored) runCatching { moreFocus.requestFocus() }
            returnFocus = null
        }
    }
    val actions = buildList {
        if (detail.playable && detail.type in listOf("movie", "episode") && detail.ratingKey != null) {
            add(DetailAction.Play); add(DetailAction.Restart)
        }
        if (detail.type in listOf("movie", "show")) add(DetailAction.Watchlist)
        add(DetailAction.Rating)
        if (detail.userRating != null) add(DetailAction.ClearRating)
        add(DetailAction.Watched); add(DetailAction.Playlist)
        if (issueEnabled) add(DetailAction.Issue)
    }
    fun act(action: DetailAction) {
        when (action) {
            DetailAction.Play -> detail.ratingKey?.let { onPlay(PlayerRoute(it, mediaId = mediaId)) }
            DetailAction.Restart -> detail.ratingKey?.let { onPlay(PlayerRoute(it, mediaId = mediaId, startPositionMs = 0)) }
            DetailAction.Watchlist -> if (detail.onWatchlist == null) onRetryWatchlist() else onSetWatchlist()
            DetailAction.Rating -> { returnFocus = rateFocus; editing = true }
            DetailAction.ClearRating -> { returnFocus = rateFocus; editing = false; rateFocus.requestFocus(); onRating(null) }
            DetailAction.Watched -> onSetWatched()
            DetailAction.Playlist -> onAddToPlaylist()
            DetailAction.Issue -> onReportIssue()
        }
    }
    val labels = mapOf(
        DetailAction.Play to stringResource(if ((detail.viewOffsetMs ?: 0) > 0) R.string.resume else R.string.play),
        DetailAction.Restart to stringResource(R.string.start_over),
        DetailAction.Watchlist to stringResource(when(detail.onWatchlist) { true -> R.string.remove_watchlist; false -> R.string.add_watchlist; null -> R.string.check_watchlist }),
        DetailAction.Rating to stringResource(R.string.cat_rate), DetailAction.ClearRating to stringResource(R.string.unrate),
        DetailAction.Watched to stringResource(if (detail.viewCount > 0) R.string.mark_unwatched else R.string.mark_watched),
        DetailAction.Playlist to stringResource(R.string.add_to_playlist), DetailAction.Issue to stringResource(R.string.report_issue),
    )
    val watchlistState = stringResource(when(detail.onWatchlist) { true -> R.string.watchlist_saved; false -> R.string.watchlist_not_saved; null -> R.string.watchlist_unknown })
    @Composable fun render(action: DetailAction, measuring: Boolean) {
        if (action == DetailAction.Rating && measuring) {
            Box(Modifier.width(if (expanded) 208.dp else 48.dp).height(60.dp))
        } else if (action == DetailAction.Rating) {
            RatingControl(detail.userRating, enabled, { onRating(it); editing = false },
                Modifier.focusRequester(rateFocus), initialFocus = editing, editing = editing,
                onEdit = { editing = true }, onDone = {
                    editing = false
                    if (detail.userRating == null) returnFocus = rateFocus
                }, onLeave = { editing = false }, pending = pending, expanded = expanded)
        } else {
            val focus = remember { FocusRequester() }
            if (action == DetailAction.Play && !measuring) LaunchedEffect(detail.ratingKey) {
                if (initialFocusPending && enabled) { initialFocusPending = false; runCatching { focus.requestFocus() } }
            }
            TvAction(labels.getValue(action), when(action) {
                DetailAction.Play -> TvSymbol.Play; DetailAction.Restart -> TvSymbol.Restart
                DetailAction.Watchlist -> if (detail.onWatchlist == true) TvSymbol.BookmarkFilled else TvSymbol.Bookmark
                DetailAction.Rating -> TvSymbol.Star; DetailAction.ClearRating -> TvSymbol.Close
                DetailAction.Watched -> TvSymbol.Check; DetailAction.Playlist -> TvSymbol.List; DetailAction.Issue -> TvSymbol.Issues
            }, { act(action) }, Modifier.then(if (measuring) Modifier.clearAndSetSemantics {}.focusProperties { canFocus = false } else Modifier.focusRequester(if (action == DetailAction.Rating) rateFocus else focus)),
                enabled = enabled && !measuring, primary = action == DetailAction.Play,
                selected = (action == DetailAction.Watchlist && detail.onWatchlist == true) || (action == DetailAction.Watched && detail.viewCount > 0),
                stateDescription = if (action == DetailAction.Watchlist) watchlistState else null)
        }
    }
    Column(modifier) {
        SubcomposeLayout(Modifier.fillMaxWidth()) { constraints ->
            val gap = 8.dp.roundToPx()
            val measured = actions.associateWith { action ->
                subcompose(action) {
                    render(action, measuring = true)
                }.single().measure(Constraints(maxWidth = if (expanded && action == DetailAction.Rating)
                    (constraints.maxWidth - gap - 48.dp.roundToPx()).coerceAtLeast(1) else constraints.maxWidth))
            }
            val visible = actions.toMutableList()
            fun width() = visible.sumOf { measured.getValue(it).width } + gap * (visible.size - 1).coerceAtLeast(0)
            val moreWidth = 48.dp.roundToPx()
            if (width() > constraints.maxWidth) {
                // Keep the expanded rating in place while surplus actions move to More.
                while (visible.isNotEmpty() && width() + gap + moreWidth > constraints.maxWidth) {
                    val remove = visible.lastOrNull { !expanded || it != DetailAction.Rating } ?: break
                    visible.remove(remove)
                }
            }
            val surplus = actions.filterNot { it in visible }
            val overflow = if (surplus.isNotEmpty()) subcompose("more") {
                TvAction(stringResource(R.string.cat_more), TvSymbol.More, {
                    moreFocus.requestFocus();returnFocus = moreFocus;more = true
                }, Modifier.focusRequester(moreFocus), enabled = enabled)
                if (more) CatalogDialogPanel(stringResource(R.string.cat_more), { more = false }) {
                    val first = remember { FocusRequester() }
                    LaunchedEffect(Unit) { first.requestFocus() }
                    surplus.forEachIndexed { index, action ->
                        CatalogTab(labels.getValue(action), false, { more = false;act(action) },
                            Modifier.fillMaxWidth().then(if (index == 0) Modifier.focusRequester(first) else Modifier), enabled)
                    }
                }
            }.single().measure(Constraints(maxWidth = constraints.maxWidth)) else {
                subcompose("close-more") { SideEffect { if (more) { more = false;returnFocus = rateFocus } } }
                null
            }
            val placed = visible.associateWith { action ->
                subcompose("visible-$action") { render(action, measuring = false) }.single()
                    .measure(Constraints(maxWidth = measured.getValue(action).width))
            }
            layout(constraints.maxWidth, placed.values.maxOfOrNull { it.height } ?: 60.dp.roundToPx()) {
                var x = 0
                visible.forEach { action -> placed.getValue(action).let { it.placeRelative(x, 0); x += it.width + gap } }
                overflow?.placeRelative(x, 0)
            }
        }
        actionError?.let { Text(it, fontSize = 11.sp, color = MaterialTheme.colorScheme.error,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
    }
}
