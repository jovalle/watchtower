package io.github.jovalle.watchtower.tv.catalog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.github.jovalle.watchtower.tv.api.PersonProfile
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.auth.IdentityChange
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

data class PersonProfileState(
    val profile: PersonProfile? = null,
    val loading: Boolean = true,
    val error: String? = null,
)

class PersonProfileViewModel(
    private val ratingKey: String,
    private val personId: String,
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val _state = MutableStateFlow(PersonProfileState())
    val state = _state.asStateFlow()
    private var request: Job? = null
    private var generation = 0

    init {
        viewModelScope.launch {
            identityChanges.collect {
                request?.cancel()
                _state.value = PersonProfileState()
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
            _state.value = PersonProfileState(loading = false)
            return
        }
        _state.value = _state.value.copy(loading = true, error = null)
        request = viewModelScope.launch {
            try {
                val profile = data.person(snapshot, ratingKey, personId)
                if (ticket == generation && current() == snapshot) {
                    _state.value = PersonProfileState(profile, loading = false)
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (ticket == generation && current() == snapshot) {
                    _state.value = _state.value.copy(loading = false,
                        error = error.message?.takeIf(String::isNotBlank) ?: "Person details could not be loaded. Try again.")
                }
            }
        }
    }
}
