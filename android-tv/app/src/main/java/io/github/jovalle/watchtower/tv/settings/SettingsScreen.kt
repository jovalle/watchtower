package io.github.jovalle.watchtower.tv.settings

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.focusable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.setValue
import androidx.annotation.StringRes
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.BuildConfig
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.ui.pointerClick
import io.github.jovalle.watchtower.tv.ui.TvToggleIndicator
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.TvSymbol
import io.github.jovalle.watchtower.tv.api.MeResponse
import io.github.jovalle.watchtower.tv.api.DeviceSummary
import io.github.jovalle.watchtower.tv.api.Preferences
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

@Serializable data object SettingsRoute

data class SettingsState(
    val loading: Boolean = true,
    val preferences: Preferences? = null,
    val devices: List<DeviceSummary> = emptyList(),
    val local: ProfilePlaybackPrefs = ProfilePlaybackPrefs(),
    val savingKey: String? = null,
    val error: String? = null,
    @StringRes val errorRes: Int? = null,
    val loadFailed: Boolean = false,
)

class SettingsViewModel(private val graph: AppGraph) : ViewModel() {
    private val _state = MutableStateFlow(SettingsState())
    val state: StateFlow<SettingsState> = _state.asStateFlow()

    init {
        viewModelScope.launch { graph.session.identityChanges.collect { _state.value = SettingsState(); load() } }
        load()
    }

    fun load() {
        val snapshot = graph.session.current() ?: return
        val me = graph.session.currentMe() ?: return
        _state.value = _state.value.copy(loading = true, error = null, errorRes = null, loadFailed = false,
            local = graph.localPlaybackPrefs.get(me.server.machineId, me.profile.userId))
        viewModelScope.launch {
            try {
                val preferences = graph.api.preferences(snapshot)
                val devices = graph.api.devices(snapshot).items
                if (graph.session.current() == snapshot) {
                    _state.value = SettingsState(
                        loading = false,
                        preferences = preferences,
                        devices = devices,
                        local = graph.localPlaybackPrefs.get(me.server.machineId, me.profile.userId),
                    )
                }
            } catch (error: Exception) {
                if (graph.session.current() == snapshot) {
                    _state.value = _state.value.copy(
                        loading = false,
                        loadFailed = true,
                        error = error.message,
                        errorRes = if (error.message == null) R.string.settings_load_failed else null,
                    )
                }
            }
        }
    }

    fun setServerPreference(key: String, value: Boolean) {
        val snapshot = graph.session.current() ?: return
        val previous = _state.value.preferences ?: return
        if (previous.booleanValue(key) == value || _state.value.savingKey != null) return
        viewModelScope.launch {
            _state.value = _state.value.copy(savingKey = key, error = null, errorRes = null)
            try {
                val updated = graph.api.updatePreferences(snapshot, buildJsonObject { put(key, JsonPrimitive(value)) })
                if (graph.session.current() == snapshot) {
                    _state.value = _state.value.copy(preferences = updated, savingKey = null)
                }
            } catch (error: Exception) {
                if (graph.session.current() == snapshot) {
                    _state.value = _state.value.copy(
                        savingKey = null,
                        error = error.message,
                        errorRes = if (error.message == null) R.string.settings_save_failed else null,
                    )
                }
            }
        }
    }

    fun setLocal(transform: (ProfilePlaybackPrefs) -> ProfilePlaybackPrefs) {
        val me = graph.session.currentMe() ?: return
        val updated = transform(graph.localPlaybackPrefs.get(me.server.machineId, me.profile.userId))
        graph.localPlaybackPrefs.set(me.server.machineId, me.profile.userId, updated)
        _state.value = _state.value.copy(local = updated, error = null, errorRes = null)
    }

    fun revoke(device: DeviceSummary) {
        val snapshot = graph.session.current() ?: return
        viewModelScope.launch {
            try {
                graph.api.revokeDevice(snapshot, device.deviceSessionId)
                if (device.current) {
                    clearLocalAndSignOut()
                } else if (graph.session.current() == snapshot) {
                    _state.value = _state.value.copy(devices = _state.value.devices.filterNot { it.deviceSessionId == device.deviceSessionId })
                }
            } catch (error: Exception) {
                if (graph.session.current() == snapshot) _state.value = _state.value.copy(
                    error = error.message,
                    errorRes = if (error.message == null) R.string.device_revoke_failed else null,
                )
            }
        }
    }

