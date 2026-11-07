package io.github.jovalle.watchtower.tv.catalog

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.itemsIndexed as listItemsIndexed
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.OutlinedButtonDefaults
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import coil3.ImageLoader
import coil3.compose.AsyncImage
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.MediaStatusBadge
import io.github.jovalle.watchtower.tv.ui.TvSymbol
import io.github.jovalle.watchtower.tv.ui.pointerClick
import io.github.jovalle.watchtower.tv.api.HomeResponse
import io.github.jovalle.watchtower.tv.api.ExternalId
import io.github.jovalle.watchtower.tv.api.LibraryLetter
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.PlaylistItem
import io.github.jovalle.watchtower.tv.api.PlaylistSummary
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import io.github.jovalle.watchtower.tv.platform.VoiceSearch
import io.github.jovalle.watchtower.tv.platform.WatchNextManager
import kotlinx.coroutines.launch
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
    onExternalDetails: ((MediaSummary) -> Unit)? = null,
) {
    val model: HomeViewModel = viewModel { HomeViewModel(data, graph.session::current, graph.session.identityChanges) }
    val refreshError by model.refreshError.collectAsStateWithLifecycle()
    val heroActions by model.heroActions.collectAsStateWithLifecycle()
    LifecycleResumeEffect(model) {
        if (model.state.value != LoadState.Loading) model.reload()
        onPauseOrDispose { }
    }
    Box(Modifier.fillMaxSize()) {
        when (val state = model.state.collectAsStateWithLifecycle().value) {
            LoadState.Loading -> LoadingScreen()
            is LoadState.Error -> ErrorScreen(state.message, model::reload)
            is LoadState.Content -> HomeContent(graph, state.value, watchNext, onDetails, onPlay, onExternalDetails,
                heroActions, model::selectHero, { action -> when (action) {
                    HeroAction.Watched -> model.setHeroWatched();HeroAction.Watchlist -> model.setHeroWatchlist();HeroAction.Dismiss -> model.dismissHero()
                } }, model::reload)
        }
        refreshError?.let { message ->
            Row(Modifier.align(Alignment.BottomCenter).padding(24.dp).background(MaterialTheme.colorScheme.surface).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(message, color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.weight(1f).semantics { liveRegion = LiveRegionMode.Polite })
                TvAction(stringResource(R.string.retry), TvSymbol.Refresh, model::reload)
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun HomeContent(
    graph: AppGraph, home: HomeResponse, watchNext: WatchNextManager,
    onDetails: (String) -> Unit, onPlay: (PlayerRoute) -> Unit,
    onExternalDetails: ((MediaSummary) -> Unit)? = null,
    heroActions: HeroActionsState = HeroActionsState(),
    onHeroSelected: (MediaSummary) -> Unit = {}, onHeroAction: (HeroAction) -> Unit = {}, onRefresh: () -> Unit = {},
) {
    val horizontalScrollSpec = LocalBringIntoViewSpec.current
    val verticalScrollSpec = remember {
        object : BringIntoViewSpec {
            override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float = when {
                offset < 0f -> offset
                offset + size > containerSize -> offset + size - containerSize
                else -> 0f
            }
        }
    }
    val pageState = rememberLazyListState()
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val snapshot = graph.session.current()
    val me = graph.session.currentMe()
    val rows = home.rows.filter { it.items.isNotEmpty() }.ifEmpty {
        if (home.hero.isEmpty()) emptyList() else listOf(io.github.jovalle.watchtower.tv.api.HomeRow("featured", "featured", stringResource(R.string.cat_recommended), home.hero))
    }
    var focusedRowId by rememberSaveable { mutableStateOf<String?>(null) }
    var focusedItemKey by rememberSaveable { mutableStateOf<String?>(null) }
    val hero = rows.firstOrNull { it.id == focusedRowId }?.items?.firstOrNull { it.stableKey == focusedItemKey }
        ?: focusedHomeItem(home, focusedItemKey)
    val heroFocus = remember { FocusRequester() }
    val posterFocus = remember { FocusRequester() }
    val restoreRowId = focusedRowId?.takeIf { id -> rows.any { it.id == id } } ?: rows.firstOrNull()?.id
    val restoreItems = rows.firstOrNull { it.id == restoreRowId }?.items.orEmpty()
    val restoreItemKey = restoreItems.firstOrNull { it.stableKey == focusedItemKey }?.stableKey ?: restoreItems.firstOrNull()?.stableKey
    LaunchedEffect(hero) { hero?.let(onHeroSelected) }
    LaunchedEffect(home, snapshot, me?.profile?.userId) {
        if (snapshot != null && me != null) {
            val items = home.rows.firstOrNull { it.kind == "continue_watching" }?.items.orEmpty().map { item ->
                item.copy(posterUrl = item.posterUrl?.let { runCatching { snapshot.resolve(it).toString() }.getOrNull() },
                    backdropUrl = item.backdropUrl?.let { runCatching { snapshot.resolve(it).toString() }.getOrNull() })
            }
            watchNext.sync(me.profile, me.server.machineId, items)
        }
    }
    BoxWithConstraints(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        hero?.let { ArtworkWash(graph, it.backdropUrl, it.title) }
        val bottomPadding = (maxHeight - 200.dp).coerceAtLeast(36.dp)
        CompositionLocalProvider(LocalBringIntoViewSpec provides verticalScrollSpec) {
            LazyColumn(state = pageState, modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 64.dp, end = 48.dp, bottom = bottomPadding),
                verticalArrangement = Arrangement.spacedBy(24.dp)) {
                hero?.let { featured -> item(key = "home-hero") {
                    Box(Modifier.padding(top = 32.dp, bottom = 8.dp)) {
                        val localKey = featured.ratingKey?.takeIf { it.isNotBlank() && featured.external == null }
                        HomeHero(graph, featured, heroActions,
                            rows.any { row -> row.kind == "continue_watching" && row.items.any { it.stableKey == featured.stableKey } },
                            heroFocus, onDown = {
                                if (restoreItemKey != null) scope.launch {
                                    val restored = runCatching { posterFocus.requestFocus() }.getOrDefault(false)
                                    if (!restored) {
                                        pageState.scrollToItem(rows.indexOfFirst { it.id == restoreRowId }.coerceAtLeast(0) + 1)
                                        withFrameNanos { };posterFocus.requestFocus()
                                    }
                                }
                            }, detailsEnabled = localKey != null || (featured.external != null && onExternalDetails != null),
                            onDetails = {
                                if (graph.session.current() == snapshot) {
                                    if (featured.external != null) onExternalDetails?.invoke(featured) else localKey?.let(onDetails)
                                }
                            }, onPlay = { if (graph.session.current() == snapshot) onPlay(it) }, onAction = onHeroAction)
                    }
                } }
                if (rows.isEmpty()) item {
                    val emptyFocus = remember { FocusRequester() }
                    LaunchedEffect(Unit) { emptyFocus.requestFocus() }
                    Column(Modifier.padding(top = 48.dp)) {
                        Text(stringResource(R.string.no_results), color = Color.LightGray)
                        TvAction(stringResource(R.string.hero_refresh_home), TvSymbol.Refresh, onRefresh, Modifier.focusRequester(emptyFocus))
                    }
                }
                rows.forEach { row -> item(key = row.id) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(row.title, fontSize = 16.sp, lineHeight = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
                        CompositionLocalProvider(LocalBringIntoViewSpec provides horizontalScrollSpec) {
                            FocusRestoringHomeRow(row.items, restoreItemKey.takeIf { row.id == restoreRowId },
                                { key -> focusedRowId = row.id;focusedItemKey = key }) { item, modifier ->
                                val savedPoster = row.id == restoreRowId && item.stableKey == restoreItemKey
                                MediaCard(graph, item, modifier.then(if (savedPoster) Modifier.focusRequester(posterFocus) else Modifier)
                                    .onPreviewKeyEvent { event ->
                                        if (row.id == rows.first().id && event.key == Key.DirectionUp &&
                                            (!hero?.ratingKey.isNullOrBlank() && hero?.external == null || (hero?.external != null && onExternalDetails != null))) {
                                            if (event.type == KeyEventType.KeyDown) scope.launch {
                                                pageState.scrollToItem(0);withFrameNanos { };heroFocus.requestFocus()
                                            }
                                            true
                                        } else false
                                    }, showTitle = false) {
                                    if (graph.session.current() == snapshot) {
                                        if (item.external != null) onExternalDetails?.invoke(item) else item.ratingKey?.let(onDetails)
                                    }
                                }
                            }
                        }
                    }
                } }
            }
        }
        AndroidView(factory = { android.widget.TextClock(it).apply {
            setTextColor(android.graphics.Color.LTGRAY);textSize = 12f;typeface = resources.getFont(R.font.inter);isFocusable = false
        } }, modifier = Modifier.align(Alignment.TopEnd).padding(top = 20.dp, end = 48.dp)
            .background(Color(0x44000000), RoundedCornerShape(4.dp)).padding(horizontal = 10.dp, vertical = 4.dp))
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
    LazyRow(state = listState, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
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
private fun ArtworkWash(graph: AppGraph, path: String?, title: String) {
    val background = Color(0xFF101113)
    Box(Modifier.fillMaxSize().background(background)) {
        if (path != null) CatalogImage(graph, path, title, Modifier.fillMaxSize(), ContentScale.Crop, fallbackText = false)
        Box(Modifier.fillMaxSize().drawWithCache {
            val horizontal = Brush.horizontalGradient(0f to background, 0.35f to background.copy(alpha = 0.94f),
                0.7f to background.copy(alpha = 0.25f), 1f to Color.Transparent)
            val vertical = Brush.verticalGradient(0f to Color.Transparent, 0.35f to Color.Transparent,
                0.75f to background.copy(alpha = 0.9f), 1f to background)
            onDrawBehind { drawRect(horizontal); drawRect(vertical) }
        })
    }
}

@Composable
private fun HeroSummary(graph: AppGraph, item: MediaSummary, modifier: Modifier = Modifier) {
    Column(modifier.width(420.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        CatalogTitle(graph, item.clearLogoUrl, item.showTitle ?: item.title)
        if (item.type == "episode") Text(item.title, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(listOfNotNull(
            if (item.type == "episode" && item.seasonNumber != null && item.episodeNumber != null) "S${item.seasonNumber} • E${item.episodeNumber}" else item.year?.toString(),
            item.durationMs?.let { stringResource(R.string.duration_minutes, it / 60_000) }, item.contentRating,
        ).joinToString("   "), fontSize = 11.sp, color = Color.LightGray)
        item.summary?.takeIf { it.isNotBlank() }?.let {
            Text(it, fontSize = 13.sp, lineHeight = 17.sp, color = Color(0xFFD0D0D0), maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
internal fun CatalogTitle(graph: AppGraph, logoUrl: String?, title: String, compact: Boolean = false) {
    var failed by remember(logoUrl) { mutableStateOf(false) }
    val snapshot = graph.session.current()
    val resolved = remember(logoUrl, snapshot) { logoUrl?.let { runCatching { snapshot?.resolve(it)?.toString() }.getOrNull() } }
    if (!failed && resolved != null && snapshot != null) {
        AsyncImage(model = resolved, imageLoader = graph.imageLoader(snapshot), contentDescription = title,
            modifier = Modifier.width(256.dp).height(if (compact) 64.dp else 80.dp), contentScale = ContentScale.Fit, alignment = Alignment.CenterStart,
            onError = { failed = true })
    } else {
        Text(title, fontSize = if (compact) 26.sp else 32.sp, lineHeight = if (compact) 28.sp else 36.sp, fontWeight = FontWeight.Bold, maxLines = 2,
            overflow = TextOverflow.Ellipsis, modifier = Modifier.semantics { heading() })
    }
}

@Composable
fun LibraryScreen(
    graph: AppGraph,
    data: CatalogDataSource,
    route: LibraryRoute,
    onOpen: (String) -> Unit,
    onCollections: () -> Unit,
    onPlaylist: ((PlaylistRoute) -> Unit)? = null,
) {
    val model: LibraryViewModel = viewModel(key = route.sectionId) {
        LibraryViewModel(route.sectionId, data, graph.session::current, graph.session.identityChanges)
    }
    val state by model.state.collectAsStateWithLifecycle()
    var options by remember { mutableStateOf<String?>(null) }
    val sortOptions = listOf(
        "titleSort:asc" to stringResource(R.string.sort_title),
        "addedAt:desc" to stringResource(R.string.sort_recently_added),
        LIBRARY_RELEASE_DATE_SORT to stringResource(R.string.cat_release_date),
    )
    val filterOptions = listOf(
        "all" to stringResource(R.string.filter_all),
        "unwatched" to stringResource(R.string.filter_unwatched),
        "in_progress" to stringResource(R.string.filter_in_progress),
    )
    val source = state.source
    val recommended: LibraryRecommendationsViewModel = viewModel(key = "recommended:${route.sectionId}") {
        LibraryRecommendationsViewModel(route.sectionId, data, graph.session::current, graph.session.identityChanges)
    }
    val recommendationState by recommended.state.collectAsStateWithLifecycle()
    var focusedRowId by rememberSaveable(route.sectionId) { mutableStateOf<String?>(null) }
    var focusedKey by rememberSaveable(route.sectionId) { mutableStateOf<String?>(null) }
    val rows = (recommendationState as? LoadState.Content)?.value.orEmpty()
    val home = HomeResponse(emptyList(), rows, emptyList())
    val hero = focusedHomeItem(home, focusedKey)
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        if (source == "categories") Box(Modifier.fillMaxSize()
            .background(Brush.linearGradient(listOf(Color(0xFF333333), Color(0xFF080808))))
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f)))))
        if (source == "recommended" && hero != null) ArtworkWash(graph, hero.backdropUrl, hero.title)
        Column(Modifier.fillMaxSize().padding(start = 64.dp, end = 48.dp, top = 16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(bottom = 12.dp)) {
                CatalogTab(stringResource(R.string.cat_recommended), source == "recommended", { model.setSource("recommended") })
                CatalogTab(stringResource(R.string.cat_browse), source == "browse", { model.setSource("browse") })
                CatalogTab(stringResource(R.string.collections), false, onCollections)
                if (onPlaylist != null) CatalogTab(stringResource(R.string.playlists), source == "playlists", { model.setSource("playlists") })
                CatalogTab(stringResource(R.string.cat_categories), source == "categories", { model.setSource("categories") })
            }
            when (source) {
                "recommended" -> when (val current = recommendationState) {
                    LoadState.Loading -> Text(stringResource(R.string.loading))
                    is LoadState.Error -> ErrorScreen(current.message, recommended::reload)
                    is LoadState.Content -> {
                        if (hero != null) HeroSummary(graph, hero, Modifier.heightIn(min = 190.dp))
                        if (rows.all { it.items.isEmpty() }) {
                            Text(stringResource(R.string.cat_no_recommendations), color = Color.LightGray)
                            CatalogTab(stringResource(R.string.cat_browse), false, { model.setSource("browse") })
                        }
                        RecommendedRows(graph, rows, focusedRowId, focusedKey, { rowId, key -> focusedRowId = rowId; focusedKey = key }, onOpen)
                    }
                }
                "browse" -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(bottom = 12.dp)) {
                        state.genre?.let { genre -> CatalogTab(genre, false, { model.setSource("categories") }) }
                        CatalogTab(filterOptions.firstOrNull { it.first == state.filter }?.second.orEmpty(), false, { options = "filter" })
                        Text(stringResource(R.string.cat_by), color = Color.LightGray, fontSize = 12.sp)
                        CatalogTab(sortOptions.firstOrNull { it.first == state.sort }?.second.orEmpty(), false, { options = "sort" })
                        if (state.genre != null) CatalogTab(stringResource(R.string.cat_clear), false, model::clearGenre)
                    }
                    if (state.error != null && state.items.isEmpty()) ErrorScreen(state.error.orEmpty(), model::reload)
                    else MediaGrid(graph, state, model, onOpen)
                }
                "categories" -> when {
                    state.genresLoading -> Text(stringResource(R.string.loading), modifier = Modifier.padding(top = 10.dp))
                    state.genresError != null -> Column {
                        Text(state.genresError.orEmpty(), color = MaterialTheme.colorScheme.error)
                        TvAction(stringResource(R.string.retry), TvSymbol.Refresh, model::loadGenres)
                    }
                    state.genres.isEmpty() -> Text(stringResource(R.string.cat_no_categories), modifier = Modifier.padding(top = 10.dp))
                    else -> LibraryCategories(graph, state.genres, state.focusedGenre, model::rememberGenre, model::selectGenre,
                        modifier = Modifier.padding(top = 2.dp), artwork = state.genreArtwork)
                }
                "playlists" -> {
                    val playlists: PlaylistsViewModel = viewModel(key = "source-playlists") {
                        PlaylistsViewModel(data, graph.session::current, graph.session.identityChanges)
                    }
                    when (val current = playlists.state.collectAsStateWithLifecycle().value) {
                        LoadState.Loading -> Text(stringResource(R.string.loading))
                        is LoadState.Error -> ErrorScreen(current.message, playlists::reload)
                        is LoadState.Content -> {
                            if (current.value.isEmpty()) Text(stringResource(R.string.no_playlists))
                            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(current.value, key = PlaylistSummary::playlistId) { playlist ->
                                    CatalogTab(stringResource(R.string.playlist_with_count, playlist.title, playlist.itemCount), false,
                                        { onPlaylist?.invoke(PlaylistRoute(playlist.playlistId, playlist.title, playlist.smart)) })
                                }
                            }
                        }
                    }
                }
            }
        }
        if (source == "browse" && state.sort.startsWith("titleSort:")) {
            if (state.letters.isNotEmpty()) LibraryLetterBar(state.letters, model::jumpToLetter,
                Modifier.align(Alignment.TopEnd).padding(top = 48.dp, end = 24.dp).heightIn(max = 432.dp))
            if (state.lettersError != null) TvAction(stringResource(R.string.retry), TvSymbol.Refresh, model::loadLetters,
                modifier = Modifier.align(Alignment.TopEnd).padding(top = 48.dp, end = 24.dp))
        }
    }
    options?.let { kind ->
        CatalogOptionsDialog(
            title = stringResource(if (kind == "sort") R.string.cat_sort_by else R.string.cat_filter),
            options = if (kind == "sort") sortOptions else filterOptions,
            selected = if (kind == "sort") state.sort else state.filter,
            onSelect = { value -> if (kind == "sort") model.setSort(value) else model.setFilter(value); options = null },
            onDismiss = { options = null },
        )
    }
}

@Composable
internal fun RecommendedRows(
    graph: AppGraph,
    rows: List<io.github.jovalle.watchtower.tv.api.HomeRow>,
    focusedRowId: String?,
    focusedKey: String?,
    onFocused: (String, String) -> Unit,
    onOpen: (String) -> Unit,
) {
    val restoreRowId = focusedRowId?.takeIf { id -> rows.any { it.id == id && it.items.isNotEmpty() } }
        ?: rows.firstOrNull { it.items.isNotEmpty() }?.id
    val restoreItems = rows.firstOrNull { it.id == restoreRowId }?.items.orEmpty()
    val restoreKey = restoreItems.firstOrNull { it.stableKey == focusedKey }?.stableKey ?: restoreItems.firstOrNull()?.stableKey
    LazyColumn(verticalArrangement = Arrangement.spacedBy(20.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)) {
        rows.forEach { row -> item(key = row.id) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.semantics { contentDescription = row.title }) {
                Text(row.title, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                FocusRestoringHomeRow(row.items,
                    restoreKey.takeIf { row.id == restoreRowId },
                    { onFocused(row.id, it) }) { item, modifier ->
                    MediaCard(graph, item, modifier, showTitle = false) { item.ratingKey?.let(onOpen) }
                }
            }
        } }
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
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(start = 64.dp, end = 48.dp, top = 16.dp, bottom = 24.dp)) {
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
                        val open = { onOpen(CollectionRoute(collection.collectionId, collection.title)) }
                        Button(
                            onClick = open,
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).pointerClick(onClick = open),
                            shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
                            scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
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
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(start = 64.dp, end = 48.dp, top = 16.dp, bottom = 24.dp)) {
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
    var restorePending by remember { mutableStateOf(true) }
    val gridState = rememberLazyGridState()
    LaunchedEffect(state.items, restorePending) {
        if (restorePending && state.items.isNotEmpty()) {
            val target = state.focusedIndex.coerceIn(0, state.items.lastIndex)
            gridState.scrollToItem(target)
            withFrameNanos { }
            requesters[target]?.requestFocus()
            restorePending = false
        }
    }
    LazyVerticalGrid(
        state = gridState,
        columns = GridCells.Fixed(6),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalArrangement = Arrangement.spacedBy(16.dp),
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
                TvAction(stringResource(R.string.retry), TvSymbol.Refresh, retry)
            }
        } }
    }
}

