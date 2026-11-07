package io.github.jovalle.watchtower.tv.catalog

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.*
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.*
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.platform.VoiceSearch
import io.github.jovalle.watchtower.tv.ui.pointerClick
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.TvSymbol
import java.util.Locale

@Composable
fun SearchScreen(graph: AppGraph, data: CatalogDataSource, onOpen: (MediaSummary) -> Unit) {
    val context = LocalContext.current
    val queryLabel = stringResource(R.string.cat_search_query)
    val history = remember(context.applicationContext) { RecentSearches(context.applicationContext) }
    val model: SearchViewModel = viewModel {
        SearchViewModel(data, graph.session::current, graph.session.identityChanges, history,
            { graph.session.currentMe()?.let { it.server.machineId to it.profile.userId } })
    }
    val state by model.state.collectAsStateWithLifecycle()
    val voiceAvailable = remember(context) { VoiceSearch.isAvailable(context) }
    val voiceLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) VoiceSearch.firstResult(result.data)?.let(model::search)
    }
    val queryFocus = remember { FocusRequester() }
    val resultFocus = remember { FocusRequester() }
    val settingsFocus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val view = LocalView.current
    var queryFocused by remember { mutableStateOf(false) }
    var settings by remember { mutableStateOf(false) }
    var restoreSettingsFocus by remember { mutableStateOf(false) }
    val results = filteredSearchResults(state)
    LaunchedEffect(state.useSystemKeyboard, settings) {
        if (state.useSystemKeyboard && !settings) {
            while (!view.hasWindowFocus()) withFrameNanos { }
            withFrameNanos { }
            queryFocus.requestFocus()
            keyboard?.show()
        } else if (!state.useSystemKeyboard) keyboard?.hide()
    }
    LaunchedEffect(settings) {
        if (!settings && restoreSettingsFocus && !state.useSystemKeyboard) {
            while (!view.hasWindowFocus()) withFrameNanos { }
            withFrameNanos { }
            settingsFocus.requestFocus()
            restoreSettingsFocus = false
        }
    }
    Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF333333), Color(0xFF080808))))
        .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f))))
        .onPreviewKeyEvent { event ->
            if (queryFocused || settings) false else typedSearchQuery(model.state.value.query, event)?.let { model.search(it); true } ?: false
        }) {
        Column(Modifier.padding(start = 66.dp, top = 24.dp, bottom = 12.dp).width(213.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BasicTextField(state.query, model::search,
                    modifier = Modifier.width(149.dp).height(32.dp).focusRequester(queryFocus)
                        .onFocusChanged { queryFocused = it.isFocused }
                        .background(if (queryFocused) Color(0x33FFFFFF) else Color.Transparent, RoundedCornerShape(4.dp))
                        .semantics { contentDescription = queryLabel },
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = Color.White, fontSize = 13.sp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search, showKeyboardOnFocus = state.useSystemKeyboard),
                    singleLine = true,
                    decorationBox = { field -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterStart) {
                        if (state.query.isEmpty()) Text(stringResource(R.string.search), color = Color.White, fontSize = 13.sp)
                        field()
                    } },
                )
                SearchKey(stringResource(R.string.voice_search), { voiceLauncher.launch(VoiceSearch.intent()) },
                    icon = R.drawable.symbol_microphone, background = Color.Transparent, enabled = voiceAvailable)
                SearchKey(stringResource(R.string.cat_search_settings), { keyboard?.hide(); restoreSettingsFocus = true; settings = true },
                    modifier = Modifier.focusRequester(settingsFocus), icon = R.drawable.symbol_search_settings, background = Color.Transparent)
            }
            Spacer(Modifier.height(8.dp))
            if (!state.useSystemKeyboard) SearchKeyboard(state.query, model::search,
                resultFocus = resultFocus.takeIf { results.isNotEmpty() && !state.loading }, initialFocus = state.focusedResultKey == null)
            if (state.query.isBlank() && state.recentQueries.isNotEmpty()) {
                if (state.useSystemKeyboard) Spacer(Modifier.height(248.dp))
                Spacer(Modifier.height(15.dp))
                LazyColumn(modifier = Modifier.width(212.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.recentQueries, key = { it }) { recent ->
                        SearchHistoryRow(recent, R.drawable.symbol_search_history, { model.search(recent) })
                    }
                    item { SearchHistoryRow(stringResource(R.string.cat_search_clear_history), R.drawable.symbol_close, model::clearRecentSearches) }
                }
            }
        }
        if (state.query.isNotBlank()) Column(Modifier.fillMaxSize().padding(start = 343.dp, end = 48.dp, top = 24.dp)) {
            Row(Modifier.padding(start = 8.dp, bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("all" to R.string.filter_all, "movies" to R.string.cat_search_movies, "tv" to R.string.cat_search_tv).forEach { (value, label) ->
                    SearchFilterChip(stringResource(label), state.mediaFilter == value, { model.setMediaFilter(value) })
                }
            }
            when {
                state.loading -> Text(stringResource(R.string.loading), color = Color.LightGray, fontSize = 13.sp)
                state.error != null -> Column {
                    Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error, fontSize = 13.sp,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                    TvAction(stringResource(R.string.retry), TvSymbol.Refresh, { model.search(state.query) })
                }
                else -> SearchResults(graph, state, resultFocus, model::rememberFocus, { model.rememberResult(it); onOpen(it) })
            }
        }
    }
    if (settings) SearchSettingsDialog(state.showLibrary, state.showExternal, state.useSystemKeyboard,
        graph.session.currentMe()?.server?.name?.takeIf { it.isNotBlank() } ?: stringResource(R.string.cat_library),
        model::setShowLibrary, model::setShowExternal,
        { model.setUseSystemKeyboard(it); restoreSettingsFocus = false; settings = false }, { settings = false },
        graph.session.currentMe()?.account?.title)
}

