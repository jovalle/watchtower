package io.github.jovalle.watchtower.tv.catalog

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.itemsIndexed as listItemsIndexed
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import coil3.compose.AsyncImage
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.api.HomeResponse
import io.github.jovalle.watchtower.tv.api.ExternalId
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.PlaylistItem
import io.github.jovalle.watchtower.tv.api.PlaylistSummary
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import io.github.jovalle.watchtower.tv.platform.VoiceSearch
import io.github.jovalle.watchtower.tv.platform.WatchNextManager
import kotlinx.serialization.Serializable

@Serializable data object HomeRoute
@Serializable data class LibraryRoute(val sectionId: String, val title: String)
@Serializable data class CollectionsRoute(val sectionId: String, val title: String)
@Serializable data class CollectionRoute(val collectionId: String, val title: String)
@Serializable data object SearchRoute
@Serializable data object ListsRoute
@Serializable data class PlaylistRoute(val playlistId: String, val title: String, val smart: Boolean)
@Serializable data class DetailsRoute(val ratingKey: String)
@Serializable data class ExternalDetailsRoute(
    val provider: String,
    val externalId: String,
    val type: String,
    val title: String,
    val year: Int?,
    val posterUrl: String?,
    val backdropUrl: String?,
)

@Composable
fun HomeScreen(
    graph: AppGraph,
    data: CatalogDataSource,
    watchNext: WatchNextManager,
    onDetails: (String) -> Unit,
    onPlay: (PlayerRoute) -> Unit,
) {
    val model: HomeViewModel = viewModel { HomeViewModel(data, graph.session::current, graph.session.identityChanges) }
    when (val state = model.state.collectAsStateWithLifecycle().value) {
        LoadState.Loading -> LoadingScreen()
        is LoadState.Error -> ErrorScreen(state.message, model::reload)
        is LoadState.Content -> HomeContent(graph, state.value, watchNext, onDetails, onPlay)
    }
}

@Composable
private fun HomeContent(
    graph: AppGraph,
    home: HomeResponse,
    watchNext: WatchNextManager,
    onDetails: (String) -> Unit,
    onPlay: (PlayerRoute) -> Unit,
) {
    val hero = home.hero.firstOrNull()
    val snapshot = graph.session.current()
    val me = graph.session.currentMe()
    var focusedRowId by rememberSaveable { mutableStateOf<String?>(null) }
    var focusedItemKey by rememberSaveable { mutableStateOf<String?>(null) }
    val firstRow = home.rows.firstOrNull { it.items.isNotEmpty() }
    val restoreRowId = focusedRowId?.takeIf { id -> home.rows.any { it.id == id && it.items.isNotEmpty() } }
        ?: firstRow?.id
    val restoreItemKey = home.rows.firstOrNull { it.id == restoreRowId }?.items
        ?.firstOrNull { it.stableKey == focusedItemKey }?.stableKey
        ?: home.rows.firstOrNull { it.id == restoreRowId }?.items?.firstOrNull()?.stableKey
    LaunchedEffect(home, snapshot, me?.profile?.userId) {
        if (snapshot != null && me != null) {
            val items = home.rows.firstOrNull { it.kind == "continue_watching" }?.items.orEmpty().map { item ->
                item.copy(
                    posterUrl = item.posterUrl?.let { runCatching { snapshot.resolve(it).toString() }.getOrNull() },
                    backdropUrl = item.backdropUrl?.let { runCatching { snapshot.resolve(it).toString() }.getOrNull() },
                )
            }
            watchNext.sync(me.profile, me.server.machineId, items)
        }
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 36.dp, end = 36.dp, bottom = 40.dp),
        verticalArrangement = Arrangement.spacedBy(22.dp),
    ) {
        if (hero != null) item(key = "hero") { Hero(graph, hero, onDetails, onPlay) }
        home.rows.forEach { row ->
            item(key = row.id) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(row.title, fontSize = 24.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
                    FocusRestoringHomeRow(
                        items = row.items,
                        restoreKey = restoreItemKey.takeIf { row.id == restoreRowId },
                        onFocused = { key -> focusedRowId = row.id; focusedItemKey = key },
                    ) { item, modifier ->
                        MediaCard(graph, item, modifier) { item.ratingKey?.let(onDetails) }
                    }
                }
            }
        }
    }
}

@Composable
internal fun FocusRestoringHomeRow(
    items: List<MediaSummary>,
    restoreKey: String?,
    onFocused: (String) -> Unit,
    itemContent: @Composable (MediaSummary, Modifier) -> Unit,
) {
    val keys = items.map(MediaSummary::stableKey)
    val requesters = remember(keys) { keys.associateWith { FocusRequester() } }
    val listState = rememberLazyListState()
    val restoreIndex = keys.indexOf(restoreKey)
    var restorePending by remember { mutableStateOf(true) }
    LaunchedEffect(restoreKey, keys, restorePending) {
        if (restorePending && restoreIndex >= 0) {
            listState.scrollToItem(restoreIndex)
            requesters[restoreKey]?.requestFocus()
            restorePending = false
        }
    }
    LazyRow(state = listState, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        items(items, key = MediaSummary::stableKey) { item ->
            itemContent(
                item,
                Modifier.focusRequester(requireNotNull(requesters[item.stableKey])).onFocusChanged {
                    if (it.isFocused) onFocused(item.stableKey)
                },
            )
        }
    }
}