@Composable
private fun MediaGrid(graph: AppGraph, state: LibraryState, model: LibraryViewModel, onOpen: (String) -> Unit) {
    if (state.items.isEmpty() && !state.loading && state.error == null) {
        Text(stringResource(R.string.no_results), color = Color.LightGray)
        return
    }
    val requesters = remember { mutableMapOf<String, FocusRequester>() }
    var restorePending by remember(state.jumpVersion) { mutableStateOf(true) }
    val keys = state.items.mapNotNull { it.ratingKey }
    val target = restoredFocusIndex(state.focusedKey, state.focusedIndex, keys)
    val gridState = rememberLazyGridState()
    LaunchedEffect(state.items, restorePending) {
        if (restorePending && target >= 0) {
            gridState.scrollToItem(target)
            withFrameNanos { }
            requesters[keys[target]]?.requestFocus()
            restorePending = false
        }
    }
    LazyVerticalGrid(
        state = gridState,
        columns = GridCells.Fixed(6),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalArrangement = Arrangement.spacedBy(16.dp),
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
        state.error?.let { message -> item(key = "error") {
            Column { Text(message, color = MaterialTheme.colorScheme.error)
                TvAction(stringResource(R.string.retry), TvSymbol.Refresh, model::loadNext) }
        } }
    }
}

