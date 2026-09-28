package io.github.jovalle.watchtower.tv.catalog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.github.jovalle.watchtower.tv.api.HomeResponse
import io.github.jovalle.watchtower.tv.api.LibrarySection
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.Page
import io.github.jovalle.watchtower.tv.api.SearchResponse
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.api.WatchlistResponse
import io.github.jovalle.watchtower.tv.api.WatchtowerApi
import io.github.jovalle.watchtower.tv.auth.IdentityChange
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch

interface CatalogDataSource {
    suspend fun home(snapshot: SessionSnapshot): HomeResponse
    suspend fun libraries(snapshot: SessionSnapshot): List<LibrarySection>
    suspend fun libraryItems(
        snapshot: SessionSnapshot,
        sectionId: String,
        sort: String,
        filter: String,
        cursor: String?,
    ): Page<MediaSummary>
    suspend fun media(snapshot: SessionSnapshot, ratingKey: String): MediaDetail
    suspend fun children(snapshot: SessionSnapshot, ratingKey: String): List<MediaSummary>
    suspend fun search(snapshot: SessionSnapshot, query: String): SearchResponse
    suspend fun watchlist(snapshot: SessionSnapshot, source: String): WatchlistResponse
    suspend fun setWatched(snapshot: SessionSnapshot, ratingKey: String, watched: Boolean)
    suspend fun setRating(snapshot: SessionSnapshot, ratingKey: String, rating: Double?)
    suspend fun setWatchlist(snapshot: SessionSnapshot, ratingKey: String, add: Boolean)
}

class ApiCatalogDataSource(private val api: WatchtowerApi) : CatalogDataSource {
    override suspend fun home(snapshot: SessionSnapshot) = api.home(snapshot)
    override suspend fun libraries(snapshot: SessionSnapshot) = api.libraries(snapshot).items
    override suspend fun libraryItems(
        snapshot: SessionSnapshot,
        sectionId: String,
        sort: String,
        filter: String,
        cursor: String?,
    ) = api.libraryItems(snapshot, sectionId, sort, filter, limit = 50, cursor = cursor)
    override suspend fun media(snapshot: SessionSnapshot, ratingKey: String) = api.media(snapshot, ratingKey)
    override suspend fun children(snapshot: SessionSnapshot, ratingKey: String) =
        api.children(snapshot, ratingKey).items
    override suspend fun search(snapshot: SessionSnapshot, query: String) = api.search(snapshot, query)
    override suspend fun watchlist(snapshot: SessionSnapshot, source: String) = api.watchlist(snapshot, source)
    override suspend fun setWatched(snapshot: SessionSnapshot, ratingKey: String, watched: Boolean) =
        api.setWatched(snapshot, ratingKey, watched)
    override suspend fun setRating(snapshot: SessionSnapshot, ratingKey: String, rating: Double?) =
        api.setRating(snapshot, ratingKey, rating)
    override suspend fun setWatchlist(snapshot: SessionSnapshot, ratingKey: String, add: Boolean) {
        val body = io.github.jovalle.watchtower.tv.api.WatchlistMutationRequest(ratingKey, null)
        if (add) api.addToWatchlist(snapshot, body) else api.removeFromWatchlist(snapshot, body)
    }
}

sealed interface LoadState<out T> {
    data object Loading : LoadState<Nothing>
    data class Content<T>(val value: T) : LoadState<T>
    data class Error(val message: String) : LoadState<Nothing>
}

data class LibraryState(
    val items: List<MediaSummary> = emptyList(),
    val sort: String = "titleSort:asc",
    val filter: String = "all",
    val nextCursor: String? = null,
    val loading: Boolean = false,
    val endReached: Boolean = false,
    val error: String? = null,
    val focusedKey: String? = null,
    val focusedIndex: Int = 0,
)

