package io.github.jovalle.watchtower.tv.catalog

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
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
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import io.github.jovalle.watchtower.tv.platform.VoiceSearch
import io.github.jovalle.watchtower.tv.platform.WatchNextManager
import kotlinx.serialization.Serializable

@Serializable data object HomeRoute
@Serializable data class LibraryRoute(val sectionId: String, val title: String)
@Serializable data object SearchRoute
@Serializable data object ListsRoute
@Serializable data class DetailsRoute(val ratingKey: String)

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
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        items(row.items, key = { it.stableKey }) { item ->
                            MediaCard(graph, item) { item.ratingKey?.let(onDetails) }
                        }
                    }
                }
            }
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
fun LibraryScreen(graph: AppGraph, data: CatalogDataSource, route: LibraryRoute, onOpen: (String) -> Unit) {
    val model: LibraryViewModel = viewModel(key = route.sectionId) {
        LibraryViewModel(route.sectionId, data, graph.session::current, graph.session.identityChanges)
    }
    val state by model.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(28.dp)) {
        Text(route.title, fontSize = 34.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(vertical = 14.dp)) {
            listOf("titleSort:asc" to "A–Z", "addedAt:desc" to "Recently added", "year:desc" to "Year").forEach { (value, label) ->
                OutlinedButton(onClick = { model.setSort(value) }) { Text(label) }
            }
            listOf("all" to "All", "unwatched" to "Unwatched", "in_progress" to "In progress").forEach { (value, label) ->
                OutlinedButton(onClick = { model.setFilter(value) }) { Text(label) }
            }
        }
        if (state.error != null && state.items.isEmpty()) ErrorScreen(state.error.orEmpty(), model::reload)
        else MediaGrid(graph, state, model, onOpen)
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
fun SearchScreen(graph: AppGraph, data: CatalogDataSource, onOpen: (String) -> Unit) {
    val model: SearchViewModel = viewModel { SearchViewModel(data, graph.session::current, graph.session.identityChanges) }
    val state by model.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val voiceAvailable = remember(context) { VoiceSearch.isAvailable(context) }
    val voiceLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) VoiceSearch.firstResult(result.data)?.let(model::search)
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(32.dp)) {
        Text(stringResource(R.string.search), fontSize = 34.sp, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            BasicTextField(
                value = state.query,
                onValueChange = model::search,
                modifier = Modifier.weight(1f).background(Color.White).border(3.dp, MaterialTheme.colorScheme.primary).padding(15.dp).focusable(),
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
private fun SearchRow(graph: AppGraph, title: String, items: List<MediaSummary>, onOpen: (String) -> Unit) {
    if (items.isEmpty()) return
    Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 16.dp).semantics { heading() })
    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        items(items, key = { it.stableKey }) { item -> MediaCard(graph, item) { item.ratingKey?.let(onOpen) } }
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
    when {
        state.loading -> LoadingScreen()
        state.error != null && state.detail == null -> ErrorScreen(state.error.orEmpty(), model::reload)
        state.detail != null -> DetailsContent(graph, requireNotNull(state.detail), state, model, onOpen, onPlay)
    }
}

@Composable
private fun DetailsContent(
    graph: AppGraph,
    detail: MediaDetail,
    state: DetailState,
    model: DetailViewModel,
    onOpen: (String) -> Unit,
    onPlay: (PlayerRoute) -> Unit,
) {
    LazyColumn(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        item {
            Box(Modifier.fillMaxWidth().height(390.dp)) {
                CatalogImage(graph, detail.backdropUrl, detail.title, Modifier.fillMaxSize(), ContentScale.Crop)
                Box(Modifier.fillMaxSize().background(Color(0x77000000)))
                Column(Modifier.align(Alignment.BottomStart).padding(36.dp).fillMaxWidth(0.78f)) {
                    Text(detail.title, fontSize = 40.sp, fontWeight = FontWeight.Bold)
                    Text(detail.metadataLine(), fontSize = 17.sp)
                    detail.summary?.let { Text(it, fontSize = 17.sp, maxLines = 4, overflow = TextOverflow.Ellipsis) }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 14.dp)) {
                        DetailsPlaybackActions(detail, onPlay)
                        OutlinedButton(onClick = { model.setWatched(detail.viewCount == 0) }, enabled = !state.mutationInFlight) {
                            Text(if (detail.viewCount > 0) stringResource(R.string.mark_unwatched) else stringResource(R.string.mark_watched))
                        }
                        OutlinedButton(onClick = { model.setWatchlist(detail.onWatchlist != true) }, enabled = !state.mutationInFlight) {
                            Text(if (detail.onWatchlist == true) stringResource(R.string.remove_watchlist) else stringResource(R.string.add_watchlist))
                        }
                    }
                    state.message?.let { Text(stringResource(R.string.saved), color = MaterialTheme.colorScheme.primary) }
                    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            }
        }
        if (detail.versions.size > 1) item {
            Heading("Versions")
            LazyRow(Modifier.padding(horizontal = 32.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(detail.versions, key = { it.mediaId }) { version ->
                    Button(onClick = { detail.ratingKey?.let { onPlay(PlayerRoute(it, version.mediaId)) } }) { Text(version.label) }
                }
            }
        }
        if (detail.editions.isNotEmpty()) item {
            Heading("Editions")
            LazyRow(Modifier.padding(horizontal = 32.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(detail.editions, key = { it.ratingKey }) { edition ->
                    OutlinedButton(onClick = { onOpen(edition.ratingKey) }) { Text(edition.editionTitle ?: "Edition") }
                }
            }
        }
        if (state.seasons.isNotEmpty()) item {
            Heading(stringResource(R.string.seasons))
            LazyRow(Modifier.padding(horizontal = 32.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                items(state.seasons, key = { it.stableKey }) { season ->
                    MediaCard(graph, season, modifier = Modifier.onFocusChanged { if (it.isFocused) model.loadSeason(season) }) {
                        season.ratingKey?.let(onOpen)
                    }
                }
            }
            val episodes = state.episodes.values.flatten()
            if (episodes.isNotEmpty()) {
                Heading(stringResource(R.string.episodes))
                LazyRow(Modifier.padding(horizontal = 32.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(episodes, key = { it.stableKey }) { episode ->
                        MediaCard(graph, episode) { episode.ratingKey?.let(onOpen) }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(40.dp)) }
    }
}

@Composable
fun DetailsPlaybackActions(detail: MediaDetail, onPlay: (PlayerRoute) -> Unit) {
    val ratingKey = detail.ratingKey
    if (detail.playable && ratingKey != null) {
        Button(onClick = { onPlay(PlayerRoute(ratingKey, startPositionMs = null)) }) { Text(stringResource(R.string.play)) }
        OutlinedButton(onClick = { onPlay(PlayerRoute(ratingKey, startPositionMs = 0)) }) { Text(stringResource(R.string.start_over)) }
    }
}

@Composable
fun ListsScreen(graph: AppGraph, data: CatalogDataSource, onOpen: (String) -> Unit) {
    var source by remember { mutableStateOf("all") }
    var state by remember { mutableStateOf<LoadState<io.github.jovalle.watchtower.tv.api.WatchlistResponse>>(LoadState.Loading) }
    LaunchedEffect(source, graph.session.current()) {
        val snapshot = graph.session.current() ?: return@LaunchedEffect
        state = LoadState.Loading
        state = try {
            val result = data.watchlist(snapshot, source)
            if (graph.session.current() == snapshot) LoadState.Content(result) else LoadState.Loading
        } catch (error: Exception) {
            LoadState.Error(error.message ?: "Unable to load lists.")
        }
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(32.dp)) {
        Text(stringResource(R.string.my_lists), fontSize = 34.sp, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(vertical = 12.dp)) {
            listOf("all", "plex", "trakt", "imdb").forEach { value ->
                OutlinedButton(onClick = { source = value }) { Text(value.replaceFirstChar(Char::uppercase)) }
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
fun MediaCard(graph: AppGraph, item: MediaSummary, modifier: Modifier = Modifier, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val description = buildString {
        append(item.title)
        append(", ${item.type}")
        item.year?.let { append(", $it") }
        if (item.viewCount > 0) append(", watched")
        item.minutesLeft?.let { append(", $it minutes left") }
        if (item.external != null) append(", not in library")
    }
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
                if (item.viewCount > 0) Text("Watched", fontSize = 14.sp, modifier = Modifier.align(Alignment.TopEnd).background(Color.Black).padding(5.dp))
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

private val MediaSummary.stableKey: String get() = ratingKey ?: "${external?.provider}:${external?.id}:${external?.type}"
private val MediaSummary.progress: Float
    get() = if ((durationMs ?: 0) > 0) ((viewOffsetMs ?: 0).toFloat() / durationMs!!.toFloat()).coerceIn(0f, 1f) else 0f
private val MediaSummary.minutesLeft: Long?
    get() = durationMs?.let { duration -> viewOffsetMs?.let { ((duration - it).coerceAtLeast(0) / 60_000) } }

private fun MediaDetail.metadataLine(): String = listOfNotNull(
    year?.toString(),
    contentRating,
    durationMs?.let { "${it / 60_000} min" },
    audienceRating?.let { "Audience $it" },
    genres.takeIf { it.isNotEmpty() }?.joinToString(" • "),
).joinToString("  •  ")