internal fun editSearchQuery(query: String, key: String): String = when (key) {
    "space" -> query + " "
    "backspace" -> if (query.isEmpty()) query else query.substring(0, query.offsetByCodePoints(query.length, -1))
    "clear" -> ""
    else -> query + key
}

private fun typedSearchQuery(query: String, event: KeyEvent): String? {
    if (event.type != KeyEventType.KeyDown || event.nativeKeyEvent.isCtrlPressed || event.nativeKeyEvent.isMetaPressed || event.nativeKeyEvent.isAltPressed) return null
    if (event.key == Key.Backspace) return editSearchQuery(query, "backspace")
    val point = event.nativeKeyEvent.unicodeChar
    return if (point != 0 && Character.isValidCodePoint(point) && !Character.isISOControl(point)) query + String(Character.toChars(point)) else null
}

internal fun filteredSearchResults(state: SearchState): List<MediaSummary> {
    val result = state.result ?: return emptyList()
    val items = (if (state.showLibrary) result.library else emptyList()) + (if (state.showExternal) result.external else emptyList())
    return items.filter { item -> when (state.mediaFilter) {
        "movies" -> item.type == "movie"
        "tv" -> item.type in listOf("show", "season", "episode")
        else -> item.type in listOf("movie", "show", "season", "episode")
    } }.distinctBy(MediaSummary::stableKey)
}

@Composable
internal fun SearchKeyboard(query: String, onQuery: (String) -> Unit, modifier: Modifier = Modifier, resultFocus: FocusRequester? = null, initialFocus: Boolean = true) {
    val first = remember { FocusRequester() }
    val view = LocalView.current
    var input by remember { mutableStateOf(query) }
    SideEffect { input = query }
    LaunchedEffect(initialFocus) {
        if (initialFocus) {
            while (!view.hasWindowFocus()) withFrameNanos { }
            withFrameNanos { }
            first.requestFocus()
        }
    }
    val edit: (String) -> Unit = { key -> input = editSearchQuery(input, key); onQuery(input) }
    Column(modifier.width(212.dp).onPreviewKeyEvent { event ->
        typedSearchQuery(input, event)?.let { input = it; onQuery(it); true } ?: false
    }, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        "abcdefghijklmnopqrstuvwxyz1234567890".chunked(6).forEachIndexed { rowIndex, row ->
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                row.forEachIndexed { column, key ->
                    SearchKey(stringResource(R.string.cat_search_key, key.toString()), { edit(key.toString()) }, text = key.toString(),
                        modifier = Modifier.then(if (rowIndex == 0 && column == 0) Modifier.focusRequester(first) else Modifier)
                            .focusProperties { if (column == 5 && resultFocus != null) right = resultFocus })
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            SearchKey(stringResource(R.string.cat_search_space), { edit("space") }, icon = R.drawable.symbol_space, width = 68.dp, background = Color(0xFF2C2C2C))
            SearchKey(stringResource(R.string.cat_search_backspace), { edit("backspace") }, icon = R.drawable.symbol_backspace, width = 68.dp, background = Color(0xFF2C2C2C))
            SearchKey(stringResource(R.string.cat_search_clear), { edit("clear") }, icon = R.drawable.symbol_close, width = 68.dp, background = Color(0xFF2C2C2C),
                modifier = Modifier.focusProperties { if (resultFocus != null) right = resultFocus })
        }
    }
}

@Composable
private fun SearchKey(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, text: String? = null,
    icon: Int? = null, width: Dp = 32.dp, background: Color = Color(0xFF3A3A3A), enabled: Boolean = true) {
    var focused by remember { mutableStateOf(false) }
    Surface(onClick = onClick, enabled = enabled,
        modifier = modifier.width(width).height(32.dp).onFocusChanged { focused = it.isFocused }
            .pointerClick(enabled = enabled, onClick = onClick).semantics { contentDescription = label },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(4.dp)), scale = ClickableSurfaceDefaults.scale(focusedScale = 1f),
        colors = ClickableSurfaceDefaults.colors(containerColor = background, focusedContainerColor = Color.White)) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            val color = if (focused) Color.Black else Color.White.copy(alpha = if (enabled) 1f else 0.38f)
            if (icon != null) Icon(painterResource(icon), null, Modifier.size(16.dp), tint = color)
            else Text(text.orEmpty(), color = color, fontSize = 13.sp)
        }
    }
}