data class DetailState(
    val detail: MediaDetail? = null,
    val seasons: List<MediaSummary> = emptyList(),
    val episodes: Map<String, List<MediaSummary>> = emptyMap(),
    val loading: Boolean = true,
    val mutationInFlight: Boolean = false,
    val message: String? = null,
    val error: String? = null,
)

data class SearchState(
    val query: String = "",
    val loading: Boolean = false,
    val result: SearchResponse? = null,
    val error: String? = null,
)

class HomeViewModel(
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<HomeResponse>>(LoadState.Loading)
    val state: StateFlow<LoadState<HomeResponse>> = _state.asStateFlow()
    private var request: Job? = null

    init {
        viewModelScope.launch {
            identityChanges.collect {
                request?.cancel()
                _state.value = LoadState.Loading
                reload()
            }
        }
        reload()
    }

    fun reload() {
        request?.cancel()
        val snapshot = current() ?: return
        request = viewModelScope.launch {
            _state.value = LoadState.Loading
            try {
                val result = data.home(snapshot)
                if (current() == snapshot) _state.value = LoadState.Content(result)
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = LoadState.Error(error.displayMessage())
            }
        }
    }
}

class NavigationViewModel(
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<List<LibrarySection>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<LibrarySection>>> = _state.asStateFlow()

    init {
        viewModelScope.launch { identityChanges.collect { _state.value = LoadState.Loading; load() } }
        load()
    }

    fun load() {
        val snapshot = current() ?: return
        viewModelScope.launch {
            try {
                val result = data.libraries(snapshot)
                if (current() == snapshot) _state.value = LoadState.Content(result)
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = LoadState.Error(error.displayMessage())
            }
        }
    }
}

class LibraryViewModel(
    private val sectionId: String,
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val _state = MutableStateFlow(LibraryState())
    val state: StateFlow<LibraryState> = _state.asStateFlow()
    private var request: Job? = null

    init {
        viewModelScope.launch { identityChanges.collect { reset() } }
        reload()
    }

    fun setSort(sort: String) {
        if (_state.value.sort == sort) return
        _state.value = _state.value.copy(sort = sort)
        reload()
    }

    fun setFilter(filter: String) {
        if (_state.value.filter == filter) return
        _state.value = _state.value.copy(filter = filter)
        reload()
    }

    fun rememberFocus(ratingKey: String, index: Int) {
        _state.value = _state.value.copy(focusedKey = ratingKey, focusedIndex = index)
    }

    fun loadNear(index: Int) {
        if (index >= _state.value.items.lastIndex - 8) loadNext()
    }

    fun reload() {
        request?.cancel()
        _state.value = LibraryState(
            sort = _state.value.sort,
            filter = _state.value.filter,
            focusedKey = _state.value.focusedKey,
            focusedIndex = _state.value.focusedIndex,
        )
        loadNext()
    }

    fun loadNext() {
        val before = _state.value
        if (before.loading || before.endReached) return
        val snapshot = current() ?: return
        request = viewModelScope.launch {
            _state.value = before.copy(loading = true, error = null)
            try {
                val page = data.libraryItems(snapshot, sectionId, before.sort, before.filter, before.nextCursor)
                if (current() != snapshot) return@launch
                val combined = (before.items + page.items).distinctBy { it.ratingKey }
                _state.value = before.copy(
                    items = combined,
                    nextCursor = page.nextCursor,
                    loading = false,
                    endReached = page.nextCursor == null,
                )
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = before.copy(loading = false, error = error.displayMessage())
            }
        }
    }

    private fun reset() {
        request?.cancel()
        _state.value = LibraryState(sort = _state.value.sort, filter = _state.value.filter)
    }
}

