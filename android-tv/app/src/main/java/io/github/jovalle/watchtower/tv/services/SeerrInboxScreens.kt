package io.github.jovalle.watchtower.tv.services

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil3.compose.AsyncImage
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.api.IssueDetail
import io.github.jovalle.watchtower.tv.api.IssueSummary
import io.github.jovalle.watchtower.tv.api.RequestSummary
import io.github.jovalle.watchtower.tv.catalog.ExternalDetailsRoute
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.MediaStatusBadge
import io.github.jovalle.watchtower.tv.ui.TvSymbol
import io.github.jovalle.watchtower.tv.ui.pointerClick
import kotlinx.serialization.Serializable
import kotlinx.coroutines.launch

@Serializable data object RequestsRoute
@Serializable data object IssuesRoute
@Serializable data class IssueDetailRoute(val id: Int)

@Composable
fun RequestsScreen(
    graph: AppGraph,
    onOpen: (ExternalDetailsRoute) -> Unit,
    onOpenLocal: (String) -> Unit,
    onSettings: () -> Unit,
) {
    if (graph.session.currentMe()?.features?.requests != true) {
        ServiceUnavailable(onSettings)
        return
    }
    val owner = graph.session.current()
    val model: SeerrInboxViewModel<RequestSummary> = viewModel(key = "requests:${owner?.deviceSessionId}:${owner?.identityVersion}") {
        SeerrInboxViewModel(graph.session::current, graph.session.identityChanges, graph.api::requestInbox)
    }
    LifecycleResumeEffect(model) {
        if (!model.state.value.loading) model.reload()
        onPauseOrDispose { }
    }
    val state by model.state.collectAsStateWithLifecycle()
    SeerrInboxContent(
        title = stringResource(R.string.services_requests),
        description = stringResource(R.string.services_requests_description),
        emptyTitle = stringResource(R.string.services_no_requests),
        emptyMessage = stringResource(R.string.services_no_requests_description),
        state = state,
        filters = listOf("all" to stringResource(R.string.services_all), "pending" to stringResource(R.string.services_pending),
            "processing" to stringResource(R.string.services_processing), "available" to stringResource(R.string.services_available),
            "failed" to stringResource(R.string.services_failed)),
        onFilter = model::setFilter,
        onRefresh = model::reload,
        onPage = model::goToPage,
        countLabel = pluralStringResource(R.plurals.services_request_count, state.totalResults, state.totalResults),
        itemKey = { it.id },
    ) { item ->
        ServiceTitleRow(graph, item.title, listOfNotNull(item.status, stringResource(R.string.services_4k).takeIf { item.is4k }).joinToString(" / "), item.posterUrl, item.type) {
            openTitle(item.ratingKey, item.type, item.tmdbId, item.title, item.posterUrl, onOpen, onOpenLocal)
        }
    }
}

@Composable
fun IssuesScreen(graph: AppGraph, onIssue: (Int) -> Unit, onSettings: () -> Unit) {
    if (graph.session.currentMe()?.features?.requests != true) {
        ServiceUnavailable(onSettings)
        return
    }
    val owner = graph.session.current()
    val model: SeerrInboxViewModel<IssueSummary> = viewModel(key = "issues:${owner?.deviceSessionId}:${owner?.identityVersion}") {
        SeerrInboxViewModel(graph.session::current, graph.session.identityChanges, graph.api::issues)
    }
    LifecycleResumeEffect(model) {
        if (!model.state.value.loading) model.reload()
        onPauseOrDispose { }
    }
    val state by model.state.collectAsStateWithLifecycle()
    SeerrInboxContent(
        title = stringResource(R.string.services_issues),
        description = stringResource(R.string.services_issues_description),
        emptyTitle = stringResource(R.string.services_no_issues),
        emptyMessage = stringResource(R.string.services_no_issues_description),
        state = state,
        filters = listOf("all" to stringResource(R.string.services_all), "open" to stringResource(R.string.services_open), "resolved" to stringResource(R.string.services_resolved)),
        onFilter = model::setFilter,
        onRefresh = model::reload,
        onPage = model::goToPage,
        countLabel = pluralStringResource(R.plurals.services_issue_count, state.totalResults, state.totalResults),
        itemKey = { it.id },
    ) { item ->
        ServiceTitleRow(graph, item.title, "${issueTypeLabel(item.issueType)} / ${issueStatusLabel(item.status)}", item.posterUrl, item.type,
            statusCode = item.status) { onIssue(item.id) }
    }
}

