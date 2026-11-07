package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.PlaylistSummary
import io.github.jovalle.watchtower.tv.api.WatchlistResponse
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.TvSymbol
import io.github.jovalle.watchtower.tv.ui.pointerClick

@Composable
internal fun MyListsContent(
    graph: AppGraph,
    playlistState: LoadState<List<PlaylistSummary>>,
    watchlistState: LoadState<WatchlistResponse>,
    source: String,
    onSource: (String) -> Unit,
    onRetryPlaylists: () -> Unit,
    onRetryWatchlist: () -> Unit,
    onOpen: (String) -> Unit,
    onPlaylist: (PlaylistRoute) -> Unit,
    onExternalDetails: ((MediaSummary) -> Unit)? = null,
) {
    var focusedKey by rememberSaveable { mutableStateOf<String?>(null) }
    val sourceFocus = remember { listOf("all", "plex", "trakt", "imdb").associateWith { FocusRequester() } }
    val initialPlaylist = (playlistState as? LoadState.Content)?.value?.firstOrNull()
    val savedKey = focusedKey?.takeIf { key ->
        when {
            key.startsWith("playlist:") -> playlistState is LoadState.Loading ||
                (playlistState as? LoadState.Content)?.value?.any { "playlist:${it.playlistId}" == key } == true
            key.startsWith("watchlist:") -> watchlistState is LoadState.Loading ||
                (watchlistState as? LoadState.Content)?.value?.items?.any { "watchlist:${it.type}:${it.id}" == key } == true
            else -> key.removePrefix("source:") in sourceFocus
        }
    }
    val restoreKey = savedKey ?: initialPlaylist?.let { "playlist:${it.playlistId}" }
        ?: "source:$source".takeIf { playlistState !is LoadState.Loading }
    LaunchedEffect(restoreKey) {
        if (restoreKey?.startsWith("source:") == true) sourceFocus[restoreKey.removePrefix("source:")]?.requestFocus()
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).verticalScroll(rememberScrollState())
        .padding(start = 64.dp, end = 48.dp, top = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.my_lists), fontSize = 34.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        Text(stringResource(R.string.playlists), fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        when (playlistState) {
            LoadState.Loading -> Text(stringResource(R.string.loading))
            is LoadState.Error -> {
                Text(playlistState.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                TvAction(stringResource(R.string.retry), TvSymbol.Refresh, onRetryPlaylists)
            }
            is LoadState.Content -> if (playlistState.value.isEmpty()) Text(stringResource(R.string.lists_no_playlists)) else {
                ListsShelf(playlistState.value, { "playlist:${it.playlistId}" }, restoreKey, { focusedKey = it }) { playlist, modifier ->
                    PlaylistCover(graph, playlist, modifier) { onPlaylist(PlaylistRoute(playlist.playlistId, playlist.title, playlist.smart)) }
                }
            }
        }
        Text(stringResource(R.string.watchlist), fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf("all" to R.string.filter_all, "plex" to R.string.source_plex, "trakt" to R.string.source_trakt, "imdb" to R.string.source_imdb).forEach { (value, label) ->
                val choose = { focusedKey = "source:$value"; onSource(value) }
                Button(onClick = choose, modifier = Modifier.heightIn(min = 40.dp).focusRequester(requireNotNull(sourceFocus[value]))
                    .onFocusChanged { if (it.isFocused) focusedKey = "source:$value" }.semantics { selected = source == value }
                    .pointerClick(onClick = choose),
                    shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
                    colors = ButtonDefaults.colors(containerColor = if (source == value) Color(0x33FFFFFF) else Color.Transparent,
                        contentColor = Color.White, focusedContainerColor = Color.White, focusedContentColor = Color.Black),
                    scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f)) { Text(stringResource(label)) }
            }
        }
        when (watchlistState) {
            LoadState.Loading -> Text(stringResource(R.string.loading))
            is LoadState.Error -> {
                Text(watchlistState.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                TvAction(stringResource(R.string.retry), TvSymbol.Refresh, onRetryWatchlist)
            }
            is LoadState.Content -> {
                watchlistState.value.errors.forEach { message ->
                    Text(message, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                }
                if (watchlistState.value.errors.isNotEmpty()) TvAction(stringResource(R.string.retry), TvSymbol.Refresh, onRetryWatchlist)
                if (watchlistState.value.items.isEmpty()) Text(stringResource(R.string.lists_watchlist_empty)) else {
                    ListsShelf(watchlistState.value.items, { "watchlist:${it.type}:${it.id}" }, restoreKey, { focusedKey = it }) { item, modifier ->
                        val summary = MediaSummary(item.ratingKey, item.type, item.title, item.year, item.posterUrl, null, null, null, null,
                            0, null, null, null, null, null, null, null, null, item.external.takeIf { item.ratingKey == null })
                        if (item.ratingKey != null || (item.external != null && onExternalDetails != null)) {
                            MediaCard(graph, summary, modifier) {
                                if (item.ratingKey != null) onOpen(item.ratingKey) else onExternalDetails?.invoke(summary)
                            }
                        } else Column(modifier.width(112.dp).focusable()) {
                            CatalogImage(graph, item.posterUrl, item.title, Modifier.width(112.dp).height(168.dp), ContentScale.Crop)
                            Text(item.title, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(stringResource(R.string.lists_details_unavailable), fontSize = 10.sp, color = Color.LightGray)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun <T> ListsShelf(items: List<T>, key: (T) -> String, restoreKey: String?, onFocused: (String) -> Unit, content: @Composable (T, Modifier) -> Unit) {
    val keys = items.map(key)
    val requesters = remember(keys) { keys.associateWith { FocusRequester() } }
    val listState = rememberLazyListState()
    var restorePending by remember { mutableStateOf(true) }
    LaunchedEffect(keys, restoreKey) {
        val index = keys.indexOf(restoreKey)
        if (restorePending && index >= 0) {
            listState.scrollToItem(index)
            withFrameNanos { }
            requesters[restoreKey]?.requestFocus()
            restorePending = false
        }
    }
    LazyRow(state = listState, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        items(items, key = key) { item ->
            val itemKey = key(item)
            content(item, Modifier.focusRequester(requireNotNull(requesters[itemKey])).onFocusChanged { if (it.hasFocus) onFocused(itemKey) })
        }
    }
}

@Composable
private fun PlaylistCover(graph: AppGraph, playlist: PlaylistSummary, modifier: Modifier, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val description = stringResource(R.string.playlist_with_count, playlist.title, playlist.itemCount)
    Surface(onClick = onClick, modifier = modifier.width(112.dp).onFocusChanged { focused = it.isFocused }
        .pointerClick(onClick = onClick).semantics { contentDescription = description },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(4.dp)), scale = ClickableSurfaceDefaults.scale(focusedScale = 1f),
        colors = ClickableSurfaceDefaults.colors(containerColor = Color.Transparent, focusedContainerColor = Color.Transparent)) {
        Column {
            Box(Modifier.width(112.dp).height(168.dp).clip(RoundedCornerShape(4.dp))) {
                CatalogImage(graph, playlist.thumbUrl, playlist.title, Modifier.fillMaxSize(), ContentScale.Crop)
                if (focused) Box(Modifier.fillMaxSize().border(1.5.dp, Color.White, RoundedCornerShape(4.dp)))
            }
            Text(playlist.title, color = Color.White, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
            Text(stringResource(R.string.item_count, playlist.itemCount), color = Color.LightGray, fontSize = 10.sp)
        }
    }
}