@Composable
private fun Hero(graph: AppGraph, item: MediaSummary, onDetails: (String) -> Unit, onPlay: (PlayerRoute) -> Unit) {
    Box(Modifier.fillMaxWidth().height(360.dp).clipToBounds()) {
        CatalogImage(graph, item.backdropUrl, item.title, Modifier.fillMaxSize(), ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Color(0x66000000)))
        Column(Modifier.align(Alignment.BottomStart).padding(28.dp).fillMaxWidth(0.7f)) {
            Text(item.title, fontSize = 40.sp, fontWeight = FontWeight.Bold)
            item.year?.let { Text(it.toString(), fontSize = 18.sp) }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 16.dp)) {
                item.ratingKey?.let { key ->
                    Button(onClick = { onPlay(PlayerRoute(key)) }) {
                        Text(if ((item.viewOffsetMs ?: 0) > 0) stringResource(R.string.resume) else stringResource(R.string.play))
                    }
                    OutlinedButton(onClick = { onDetails(key) }) { Text(stringResource(R.string.details)) }
                }
            }
        }
    }
}

@Composable
fun LibraryScreen(
    graph: AppGraph,
    data: CatalogDataSource,
    route: LibraryRoute,
    onOpen: (String) -> Unit,
    onCollections: () -> Unit,
) {
    val model: LibraryViewModel = viewModel(key = route.sectionId) {
        LibraryViewModel(route.sectionId, data, graph.session::current, graph.session.identityChanges)
    }
    val state by model.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(28.dp)) {
        Text(route.title, fontSize = 34.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(vertical = 14.dp)) {
            Button(onClick = onCollections) { Text(stringResource(R.string.collections)) }
            listOf(
                "titleSort:asc" to stringResource(R.string.sort_title),
                "addedAt:desc" to stringResource(R.string.sort_recently_added),
                "year:desc" to stringResource(R.string.sort_year),
            ).forEach { (value, label) ->
                OutlinedButton(onClick = { model.setSort(value) }) { Text(label) }
            }
            listOf(
                "all" to stringResource(R.string.filter_all),
                "unwatched" to stringResource(R.string.filter_unwatched),
                "in_progress" to stringResource(R.string.filter_in_progress),
            ).forEach { (value, label) ->
                OutlinedButton(onClick = { model.setFilter(value) }) { Text(label) }
            }
        }
        if (state.error != null && state.items.isEmpty()) ErrorScreen(state.error.orEmpty(), model::reload)
        else MediaGrid(graph, state, model, onOpen)
    }
}

