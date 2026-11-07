package io.github.jovalle.watchtower.tv.services

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.github.jovalle.watchtower.tv.api.ApiException
import io.github.jovalle.watchtower.tv.api.IssueDetail
import io.github.jovalle.watchtower.tv.api.ServicePage
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.auth.IdentityChange
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SeerrInboxState<T>(
    val items: List<T> = emptyList(),
    val page: Int = 1,
    val pages: Int = 0,
    val totalResults: Int = 0,
    val filter: String = "all",
    val loading: Boolean = true,
    val error: String? = null,
)

class SeerrInboxViewModel<T>(
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
    private val loadPage: suspend (SessionSnapshot, Int, String) -> ServicePage<T>,
) : ViewModel() {
    private val _state = MutableStateFlow(SeerrInboxState<T>())
    val state = _state.asStateFlow()
    private var request: Job? = null
    private var generation = 0

    init {
        viewModelScope.launch {
            identityChanges.collect {
                _state.value = SeerrInboxState()
                reload()
            }
        }
        reload()
    }

    fun setFilter(filter: String) {
        if (_state.value.filter == filter) return
        _state.value = SeerrInboxState(filter = filter)
        reload()
    }

    fun goToPage(page: Int) {
        if (page < 1 || page > _state.value.pages || page == _state.value.page) return
        _state.value = _state.value.copy(items = emptyList(), page = page)
        reload()
    }

    fun reload() {
        val ticket = ++generation
        request?.cancel()
        val owner = current()
        if (owner == null) {
            _state.value = SeerrInboxState(loading = false)
            return
        }
        val page = _state.value.page
        val filter = _state.value.filter
        _state.value = _state.value.copy(loading = true, error = null)
        request = viewModelScope.launch {
            try {
                val loaded = loadPage(owner, page, filter)
                if (ticket == generation && current() == owner) {
                    _state.value = SeerrInboxState(loaded.items, loaded.page, loaded.pages, loaded.totalResults, filter, loading = false)
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (ticket == generation && current() == owner) _state.value = _state.value.copy(loading = false, error = error.serviceMessage())
            }
        }
    }
}

data class SeerrIssueDetailState(val issue: IssueDetail? = null, val loading: Boolean = true, val error: String? = null)

class SeerrIssueDetailViewModel(
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
    private val loadIssue: suspend (SessionSnapshot) -> IssueDetail,
) : ViewModel() {
    private val _state = MutableStateFlow(SeerrIssueDetailState())
    val state = _state.asStateFlow()
    private var request: Job? = null
    private var generation = 0

    init {
        viewModelScope.launch { identityChanges.collect { _state.value = SeerrIssueDetailState(); reload() } }
        reload()
    }

    fun reload() {
        val ticket = ++generation
        request?.cancel()
        val owner = current()
        if (owner == null) {
            _state.value = SeerrIssueDetailState(loading = false)
            return
        }
        _state.value = SeerrIssueDetailState()
        request = viewModelScope.launch {
            try {
                val issue = loadIssue(owner)
                if (ticket == generation && current() == owner) _state.value = SeerrIssueDetailState(issue, loading = false)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (ticket == generation && current() == owner) _state.value = SeerrIssueDetailState(loading = false, error = error.serviceMessage())
            }
        }
    }
}

private fun Exception.serviceMessage(): String = when {
    this is ApiException && code == "requests_not_linked" -> "This Plex profile is not linked to Seerr. Ask the server owner to link it, then try again."
    else -> message?.takeIf { it.isNotBlank() } ?: "Requests and issues could not be loaded. Try again."
}