@Composable
private fun SearchFilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Surface(onClick = onClick, modifier = Modifier.height(32.dp).onFocusChanged { focused = it.isFocused }
        .pointerClick(onClick = onClick).semantics { this.selected = selected },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(4.dp)), scale = ClickableSurfaceDefaults.scale(focusedScale = 1f),
        colors = ClickableSurfaceDefaults.colors(containerColor = Color(0xFF333333), focusedContainerColor = Color.White)) {
        Box(Modifier.fillMaxHeight().padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
            Text(label, color = if (focused) Color.Black else if (selected) MaterialTheme.colorScheme.primary else Color.White, fontSize = 13.sp)
        }
    }
}

@Composable
internal fun SearchResults(graph: AppGraph, state: SearchState, firstResultFocus: FocusRequester, onFocused: (String) -> Unit, onOpen: (MediaSummary) -> Unit, modifier: Modifier = Modifier) {
    val items = filteredSearchResults(state)
    if (items.isEmpty()) {
        Text(stringResource(R.string.no_results), color = Color.LightGray, fontSize = 13.sp, modifier = modifier)
        return
    }
    val keys = items.map(MediaSummary::stableKey)
    val requesters = remember(keys, firstResultFocus) { keys.mapIndexed { index, key -> key to if (index == 0) firstResultFocus else FocusRequester() }.toMap() }
    val grid = rememberLazyGridState()
    val view = LocalView.current
    var restorePending by remember(state.query) { mutableStateOf(true) }
    LaunchedEffect(keys, state.focusedResultKey, restorePending) {
        if (restorePending && state.focusedResultKey != null) {
            val index = restoredFocusIndex(state.focusedResultKey, 0, keys)
            grid.scrollToItem(index)
            while (!view.hasWindowFocus()) withFrameNanos { }
            withFrameNanos { }
            requesters[keys[index]]?.requestFocus()
            restorePending = false
        }
    }
    LazyVerticalGrid(columns = GridCells.Fixed(2), state = grid, modifier = modifier.fillMaxSize(),
        horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp),
        contentPadding = PaddingValues(bottom = 16.dp)) {
        itemsIndexed(items, key = { _, item -> item.stableKey }) { _, item ->
            SearchResultCard(graph, item, Modifier.focusRequester(requireNotNull(requesters[item.stableKey])).onFocusChanged {
                if (it.isFocused) onFocused(item.stableKey)
            }) { onOpen(item) }
        }
    }
}