@Composable
fun MediaDetailsScreen(
    graph: AppGraph,
    data: CatalogDataSource,
    route: DetailsRoute,
    onOpen: (String) -> Unit,
    onPlay: (PlayerRoute) -> Unit,
    onPerson: (PersonRoute) -> Unit = {},
) {
    val model: DetailViewModel = viewModel(key = route.ratingKey) {
        DetailViewModel(route.ratingKey, data, graph.session::current, graph.session.identityChanges)
    }
    val state by model.state.collectAsStateWithLifecycle()
    val detail = state.detail
    val tmdbId = state.requestTmdbId
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
            data,
            requireNotNull(state.detail),
            state,
            model,
            requests.state.collectAsStateWithLifecycle().value,
            requests,
            onOpen,
            onPlay,
            onPerson,
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DetailsContent(
    graph: AppGraph,
    data: CatalogDataSource,
    detail: MediaDetail,
    state: DetailState,
    model: DetailViewModel,
    requestState: RequestState,
    requestModel: RequestActionsViewModel,
    onOpen: (String) -> Unit,
    onPlay: (PlayerRoute) -> Unit,
    onPerson: (PersonRoute) -> Unit,
) {
    var selectedMediaId by rememberSaveable(detail.ratingKey) { mutableStateOf<String?>(null) }
    val selectedVersion = detail.versions.firstOrNull { it.mediaId == selectedMediaId } ?: detail.versions.firstOrNull()
    val horizontalScrollSpec = LocalBringIntoViewSpec.current
    val actionsEnabled = state.actionsReady && !state.mutationInFlight
    var showPlaylists by remember { mutableStateOf(false) }
    var showIssue by remember { mutableStateOf(false) }
    var returnToCast by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(requestState.completedOperation) {
        if (requestState.completedOperation == RequestOperation.Issue) showIssue = false
    }
    var focusedEpisode by rememberSaveable { mutableStateOf<String?>(detail.ratingKey.takeIf { detail.type == "episode" }) }
    val seasonKey = state.selectedSeasonKey
    val episodic = seasonKey != null
    val hasSeriesNavigation = state.seriesDetail != null || state.seasons.isNotEmpty()
    val episodePage = state.episodes[seasonKey] ?: PagedState()
    val episodeKeys = episodePage.items.map(MediaSummary::stableKey)
    val episodeRequesters = remember(episodeKeys) { episodeKeys.associateWith { FocusRequester() } }
    val episodeList = rememberLazyListState()
    var restoredSeason by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(seasonKey, episodeKeys) {
        if (seasonKey != null && episodeKeys.isNotEmpty() && restoredSeason != seasonKey) {
            val index = restoredFocusIndex(focusedEpisode, 0, episodeKeys)
            episodeList.scrollToItem(index)
            withFrameNanos { }
            episodeRequesters[episodeKeys[index]]?.requestFocus()
            restoredSeason = seasonKey
        }
    }
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
    ArtworkWash(graph, detail.backdropUrl, detail.title)
    DetailScrollColumn {
        item {
            Column(Modifier.padding(start = 64.dp, end = 48.dp, top = if (hasSeriesNavigation) 16.dp else 60.dp)) {
                if (hasSeriesNavigation) {
                    CompositionLocalProvider(LocalBringIntoViewSpec provides horizontalScrollSpec) {
                        DetailSeasonTabs(state, { restoredSeason = null; model.selectShowOverview() },
                            { season -> restoredSeason = null; model.loadSeason(season) }, model::loadSeasonsNear, model::retrySeasons)
                    }
                }
                Column(Modifier.width(420.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    CatalogTitle(graph, detail.clearLogoUrl, detail.showTitle ?: detail.title)
                    if (detail.type == "episode") Text(detail.title, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    EnrichedDetailMetadata(graph, data, detail)
                    if (detail.type == "episode" && detail.seasonNumber != null && detail.episodeNumber != null) {
                        Text(stringResource(R.string.cat_episode_context, detail.seasonNumber, detail.episodeNumber), fontSize = 11.sp, color = Color.LightGray)
                    }
                    detail.summary?.takeIf { it.isNotBlank() }?.let {
                        Text(it, fontSize = 13.sp, lineHeight = 16.sp, maxLines = 3, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(top = 8.dp))
                    }
                }
                if (episodic) Spacer(Modifier.height(16.dp))
                else DetailsActionRow(
                    detail = detail,
                    enabled = actionsEnabled,
                    issueEnabled = requestState.enabled,
                    onPlay = onPlay,
                    onSetWatched = { model.setWatched(detail.viewCount == 0) },
                    onSetWatchlist = { model.setWatchlist(detail.onWatchlist != true) },
                    onAddToPlaylist = { model.loadPlaylists(); showPlaylists = true },
                    onReportIssue = { requestModel.clearFeedback(); showIssue = true },
                    onRating = model::setRating,
                    modifier = Modifier.padding(top = 10.dp),
                    initialPlaybackFocus = !returnToCast,
                    mediaId = selectedVersion?.mediaId, onRetryWatchlist = model::loadWatchlist, pending = state.mutationInFlight, actionError = state.error.takeIf { state.actionsReady },
                )
                if (detail.directors.isNotEmpty()) Text(stringResource(R.string.cat_directed_by, detail.directors.joinToString(", ")),
                    fontSize = 12.sp, color = Color.LightGray, modifier = Modifier.padding(top = 2.dp))
                if (state.episodeLoading) Text(stringResource(R.string.loading), color = Color.LightGray)
                state.error?.takeIf { !state.actionsReady }?.let {
                    Text(it, color = MaterialTheme.colorScheme.error)
                    if (!state.actionsReady && state.selectedEpisodeKey != null) TvAction(stringResource(R.string.retry), TvSymbol.Refresh,
                        { model.selectEpisode(state.selectedEpisodeKey) })
                }
                requestState.message?.let { Text(stringResource(R.string.issue_submitted), color = MaterialTheme.colorScheme.primary) }
                requestState.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        }
        if (episodic) {
            item {
                CompositionLocalProvider(LocalBringIntoViewSpec provides horizontalScrollSpec) {
                    LazyRow(state = episodeList, contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 64.dp, end = 48.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        listItemsIndexed(episodePage.items, key = { _, episode -> episode.stableKey }) { index, episode ->
                            EpisodeCard(graph, episode, Modifier.focusRequester(requireNotNull(episodeRequesters[episode.stableKey]))
                                .onFocusChanged {
                                    if (it.isFocused) {
                                        focusedEpisode = episode.stableKey
                                        episode.ratingKey?.let(model::selectEpisode)
                                        model.loadEpisodesNear(requireNotNull(seasonKey), index)
                                    }
                                }, onClick = {
                                    if (state.actionsReady && state.selectedEpisodeKey == episode.ratingKey) episode.ratingKey?.let { onPlay(PlayerRoute(it)) }
                                })
                        }
                        if (episodePage.loading) item { Text(stringResource(R.string.loading)) }
                        episodePage.error?.let { message -> item {
                            Column { Text(message, color = MaterialTheme.colorScheme.error)
                                TvAction(stringResource(R.string.retry), TvSymbol.Refresh, { model.retryEpisodes(requireNotNull(seasonKey)) }) }
                        } }
                    }
                }
                DetailsActionRow(detail, actionsEnabled, requestState.enabled, onPlay,
                    { model.setWatched(detail.viewCount == 0) }, { model.setWatchlist(detail.onWatchlist != true) },
                    { model.loadPlaylists(); showPlaylists = true }, { requestModel.clearFeedback(); showIssue = true },
                    modifier = Modifier.padding(start = 64.dp, top = 12.dp), onRating = model::setRating,
                    initialPlaybackFocus = false, mediaId = selectedVersion?.mediaId, onRetryWatchlist = model::loadWatchlist,
                    pending = state.mutationInFlight, actionError = state.error.takeIf { state.actionsReady })
            }
        }
        if (detail.versions.isNotEmpty()) item {
            TechnicalMediaDetails(detail.versions, selectedVersion?.mediaId,
                { id -> if (detail.versions.any { it.mediaId == id }) selectedMediaId = id },
                Modifier.padding(start = 64.dp, end = 48.dp, top = 12.dp, bottom = 12.dp))
        }
        if (detail.editions.isNotEmpty()) item {
            Heading(stringResource(R.string.editions))
            CompositionLocalProvider(LocalBringIntoViewSpec provides horizontalScrollSpec) {
                LazyRow(Modifier.padding(start = 64.dp, end = 48.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(detail.editions, key = { it.ratingKey }) { edition ->
                        val open = { onOpen(edition.ratingKey) }
                        OutlinedButton(
                            onClick = open, enabled = actionsEnabled, modifier = Modifier.heightIn(min = 48.dp).pointerClick(enabled = actionsEnabled, onClick = open),
                            shape = OutlinedButtonDefaults.shape(RoundedCornerShape(4.dp)),
                            scale = OutlinedButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
                        ) {
                            Text(edition.editionTitle ?: stringResource(R.string.edition))
                        }
                    }
                }
            }
        }
        if (detail.cast.isNotEmpty()) item {
            Heading(stringResource(R.string.cat_cast))
            CompositionLocalProvider(LocalBringIntoViewSpec provides horizontalScrollSpec) {
                Box(Modifier.padding(start = 64.dp, end = 48.dp)) {
                    CastShelf(graph, detail.cast, returnToCast, { returnToCast = false }) { person ->
                        val sourceKey = detail.ratingKey
                        val personId = person.id
                        if (sourceKey != null && personId != null) {
                            returnToCast = true
                            onPerson(PersonRoute(sourceKey, personId, person.name))
                        }
                    }
                }
            }
        }
        if (!detail.summary.isNullOrBlank()) item {
            Heading(stringResource(R.string.cat_overview))
            Text(detail.summary, fontSize = 17.sp, modifier = Modifier.padding(start = 64.dp, end = 48.dp).fillMaxWidth(0.85f).focusable())
        }
        item { Spacer(Modifier.height(40.dp)) }
    }
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
            busy = requestState.mutationInFlight || !state.actionsReady,
            onSubmit = { issueType, message -> if (state.actionsReady) requestModel.reportIssue(issueType, message) },
            onDismiss = { showIssue = false },
            error = requestState.error,
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun DetailScrollColumn(content: LazyListScope.() -> Unit) {
    val scrollSpec = remember {
        object : BringIntoViewSpec {
            override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float = when {
                offset < 0f -> offset
                offset + size > containerSize -> offset + size - containerSize
                else -> 0f
            }
        }
    }
    CompositionLocalProvider(LocalBringIntoViewSpec provides scrollSpec) {
        LazyColumn(Modifier.fillMaxSize(), content = content)
    }
}

@Composable
internal fun DetailSeasonTabs(
    state: DetailState,
    onShow: () -> Unit,
    onSeason: (MediaSummary) -> Unit,
    onSeasonsNear: (Int) -> Unit = {},
    onRetry: () -> Unit = {},
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 16.dp)) {
        if (state.seriesDetail != null) item(key = "show") {
            CatalogTab(stringResource(R.string.cat_show), state.selectedSeasonKey == null, onShow)
        }
        listItemsIndexed(state.seasons, key = { _, season -> season.stableKey }) { index, season ->
            CatalogTab(season.title, season.ratingKey == state.selectedSeasonKey, { onSeason(season) },
                Modifier.onFocusChanged { if (it.isFocused) onSeasonsNear(index) })
        }
        if (state.seasonsError != null) item { TvAction(stringResource(R.string.retry), TvSymbol.Refresh, onRetry) }
    }
}

@Composable
internal fun PlaylistChooserDialog(
    state: LoadState<List<PlaylistSummary>>?,
    onChoose: (String) -> Unit,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
) {
    val primary = remember { FocusRequester() }
    val firstEnabled = (state as? LoadState.Content)?.value?.firstOrNull { !it.smart }?.playlistId
    CatalogDialogPanel(stringResource(R.string.choose_playlist), onDismiss) {
            LaunchedEffect(state) { primary.requestFocus() }
            when (state) {
                null, LoadState.Loading -> Text(stringResource(R.string.loading))
                is LoadState.Error -> TvAction(stringResource(R.string.retry), TvSymbol.Refresh, onRetry, modifier = Modifier.focusRequester(primary))
                is LoadState.Content -> {
                    if (state.value.isEmpty()) Text(stringResource(R.string.no_playlists))
                    state.value.forEach { playlist ->
                        val choose = { onChoose(playlist.playlistId) }
                        Button(
                            onClick = choose,
                            enabled = !playlist.smart,
                            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)
                                .pointerClick(enabled = !playlist.smart, onClick = choose)
                                .then(if (playlist.playlistId == firstEnabled) Modifier.focusRequester(primary) else Modifier),
                            shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
                            scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
                        ) { Text(playlist.title) }
                    }
                }
            }
            TvAction(
                stringResource(R.string.cancel), TvSymbol.Close, onDismiss,
                modifier = if (state !is LoadState.Error && firstEnabled == null) Modifier.focusRequester(primary) else Modifier,
            )
    }
}

@Composable
internal fun IssueDialog(
    busy: Boolean,
    onSubmit: (Int, String) -> Unit,
    onDismiss: () -> Unit,
    error: String? = null,
) {
    var issueType by remember { mutableStateOf(4) }
    var message by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current
    val primary = remember { FocusRequester() }
    val messageDescription = stringResource(R.string.cat_issue_message)
    LaunchedEffect(Unit) { primary.requestFocus() }
    Dialog(onDismissRequest = onDismiss) {
        BackHandler(onBack = onDismiss)
        Column(
            Modifier.width(560.dp).heightIn(max = 480.dp).background(MaterialTheme.colorScheme.surface)
                .verticalScroll(rememberScrollState()).padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.report_issue), fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(1 to R.string.issue_video, 2 to R.string.issue_audio, 3 to R.string.issue_subtitles, 4 to R.string.issue_other)
                    .forEach { (value, label) ->
                        val choose = { issueType = value }
                        OutlinedButton(
                            onClick = choose,
                            modifier = (if (value == 4) Modifier.focusRequester(primary) else Modifier)
                                .heightIn(min = 48.dp).pointerClick(onClick = choose),
                            shape = OutlinedButtonDefaults.shape(RoundedCornerShape(4.dp)),
                            scale = OutlinedButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
                        ) {
                            Text(if (issueType == value) stringResource(R.string.selected_option, stringResource(label)) else stringResource(label))
                        }
                    }
            }
            Text(messageDescription, fontSize = 16.sp, color = Color.LightGray)
            BasicTextField(
                value = message,
                onValueChange = { message = it.take(240) },
                modifier = Modifier.fillMaxWidth().background(Color.White).padding(14.dp)
                    .semantics { contentDescription = messageDescription }
                    .onPreviewKeyEvent { it.type == KeyEventType.KeyDown && it.key == Key.DirectionDown && focusManager.moveFocus(FocusDirection.Down) },
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.Black, fontSize = 19.sp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { focusManager.moveFocus(FocusDirection.Down) }),
                singleLine = true,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TvAction(stringResource(R.string.submit_issue), TvSymbol.Send, { onSubmit(issueType, message) }, enabled = !busy && message.isNotBlank(), primary = true)
                TvAction(stringResource(R.string.cancel), TvSymbol.Close, onDismiss)
            }
            if (busy) Text(stringResource(R.string.saving), color = Color.LightGray)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
        }
    }
}