@Composable
fun CollectionsScreen(
    graph: AppGraph,
    data: CatalogDataSource,
    route: CollectionsRoute,
    onOpen: (CollectionRoute) -> Unit,
) {
    val model: CollectionsViewModel = viewModel(key = route.sectionId) {
        CollectionsViewModel(route.sectionId, data, graph.session::current, graph.session.identityChanges)
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(32.dp)) {
        Text(
            stringResource(R.string.library_collections, route.title),
            fontSize = 34.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { heading() },
        )
        when (val state = model.state.collectAsStateWithLifecycle().value) {
            LoadState.Loading -> Text(stringResource(R.string.loading), modifier = Modifier.padding(top = 18.dp))
            is LoadState.Error -> ErrorScreen(state.message, model::reload)
            is LoadState.Content -> {
                if (state.value.isEmpty()) Text(stringResource(R.string.no_collections), modifier = Modifier.padding(top = 18.dp))
                LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 14.dp)) {
                    items(state.value, key = { it.collectionId }) { collection ->
                        Button(
                            onClick = { onOpen(CollectionRoute(collection.collectionId, collection.title)) },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(collection.title, modifier = Modifier.weight(1f))
                            Text(stringResource(R.string.item_count, collection.itemCount))
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun CollectionScreen(graph: AppGraph, data: CatalogDataSource, route: CollectionRoute, onOpen: (String) -> Unit) {
    val model: CollectionItemsViewModel = viewModel(key = route.collectionId) {
        CollectionItemsViewModel(route.collectionId, data, graph.session::current, graph.session.identityChanges)
    }
    val state by model.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(28.dp)) {
        Text(route.title, fontSize = 34.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        if (state.error != null && state.items.isEmpty()) {
            ErrorScreen(state.error.orEmpty(), model::retry)
        } else {
            PagedMediaGrid(graph, state, model::rememberFocus, model::loadNear, model::retry, onOpen)
        }
    }
}

@Composable
private fun PagedMediaGrid(
    graph: AppGraph,
    state: PagedState<MediaSummary>,
    rememberFocus: (Int) -> Unit,
    loadNear: (Int) -> Unit,
    retry: () -> Unit,
    onOpen: (String) -> Unit,
) {
    if (state.items.isEmpty() && !state.loading && state.error == null) {
        Text(stringResource(R.string.collection_empty), modifier = Modifier.padding(top = 18.dp))
        return
    }
    val requesters = remember { mutableMapOf<Int, FocusRequester>() }
    LaunchedEffect(state.items) {
        requesters[state.focusedIndex.coerceIn(0, state.items.lastIndex.coerceAtLeast(0))]?.requestFocus()
    }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(160.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        itemsIndexed(state.items, key = { _, item -> item.stableKey }) { index, item ->
            val requester = remember(index) { FocusRequester().also { requesters[index] = it } }
            MediaCard(
                graph,
                item,
                modifier = Modifier.focusRequester(requester).onFocusChanged {
                    if (it.isFocused) { rememberFocus(index); loadNear(index) }
                },
            ) { item.ratingKey?.let(onOpen) }
        }
        if (state.loading) item(key = "loading") { Text(stringResource(R.string.loading), modifier = Modifier.padding(20.dp)) }
        state.error?.let { message -> item(key = "error") {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(message, color = MaterialTheme.colorScheme.error)
                OutlinedButton(onClick = retry) { Text(stringResource(R.string.retry)) }
            }
        } }
    }
}

@Composable
private fun MediaGrid(graph: AppGraph, state: LibraryState, model: LibraryViewModel, onOpen: (String) -> Unit) {
    val requesters = remember { mutableMapOf<String, FocusRequester>() }
    var restorePending by remember { mutableStateOf(true) }
    val keys = state.items.mapNotNull { it.ratingKey }
    val target = restoredFocusIndex(state.focusedKey, state.focusedIndex, keys)
    LaunchedEffect(state.items, restorePending) {
        if (restorePending && target >= 0) {
            requesters[keys[target]]?.requestFocus()
            restorePending = false
        }
    }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(160.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        itemsIndexed(state.items, key = { _, item -> item.stableKey }) { index, item ->
            val key = item.ratingKey ?: return@itemsIndexed
            val requester = remember(key) { FocusRequester().also { requesters[key] = it } }
            MediaCard(
                graph = graph,
                item = item,
                modifier = Modifier.focusRequester(requester).onFocusChanged {
                    if (it.isFocused) { model.rememberFocus(key, index); model.loadNear(index) }
                },
                onClick = { onOpen(key) },
            )
        }
        if (state.loading) item(key = "loading") { Text(stringResource(R.string.loading), modifier = Modifier.padding(20.dp)) }
    }
}

@Composable
fun SearchScreen(graph: AppGraph, data: CatalogDataSource, onOpen: (MediaSummary) -> Unit) {
    val model: SearchViewModel = viewModel { SearchViewModel(data, graph.session::current, graph.session.identityChanges) }
    val state by model.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val voiceAvailable = remember(context) { VoiceSearch.isAvailable(context) }
    val voiceLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) VoiceSearch.firstResult(result.data)?.let(model::search)
    }
    val searchFocus = remember { FocusRequester() }
    LaunchedEffect(Unit) { searchFocus.requestFocus() }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(32.dp)) {
        Text(stringResource(R.string.search), fontSize = 34.sp, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BasicTextField(
                value = state.query,
                onValueChange = model::search,
                modifier = Modifier.weight(1f).background(Color.White).border(3.dp, MaterialTheme.colorScheme.primary)
                    .padding(15.dp).focusRequester(searchFocus).focusable(),
                textStyle = TextStyle(color = Color.Black, fontSize = 21.sp),
                singleLine = true,
            )
            if (voiceAvailable) {
                Button(onClick = { voiceLauncher.launch(VoiceSearch.intent()) }) { Text(stringResource(R.string.voice_search)) }
            }
        }
        when {
            state.loading -> Text(stringResource(R.string.loading), modifier = Modifier.padding(16.dp))
            state.error != null -> Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
            state.result != null -> {
                val result = requireNotNull(state.result)
                if (result.library.isEmpty() && result.external.isEmpty()) Text(stringResource(R.string.no_results), modifier = Modifier.padding(16.dp))
                SearchRow(graph, stringResource(R.string.library_results), result.library, onOpen)
                SearchRow(graph, stringResource(R.string.external_results), result.external, onOpen)
            }
        }
    }
}

@Composable
private fun SearchRow(graph: AppGraph, title: String, items: List<MediaSummary>, onOpen: (MediaSummary) -> Unit) {
    if (items.isEmpty()) return
    Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp).semantics { heading() })
    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        items(items, key = { it.stableKey }) { item -> MediaCard(graph, item) { onOpen(item) } }
    }
}

@Composable
fun MediaDetailsScreen(
    graph: AppGraph,
    data: CatalogDataSource,
    route: DetailsRoute,
    onOpen: (String) -> Unit,
    onPlay: (PlayerRoute) -> Unit,
) {
    val model: DetailViewModel = viewModel(key = route.ratingKey) {
        DetailViewModel(route.ratingKey, data, graph.session::current, graph.session.identityChanges)
    }
    val state by model.state.collectAsStateWithLifecycle()
    val detail = state.detail
    val tmdbId = detail?.guids?.tmdb?.toIntOrNull()
    val requestsEnabled = graph.session.currentMe()?.features?.requests == true
    val identityVersion = graph.session.current()?.identityVersion
    val requests: RequestActionsViewModel = viewModel(key = "issue:${route.ratingKey}:$tmdbId:$identityVersion") {
        RequestActionsViewModel(
            detail?.type.requestType(),
            tmdbId,
            requestsEnabled,
            data,
            graph.session::current,
            graph.session.identityChanges,
            loadAvailability = false,
        )
    }
    when {
        state.loading -> LoadingScreen()
        state.error != null && state.detail == null -> ErrorScreen(state.error.orEmpty(), model::reload)
        state.detail != null -> DetailsContent(
            graph,
            requireNotNull(state.detail),
            state,
            model,
            requests.state.collectAsStateWithLifecycle().value,
            requests,
            onOpen,
            onPlay,
        )
    }
}