@Composable
private fun SearchResultCard(graph: AppGraph, item: MediaSummary, modifier: Modifier, onOpen: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Surface(onClick = onOpen, modifier = modifier.fillMaxWidth().height(141.dp).onFocusChanged { focused = it.isFocused }
        .pointerClick(onClick = onOpen).semantics { contentDescription = item.title },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(4.dp)), scale = ClickableSurfaceDefaults.scale(focusedScale = 1f),
        colors = ClickableSurfaceDefaults.colors(containerColor = Color(0xFF222222), focusedContainerColor = Color(0xFF292929))) {
        Box(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxSize().padding(horizontal = 8.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                CatalogImage(graph, if (item.type == "episode") item.thumbUrl ?: item.posterUrl else item.posterUrl, item.title,
                    Modifier.width(86.dp).height(129.dp).clip(RoundedCornerShape(4.dp)), ContentScale.Crop, fallbackText = false)
                Column(Modifier.weight(1f)) {
                    Text(item.title, color = Color.White, fontSize = 14.sp, lineHeight = 16.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    if (item.type == "episode" && item.showTitle != null) Text(item.showTitle, color = Color.LightGray, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val type = stringResource(when (item.type) { "show" -> R.string.cat_show; "season" -> R.string.cat_season; "episode" -> R.string.cat_search_episode; else -> R.string.cat_search_movie })
                    val context = if (item.type == "episode" && item.seasonNumber != null && item.episodeNumber != null) "S${item.seasonNumber} E${item.episodeNumber}" else item.year?.toString()
                    Text(listOfNotNull(context, type).joinToString(" • "), color = Color(0xFFA8A8A8), fontSize = 12.sp, lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val source = item.external?.provider?.uppercase(Locale.ROOT)
                        ?: graph.session.currentMe()?.server?.name?.takeIf { it.isNotBlank() } ?: stringResource(R.string.cat_library)
                    Text(source, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (focused) Box(Modifier.fillMaxSize().border(2.dp, Color.White, RoundedCornerShape(4.dp)))
        }
    }
}

@Composable
internal fun SearchSettingsDialog(showLibrary: Boolean, showExternal: Boolean, useSystemKeyboard: Boolean,
    serverName: String, onLibrary: (Boolean) -> Unit, onExternal: (Boolean) -> Unit,
    onSystemKeyboard: (Boolean) -> Unit, onDismiss: () -> Unit, profileTitle: String? = null) {
    val first = remember { FocusRequester() }
    CatalogDialogPanel(stringResource(R.string.cat_search_settings), onDismiss) {
        val view = LocalView.current
        LaunchedEffect(Unit) {
            while (!view.hasWindowFocus()) withFrameNanos { }
            withFrameNanos { }
            first.requestFocus()
        }
        Text(stringResource(R.string.cat_search_media_libraries), fontSize = 14.sp, fontWeight = FontWeight.Bold)
        SearchCheckbox(serverName, showLibrary, { onLibrary(!showLibrary) }, Modifier.focusRequester(first),
            profileTitle ?: stringResource(R.string.cat_search_library_results), stringResource(R.string.cat_search_library_results))
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.external_results), fontSize = 14.sp, fontWeight = FontWeight.Bold)
        SearchCheckbox(stringResource(R.string.cat_search_discovery_results), showExternal, { onExternal(!showExternal) })
        Spacer(Modifier.height(8.dp).fillMaxWidth().background(Color(0xFF333333)))
        SearchCheckbox(stringResource(R.string.cat_search_system_keyboard), useSystemKeyboard, { onSystemKeyboard(!useSystemKeyboard) })
    }
}

@Composable
private fun SearchCheckbox(label: String, checked: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier,
    subtitle: String? = null, description: String = label) {
    var focused by remember { mutableStateOf(false) }
    Button(onClick = onClick, modifier = modifier.fillMaxWidth().heightIn(min = if (subtitle == null) 32.dp else 48.dp)
        .onFocusChanged { focused = it.isFocused }.pointerClick(onClick = onClick)
        .semantics { contentDescription = description; toggleableState = if (checked) androidx.compose.ui.state.ToggleableState.On else androidx.compose.ui.state.ToggleableState.Off },
        shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)), contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
        scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
        colors = ButtonDefaults.colors(containerColor = Color.Transparent, focusedContainerColor = Color.White)) {
        Column(Modifier.weight(1f)) {
            Text(label, color = if (focused) Color.Black else Color.White, fontSize = 13.sp)
            subtitle?.let { Text(it, color = if (focused) Color.Black else Color.LightGray, fontSize = 11.sp) }
        }
        Box(Modifier.size(16.dp).border(1.dp, if (focused) Color.Gray else Color.DarkGray, RoundedCornerShape(2.dp)), contentAlignment = Alignment.Center) {
            if (checked) Icon(painterResource(R.drawable.symbol_check), null, Modifier.size(12.dp), tint = if (focused) Color.Black else Color.White)
        }
    }
}

@Composable
private fun SearchHistoryRow(label: String, icon: Int, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Button(onClick = onClick, modifier = Modifier.fillMaxWidth().heightIn(min = 32.dp).onFocusChanged { focused = it.isFocused }.pointerClick(onClick = onClick),
        shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)), contentPadding = PaddingValues(horizontal = 8.dp),
        scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
        colors = ButtonDefaults.colors(containerColor = Color.Transparent, focusedContainerColor = Color.White)) {
        Icon(painterResource(icon), null, Modifier.size(16.dp), tint = if (focused) Color.Black else Color.White)
        Text(label, color = if (focused) Color.Black else Color.White, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 8.dp))
    }
}
