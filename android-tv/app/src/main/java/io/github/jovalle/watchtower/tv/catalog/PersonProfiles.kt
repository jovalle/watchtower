package io.github.jovalle.watchtower.tv.catalog

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.Person
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.TvSymbol
import io.github.jovalle.watchtower.tv.ui.pointerClick
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

@Serializable data class PersonRoute(val ratingKey: String, val personId: String, val name: String)

@Composable
fun PersonProfileScreen(graph: AppGraph, data: CatalogDataSource, route: PersonRoute, onOpen: (MediaSummary) -> Unit, onBack: () -> Unit) {
    val model: PersonProfileViewModel = viewModel(key = "person:${route.ratingKey}:${route.personId}") {
        PersonProfileViewModel(route.ratingKey, route.personId, data, graph.session::current, graph.session.identityChanges)
    }
    val state by model.state.collectAsStateWithLifecycle()
    val snapshot = graph.session.current()
    key(snapshot) {
        PersonProfileContent(graph, state, route.name,
            onOpen = { if (snapshot != null && graph.session.current() == snapshot) onOpen(it) },
            onRetry = model::reload, onBack = onBack)
    }
}

@Composable
internal fun PersonProfileContent(graph: AppGraph, state: PersonProfileState, name: String, onOpen: (MediaSummary) -> Unit, onRetry: () -> Unit, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    val backFocus = remember { FocusRequester() }
    var focusedShelf by rememberSaveable { mutableStateOf<String?>(null) }
    var focusedWork by rememberSaveable { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()
    val profile = state.profile
    LaunchedEffect(Unit) { if (focusedShelf == null) backFocus.requestFocus() }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Row(Modifier.fillMaxWidth().padding(start = 64.dp, end = 48.dp, top = 24.dp), verticalAlignment = Alignment.CenterVertically) {
            TvAction(stringResource(R.string.person_back), TvSymbol.Back, onBack, Modifier.focusRequester(backFocus))
            if (state.error != null || profile?.warnings?.isNotEmpty() == true) {
                TvAction(stringResource(R.string.retry), TvSymbol.Refresh, { backFocus.requestFocus(); onRetry() }, enabled = !state.loading)
            }
            if (state.loading) Text(stringResource(R.string.loading), fontSize = 14.sp, color = Color.LightGray)
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().testTag("person-page"),
            contentPadding = PaddingValues(start = 64.dp, end = 48.dp, top = 12.dp, bottom = 48.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            item(key = "identity") {
                Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    CatalogImage(graph, profile?.thumbUrl, profile?.name ?: name,
                        Modifier.size(120.dp).clip(CircleShape).background(Color(0xFF242424)), ContentScale.Crop, fallbackText = false)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(profile?.name ?: name, fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold,
                            modifier = Modifier.semantics { heading() })
                        profile?.role?.takeIf(String::isNotBlank)?.let { Text(it, fontSize = 17.sp, color = Color.LightGray) }
                        if (profile != null) FlowRow(horizontalArrangement = Arrangement.spacedBy(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            profile.birthday?.takeIf(String::isNotBlank)?.let { PersonFact(stringResource(R.string.person_born, it)) }
                            profile.deathday?.takeIf(String::isNotBlank)?.let { PersonFact(stringResource(R.string.person_died, it)) }
                            profile.placeOfBirth?.takeIf(String::isNotBlank)?.let { PersonFact(stringResource(R.string.person_birthplace, it)) }
                            profile.knownForDepartment?.takeIf(String::isNotBlank)?.let { PersonFact(stringResource(R.string.person_department, it)) }
                        }
                    }
                }
            }
            state.error?.let { message -> item(key = "error") { Text(message, color = MaterialTheme.colorScheme.error, modifier = Modifier.focusable()) } }
            if (profile != null) {
                if (profile.warnings.isNotEmpty()) item(key = "warnings") {
                    Text(profile.warnings.joinToString("\n"), color = Color.LightGray, fontSize = 15.sp, modifier = Modifier.focusable())
                }
                item(key = "biography") {
                    PersonBiography(profile.biography?.takeIf(String::isNotBlank) ?: stringResource(R.string.person_biography_unavailable))
                }
                listOf(
                    Triple("known-for", R.string.person_known_for, profile.knownFor),
                    Triple("library", R.string.person_library, profile.library),
                    Triple("filmography", R.string.person_filmography, profile.filmography),
                ).forEach { (id, title, works) ->
                    item(key = id) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(stringResource(title), fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
                            if (works.isEmpty()) Text(stringResource(when (id) {
                                "known-for" -> R.string.person_known_for_empty
                                "library" -> R.string.person_library_empty
                                else -> R.string.person_filmography_empty
                            }), color = Color.LightGray, fontSize = 15.sp, modifier = Modifier.focusable())
                            else FocusRestoringHomeRow(works,
                                restoreKey = focusedWork.takeIf { focusedShelf == id },
                                onFocused = { focusedShelf = id; focusedWork = it },
                            ) { work, modifier -> MediaCard(graph, work, modifier) { onOpen(work) } }
                        }
                    }
                }
            } else if (!state.loading && state.error == null) item(key = "unavailable") {
                Text(stringResource(R.string.person_profile_unavailable), color = Color.LightGray)
            }
        }
    }
}