@Composable
private fun DetailsContent(
    graph: AppGraph,
    detail: MediaDetail,
    state: DetailState,
    model: DetailViewModel,
    requestState: RequestState,
    requestModel: RequestActionsViewModel,
    onOpen: (String) -> Unit,
    onPlay: (PlayerRoute) -> Unit,
) {
    var showPlaylists by remember { mutableStateOf(false) }
    var showIssue by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        item {
            Box(Modifier.fillMaxWidth().heightIn(min = 390.dp)) {
                CatalogImage(graph, detail.backdropUrl, detail.title, Modifier.fillMaxSize(), ContentScale.Crop)
                Box(Modifier.fillMaxSize().background(Color(0x77000000)))
                Column(Modifier.align(Alignment.BottomStart).padding(36.dp).fillMaxWidth(0.78f)) {
                    Text(detail.title, fontSize = 40.sp, fontWeight = FontWeight.Bold)
                    Text(detail.metadataLine(), fontSize = 17.sp)
                    detail.summary?.let { Text(it, fontSize = 17.sp, maxLines = 4, overflow = TextOverflow.Ellipsis) }
                    DetailsActionRow(
                        detail = detail,
                        enabled = !state.mutationInFlight,
                        issueEnabled = requestState.enabled,
                        onPlay = onPlay,
                        onSetWatched = { model.setWatched(detail.viewCount == 0) },
                        onSetWatchlist = { model.setWatchlist(detail.onWatchlist != true) },
                        onAddToPlaylist = { model.loadPlaylists(); showPlaylists = true },
                        onReportIssue = { showIssue = true },
                        modifier = Modifier.padding(top = 14.dp),
                    )
                    state.message?.let { Text(stringResource(R.string.saved), color = MaterialTheme.colorScheme.primary) }
                    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    requestState.message?.let { Text(stringResource(R.string.issue_submitted), color = MaterialTheme.colorScheme.primary) }
                    requestState.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            }
        }
        item {
            RatingControl(
                rating = detail.userRating,
                enabled = !state.mutationInFlight,
                onRating = model::setRating,
                modifier = Modifier.padding(horizontal = 32.dp, vertical = 16.dp),
            )
        }
        if (detail.versions.size > 1) item {
            Heading(stringResource(R.string.versions))
            LazyRow(Modifier.padding(horizontal = 32.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(detail.versions, key = { it.mediaId }) { version ->
                    Button(onClick = { detail.ratingKey?.let { onPlay(PlayerRoute(it, version.mediaId)) } }) { Text(version.label) }
                }
            }
        }
        if (detail.editions.isNotEmpty()) item {
            Heading(stringResource(R.string.editions))
            LazyRow(Modifier.padding(horizontal = 32.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(detail.editions, key = { it.ratingKey }) { edition ->
                    OutlinedButton(onClick = { onOpen(edition.ratingKey) }) {
                        Text(edition.editionTitle ?: stringResource(R.string.edition))
                    }
                }
            }
        }
        if (state.seasons.isNotEmpty()) item {
            Heading(stringResource(R.string.seasons))
            LazyRow(Modifier.padding(horizontal = 32.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                listItemsIndexed(state.seasons, key = { _, item -> item.stableKey }) { index, season ->
                    MediaCard(graph, season, modifier = Modifier.onFocusChanged {
                        if (it.isFocused) { model.loadSeason(season); model.loadSeasonsNear(index) }
                    }) {
                        season.ratingKey?.let(onOpen)
                    }
                }
            }
            state.seasonsError?.let {
                Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 32.dp))
                OutlinedButton(onClick = model::retrySeasons, modifier = Modifier.padding(horizontal = 32.dp)) {
                    Text(stringResource(R.string.retry))
                }
            }
            val episodes = state.episodes.flatMap { (seasonKey, page) ->
                page.items.mapIndexed { index, episode -> Triple(seasonKey, index, episode) }
            }
            if (episodes.isNotEmpty()) {
                Heading(stringResource(R.string.episodes))
                LazyRow(Modifier.padding(horizontal = 32.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(episodes, key = { it.third.stableKey }) { (seasonKey, index, episode) ->
                        MediaCard(
                            graph,
                            episode,
                            modifier = Modifier.onFocusChanged { if (it.isFocused) model.loadEpisodesNear(seasonKey, index) },
                        ) { episode.ratingKey?.let(onOpen) }
                    }
                }
            }
            state.episodes.filterValues { it.error != null }.forEach { (seasonKey, page) ->
                Text(page.error.orEmpty(), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 32.dp))
                OutlinedButton(
                    onClick = { model.retryEpisodes(seasonKey) },
                    modifier = Modifier.padding(horizontal = 32.dp),
                ) { Text(stringResource(R.string.retry)) }
            }
        }
        item { Spacer(Modifier.height(40.dp)) }
    }
    if (showPlaylists) {
        PlaylistChooserDialog(
            state = state.playlists,
            onChoose = { showPlaylists = false; model.addToPlaylist(it) },
            onRetry = model::loadPlaylists,
            onDismiss = { showPlaylists = false },
        )
    }
    if (showIssue) {
        IssueDialog(
            busy = requestState.mutationInFlight,
            onSubmit = { issueType, message -> showIssue = false; requestModel.reportIssue(issueType, message) },
            onDismiss = { showIssue = false },
        )
    }
}

@Composable
internal fun DetailsActionRow(
    detail: MediaDetail,
    enabled: Boolean,
    issueEnabled: Boolean,
    onPlay: (PlayerRoute) -> Unit,
    onSetWatched: () -> Unit,
    onSetWatchlist: () -> Unit,
    onAddToPlaylist: () -> Unit,
    onReportIssue: () -> Unit,
    modifier: Modifier = Modifier,
) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        DetailsPlaybackActions(detail, onPlay)
        OutlinedButton(onClick = onSetWatched, enabled = enabled) {
            Text(if (detail.viewCount > 0) stringResource(R.string.mark_unwatched) else stringResource(R.string.mark_watched))
        }
        OutlinedButton(onClick = onSetWatchlist, enabled = enabled) {
            Text(if (detail.onWatchlist == true) stringResource(R.string.remove_watchlist) else stringResource(R.string.add_watchlist))
        }
        OutlinedButton(onClick = onAddToPlaylist, enabled = enabled) { Text(stringResource(R.string.add_to_playlist)) }
        if (issueEnabled) {
            OutlinedButton(onClick = onReportIssue, enabled = enabled) { Text(stringResource(R.string.report_issue)) }
        }
    }
}

