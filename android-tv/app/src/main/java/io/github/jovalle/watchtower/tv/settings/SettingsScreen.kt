package io.github.jovalle.watchtower.tv.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.annotation.StringRes
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Switch
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.BuildConfig
import io.github.jovalle.watchtower.tv.R
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
    val saved: Boolean = false,
    val error: String? = null,
    @StringRes val errorRes: Int? = null,
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
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
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
            _state.value = _state.value.copy(savingKey = key, saved = false, error = null, errorRes = null)
            try {
                val updated = graph.api.updatePreferences(snapshot, buildJsonObject { put(key, JsonPrimitive(value)) })
                if (graph.session.current() == snapshot) {
                    _state.value = _state.value.copy(preferences = updated, savingKey = null, saved = true)
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
        val updated = transform(_state.value.local)
        graph.localPlaybackPrefs.set(me.server.machineId, me.profile.userId, updated)
        _state.value = _state.value.copy(local = updated, saved = true, error = null, errorRes = null)
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
    val me = graph.session.currentMe()
    val primaryFocus = remember { FocusRequester() }
    var focusRequested by remember { mutableStateOf(false) }
    LaunchedEffect(state.loading, state.preferences) {
        if (!state.loading && !focusRequested) {
            primaryFocus.requestFocus()
            focusRequested = true
        }
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { Text(stringResource(R.string.settings), fontSize = 34.sp, fontWeight = FontWeight.Bold) }
        state.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 16.sp) } }
        state.errorRes?.let { errorRes -> item { Text(stringResource(errorRes), color = MaterialTheme.colorScheme.error, fontSize = 16.sp) } }
        if (state.saved) item { Text(stringResource(R.string.saved), color = MaterialTheme.colorScheme.primary) }
        if (state.loading) item { Text(stringResource(R.string.loading)) }
        state.preferences?.let { preferences ->
            item { SectionTitle(stringResource(R.string.server_preferences)) }
            item { PreferenceToggle(stringResource(R.string.preference_continue_watching), preferences.showContinueWatching, state.savingKey == "showContinueWatching", Modifier.focusRequester(primaryFocus)) { model.setServerPreference("showContinueWatching", it) } }
            item { PreferenceToggle(stringResource(R.string.preference_recently_added), preferences.showRecentlyAdded, state.savingKey == "showRecentlyAdded") { model.setServerPreference("showRecentlyAdded", it) } }
            item { PreferenceToggle(stringResource(R.string.preference_trending), preferences.showTrending, state.savingKey == "showTrending") { model.setServerPreference("showTrending", it) } }
            item { PreferenceToggle(stringResource(R.string.collections), preferences.showCollections, state.savingKey == "showCollections") { model.setServerPreference("showCollections", it) } }
            item { PreferenceToggle(stringResource(R.string.preference_discovery_disabled), preferences.discoveryDisabled, state.savingKey == "discoveryDisabled") { model.setServerPreference("discoveryDisabled", it) } }
            item { PreferenceToggle(stringResource(R.string.preference_auto_skip_intro), preferences.autoSkipIntro, state.savingKey == "autoSkipIntro") { model.setServerPreference("autoSkipIntro", it) } }
            item { PreferenceToggle(stringResource(R.string.preference_autoplay_next), preferences.autoPlayNextEpisode, state.savingKey == "autoPlayNextEpisode") { model.setServerPreference("autoPlayNextEpisode", it) } }
        }
        item { SectionTitle(stringResource(R.string.local_playback)) }
        item { ChoiceRow(stringResource(R.string.preference_quality), QUALITY_OPTIONS, state.local.defaultQuality, if (state.preferences == null) Modifier.focusRequester(primaryFocus) else Modifier) { value -> model.setLocal { it.copy(defaultQuality = requireNotNull(value)) } } }
        item { ChoiceRow(stringResource(R.string.preference_max_bitrate), BITRATE_OPTIONS, state.local.maxBitrateKbps?.toString()) { value -> model.setLocal { it.copy(maxBitrateKbps = value?.toInt()) } } }
        item { ChoiceRow(stringResource(R.string.preference_audio_language), LANGUAGE_OPTIONS, state.local.preferredAudioLanguage) { value -> model.setLocal { it.copy(preferredAudioLanguage = value) } } }
        item { ChoiceRow(stringResource(R.string.preference_subtitle_language), LANGUAGE_OPTIONS, state.local.preferredSubtitleLanguage) { value -> model.setLocal { it.copy(preferredSubtitleLanguage = value) } } }
        item { ChoiceRow(stringResource(R.string.preference_subtitle_mode), SUBTITLE_OPTIONS, state.local.subtitleMode.name) { value -> model.setLocal { it.copy(subtitleMode = SubtitleMode.valueOf(requireNotNull(value))) } } }
        item { PreferenceToggle(stringResource(R.string.preference_audio_description), state.local.preferAudioDescription, false) { value -> model.setLocal { it.copy(preferAudioDescription = value) } } }
        item { PreferenceToggle(stringResource(R.string.preference_match_frame_rate), state.local.matchFrameRate, false) { value -> model.setLocal { it.copy(matchFrameRate = value) } } }
        item { SectionTitle(stringResource(R.string.linked_devices)) }
        items(state.devices, key = { it.deviceSessionId }) { device ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column { Text(device.name, fontSize = 18.sp); Text(device.model.orEmpty(), fontSize = 14.sp, color = Color.LightGray) }
                OutlinedButton(onClick = { model.revoke(device) }) {
                    Text(if (device.current) stringResource(R.string.sign_out) else stringResource(R.string.revoke_device))
                }
            }
        }
        item { SectionTitle(stringResource(R.string.diagnostics)) }
        item {
            val snapshot: SessionSnapshot? = graph.session.current()
            Text(stringResource(R.string.diagnostic_app, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE), fontSize = 16.sp)
            Text(stringResource(R.string.diagnostic_server, snapshot?.baseUrl?.host.orEmpty(), me?.server?.name.orEmpty()), fontSize = 16.sp)
            Text(stringResource(R.string.diagnostic_device, snapshot?.deviceSessionId?.takeLast(6).orEmpty(), snapshot?.identityVersion ?: 0), fontSize = 16.sp)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = model::signOut) { Text(stringResource(R.string.sign_out)) }
                OutlinedButton(onClick = model::changeServer) { Text(stringResource(R.string.change_server)) }
            }
        }
        item { Spacer(Modifier.height(30.dp)) }
    }
}

@Composable
private fun SectionTitle(value: String) = Text(
    value,
    fontSize = 23.sp,
    fontWeight = FontWeight.Bold,
    modifier = Modifier.padding(top = 20.dp).semantics { heading() },
)

@Composable
private fun PreferenceToggle(
    label: String,
    checked: Boolean,
    busy: Boolean,
    modifier: Modifier = Modifier,
    update: (Boolean) -> Unit,
) {
    Button(onClick = { update(!checked) }, enabled = !busy, modifier = modifier.fillMaxWidth()) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = null)
    }
}

@Composable
internal fun ChoiceRow(
    label: String,
    options: List<ChoiceOption>,
    selected: String?,
    firstOptionModifier: Modifier = Modifier,
    update: (String?) -> Unit,
) {
    Column {
        Text(label, fontSize = 17.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEachIndexed { index, option ->
                val optionLabel = stringResource(option.label)
                OutlinedButton(onClick = { update(option.value) }, modifier = if (index == 0) firstOptionModifier else Modifier) {
                    Text(if (option.value == selected) stringResource(R.string.selected_option, optionLabel) else optionLabel)
                }
            }
        }
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

internal data class ChoiceOption(val value: String?, @StringRes val label: Int)

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