    fun signOut() {
        viewModelScope.launch { clearLocalAndSignOut() }
    }

    fun changeServer() {
        viewModelScope.launch {
            clearLocalAndSignOut()
            graph.session.changeServer()
        }
    }

    private suspend fun clearLocalAndSignOut() {
        graph.session.currentMe()?.let { graph.localPlaybackPrefs.clear(it.server.machineId, it.profile.userId) }
        graph.session.signOut()
    }
}

@Composable
fun SettingsScreen(graph: AppGraph) {
    val model: SettingsViewModel = viewModel { SettingsViewModel(graph) }
    val state by model.state.collectAsStateWithLifecycle()
    SettingsContent(state, graph.session.currentMe(), graph.session.current(),
        model::setServerPreference, model::setLocal, model::revoke, model::signOut, model::changeServer, model::load)
}

@Composable
internal fun SettingsContent(
    state: SettingsState,
    me: MeResponse?,
    snapshot: SessionSnapshot?,
    onServerPreference: (String, Boolean) -> Unit,
    onLocal: ((ProfilePlaybackPrefs) -> ProfilePlaybackPrefs) -> Unit,
    onRevoke: (DeviceSummary) -> Unit,
    onSignOut: () -> Unit,
    onChangeServer: () -> Unit,
    onRetry: () -> Unit = {},
) {
    var category by remember(snapshot?.deviceSessionId, snapshot?.identityVersion) { mutableStateOf<SettingsCategory?>(null) }
    var choice by remember(snapshot?.deviceSessionId, snapshot?.identityVersion) { mutableStateOf<SettingsChoice?>(null) }
    var returnCategory by remember { mutableStateOf(SettingsCategory.ACCOUNT) }
    var returnChoice by remember { mutableStateOf<SettingsChoice?>(null) }
    var forwardEntry by remember { mutableStateOf(false) }
    val pageKey = choice?.name ?: category?.name ?: "root"
    val primary = remember(pageKey, returnChoice, returnCategory) { FocusRequester() }
    val listStates = remember { mutableMapOf<String, LazyListState>() }
    val listState = listStates.getOrPut(pageKey) { LazyListState() }
    val windowFocused = LocalWindowInfo.current.isWindowFocused
    LaunchedEffect(primary, windowFocused, state.loading) {
        if (windowFocused && !state.loading) {
            if (forwardEntry) {
                listState.scrollToItem(0)
                forwardEntry = false
            }
            withFrameNanos { }
            primary.requestFocus()
        }
    }
    val navigateBack: () -> Unit = {
        forwardEntry = false
        if (choice != null) {
            returnChoice = choice
            choice = null
        } else {
            category = null
            returnChoice = null
        }
    }
    BackHandler(category != null, onBack = navigateBack)
    val settingsLabel = stringResource(R.string.settings)
    val title = choice?.title ?: category?.title ?: R.string.settings
    val selectedChoice = choice
    val selectedCategory = category
    fun openChoice(entry: SettingsChoice) {
        forwardEntry = true
        choice = entry
    }
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(start = 240.dp, end = 16.dp, top = 16.dp, bottom = 16.dp)) {
        LazyColumn(
            state = listState,
            modifier = Modifier.width(400.dp).fillMaxHeight().clip(RoundedCornerShape(4.dp)).background(Color.Black)
                .semantics { contentDescription = settingsLabel }
                .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(4.dp)),
            contentPadding = PaddingValues(32.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item { Row(Modifier.fillMaxWidth().padding(bottom = 28.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(title), fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f).semantics { heading() })
                if (selectedCategory != null) TvAction(stringResource(R.string.panel_back), TvSymbol.Back, navigateBack, iconOnly = true)
            } }
            state.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) } }
            state.errorRes?.let { errorRes -> item { Text(stringResource(errorRes), color = MaterialTheme.colorScheme.error, fontSize = 13.sp) } }
            if (state.loadFailed) item { SettingsButton(stringResource(R.string.retry), onClick = onRetry) }
            if (state.loading) item { Text(stringResource(R.string.loading), fontSize = 13.sp) }
            if (selectedChoice != null) {
                items(selectedChoice.options()) { option ->
                    SettingsButton(stringResource(option.label),
                        modifier = if (option == selectedChoice.options().first()) Modifier.focusRequester(primary) else Modifier,
                        selected = option.value == selectedChoice.value(state.local)) {
                        onLocal { selectedChoice.update(it, option.value) }
                        returnChoice = selectedChoice
                        choice = null
                    }
                }
            } else when (selectedCategory) {
                null -> items(SettingsCategory.entries) { entry ->
                    SettingsButton(stringResource(entry.title), if (entry == returnCategory) Modifier.focusRequester(primary) else Modifier) {
                        returnCategory = entry
                        returnChoice = null
                        forwardEntry = true
                        category = entry
                    }
                }
                SettingsCategory.ACCOUNT -> {
                    val profile = me?.profile?.title?.takeIf { it.isNotBlank() }
                    profile?.let { item { SettingsInfoRow(it, Modifier.focusRequester(primary)) } }
                    me?.server?.name?.takeIf { it.isNotBlank() }?.let { item { SettingsInfoRow(it) } }
                    snapshot?.baseUrl?.host?.let { item { SettingsInfoRow(it) } }
                    item { SettingsButton(stringResource(R.string.sign_out), if (profile == null) Modifier.focusRequester(primary) else Modifier, onClick = onSignOut) }
                    item { SettingsButton(stringResource(R.string.change_server), onClick = onChangeServer) }
                }
                SettingsCategory.EXPERIENCE -> {
                    state.preferences?.let { prefs ->
                        item { PreferenceToggle(stringResource(R.string.preference_continue_watching), prefs.showContinueWatching, state.savingKey != null, Modifier.focusRequester(primary)) { onServerPreference("showContinueWatching", it) } }
                        item { PreferenceToggle(stringResource(R.string.preference_recently_added), prefs.showRecentlyAdded, state.savingKey != null) { onServerPreference("showRecentlyAdded", it) } }
                        item { PreferenceToggle(stringResource(R.string.preference_trending), prefs.showTrending, state.savingKey != null) { onServerPreference("showTrending", it) } }
                        item { PreferenceToggle(stringResource(R.string.collections), prefs.showCollections, state.savingKey != null) { onServerPreference("showCollections", it) } }
                        item { PreferenceToggle(stringResource(R.string.preference_discovery_disabled), prefs.discoveryDisabled, state.savingKey != null) { onServerPreference("discoveryDisabled", it) } }
                    } ?: item { SettingsInfoRow(state.error ?: stringResource(R.string.settings_load_failed), Modifier.focusRequester(primary)) }
                }
                SettingsCategory.PLAYER -> {
                    state.preferences?.let { prefs ->
                        item { PreferenceToggle(stringResource(R.string.preference_auto_skip_intro), prefs.autoSkipIntro, state.savingKey != null, Modifier.focusRequester(primary)) { onServerPreference("autoSkipIntro", it) } }
                        item { PreferenceToggle(stringResource(R.string.preference_autoplay_next), prefs.autoPlayNextEpisode, state.savingKey != null) { onServerPreference("autoPlayNextEpisode", it) } }
                    } ?: item { SettingsInfoRow(state.error ?: stringResource(R.string.settings_load_failed), Modifier.focusRequester(primary)) }
                }
                SettingsCategory.VIDEO_AUDIO -> {
                    item { SectionTitle(stringResource(R.string.settings_video), Modifier.padding(bottom = 4.dp)) }
                    listOf(SettingsChoice.QUALITY, SettingsChoice.BITRATE, SettingsChoice.SPEED, SettingsChoice.DISPLAY).forEach { entry ->
                        item { SettingsButton(stringResource(entry.title), if (entry == (returnChoice ?: SettingsChoice.QUALITY)) Modifier.focusRequester(primary) else Modifier,
                            value = entry.label(state.local)) { openChoice(entry) } }
                    }
                    item { PreferenceToggle(stringResource(R.string.preference_match_frame_rate), state.local.matchFrameRate, false) { value -> onLocal { it.copy(matchFrameRate = value) } } }
                    item { SectionTitle(stringResource(R.string.settings_audio), Modifier.padding(top = 20.dp)) }
                    item { SettingsButton(stringResource(SettingsChoice.AUDIO_LANGUAGE.title), if (returnChoice == SettingsChoice.AUDIO_LANGUAGE) Modifier.focusRequester(primary) else Modifier,
                        value = SettingsChoice.AUDIO_LANGUAGE.label(state.local)) { openChoice(SettingsChoice.AUDIO_LANGUAGE) } }
                    item { PreferenceToggle(stringResource(R.string.preference_audio_description), state.local.preferAudioDescription, false) { value -> onLocal { it.copy(preferAudioDescription = value) } } }
                }
                SettingsCategory.SUBTITLES -> {
                    listOf(SettingsChoice.SUBTITLE_LANGUAGE, SettingsChoice.SUBTITLE_MODE).forEach { entry ->
                        item { SettingsButton(stringResource(entry.title), if (entry == (returnChoice ?: SettingsChoice.SUBTITLE_LANGUAGE)) Modifier.focusRequester(primary) else Modifier,
                            value = entry.label(state.local)) { openChoice(entry) } }
                    }
                }
                SettingsCategory.ADVANCED -> {
                    item { SectionTitle(stringResource(R.string.linked_devices), Modifier.padding(bottom = 4.dp)) }
                    if (state.devices.isEmpty()) item { SettingsInfoRow(state.error ?: stringResource(R.string.settings_no_devices), Modifier.focusRequester(primary)) }
                    items(state.devices, key = { it.deviceSessionId }) { device ->
                        SettingsButton(device.name + device.model?.takeIf { it.isNotBlank() }?.let { "\n$it" }.orEmpty(),
                            if (device == state.devices.first()) Modifier.focusRequester(primary) else Modifier,
                            value = stringResource(if (device.current) R.string.sign_out else R.string.revoke_device)) { onRevoke(device) }
                    }
                    item { SettingsInfoRow(stringResource(R.string.diagnostic_server, snapshot?.baseUrl?.host.orEmpty(), me?.server?.name.orEmpty())) }
                }
                SettingsCategory.ABOUT -> {
                    item { SettingsInfoRow(stringResource(R.string.diagnostic_app, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE), Modifier.focusRequester(primary)) }
                    item { SettingsInfoRow(stringResource(R.string.diagnostic_device, snapshot?.deviceSessionId?.takeLast(6).orEmpty(), snapshot?.identityVersion ?: 0)) }
                }
            }
            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