@Composable
internal fun RatingControl(
    rating: Double?,
    enabled: Boolean,
    onRating: (Double?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val value = rating?.toInt() ?: 0
    val description = if (rating == null) {
        stringResource(R.string.rating_not_set_description)
    } else {
        stringResource(R.string.rating_set_description, value)
    }
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        Button(
            onClick = { onRating(if (value == 10) 0.0 else (value + 1).toDouble()) },
            enabled = enabled,
            modifier = Modifier.onKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
                when (event.key) {
                    Key.DirectionLeft -> { onRating((value - 1).coerceAtLeast(0).toDouble()); true }
                    Key.DirectionRight -> { onRating((value + 1).coerceAtMost(10).toDouble()); true }
                    else -> false
                }
            }.semantics { contentDescription = description },
        ) {
            Text(stringResource(R.string.rating_value, value))
        }
        if (rating != null) {
            OutlinedButton(onClick = { onRating(null) }, enabled = enabled) { Text(stringResource(R.string.unrate)) }
        }
    }
}

@Composable
private fun PlaylistChooserDialog(
    state: LoadState<List<PlaylistSummary>>?,
    onChoose: (String) -> Unit,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss) {
        BackHandler(onBack = onDismiss)
        val primary = remember { FocusRequester() }
        LaunchedEffect(state) { primary.requestFocus() }
        Column(
            Modifier.width(520.dp).background(MaterialTheme.colorScheme.surface).padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.choose_playlist), fontSize = 26.sp, fontWeight = FontWeight.Bold)
            when (state) {
                null, LoadState.Loading -> Text(stringResource(R.string.loading))
                is LoadState.Error -> Button(onClick = onRetry, modifier = Modifier.focusRequester(primary)) {
                    Text(stringResource(R.string.retry))
                }
                is LoadState.Content -> {
                    if (state.value.isEmpty()) Text(stringResource(R.string.no_playlists))
                    state.value.forEachIndexed { index, playlist ->
                        Button(
                            onClick = { onChoose(playlist.playlistId) },
                            enabled = !playlist.smart,
                            modifier = Modifier.fillMaxWidth().then(if (index == 0) Modifier.focusRequester(primary) else Modifier),
                        ) { Text(playlist.title) }
                    }
                }
            }
            OutlinedButton(
                onClick = onDismiss,
                modifier = if (state == null || state == LoadState.Loading || (state is LoadState.Content && state.value.isEmpty())) {
                    Modifier.focusRequester(primary)
                } else Modifier,
            ) { Text(stringResource(R.string.cancel)) }
        }
    }
}