@OptIn(FlowPreview::class)
class SearchViewModel(
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val query = MutableStateFlow("")
    private val _state = MutableStateFlow(SearchState())
    val state: StateFlow<SearchState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            identityChanges.collect { query.value = ""; _state.value = SearchState() }
        }
        viewModelScope.launch {
            query.debounce(300).collectLatest { value ->
                if (value.isBlank()) {
                    _state.value = SearchState()
                    return@collectLatest
                }
                val snapshot = current() ?: return@collectLatest
                _state.value = SearchState(query = value, loading = true)
                try {
                    val result = data.search(snapshot, value)
                    if (current() == snapshot && query.value == value) {
                        _state.value = SearchState(query = value, result = result)
                    }
                } catch (error: Exception) {
                    if (current() == snapshot && query.value == value) {
                        _state.value = SearchState(query = value, error = error.displayMessage())
                    }
                }
            }
        }
    }

    fun search(value: String) {
        query.value = value
        _state.value = _state.value.copy(query = value)
    }
}

class DetailViewModel(
    private val ratingKey: String,
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val _state = MutableStateFlow(DetailState())
    val state: StateFlow<DetailState> = _state.asStateFlow()
    private var request: Job? = null

    init {
        viewModelScope.launch { identityChanges.collect { request?.cancel(); _state.value = DetailState() } }
        reload()
    }

    fun reload() {
        request?.cancel()
        val snapshot = current() ?: return
        request = viewModelScope.launch {
            _state.value = DetailState()
            try {
                val detail = data.media(snapshot, ratingKey)
                val seasons = if (detail.type == "show") orderSeasons(data.children(snapshot, ratingKey)) else emptyList()
                if (current() == snapshot) _state.value = DetailState(detail = detail, seasons = seasons, loading = false)
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = DetailState(loading = false, error = error.displayMessage())
            }
        }
    }

    fun loadSeason(season: MediaSummary) {
        val key = season.ratingKey ?: return
        if (_state.value.episodes.containsKey(key)) return
        val snapshot = current() ?: return
        viewModelScope.launch {
            try {
                val episodes = data.children(snapshot, key)
                if (current() == snapshot) _state.value = _state.value.copy(episodes = _state.value.episodes + (key to episodes))
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = _state.value.copy(error = error.displayMessage())
            }
        }
    }

    fun setWatched(watched: Boolean) = mutate {
        data.setWatched(it, ratingKey, watched)
        val detail = _state.value.detail ?: return@mutate
        _state.value = _state.value.copy(detail = detail.copy(viewCount = if (watched) maxOf(1, detail.viewCount) else 0))
    }

    fun setRating(rating: Double?) = mutate {
        data.setRating(it, ratingKey, rating)
        _state.value = _state.value.copy(detail = _state.value.detail?.copy(userRating = rating))
    }

    fun setWatchlist(add: Boolean) = mutate {
        data.setWatchlist(it, ratingKey, add)
        _state.value = _state.value.copy(detail = _state.value.detail?.copy(onWatchlist = add))
    }

    private fun mutate(block: suspend (SessionSnapshot) -> Unit) {
        if (_state.value.mutationInFlight) return
        val snapshot = current() ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(mutationInFlight = true, message = null, error = null)
            try {
                block(snapshot)
                if (current() == snapshot) _state.value = _state.value.copy(mutationInFlight = false, message = "Saved")
            } catch (error: Exception) {
                if (current() == snapshot) {
                    _state.value = _state.value.copy(mutationInFlight = false, error = error.displayMessage())
                }
            }
        }
    }
}

fun orderSeasons(items: List<MediaSummary>): List<MediaSummary> =
    items.sortedWith(compareBy<MediaSummary> { it.seasonNumber == 0 }.thenBy { it.seasonNumber ?: Int.MAX_VALUE })

fun restoredFocusIndex(previousKey: String?, previousIndex: Int, currentKeys: List<String>): Int {
    if (currentKeys.isEmpty()) return -1
    val exact = previousKey?.let(currentKeys::indexOf) ?: -1
    return if (exact >= 0) exact else previousIndex.coerceIn(0, currentKeys.lastIndex)
}

private fun Exception.displayMessage(): String = message?.takeIf { it.isNotBlank() } ?: "Something went wrong. Try again."