private enum class SettingsCategory(@StringRes val title: Int) {
    ACCOUNT(R.string.settings_account), EXPERIENCE(R.string.settings_experience), PLAYER(R.string.settings_player_experience),
    VIDEO_AUDIO(R.string.settings_video_audio), SUBTITLES(R.string.preference_subtitle_mode), ADVANCED(R.string.settings_advanced), ABOUT(R.string.settings_about),
}

private enum class SettingsChoice(@StringRes val title: Int) {
    QUALITY(R.string.preference_quality), BITRATE(R.string.preference_max_bitrate), AUDIO_LANGUAGE(R.string.preference_audio_language),
    SUBTITLE_LANGUAGE(R.string.preference_subtitle_language), SUBTITLE_MODE(R.string.settings_subtitle_mode),
    SPEED(R.string.player_playback_speed), DISPLAY(R.string.player_display_mode);

    fun options(): List<ChoiceOption> = when (this) {
        QUALITY -> QUALITY_OPTIONS
        BITRATE -> BITRATE_OPTIONS
        AUDIO_LANGUAGE, SUBTITLE_LANGUAGE -> LANGUAGE_OPTIONS
        SUBTITLE_MODE -> SUBTITLE_OPTIONS
        SPEED -> SPEED_OPTIONS
        DISPLAY -> DISPLAY_OPTIONS
    }

