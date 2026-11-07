package io.github.jovalle.watchtower.tv.catalog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.github.jovalle.watchtower.tv.api.ProviderRating
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.auth.IdentityChange
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class MediaRatingsState(
    val ratings: List<ProviderRating>? = null,
    val warnings: List<String> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
)

class MediaRatingsViewModel(
    private val ratingKey: String,
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val _state = MutableStateFlow(MediaRatingsState())
    val state = _state.asStateFlow()
    private var request: Job? = null
    private var generation = 0

    init {
        viewModelScope.launch {
            identityChanges.collect {
                _state.value = MediaRatingsState()
                reload()
            }
        }
        reload()
    }

    fun reload() {
        val ticket = ++generation
        request?.cancel()
        val snapshot = current()
        if (snapshot == null) {
            _state.value = MediaRatingsState(loading = false)
            return
        }
        _state.value = _state.value.copy(loading = true, error = null)
        request = viewModelScope.launch {
            try {
                val response = data.mediaRatings(snapshot, ratingKey)
                if (ticket == generation && current() == snapshot) {
                    _state.value = MediaRatingsState(response.ratings, response.warnings, loading = false)
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                if (ticket == generation && current() == snapshot) {
                    _state.value = _state.value.copy(loading = false, error = "Ratings could not be loaded. Try again.")
                }
            }
        }
    }
}