@Composable
private fun IssueDialog(
    busy: Boolean,
    onSubmit: (Int, String) -> Unit,
    onDismiss: () -> Unit,
) {
    var issueType by remember { mutableStateOf(4) }
    var message by remember { mutableStateOf("") }
    val primary = remember { FocusRequester() }
    val messageDescription = stringResource(R.string.issue_message_description)
    LaunchedEffect(Unit) { primary.requestFocus() }
    Dialog(onDismissRequest = onDismiss) {
        BackHandler(onBack = onDismiss)
        Column(
            Modifier.width(560.dp).background(MaterialTheme.colorScheme.surface).padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.report_issue), fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(1 to R.string.issue_video, 2 to R.string.issue_audio, 3 to R.string.issue_subtitles, 4 to R.string.issue_other)
                    .forEach { (value, label) ->
                        OutlinedButton(onClick = { issueType = value }) {
                            Text(if (issueType == value) stringResource(R.string.selected_option, stringResource(label)) else stringResource(label))
                        }
                    }
            }
            BasicTextField(
                value = message,
                onValueChange = { message = it.take(240) },
                modifier = Modifier.fillMaxWidth().background(Color.White).padding(14.dp)
                    .semantics { contentDescription = messageDescription },
                textStyle = TextStyle(color = Color.Black, fontSize = 19.sp),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = { onSubmit(issueType, message) },
                    enabled = !busy,
                    modifier = Modifier.focusRequester(primary),
                ) { Text(stringResource(R.string.submit_issue)) }
                OutlinedButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
            }
        }
    }
}

@Composable
fun ExternalDetailsScreen(graph: AppGraph, data: CatalogDataSource, route: ExternalDetailsRoute) {
    val tmdbId = route.externalId.toIntOrNull().takeIf { route.provider == "tmdb" }
    val identityVersion = graph.session.current()?.identityVersion
    val model: RequestActionsViewModel = viewModel(key = "request:${route.provider}:${route.externalId}:$identityVersion") {
        RequestActionsViewModel(
            route.type.requestType(),
            tmdbId,
            graph.session.currentMe()?.features?.requests == true,
            data,
            graph.session::current,
            graph.session.identityChanges,
        )
    }
    val state by model.state.collectAsStateWithLifecycle()
    var showIssue by remember { mutableStateOf(false) }
    val requestFocus = remember { FocusRequester() }
    LaunchedEffect(state.enabled) { if (state.enabled) requestFocus.requestFocus() }
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        CatalogImage(graph, route.backdropUrl, route.title, Modifier.fillMaxSize(), ContentScale.Crop)
        Box(Modifier.fillMaxSize().background(Color(0xAA000000)))
        Column(
            Modifier.align(Alignment.BottomStart).padding(48.dp).fillMaxWidth(0.72f),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(route.title, fontSize = 40.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
            route.year?.let { Text(it.toString(), fontSize = 18.sp) }
            if (!state.enabled) {
                Text(stringResource(R.string.not_in_library), color = Color.LightGray)
            } else {
                state.availability?.let { Text(stringResource(R.string.request_status, it.status)) }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Button(
                        onClick = model::request,
                        enabled = !state.loading && !state.mutationInFlight,
                        modifier = Modifier.focusRequester(requestFocus),
                    ) {
                        Text(stringResource(R.string.request_media))
                    }
                    OutlinedButton(onClick = { showIssue = true }, enabled = !state.mutationInFlight) {
                        Text(stringResource(R.string.report_issue))
                    }
                }
                state.message?.let { Text(stringResource(R.string.request_submitted), color = MaterialTheme.colorScheme.primary) }
                state.error?.let {
                    Text(it, color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = model::load) { Text(stringResource(R.string.retry)) }
                }
            }
        }
    }
    if (showIssue) {
        IssueDialog(
            busy = state.mutationInFlight,
            onSubmit = { issueType, message -> showIssue = false; model.reportIssue(issueType, message) },
            onDismiss = { showIssue = false },
        )
    }
}

@Composable
fun DetailsPlaybackActions(
    detail: MediaDetail,
    onPlay: (PlayerRoute) -> Unit,
) {
    val ratingKey = detail.ratingKey
    if (detail.playable && ratingKey != null) {
        // Land D-pad focus on the primary action when details open (some devices assign no initial focus).
        val playFocus = remember { FocusRequester() }
        LaunchedEffect(ratingKey) { runCatching { playFocus.requestFocus() } }
        Button(onClick = { onPlay(PlayerRoute(ratingKey, startPositionMs = null)) }, modifier = Modifier.focusRequester(playFocus)) {
            Text(stringResource(R.string.play))
        }
        OutlinedButton(onClick = { onPlay(PlayerRoute(ratingKey, startPositionMs = 0)) }) { Text(stringResource(R.string.start_over)) }
    }
}