@Composable
fun IssueDetailScreen(
    graph: AppGraph,
    id: Int,
    onOpen: (ExternalDetailsRoute) -> Unit,
    onOpenLocal: (String) -> Unit,
    onBack: () -> Unit,
) {
    val owner = graph.session.current()
    val model: SeerrIssueDetailViewModel = viewModel(key = "issue:$id:${owner?.deviceSessionId}:${owner?.identityVersion}") {
        SeerrIssueDetailViewModel(graph.session::current, graph.session.identityChanges) { graph.api.issueDetail(it, id) }
    }
    val state by model.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(start = 64.dp, end = 32.dp, top = 24.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        val primary = remember { FocusRequester() }
        LaunchedEffect(Unit) { primary.requestFocus() }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(R.string.services_issue_details), fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
            TvAction(stringResource(R.string.services_back), TvSymbol.Back, onBack, Modifier.focusRequester(primary))
        }
        when {
            state.loading -> ServiceMessage(stringResource(R.string.services_loading), "")
            state.error != null -> ServiceFailure(state.error.orEmpty(), model::reload)
            state.issue != null -> IssueDetailContent(graph, requireNotNull(state.issue), onOpen, onOpenLocal)
        }
    }
}

@Composable
internal fun IssueDetailContent(graph: AppGraph, issue: IssueDetail, onOpen: (ExternalDetailsRoute) -> Unit, onOpenLocal: (String) -> Unit) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val readingFocus = remember { FocusRequester() }
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize().focusRequester(readingFocus)
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown && (event.key == Key.DirectionDown || event.key == Key.DirectionUp) &&
                    (event.key == Key.DirectionDown || listState.canScrollBackward)) {
                    readingFocus.requestFocus()
                    val direction = if (event.key == Key.DirectionDown) 1 else -1
                    val step = (listState.layoutInfo.viewportEndOffset - listState.layoutInfo.viewportStartOffset).coerceAtLeast(320) / 2f
                    scope.launch { listState.scrollBy(direction * step) }
                    true
                } else false
            }.focusable(),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(24.dp), verticalAlignment = Alignment.Top) {
                ServicePoster(graph, issue.posterUrl, issue.type, Modifier.width(100.dp).height(150.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(issue.title, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
                    Text(issueTypeLabel(issue.issueType), color = Color.LightGray, fontSize = 14.sp)
                    MediaStatusBadge(issueStatusLabel(issue.status), issue.status)
                    if (issue.createdAt.isNotBlank()) Text(issue.createdAt.substringBefore('T'), color = Color.LightGray, fontSize = 13.sp)
                }
                TvAction(stringResource(R.string.services_title_details), TvSymbol.Info, {
                    openTitle(issue.ratingKey, issue.type, issue.tmdbId, issue.title, issue.posterUrl, onOpen, onOpenLocal)
                })
            }
        }
        item {
            Text(stringResource(R.string.services_report), fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Text(issue.message.ifBlank { stringResource(R.string.services_no_message) }, fontSize = 15.sp, modifier = Modifier.padding(top = 8.dp))
        }
        item { Text(stringResource(R.string.services_conversation), fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
        if (issue.comments.isEmpty()) item { Text(stringResource(R.string.services_no_comments), color = Color.LightGray) }
        items(issue.comments, key = { it.id }) { comment ->
            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                val meta = listOfNotNull(comment.author, comment.createdAt.substringBefore('T').takeIf { it.isNotBlank() }).joinToString(" / ")
                if (meta.isNotBlank()) Text(meta, color = Color.LightGray, fontSize = 13.sp)
                Text(comment.message, fontSize = 15.sp)
            }
        }
    }
}

@Composable
internal fun <T> SeerrInboxContent(
    title: String,
    description: String,
    emptyTitle: String,
    emptyMessage: String,
    state: SeerrInboxState<T>,
    filters: List<Pair<String, String>>,
    onFilter: (String) -> Unit,
    onRefresh: () -> Unit,
    onPage: (Int) -> Unit,
    countLabel: String? = null,
    itemKey: ((T) -> Any)? = null,
    itemContent: @Composable (T) -> Unit,
) {
    var filterOpen by remember { mutableStateOf(false) }
    val primary = remember { FocusRequester() }
    val refreshFocus = remember { FocusRequester() }
    val retry = { refreshFocus.requestFocus(); onRefresh() }
    LaunchedEffect(filterOpen) { if (!filterOpen) primary.requestFocus() }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(start = 64.dp, end = 32.dp, top = 24.dp, bottom = 24.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
                Text(description, fontSize = 14.sp, color = Color.LightGray)
                val selection = filters.firstOrNull { it.first == state.filter }?.second.orEmpty()
                Text(selection + if (state.totalResults > 0) " / ${countLabel ?: stringResource(R.string.services_count, state.totalResults)}" else "", color = Color.LightGray, fontSize = 13.sp)
            }
            TvAction(stringResource(R.string.services_filter), TvSymbol.Filter, { filterOpen = true }, Modifier.focusRequester(primary))
            TvAction(stringResource(R.string.services_refresh), TvSymbol.Refresh, onRefresh,
                Modifier.focusRequester(refreshFocus), enabled = !state.loading)
        }
        Spacer(Modifier.height(14.dp))
        when {
            state.loading && state.items.isEmpty() -> ServiceMessage(stringResource(R.string.services_loading), "")
            state.error != null && state.items.isEmpty() -> ServiceFailure(state.error, retry)
            state.items.isEmpty() -> ServiceMessage(emptyTitle, emptyMessage)
            else -> {
                if (state.loading) Text(stringResource(R.string.services_loading), color = Color.LightGray)
                state.error?.let { ServiceFailure(it, retry) }
                LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.items, key = itemKey) { itemContent(it) }
                }
                if (state.pages > 1) Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.Center) {
                    TvAction(stringResource(R.string.services_previous_page), TvSymbol.Previous, { onPage(state.page - 1) }, enabled = state.page > 1)
                    Text(stringResource(R.string.services_page, state.page, state.pages), fontSize = 13.sp, modifier = Modifier.height(40.dp).padding(horizontal = 16.dp).wrapContentHeight())
                    TvAction(stringResource(R.string.services_next_page), TvSymbol.Next, { onPage(state.page + 1) }, enabled = state.page < state.pages)
                }
            }
        }
    }
    if (filterOpen) ServiceFilterDialog(title, filters, state.filter, { filterOpen = false; onFilter(it) }, { filterOpen = false })
}

