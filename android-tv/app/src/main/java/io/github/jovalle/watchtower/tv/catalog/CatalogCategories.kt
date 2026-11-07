package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.ui.pointerClick
import kotlinx.coroutines.flow.first

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun LibraryCategories(graph: AppGraph, genres: List<String>, focusedGenre: String?, onFocused: (String) -> Unit,
    onSelect: (String) -> Unit, modifier: Modifier = Modifier, artwork: Map<String, String> = emptyMap()) {
    if (genres.isEmpty()) return
    val grid = rememberLazyGridState()
    val requesters = remember(genres) { genres.associateWith { FocusRequester() } }
    var restorePending by remember(genres) { mutableStateOf(true) }
    val view = LocalView.current
    val scrollSpec = remember {
        object : BringIntoViewSpec {
            override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float = when {
                offset < 0f -> offset
                offset + size > containerSize -> offset + size - containerSize
                else -> 0f
            }
        }
    }
    LaunchedEffect(genres, focusedGenre, restorePending) {
        if (restorePending) {
            val index = restoredFocusIndex(focusedGenre, 0, genres)
            val target = genres[index]
            while (!view.hasWindowFocus()) withFrameNanos { }
            val visible = snapshotFlow { grid.layoutInfo.visibleItemsInfo }.first { it.isNotEmpty() }
            if (visible.none { it.key == target }) {
                grid.scrollToItem(index)
                snapshotFlow { grid.layoutInfo.visibleItemsInfo.any { it.key == target } }.first { it }
            }
            withFrameNanos { }
            requesters[target]?.requestFocus()
            restorePending = false
        }
    }
    CompositionLocalProvider(LocalBringIntoViewSpec provides scrollSpec) {
        LazyVerticalGrid(columns = GridCells.Fixed(4), state = grid, modifier = modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(50.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
            itemsIndexed(genres, key = { _, genre -> genre }) { index, genre ->
                Box(Modifier.fillMaxWidth()) {
                    CategoryCard(graph, genre, artwork[genre], categoryTints[index % categoryTints.size],
                        Modifier.focusRequester(requireNotNull(requesters[genre])).onFocusChanged { if (it.isFocused) onFocused(genre) }) { onSelect(genre) }
                }
            }
        }
    }
}

@Composable
private fun CategoryCard(graph: AppGraph, genre: String, image: String?, tint: Color, modifier: Modifier, onSelect: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Surface(onClick = onSelect, modifier = modifier.width(188.dp).height(106.dp).onFocusChanged { focused = it.isFocused }
        .pointerClick(onClick = onSelect).semantics { contentDescription = genre },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(4.dp)), scale = ClickableSurfaceDefaults.scale(focusedScale = 1f),
        colors = ClickableSurfaceDefaults.colors(containerColor = Color(0xFF101015), focusedContainerColor = Color(0xFF101015))) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (image != null) CatalogImage(graph, image, genre, Modifier.fillMaxSize(), ContentScale.Crop, fallbackText = false)
            Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(tint.copy(alpha = 0.85f), tint.copy(alpha = 0.65f)))))
            Text(genre, color = Color.White, fontSize = 16.sp, lineHeight = 20.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center, modifier = Modifier.padding(12.dp))
            if (focused) Box(Modifier.fillMaxSize().border(2.dp, Color.White, RoundedCornerShape(4.dp)))
        }
    }
}

private val categoryTints = listOf(Color(0xFF287F8A), Color(0xFFA66A60), Color(0xFF3B7935), Color(0xFFAA2946),
    Color(0xFF68601C), Color(0xFFBA304A), Color(0xFF78467B), Color(0xFF3D5D91), Color(0xFFAD592E),
    Color(0xFFAA976F), Color(0xFF697528), Color(0xFFAB7928))