@Composable
fun ListsScreen(
    graph: AppGraph,
    data: CatalogDataSource,
    onOpen: (String) -> Unit,
    onPlaylist: (PlaylistRoute) -> Unit,
) {
    val playlists: PlaylistsViewModel = viewModel {
        PlaylistsViewModel(data, graph.session::current, graph.session.identityChanges)
    }
    var source by remember { mutableStateOf("all") }
    var state by remember { mutableStateOf<LoadState<io.github.jovalle.watchtower.tv.api.WatchlistResponse>>(LoadState.Loading) }
    val loadFailed = stringResource(R.string.lists_load_failed)
    LaunchedEffect(source, graph.session.current()) {
        val snapshot = graph.session.current() ?: return@LaunchedEffect
        state = LoadState.Loading
        state = try {
            val result = data.watchlist(snapshot, source)
            if (graph.session.current() == snapshot) LoadState.Content(result) else LoadState.Loading
        } catch (error: Exception) {
            LoadState.Error(error.message ?: loadFailed)
        }
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(32.dp)) {
        Text(stringResource(R.string.my_lists), fontSize = 34.sp, fontWeight = FontWeight.Bold)
        Heading(stringResource(R.string.playlists))
        when (val playlistState = playlists.state.collectAsStateWithLifecycle().value) {
            LoadState.Loading -> Text(stringResource(R.string.loading))
            is LoadState.Error -> OutlinedButton(onClick = playlists::reload) { Text(stringResource(R.string.retry)) }
            is LoadState.Content -> LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(playlistState.value, key = PlaylistSummary::playlistId) { playlist ->
                    Button(onClick = { onPlaylist(PlaylistRoute(playlist.playlistId, playlist.title, playlist.smart)) }) {
                        Text(stringResource(R.string.playlist_with_count, playlist.title, playlist.itemCount))
                    }
                }
            }
        }
        Heading(stringResource(R.string.watchlist))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(vertical = 12.dp)) {
            listOf(
                "all" to stringResource(R.string.filter_all),
                "plex" to stringResource(R.string.source_plex),
                "trakt" to stringResource(R.string.source_trakt),
                "imdb" to stringResource(R.string.source_imdb),
            ).forEach { (value, label) ->
                OutlinedButton(onClick = { source = value }) { Text(label) }
            }
        }
        when (val current = state) {
            LoadState.Loading -> Text(stringResource(R.string.loading))
            is LoadState.Error -> Text(current.message, color = MaterialTheme.colorScheme.error)
            is LoadState.Content -> LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                items(current.value.items, key = { it.id }) { item ->
                    val summary = MediaSummary(
                        item.ratingKey, item.type, item.title, item.year, item.posterUrl, null, null, null, null,
                        0, null, null, null, null, null, null, null, null, item.external,
                    )
                    MediaCard(graph, summary) { item.ratingKey?.let(onOpen) }
                }
            }
        }
    }
}

@Composable
fun PlaylistScreen(
    graph: AppGraph,
    data: CatalogDataSource,
    route: PlaylistRoute,
    onOpen: (String) -> Unit,
    onPlay: (PlayerRoute) -> Unit,
) {
    val model: PlaylistItemsViewModel = viewModel(key = route.playlistId) {
        PlaylistItemsViewModel(route.playlistId, data, graph.session::current, graph.session.identityChanges)
    }
    val state by model.state.collectAsStateWithLifecycle()
    var pendingRemoval by remember { mutableStateOf<PlaylistItem?>(null) }
    val requesters = remember { mutableMapOf<Int, FocusRequester>() }
    LaunchedEffect(state.items) {
        requesters[state.focusedIndex.coerceIn(0, state.items.lastIndex.coerceAtLeast(0))]?.requestFocus()
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(32.dp)) {
        Text(route.title, fontSize = 34.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        if (route.smart) Text(stringResource(R.string.smart_playlist_read_only), color = Color.LightGray)
        if (state.error != null && state.items.isEmpty()) {
            ErrorScreen(state.error.orEmpty(), model::retry)
        } else if (state.items.isEmpty() && !state.loading) {
            Text(stringResource(R.string.playlist_empty), modifier = Modifier.padding(top = 18.dp))
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 14.dp)) {
                listItemsIndexed(state.items, key = { _, item -> item.playlistItemId }) { index, item ->
                    val requester = remember(index) { FocusRequester().also { requesters[index] = it } }
                    PlaylistItemActions(
                        item = item,
                        smart = route.smart,
                        modifier = Modifier.focusRequester(requester).onFocusChanged {
                            if (it.hasFocus) { model.rememberFocus(index); model.loadNear(index) }
                        },
                        onOpen = onOpen,
                        onPlay = onPlay,
                        onRemove = { pendingRemoval = item },
                    )
                }
                if (state.loading) item(key = "loading") { Text(stringResource(R.string.loading)) }
                state.error?.let { message -> item(key = "error") {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(message, color = MaterialTheme.colorScheme.error)
                        OutlinedButton(onClick = model::retry) { Text(stringResource(R.string.retry)) }
                    }
                } }
            }
        }
    }
    pendingRemoval?.let { item ->
        ConfirmationDialog(
            title = stringResource(R.string.remove_playlist_title),
            message = stringResource(R.string.remove_playlist_message, item.title),
            confirmLabel = stringResource(R.string.remove_action),
            onConfirm = { pendingRemoval = null; model.remove(item) },
            onDismiss = { pendingRemoval = null },
        )
    }
}

@Composable
internal fun PlaylistItemActions(
    item: PlaylistItem,
    smart: Boolean,
    modifier: Modifier = Modifier,
    onOpen: (String) -> Unit,
    onPlay: (PlayerRoute) -> Unit,
    onRemove: () -> Unit,
) {
    Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Button(onClick = { item.ratingKey?.let { onPlay(PlayerRoute(it)) } }, enabled = item.ratingKey != null) {
            Text(stringResource(R.string.play_item, item.title))
        }
        OutlinedButton(onClick = { item.ratingKey?.let(onOpen) }, enabled = item.ratingKey != null) {
            Text(stringResource(R.string.details))
        }
        OutlinedButton(onClick = onRemove, enabled = !smart) {
            Text(stringResource(R.string.remove_from_playlist))
        }
    }
}

