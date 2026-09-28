package io.github.jovalle.watchtower.tv.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
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
    val message: String? = null,
    val error: String? = null,
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
                    _state.value = _state.value.copy(loading = false, error = error.message ?: "Unable to load settings.")
                }
            }
        }
    }

    fun setServerPreference(key: String, value: Boolean) {
        val snapshot = graph.session.current() ?: return
        val previous = _state.value.preferences ?: return
        if (previous.booleanValue(key) == value || _state.value.savingKey != null) return
        viewModelScope.launch {
            _state.value = _state.value.copy(savingKey = key, message = null, error = null)
            try {
                val updated = graph.api.updatePreferences(snapshot, buildJsonObject { put(key, JsonPrimitive(value)) })
                if (graph.session.current() == snapshot) {
                    _state.value = _state.value.copy(preferences = updated, savingKey = null, message = "Saved")
                }
            } catch (error: Exception) {
                if (graph.session.current() == snapshot) {
                    _state.value = _state.value.copy(savingKey = null, error = error.message ?: "The setting was not saved.")
                }
            }
        }
    }

    fun setLocal(transform: (ProfilePlaybackPrefs) -> ProfilePlaybackPrefs) {
        val me = graph.session.currentMe() ?: return
        val updated = transform(_state.value.local)
        graph.localPlaybackPrefs.set(me.server.machineId, me.profile.userId, updated)
        _state.value = _state.value.copy(local = updated, message = "Saved", error = null)
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
                if (graph.session.current() == snapshot) _state.value = _state.value.copy(error = error.message ?: "Device revoke failed.")
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
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(32.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { Text(stringResource(R.string.settings), fontSize = 34.sp, fontWeight = FontWeight.Bold) }
        state.error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 16.sp) } }
        state.message?.let { item { Text(stringResource(R.string.saved), color = MaterialTheme.colorScheme.primary) } }
        state.preferences?.let { preferences ->
            item { SectionTitle(stringResource(R.string.server_preferences)) }
            item { PreferenceToggle("Continue Watching", preferences.showContinueWatching, state.savingKey == "showContinueWatching") { model.setServerPreference("showContinueWatching", it) } }
            item { PreferenceToggle("Recently Added", preferences.showRecentlyAdded, state.savingKey == "showRecentlyAdded") { model.setServerPreference("showRecentlyAdded", it) } }
            item { PreferenceToggle("Trending", preferences.showTrending, state.savingKey == "showTrending") { model.setServerPreference("showTrending", it) } }
            item { PreferenceToggle("Collections", preferences.showCollections, state.savingKey == "showCollections") { model.setServerPreference("showCollections", it) } }
            item { PreferenceToggle("Discovery disabled", preferences.discoveryDisabled, state.savingKey == "discoveryDisabled") { model.setServerPreference("discoveryDisabled", it) } }
            item { PreferenceToggle("Auto-skip intros", preferences.autoSkipIntro, state.savingKey == "autoSkipIntro") { model.setServerPreference("autoSkipIntro", it) } }
            item { PreferenceToggle("Autoplay next episode", preferences.autoPlayNextEpisode, state.savingKey == "autoPlayNextEpisode") { model.setServerPreference("autoPlayNextEpisode", it) } }
        }
        item { SectionTitle(stringResource(R.string.local_playback)) }
        item { ChoiceRow("Quality", QUALITY_OPTIONS, state.local.defaultQuality) { model.setLocal { prefs -> prefs.copy(defaultQuality = it) } } }
        item { ChoiceRow("Subtitles", SubtitleMode.entries.map { it.name }, state.local.subtitleMode.name) { value -> model.setLocal { it.copy(subtitleMode = SubtitleMode.valueOf(value)) } } }
        item { PreferenceToggle("Prefer audio description", state.local.preferAudioDescription, false) { value -> model.setLocal { it.copy(preferAudioDescription = value) } } }
        item { PreferenceToggle("Match frame rate", state.local.matchFrameRate, false) { value -> model.setLocal { it.copy(matchFrameRate = value) } } }
        item { SectionTitle(stringResource(R.string.linked_devices)) }
        items(state.devices, key = { it.deviceSessionId }) { device ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column { Text(device.name, fontSize = 18.sp); Text(device.model.orEmpty(), fontSize = 14.sp, color = Color.LightGray) }
                OutlinedButton(onClick = { model.revoke(device) }) { Text(if (device.current) stringResource(R.string.sign_out) else "Revoke") }
            }
        }
        item { SectionTitle(stringResource(R.string.diagnostics)) }
        item {
            val snapshot: SessionSnapshot? = graph.session.current()
            Text("App ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})", fontSize = 16.sp)
            Text("Server ${snapshot?.baseUrl?.host.orEmpty()} • ${me?.server?.name.orEmpty()} • API v1", fontSize = 16.sp)
            Text("Device …${snapshot?.deviceSessionId?.takeLast(6).orEmpty()} • identity ${snapshot?.identityVersion ?: 0}", fontSize = 16.sp)
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
private fun PreferenceToggle(label: String, checked: Boolean, busy: Boolean, update: (Boolean) -> Unit) {
    Button(onClick = { update(!checked) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = null)
    }
}

@Composable
private fun ChoiceRow(label: String, options: List<String>, selected: String, update: (String) -> Unit) {
    Column {
        Text(label, fontSize = 17.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { option ->
                OutlinedButton(onClick = { update(option) }) { Text(if (option == selected) "$option •" else option) }
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

private val QUALITY_OPTIONS = listOf("original", "1080p-20", "1080p-12", "1080p-8", "720p-4", "720p-2", "480p-1.5")