@Composable
fun ExternalDetailsScreen(graph: AppGraph, data: CatalogDataSource, route: ExternalDetailsRoute,
    onOpenLocal: (String) -> Unit = {}, onBack: () -> Unit = {}) {
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
    LaunchedEffect(state.completedOperation) {
        if (state.completedOperation == RequestOperation.Issue) showIssue = false
    }
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        CatalogImage(graph, route.backdropUrl, route.title, Modifier.fillMaxSize(), ContentScale.Crop, fallbackText = false)
        Box(Modifier.fillMaxSize().background(Color(0xAA000000)))
        Column(
            Modifier.align(Alignment.BottomStart).padding(start = 64.dp, end = 48.dp, bottom = 48.dp).fillMaxWidth(0.72f),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(route.title, fontSize = 40.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
            route.year?.let { Text(it.toString(), fontSize = 18.sp) }
            ExternalRequestActions(state, route.type, model::request,
                { model.clearFeedback(); showIssue = true }, model::load, onOpenLocal, onBack, focusActions = !showIssue)
        }
    }
    if (showIssue) {
        IssueDialog(
            busy = state.mutationInFlight,
            onSubmit = model::reportIssue,
            onDismiss = { showIssue = false },
            error = state.error,
        )
    }
}

@Composable
internal fun ExternalRequestActions(
    state: RequestState, type: String, onRequest: () -> Unit, onReport: () -> Unit, onRetry: () -> Unit,
    onOpenLocal: (String) -> Unit, onBack: () -> Unit, focusActions: Boolean = true,
) {
    val primary = remember { FocusRequester() }
    val availability = state.availability
    val localKey = availability?.ratingKey?.takeIf { it.isNotBlank() }
    val canReport = state.enabled && availability != null &&
        (localKey != null || availability.status in listOf("available", "partially_available"))
    val showRequest = state.requestEligible || state.loading
    LaunchedEffect(state.loading, availability, state.error, focusActions) {
        if (focusActions && !state.loading) primary.requestFocus()
    }
    if (!state.enabled) Text(stringResource(R.string.requests_unavailable_profile), color = Color.LightGray)
    if (state.loading) Text(stringResource(R.string.checking_availability), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
    else if (availability != null) {
        val label = stringResource(when (availability.status) {
            "available" -> R.string.services_available
            "partially_available" -> R.string.request_partially_available
            "pending" -> if (availability.requests.any { !it.is4k && it.status == "pending" })
                R.string.request_awaiting_approval else R.string.services_pending
            "processing" -> R.string.services_processing
            "blocklisted" -> R.string.request_blocked
            else -> if (!state.requestEligible) R.string.request_already_requested else R.string.request_not_available
        })
        MediaStatusBadge(label, if (availability.status == "unknown" && !state.requestEligible) "pending" else availability.status)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (localKey != null) TvAction(stringResource(R.string.open_library_title), TvSymbol.Info, { onOpenLocal(localKey) },
            modifier = Modifier.focusRequester(primary), primary = true, enabled = !state.mutationInFlight)
        if (showRequest) TvAction(stringResource(if (type in listOf("tv", "show") && availability?.status == "partially_available")
            R.string.request_missing_seasons else R.string.request_media), TvSymbol.Requests, onRequest,
            modifier = if (localKey == null) Modifier.focusRequester(primary) else Modifier,
            primary = localKey == null, enabled = state.canRequest)
        if (canReport) TvAction(stringResource(R.string.report_issue), TvSymbol.Issues, onReport,
            modifier = if (localKey == null && !showRequest) Modifier.focusRequester(primary) else Modifier, enabled = !state.mutationInFlight)
        if (state.error != null) TvAction(stringResource(R.string.retry), TvSymbol.Refresh, onRetry,
            modifier = if (localKey == null && !showRequest && !canReport) Modifier.focusRequester(primary) else Modifier, enabled = !state.mutationInFlight)
        TvAction(stringResource(R.string.services_back), TvSymbol.Back, onBack,
            modifier = if (localKey == null && !showRequest && !canReport && state.error == null) Modifier.focusRequester(primary) else Modifier)
    }
    if (state.mutationInFlight) Text(stringResource(R.string.saving), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
    state.message?.let { Text(stringResource(if (state.completedOperation == RequestOperation.Issue) R.string.issue_submitted else R.string.request_submitted),
        color = MaterialTheme.colorScheme.primary, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
}

@Composable
fun DetailsPlaybackActions(
    detail: MediaDetail,
    onPlay: (PlayerRoute) -> Unit,
    initialFocus: Boolean = true,
    enabled: Boolean = true,
) {
    val ratingKey = detail.ratingKey
    if (detail.playable && detail.type in listOf("movie", "episode") && ratingKey != null) {
        // Land D-pad focus on the primary action when details open (some devices assign no initial focus).
        val playFocus = remember { FocusRequester() }
        LaunchedEffect(ratingKey) { if (initialFocus && enabled) runCatching { playFocus.requestFocus() } }
        TvAction(
            if ((detail.viewOffsetMs ?: 0) > 0) stringResource(R.string.resume) else stringResource(R.string.play),
            TvSymbol.Play, { onPlay(PlayerRoute(ratingKey, startPositionMs = null)) },
            modifier = Modifier.focusRequester(playFocus), primary = true, enabled = enabled,
        )
        TvAction(stringResource(R.string.start_over), TvSymbol.Restart, { onPlay(PlayerRoute(ratingKey, startPositionMs = 0)) }, enabled = enabled)
    }
}

@Composable
fun ListsScreen(
    graph: AppGraph,
    data: CatalogDataSource,
    onOpen: (String) -> Unit,
    onPlaylist: (PlaylistRoute) -> Unit,
    onExternalDetails: ((MediaSummary) -> Unit)? = null,
) {
    val playlists: PlaylistsViewModel = viewModel {
        PlaylistsViewModel(data, graph.session::current, graph.session.identityChanges)
    }
    LifecycleResumeEffect(playlists) {
        if (playlists.state.value != LoadState.Loading) playlists.reload()
        onPauseOrDispose { }
    }
    var source by rememberSaveable { mutableStateOf("all") }
    var retry by remember { mutableStateOf(0) }
    var generation by remember { mutableStateOf(0) }
    var state by remember { mutableStateOf<LoadState<io.github.jovalle.watchtower.tv.api.WatchlistResponse>>(LoadState.Loading) }
    val loadFailed = stringResource(R.string.lists_load_failed)
    LaunchedEffect(source, retry, graph.session.current()) {
        state = LoadState.Loading
        val snapshot = graph.session.current() ?: return@LaunchedEffect
        val requestedSource = source
        val attempt = ++generation
        try {
            val result = data.watchlist(snapshot, requestedSource)
            if (graph.session.current() == snapshot && generation == attempt) state = LoadState.Content(result)
        } catch (cancelled: kotlinx.coroutines.CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            if (graph.session.current() == snapshot && generation == attempt) state = LoadState.Error(error.message ?: loadFailed)
        }
    }
    MyListsContent(graph, playlists.state.collectAsStateWithLifecycle().value, state, source,
        { source = it }, playlists::reload, { retry++ }, onOpen, onPlaylist, onExternalDetails)
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
    val requesters = remember { mutableMapOf<String, FocusRequester>() }
    val listState = rememberLazyListState()
    var restorePending by remember { mutableStateOf(true) }
    LaunchedEffect(state.items, state.loading, restorePending) {
        if (restorePending && !state.loading && state.items.isNotEmpty()) {
            val index = state.focusedIndex.coerceIn(0, state.items.lastIndex)
            listState.scrollToItem(index)
            withFrameNanos { }
            runCatching { requesters[state.items[index].playlistItemId]?.requestFocus() }
            restorePending = false
        }
    }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(start = 64.dp, end = 48.dp, top = 16.dp, bottom = 24.dp)) {
        Text(route.title, fontSize = 34.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        if (route.smart) Text(stringResource(R.string.smart_playlist_read_only), color = Color.LightGray)
        if (state.error != null && state.items.isEmpty()) {
            ErrorScreen(state.error.orEmpty(), model::retry)
        } else if (state.items.isEmpty() && !state.loading) {
            Text(stringResource(R.string.playlist_empty), modifier = Modifier.padding(top = 18.dp))
        } else {
            LazyColumn(state = listState, verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 14.dp)) {
                listItemsIndexed(state.items, key = { _, item -> item.playlistItemId }) { index, item ->
                    val requester = remember(item.playlistItemId) { FocusRequester().also { requesters[item.playlistItemId] = it } }
                    PlaylistItemActions(
                        item = item,
                        smart = route.smart,
                        modifier = Modifier.focusRequester(requester).onFocusChanged {
                            if (it.hasFocus) { model.rememberFocus(index); model.loadNear(index) }
                        },
                        onOpen = onOpen,
                        onPlay = onPlay,
                        onRemove = { pendingRemoval = item },
                        removalEnabled = !state.loading,
                        graph = graph,
                    )
                }
                if (state.loading) item(key = "loading") { Text(stringResource(R.string.loading)) }
                state.error?.let { message -> item(key = "error") {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(message, color = MaterialTheme.colorScheme.error)
                        TvAction(stringResource(R.string.retry), TvSymbol.Refresh, model::retry)
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
            onConfirm = { pendingRemoval = null; restorePending = true; model.remove(item) },
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
    removalEnabled: Boolean = true,
    graph: AppGraph? = null,
) {
    Row(
        modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val artwork = Modifier.width(64.dp).height(96.dp).clip(RoundedCornerShape(4.dp))
        if (graph != null) CatalogImage(graph, item.posterUrl ?: item.thumbUrl, item.title, artwork, ContentScale.Crop)
        else CatalogImageContent(null, null, item.title, artwork, ContentScale.Crop)
        Column(Modifier.weight(1f)) {
            Text(item.title, fontSize = 20.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            item.showTitle?.let { Text(it, color = Color.LightGray, fontSize = 16.sp) }
            item.year?.let { Text(it.toString(), color = Color.LightGray, fontSize = 12.sp) }
        }
        TvAction(stringResource(R.string.play), TvSymbol.Play, { item.ratingKey?.let { onPlay(PlayerRoute(it)) } },
            enabled = item.ratingKey != null, description = stringResource(R.string.play_item, item.title))
        TvAction(stringResource(R.string.details), TvSymbol.Info, { item.ratingKey?.let(onOpen) }, enabled = item.ratingKey != null)
        val loadingDescription = stringResource(R.string.loading)
        TvAction(stringResource(R.string.remove_from_playlist), TvSymbol.Close, onRemove,
            stateDescription = loadingDescription.takeIf { !removalEnabled && !smart },
            enabled = !smart && removalEnabled)
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
            Modifier.width(520.dp).background(MaterialTheme.colorScheme.surface).padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(title, fontSize = 26.sp, fontWeight = FontWeight.Bold)
            Text(message, fontSize = 18.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TvAction(confirmLabel, TvSymbol.Check, onConfirm, modifier = Modifier.focusRequester(primary), primary = true)
                TvAction(stringResource(R.string.cancel), TvSymbol.Close, onDismiss)
            }
        }
    }
}

@Composable
fun MediaCard(graph: AppGraph, item: MediaSummary, modifier: Modifier = Modifier, showTitle: Boolean = true, onClick: () -> Unit) {
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
        modifier = modifier.wrapContentWidth(Alignment.Start).width(112.dp).onFocusChanged { focused = it.isFocused }
            .pointerClick(onClick = onClick)
            .semantics { contentDescription = description; role = Role.Button },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(4.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1f),
        colors = ClickableSurfaceDefaults.colors(containerColor = Color.Transparent, focusedContainerColor = Color.Transparent),
    ) {
        Column {
            Box(Modifier.width(112.dp).height(168.dp).clip(RoundedCornerShape(4.dp))) {
                CatalogImage(graph, item.posterUrl ?: item.thumbUrl, item.title, Modifier.fillMaxSize(), ContentScale.Crop, fallbackText = !showTitle)
                if (item.external != null) Text(
                    stringResource(R.string.not_in_library),
                    color = Color.White,
                    fontSize = 9.sp,
                    lineHeight = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.align(Alignment.TopStart).background(Color.Black).padding(horizontal = 4.dp, vertical = 3.dp),
                )
                if (item.viewCount > 0) Box(Modifier.align(Alignment.TopEnd).size(20.dp)
                    .background(Color(0xAA000000), RoundedCornerShape(bottomStart = 4.dp)), contentAlignment = Alignment.Center) {
                    Icon(painterResource(TvSymbol.Check.resource), contentDescription = null, modifier = Modifier.size(10.dp), tint = Color.White)
                }
                val progress = item.progress
                if (progress > 0f) {
                    Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(3.dp).background(Color(0xAA000000)))
                    Box(Modifier.align(Alignment.BottomStart).fillMaxWidth(progress).height(3.dp).background(MaterialTheme.colorScheme.primary))
                }
                if (focused) Box(Modifier.fillMaxSize().border(1.5.dp, Color.White, RoundedCornerShape(4.dp)))
            }
            if (showTitle) {
                Text(item.title, color = Color.White, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                item.year?.let { Text(it.toString(), color = Color.LightGray, fontSize = 10.sp, modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
            }
        }
    }
}

@Composable
private fun EpisodeCard(graph: AppGraph, episode: MediaSummary, modifier: Modifier = Modifier, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Surface(onClick = onClick, modifier = modifier.width(256.dp).height(144.dp).onFocusChanged { focused = it.isFocused }
        .pointerClick(onClick = onClick).semantics { contentDescription = episode.title },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(4.dp)), scale = ClickableSurfaceDefaults.scale(focusedScale = 1f)) {
        Box(Modifier.fillMaxSize()) {
            CatalogImage(graph, episode.thumbUrl ?: episode.posterUrl, episode.title, Modifier.fillMaxSize(), ContentScale.Crop)
            episode.episodeNumber?.let { Text("E$it", color = Color.White, fontSize = 11.sp, modifier = Modifier.align(Alignment.TopEnd).background(Color(0xCC000000)).padding(5.dp)) }
            if (episode.progress > 0f) {
                Box(Modifier.align(Alignment.BottomStart).padding(6.dp).fillMaxWidth().height(3.dp).background(Color(0xAA000000)))
                Box(Modifier.align(Alignment.BottomStart).padding(6.dp).fillMaxWidth(episode.progress).height(3.dp).background(MaterialTheme.colorScheme.primary))
            }
            if (focused) Box(Modifier.fillMaxSize().border(1.5.dp, Color.White, RoundedCornerShape(4.dp)))
        }
    }
}

@Composable
internal fun LibraryLetterBar(letters: List<LibraryLetter>, onJump: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.width(20.dp).verticalScroll(rememberScrollState()), horizontalAlignment = Alignment.CenterHorizontally) {
        letters.forEach { entry ->
            var focused by remember(entry.letter) { mutableStateOf(false) }
            val jump = { onJump(entry.cursor) }
            val description = stringResource(R.string.cat_jump_letter, entry.letter)
            Surface(onClick = jump,
                modifier = Modifier.width(20.dp).height(15.dp).onFocusChanged { focused = it.isFocused }
                    .pointerClick(onClick = jump).semantics { contentDescription = description },
                shape = ClickableSurfaceDefaults.shape(CircleShape), scale = ClickableSurfaceDefaults.scale(focusedScale = 1f),
                colors = ClickableSurfaceDefaults.colors(containerColor = Color.Transparent, focusedContainerColor = Color.White)) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(entry.letter, color = if (focused) Color.Black else Color.LightGray, fontSize = 10.sp, maxLines = 1)
                }
            }
        }
    }
}

@Composable
internal fun CatalogTab(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(onClick = onClick, enabled = enabled, modifier = modifier.heightIn(min = 32.dp).pointerClick(enabled = enabled, onClick = onClick)
        .semantics { this.selected = selected; contentDescription = label },
        shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
        colors = ButtonDefaults.colors(containerColor = if (selected) Color(0x33FFFFFF) else Color.Transparent,
            contentColor = if (selected) Color.White else Color.LightGray, focusedContainerColor = Color.White, focusedContentColor = Color.Black),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp),
        scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f)) {
        Text(label, fontSize = 13.sp, maxLines = 1)
    }
}

@Composable
internal fun CatalogImage(graph: AppGraph, path: String?, title: String, modifier: Modifier, scale: ContentScale, fallbackText: Boolean = true) {
    val snapshot = graph.session.current()
    val resolved = remember(path, snapshot) { path?.let { runCatching { snapshot?.resolve(it)?.toString() }.getOrNull() } }
    CatalogImageContent(resolved, snapshot?.let(graph::imageLoader), title, modifier, scale, fallbackText)
}

@Composable
internal fun CatalogImageContent(url: String?, imageLoader: ImageLoader?, title: String, modifier: Modifier, scale: ContentScale, fallbackText: Boolean = true) {
    var failed by remember(url, imageLoader) { mutableStateOf(false) }
    if (url != null && imageLoader != null && !failed) {
        AsyncImage(model = url, imageLoader = imageLoader, contentDescription = null, modifier = modifier, contentScale = scale,
            onError = { failed = true })
    } else if (fallbackText) {
        Box(modifier.background(Color(0xFF242424)).padding(8.dp), contentAlignment = Alignment.Center) {
            Text(title, color = Color.White, fontSize = 14.sp, lineHeight = 18.sp, maxLines = 5, overflow = TextOverflow.Ellipsis)
        }
    } else Box(modifier)
}

@Composable private fun Heading(text: String) = Text(
    text,
    fontSize = 16.sp,
    fontWeight = FontWeight.Bold,
    modifier = Modifier.padding(start = 64.dp, top = 18.dp, bottom = 12.dp).semantics { heading() },
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
        TvAction(stringResource(R.string.retry), TvSymbol.Refresh, retry)
    }
}

internal val MediaSummary.stableKey: String get() = ratingKey ?: "${external?.provider}:${external?.id}:${external?.type}"
private val MediaSummary.progress: Float
    get() = if ((durationMs ?: 0) > 0) ((viewOffsetMs ?: 0).toFloat() / durationMs!!.toFloat()).coerceIn(0f, 1f) else 0f
private val MediaSummary.minutesLeft: Long?
    get() = durationMs?.let { duration -> viewOffsetMs?.let { ((duration - it).coerceAtLeast(0) / 60_000) } }

private fun String?.requestType(): String = if (this == "show" || this == "season" || this == "episode") "tv" else this ?: "movie"