    fun value(prefs: ProfilePlaybackPrefs): String? = when (this) {
        QUALITY -> prefs.defaultQuality
        BITRATE -> prefs.maxBitrateKbps?.toString()
        AUDIO_LANGUAGE -> prefs.preferredAudioLanguage
        SUBTITLE_LANGUAGE -> prefs.preferredSubtitleLanguage
        SUBTITLE_MODE -> prefs.subtitleMode.name
        SPEED -> prefs.playbackSpeed.toString()
        DISPLAY -> prefs.videoDisplayMode.name
    }

    @Composable fun label(prefs: ProfilePlaybackPrefs): String = stringResource(options().firstOrNull { it.value == value(prefs) }?.label ?: R.string.default_option)

    fun update(prefs: ProfilePlaybackPrefs, selected: String?): ProfilePlaybackPrefs = when (this) {
        QUALITY -> prefs.copy(defaultQuality = requireNotNull(selected))
        BITRATE -> prefs.copy(maxBitrateKbps = selected?.toInt())
        AUDIO_LANGUAGE -> prefs.copy(preferredAudioLanguage = selected)
        SUBTITLE_LANGUAGE -> prefs.copy(preferredSubtitleLanguage = selected)
        SUBTITLE_MODE -> prefs.copy(subtitleMode = SubtitleMode.valueOf(requireNotNull(selected)))
        SPEED -> prefs.copy(playbackSpeed = requireNotNull(selected).toFloat())
        DISPLAY -> prefs.copy(videoDisplayMode = VideoDisplayMode.valueOf(requireNotNull(selected)))
    }
}

