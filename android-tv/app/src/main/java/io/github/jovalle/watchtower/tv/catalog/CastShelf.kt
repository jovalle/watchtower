package io.github.jovalle.watchtower.tv.catalog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.unit.dp
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.api.Person
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
private data class CastKey(val id: String?, val name: String, val role: String?)

@Composable
internal fun CastShelf(graph: AppGraph, people: List<Person>, returning: Boolean, onRestored: () -> Unit, onOpen: (Person) -> Unit) {
    val cast = people.map { Json.encodeToString(CastKey(it.id, it.name, it.role)) to it }.distinctBy { it.first }
    val keys = cast.map { it.first }
    val requesters = remember(keys) { keys.associateWith { FocusRequester() } }
    var focusedKey by rememberSaveable { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()
    // The leaving page sets returning before navigation; restore only when it mounts again.
    var restorePending by remember { mutableStateOf(returning) }
    val restoreKey = focusedKey?.takeIf { it in keys } ?: keys.firstOrNull()
    LaunchedEffect(restorePending, restoreKey, keys) {
        if (restorePending) {
            if (restoreKey != null) {
                listState.scrollToItem(keys.indexOf(restoreKey))
                withFrameNanos { }
                requesters.getValue(restoreKey).requestFocus()
            }
            restorePending = false
            onRestored()
        }
    }
    LazyRow(state = listState, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        items(cast, key = { it.first }) { (key, person) ->
            CastPersonCard(graph, person,
                Modifier.focusRequester(requesters.getValue(key)).onFocusChanged { if (it.isFocused) focusedKey = key },
            ) {
                focusedKey = key
                onOpen(person)
            }
        }
    }
}