@Composable
private fun ConfirmationDialog(
    title: String,
    message: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss) {
        BackHandler(onBack = onDismiss)
        val primary = remember { FocusRequester() }
        LaunchedEffect(Unit) { primary.requestFocus() }
        Column(
            Modifier.width(520.dp).background(MaterialTheme.colorScheme.surface).padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(title, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Text(message, fontSize = 18.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onConfirm, modifier = Modifier.focusRequester(primary)) { Text(confirmLabel) }
                OutlinedButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
            }
        }
    }
}

@Composable
fun MediaCard(graph: AppGraph, item: MediaSummary, modifier: Modifier = Modifier, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val watchedDescription = stringResource(R.string.watched)
    val minutesLeftDescription = item.minutesLeft?.let { stringResource(R.string.minutes_left, it) }
    val externalDescription = stringResource(R.string.not_in_library)
    val description = listOfNotNull(
        item.title,
        item.type,
        item.year?.toString(),
        watchedDescription.takeIf { item.viewCount > 0 },
        minutesLeftDescription,
        externalDescription.takeIf { item.external != null },
    ).joinToString(stringResource(R.string.accessibility_separator))
    Surface(
        onClick = onClick,
        modifier = modifier.width(160.dp).onFocusChanged { focused = it.isFocused }
            .semantics { contentDescription = description; role = Role.Button },
    ) {
        Column(Modifier.border(if (focused) 3.dp else 0.dp, MaterialTheme.colorScheme.primary).background(Color(0xFF171717))) {
            Box(Modifier.fillMaxWidth().aspectRatio(2f / 3f)) {
                CatalogImage(graph, item.posterUrl ?: item.thumbUrl, item.title, Modifier.fillMaxSize(), ContentScale.Crop)
                if (item.external != null) Text(
                    stringResource(R.string.not_in_library),
                    fontSize = 14.sp,
                    modifier = Modifier.align(Alignment.TopStart).background(Color.Black).padding(5.dp),
                )
                if (item.viewCount > 0) Text(stringResource(R.string.watched), fontSize = 14.sp, modifier = Modifier.align(Alignment.TopEnd).background(Color.Black).padding(5.dp))
                val progress = item.progress
                if (progress > 0f) {
                    Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(6.dp).background(Color.DarkGray))
                    Box(Modifier.align(Alignment.BottomStart).fillMaxWidth(progress).height(6.dp).background(MaterialTheme.colorScheme.primary))
                }
            }
            Text(item.title, fontSize = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.height(54.dp).padding(7.dp))
        }
    }
}

@Composable
private fun CatalogImage(graph: AppGraph, path: String?, title: String, modifier: Modifier, scale: ContentScale) {
    val snapshot = graph.session.current()
    val resolved = remember(path, snapshot) { path?.let { runCatching { snapshot?.resolve(it)?.toString() }.getOrNull() } }
    if (snapshot != null && resolved != null) {
        AsyncImage(
            model = resolved,
            imageLoader = graph.imageLoader(snapshot),
            contentDescription = null,
            modifier = modifier.background(Color(0xFF242424)),
            contentScale = scale,
        )
    } else {
        Box(modifier.background(Color(0xFF242424)), contentAlignment = Alignment.Center) { Text(title.take(1), fontSize = 32.sp) }
    }
}

@Composable private fun Heading(text: String) = Text(
    text,
    fontSize = 24.sp,
    fontWeight = FontWeight.Bold,
    modifier = Modifier.padding(start = 32.dp, top = 24.dp, bottom = 10.dp).semantics { heading() },
)

@Composable private fun LoadingScreen() = Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background), contentAlignment = Alignment.Center) {
    Text(stringResource(R.string.loading), fontSize = 22.sp)
}

@Composable private fun ErrorScreen(message: String, retry: () -> Unit) = Box(
    Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
    contentAlignment = Alignment.Center,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(message, color = MaterialTheme.colorScheme.error, fontSize = 18.sp)
        Button(onClick = retry) { Text(stringResource(R.string.retry)) }
    }
}

internal val MediaSummary.stableKey: String get() = ratingKey ?: "${external?.provider}:${external?.id}:${external?.type}"
private val MediaSummary.progress: Float
    get() = if ((durationMs ?: 0) > 0) ((viewOffsetMs ?: 0).toFloat() / durationMs!!.toFloat()).coerceIn(0f, 1f) else 0f
private val MediaSummary.minutesLeft: Long?
    get() = durationMs?.let { duration -> viewOffsetMs?.let { ((duration - it).coerceAtLeast(0) / 60_000) } }

private fun String?.requestType(): String = if (this == "show") "tv" else this ?: "movie"

@Composable
private fun MediaDetail.metadataLine(): String = listOfNotNull(
    year?.toString(),
    contentRating,
    durationMs?.let { stringResource(R.string.duration_minutes, it / 60_000) },
    audienceRating?.let { stringResource(R.string.audience_rating, it) },
    genres.takeIf { it.isNotEmpty() }?.joinToString(stringResource(R.string.metadata_separator)),
).joinToString(stringResource(R.string.metadata_separator_spaced))