@Composable
private fun SettingsButton(label: String, modifier: Modifier = Modifier, value: String? = null, selected: Boolean? = null, onClick: () -> Unit) {
    val detailed = '\n' in label
    var focused by remember { mutableStateOf(false) }
    Button(onClick = onClick, modifier = modifier.fillMaxWidth().heightIn(min = if (detailed) 44.dp else 32.dp)
        .onFocusChanged { focused = it.isFocused }.pointerClick(onClick = onClick)
        .semantics { selected?.let { this.selected = it } },
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
        shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
        scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
        colors = ButtonDefaults.colors(containerColor = Color.Transparent, contentColor = Color.White, focusedContainerColor = Color.White, focusedContentColor = Color.Black),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text(label.substringBefore('\n'), fontSize = 13.sp, lineHeight = if (detailed) 15.sp else 16.sp, maxLines = if (focused) Int.MAX_VALUE else 1, overflow = TextOverflow.Ellipsis)
                if (detailed) Text(label.substringAfter('\n'), fontSize = 10.sp, lineHeight = 12.sp, maxLines = if (focused) Int.MAX_VALUE else 1, overflow = TextOverflow.Ellipsis)
            }
            if (value != null) Text(value, modifier = Modifier.widthIn(max = 128.dp), fontSize = 11.sp, lineHeight = 14.sp,
                textAlign = TextAlign.End, maxLines = if (focused) Int.MAX_VALUE else 1, overflow = TextOverflow.Ellipsis)
            if (selected != null) Box(Modifier.size(16.dp).border(1.dp, Color.Gray, CircleShape), contentAlignment = Alignment.Center) {
                if (selected) Box(Modifier.size(8.dp).background(MaterialTheme.colorScheme.primary, CircleShape))
            }
        }
    }
}

@Composable
private fun SettingsInfoRow(value: String, modifier: Modifier = Modifier) {
    var focused by remember { mutableStateOf(false) }
    Text(value, fontSize = 13.sp, lineHeight = 16.sp, color = if (focused) Color.Black else Color.LightGray,
        modifier = modifier.fillMaxWidth().heightIn(min = 32.dp).onFocusChanged { focused = it.isFocused }
            .background(if (focused) Color.White else Color.Transparent, RoundedCornerShape(4.dp))
            .focusProperties { canFocus = true }.focusable().padding(horizontal = 12.dp, vertical = 6.dp))
}

@Composable
private fun SectionTitle(value: String, modifier: Modifier = Modifier) = Text(
    value,
    fontSize = 16.sp,
    fontWeight = FontWeight.SemiBold,
    modifier = modifier.semantics { heading() },
)