@Composable
private fun PersonFact(text: String) { Text(text, fontSize = 14.sp, color = Color.LightGray) }

@Composable
private fun PersonBiography(text: String) {
    val scroll = rememberScrollState()
    val scope = rememberCoroutineScope()
    val step = with(LocalDensity.current) { 120.dp.toPx() }
    var focused by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth().heightIn(max = 180.dp)
        .border(1.dp, if (focused) Color.White else Color.Transparent, RoundedCornerShape(4.dp))
        .onFocusChanged { focused = it.isFocused }
        .onPreviewKeyEvent { event ->
            val distance = when {
                event.key == Key.DirectionDown && scroll.canScrollForward -> step
                event.key == Key.DirectionUp && scroll.canScrollBackward -> -step
                else -> return@onPreviewKeyEvent false
            }
            if (event.type == KeyEventType.KeyDown) scope.launch { scroll.scrollBy(distance) }
            true
        }
        .verticalScroll(scroll).focusable().testTag("person-biography").padding(10.dp)) {
        Text(text, fontSize = 17.sp, lineHeight = 25.sp)
    }
}

@Composable
fun CastPersonCard(graph: AppGraph, person: Person, modifier: Modifier = Modifier, onClick: () -> Unit) {
    var focused by remember { mutableStateOf(false) }
    val description = listOfNotNull(person.name, person.role).joinToString(stringResource(R.string.accessibility_separator))
    val cardModifier = modifier.width(120.dp).onFocusChanged { focused = it.isFocused }
    val content: @Composable () -> Unit = {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(120.dp)) {
                CatalogImage(graph, person.thumbUrl, person.name, Modifier.fillMaxSize().clip(CircleShape).background(Color(0xFF242424)), ContentScale.Crop, fallbackText = false)
                if (focused) Box(Modifier.fillMaxSize().border(2.dp, Color.White, CircleShape))
            }
            Text(person.name, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
            person.role?.let { Text(it, fontSize = 10.sp, color = Color.LightGray, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            if (person.id.isNullOrBlank()) Text(stringResource(R.string.person_profile_unavailable), fontSize = 10.sp, color = Color.LightGray)
        }
    }
    if (person.id.isNullOrBlank()) Box(cardModifier.focusable().semantics { contentDescription = description }) { content() }
    else Surface(onClick = onClick,
        modifier = cardModifier.pointerClick(onClick = onClick).semantics { contentDescription = description; role = Role.Button },
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(4.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1f),
        colors = ClickableSurfaceDefaults.colors(containerColor = Color.Transparent, focusedContainerColor = Color.Transparent),
    ) { content() }
}