@Composable
internal fun ServiceUnavailable(onSettings: () -> Unit) {
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(horizontal = 64.dp, vertical = 24.dp), verticalArrangement = Arrangement.Center) {
        ServiceMessage(stringResource(R.string.services_unavailable), stringResource(R.string.services_unavailable_description))
        val primary = remember { FocusRequester() }
        LaunchedEffect(Unit) { primary.requestFocus() }
        TvAction(stringResource(R.string.services_settings), TvSymbol.Settings, onSettings, Modifier.focusRequester(primary))
    }
}

@Composable
private fun ServiceFailure(message: String, retry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(message, color = MaterialTheme.colorScheme.error, fontSize = 15.sp)
        TvAction(stringResource(R.string.services_retry), TvSymbol.Refresh, retry)
    }
}

@Composable
private fun ServiceMessage(title: String, message: String) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(vertical = 20.dp)) {
        Text(title, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        if (message.isNotBlank()) Text(message, fontSize = 15.sp, color = Color.LightGray)
    }
}

@Composable
internal fun ServiceTitleRow(graph: AppGraph, title: String, status: String, poster: String?, type: String,
    statusCode: String = status.substringBefore(" / "), onClick: () -> Unit) {
    val colors = MaterialTheme.colorScheme
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth()
            .pointerClick(onClick = onClick)
            .semantics { contentDescription = "$title, $status" },
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
        scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
        colors = ButtonDefaults.colors(containerColor = Color.Black, contentColor = colors.onSurface,
            focusedContainerColor = Color.White, focusedContentColor = Color.Black),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
            ServicePoster(graph, poster, type, Modifier.width(42.dp).height(63.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(title, maxLines = 2, overflow = TextOverflow.Ellipsis, fontSize = 17.sp)
                MediaStatusBadge(status, statusCode)
            }
            Icon(painterResource(TvSymbol.Info.resource), contentDescription = null, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun ServicePoster(graph: AppGraph, path: String?, type: String, modifier: Modifier) {
    val snapshot = graph.session.current()
    val resolved = remember(path, snapshot) { path?.let { runCatching { snapshot?.resolve(it)?.toString() }.getOrNull() } }
    val frame = modifier.clip(RoundedCornerShape(4.dp)).background(MaterialTheme.colorScheme.surface)
    if (snapshot != null && resolved != null) AsyncImage(model = resolved, contentDescription = null, imageLoader = graph.imageLoader(snapshot), modifier = frame, contentScale = ContentScale.Crop)
    else Box(frame, contentAlignment = Alignment.Center) {
        Icon(painterResource((if (type == "tv") TvSymbol.Shows else TvSymbol.Movies).resource), contentDescription = null, modifier = Modifier.size(28.dp))
    }
}

@Composable
private fun ServiceFilterDialog(title: String, options: List<Pair<String, String>>, selected: String, onChoose: (String) -> Unit, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        val primary = remember { FocusRequester() }
        LaunchedEffect(Unit) { primary.requestFocus() }
        Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.CenterEnd) {
            Column(Modifier.width(320.dp).fillMaxHeight().background(Color.Black, RoundedCornerShape(4.dp))
                .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(4.dp))
                .focusGroup().focusProperties { onExit = { cancelFocusChange() } }
                .verticalScroll(rememberScrollState()).padding(32.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 28.dp))
                options.forEachIndexed { index, (value, label) ->
                    val choose = { onChoose(value) }
                    Button(onClick = choose,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 32.dp).pointerClick(onClick = choose)
                            .semantics { this.selected = value == selected }
                            .then(if (index == 0) Modifier.focusRequester(primary) else Modifier),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                        shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
                        scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
                        colors = ButtonDefaults.colors(containerColor = Color.Transparent, contentColor = Color.White,
                            focusedContainerColor = Color.White, focusedContentColor = Color.Black),
                    ) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(label, fontSize = 14.sp)
                            if (value == selected) Icon(painterResource(TvSymbol.Check.resource), contentDescription = null, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun issueTypeLabel(type: Int): String = stringResource(when (type) {
    1 -> R.string.services_video
    2 -> R.string.services_audio
    3 -> R.string.services_subtitles
    else -> R.string.services_other
})

@Composable
private fun issueStatusLabel(status: String): String = stringResource(when (status) {
    "open" -> R.string.services_open
    "resolved" -> R.string.services_resolved
    else -> R.string.services_unknown
})

private fun openTitle(ratingKey: String?, type: String, tmdbId: Int, title: String, poster: String?, onOpen: (ExternalDetailsRoute) -> Unit, onOpenLocal: (String) -> Unit) {
    if (ratingKey != null) onOpenLocal(ratingKey)
    else onOpen(ExternalDetailsRoute("tmdb", tmdbId.toString(), type, title, null, poster, null))
}