@Composable
private fun PreferenceToggle(
    label: String,
    checked: Boolean,
    busy: Boolean,
    modifier: Modifier = Modifier,
    update: (Boolean) -> Unit,
) {
    val toggle = { update(!checked) }
    Button(
        onClick = toggle, enabled = !busy,
        modifier = modifier.fillMaxWidth().height(32.dp).pointerClick(enabled = !busy, onClick = toggle)
            .semantics { toggleableState = ToggleableState(checked) },
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
        shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
        scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
        colors = ButtonDefaults.colors(containerColor = Color.Transparent, contentColor = Color.White,
            focusedContainerColor = Color.White, focusedContentColor = Color.Black),
    ) {
        Text(label, fontSize = 13.sp, lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        TvToggleIndicator(checked = checked, enabled = !busy)
    }
}

private fun Preferences.booleanValue(key: String): Boolean = when (key) {
    "autoSkipIntro" -> autoSkipIntro
    "autoPlayNextEpisode" -> autoPlayNextEpisode
    "showContinueWatching" -> showContinueWatching
    "showRecentlyAdded" -> showRecentlyAdded
    "showTrending" -> showTrending
    "showCollections" -> showCollections
    "discoveryDisabled" -> discoveryDisabled
    else -> false
}

private data class ChoiceOption(val value: String?, @StringRes val label: Int)

private val QUALITY_OPTIONS = listOf(
    ChoiceOption("original", R.string.quality_original),
    ChoiceOption("1080p-20", R.string.quality_1080p_20),
    ChoiceOption("1080p-12", R.string.quality_1080p_12),
    ChoiceOption("1080p-8", R.string.quality_1080p_8),
    ChoiceOption("720p-4", R.string.quality_720p_4),
    ChoiceOption("720p-2", R.string.quality_720p_2),
    ChoiceOption("480p-1.5", R.string.quality_480p_15),
)

private val BITRATE_OPTIONS = listOf(
    ChoiceOption(null, R.string.default_option),
    ChoiceOption("2000", R.string.bitrate_2),
    ChoiceOption("4000", R.string.bitrate_4),
    ChoiceOption("8000", R.string.bitrate_8),
    ChoiceOption("12000", R.string.bitrate_12),
    ChoiceOption("20000", R.string.bitrate_20),
)

private val LANGUAGE_OPTIONS = listOf(
    ChoiceOption(null, R.string.default_option),
    ChoiceOption("en", R.string.language_english),
    ChoiceOption("es", R.string.language_spanish),
    ChoiceOption("fr", R.string.language_french),
    ChoiceOption("de", R.string.language_german),
    ChoiceOption("it", R.string.language_italian),
    ChoiceOption("pt", R.string.language_portuguese),
    ChoiceOption("ja", R.string.language_japanese),
    ChoiceOption("ko", R.string.language_korean),
    ChoiceOption("zh", R.string.language_chinese),
)

private val SUBTITLE_OPTIONS = listOf(
    ChoiceOption(SubtitleMode.AUTO.name, R.string.subtitle_auto),
    ChoiceOption(SubtitleMode.ALWAYS.name, R.string.subtitle_always),
    ChoiceOption(SubtitleMode.FORCED_ONLY.name, R.string.subtitle_forced_only),
    ChoiceOption(SubtitleMode.OFF.name, R.string.subtitle_off),
)

private val SPEED_OPTIONS = listOf(
    ChoiceOption("0.5", R.string.settings_speed_05), ChoiceOption("0.75", R.string.settings_speed_075),
    ChoiceOption("1.0", R.string.player_speed_normal), ChoiceOption("1.25", R.string.settings_speed_125),
    ChoiceOption("1.5", R.string.settings_speed_15), ChoiceOption("1.75", R.string.settings_speed_175),
    ChoiceOption("2.0", R.string.settings_speed_2),
)

private val DISPLAY_OPTIONS = listOf(
    ChoiceOption(VideoDisplayMode.LETTERBOX.name, R.string.player_display_letterbox),
    ChoiceOption(VideoDisplayMode.STRETCH.name, R.string.player_display_stretch),
    ChoiceOption(VideoDisplayMode.ZOOM.name, R.string.player_display_zoom),
)
