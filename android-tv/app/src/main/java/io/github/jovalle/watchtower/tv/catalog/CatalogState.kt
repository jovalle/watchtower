package io.github.jovalle.watchtower.tv.catalog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.github.jovalle.watchtower.tv.api.HomeResponse
import io.github.jovalle.watchtower.tv.api.LibrarySection
import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.Page
import io.github.jovalle.watchtower.tv.api.CollectionSummary
import io.github.jovalle.watchtower.tv.api.PlaylistItem
import io.github.jovalle.watchtower.tv.api.PlaylistSummary
import io.github.jovalle.watchtower.tv.api.RequestAvailability
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
    suspend fun libraryCollections(snapshot: SessionSnapshot, sectionId: String): List<CollectionSummary>
    suspend fun collectionItems(snapshot: SessionSnapshot, collectionId: String, cursor: String?): Page<MediaSummary>
    suspend fun media(snapshot: SessionSnapshot, ratingKey: String): MediaDetail
    suspend fun children(snapshot: SessionSnapshot, ratingKey: String, cursor: String?): Page<MediaSummary>
    suspend fun search(snapshot: SessionSnapshot, query: String): SearchResponse
    suspend fun watchlist(snapshot: SessionSnapshot, source: String): WatchlistResponse
    suspend fun setWatched(snapshot: SessionSnapshot, ratingKey: String, watched: Boolean)
    suspend fun setRating(snapshot: SessionSnapshot, ratingKey: String, rating: Double?)
    suspend fun setWatchlist(snapshot: SessionSnapshot, ratingKey: String, add: Boolean)
    suspend fun playlists(snapshot: SessionSnapshot): List<PlaylistSummary>
    suspend fun playlistItems(snapshot: SessionSnapshot, playlistId: String, cursor: String?): Page<PlaylistItem>
    suspend fun addToPlaylist(snapshot: SessionSnapshot, playlistId: String, ratingKey: String)
    suspend fun removeFromPlaylist(snapshot: SessionSnapshot, playlistId: String, playlistItemId: String)
    suspend fun requestAvailability(snapshot: SessionSnapshot, type: String, tmdbId: Int): RequestAvailability
    suspend fun createRequest(snapshot: SessionSnapshot, type: String, tmdbId: Int): RequestAvailability
    suspend fun createIssue(snapshot: SessionSnapshot, type: String, tmdbId: Int, issueType: Int, message: String)
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
    override suspend fun libraryCollections(snapshot: SessionSnapshot, sectionId: String) =
        api.libraryCollections(snapshot, sectionId).items
    override suspend fun collectionItems(snapshot: SessionSnapshot, collectionId: String, cursor: String?) =
        api.collectionItems(snapshot, collectionId, limit = 50, cursor = cursor)
    override suspend fun media(snapshot: SessionSnapshot, ratingKey: String) = api.media(snapshot, ratingKey)
    override suspend fun children(snapshot: SessionSnapshot, ratingKey: String, cursor: String?) =
        api.children(snapshot, ratingKey, limit = 100, cursor = cursor)
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
    override suspend fun playlists(snapshot: SessionSnapshot) = api.playlists(snapshot).items
    override suspend fun playlistItems(snapshot: SessionSnapshot, playlistId: String, cursor: String?) =
        api.playlistItems(snapshot, playlistId, limit = 50, cursor = cursor)
    override suspend fun addToPlaylist(snapshot: SessionSnapshot, playlistId: String, ratingKey: String) =
        api.addToPlaylist(snapshot, playlistId, ratingKey)
    override suspend fun removeFromPlaylist(snapshot: SessionSnapshot, playlistId: String, playlistItemId: String) =
        api.removeFromPlaylist(snapshot, playlistId, playlistItemId)
    override suspend fun requestAvailability(snapshot: SessionSnapshot, type: String, tmdbId: Int) =
        api.requestAvailability(snapshot, type, tmdbId)
    override suspend fun createRequest(snapshot: SessionSnapshot, type: String, tmdbId: Int) =
        api.createRequest(snapshot, io.github.jovalle.watchtower.tv.api.CreateRequestBody(type, tmdbId))
    override suspend fun createIssue(snapshot: SessionSnapshot, type: String, tmdbId: Int, issueType: Int, message: String) =
        api.createIssue(snapshot, io.github.jovalle.watchtower.tv.api.CreateIssueBody(type, tmdbId, issueType, message))
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
    val seasonsCursor: String? = null,
    val seasonsLoading: Boolean = false,
    val seasonsEndReached: Boolean = false,
    val seasonsError: String? = null,
    val episodes: Map<String, PagedState<MediaSummary>> = emptyMap(),
    val loading: Boolean = true,
    val mutationInFlight: Boolean = false,
    val playlists: LoadState<List<PlaylistSummary>>? = null,
    val message: String? = null,
    val error: String? = null,
)

data class PagedState<T>(
    val items: List<T> = emptyList(),
    val nextCursor: String? = null,
    val loading: Boolean = false,
    val endReached: Boolean = false,
    val error: String? = null,
    val focusedIndex: Int = 0,
)

data class RequestState(
    val enabled: Boolean,
    val loading: Boolean = false,
    val availability: RequestAvailability? = null,
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
        loadNext()
    }
}

class CollectionsViewModel(
    private val sectionId: String,
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<List<CollectionSummary>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<CollectionSummary>>> = _state.asStateFlow()
    private var request: Job? = null

    init {
        viewModelScope.launch { identityChanges.collect { request?.cancel(); reload() } }
        reload()
    }

    fun reload() {
        request?.cancel()
        val snapshot = current() ?: return
        request = viewModelScope.launch {
            _state.value = LoadState.Loading
            try {
                val collections = data.libraryCollections(snapshot, sectionId)
                if (current() == snapshot) _state.value = LoadState.Content(collections)
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = LoadState.Error(error.displayMessage())
            }
        }
    }
}

class CollectionItemsViewModel(
    private val collectionId: String,
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val _state = MutableStateFlow(PagedState<MediaSummary>())
    val state: StateFlow<PagedState<MediaSummary>> = _state.asStateFlow()
    private var request: Job? = null

    init {
        viewModelScope.launch { identityChanges.collect { request?.cancel(); _state.value = PagedState(); loadNext() } }
        loadNext()
    }

    fun loadNear(index: Int) {
        if (index >= _state.value.items.lastIndex - 8) loadNext()
    }

    fun retry() = loadNext()

    fun rememberFocus(index: Int) {
        _state.value = _state.value.copy(focusedIndex = index)
    }

    fun loadNext() {
        val before = _state.value
        if (before.loading || before.endReached) return
        val snapshot = current() ?: return
        request = viewModelScope.launch {
            _state.value = before.copy(loading = true, error = null)
            try {
                val page = data.collectionItems(snapshot, collectionId, before.nextCursor)
                if (current() != snapshot) return@launch
                _state.value = before.copy(
                    items = (before.items + page.items).distinctBy { it.ratingKey },
                    nextCursor = page.nextCursor,
                    loading = false,
                    endReached = page.nextCursor == null,
                )
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = before.copy(loading = false, error = error.displayMessage())
            }
        }
    }
}

class PlaylistsViewModel(
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<List<PlaylistSummary>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<PlaylistSummary>>> = _state.asStateFlow()
    private var request: Job? = null

    init {
        viewModelScope.launch { identityChanges.collect { request?.cancel(); reload() } }
        reload()
    }

    fun reload() {
        request?.cancel()
        val snapshot = current() ?: return
        request = viewModelScope.launch {
            _state.value = LoadState.Loading
            try {
                val playlists = data.playlists(snapshot)
                if (current() == snapshot) _state.value = LoadState.Content(playlists)
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = LoadState.Error(error.displayMessage())
            }
        }
    }
}

class PlaylistItemsViewModel(
    private val playlistId: String,
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val _state = MutableStateFlow(PagedState<PlaylistItem>())
    val state: StateFlow<PagedState<PlaylistItem>> = _state.asStateFlow()
    private var request: Job? = null

    init {
        viewModelScope.launch { identityChanges.collect { request?.cancel(); _state.value = PagedState(); loadNext() } }
        loadNext()
    }

    fun loadNear(index: Int) {
        if (index >= _state.value.items.lastIndex - 8) loadNext()
    }

    fun retry() = loadNext()

    fun rememberFocus(index: Int) {
        _state.value = _state.value.copy(focusedIndex = index)
    }

    fun loadNext() {
        val before = _state.value
        if (before.loading || before.endReached) return
        val snapshot = current() ?: return
        request = viewModelScope.launch {
            _state.value = before.copy(loading = true, error = null)
            try {
                val page = data.playlistItems(snapshot, playlistId, before.nextCursor)
                if (current() != snapshot) return@launch
                _state.value = before.copy(
                    items = (before.items + page.items).distinctBy { it.playlistItemId },
                    nextCursor = page.nextCursor,
                    loading = false,
                    endReached = page.nextCursor == null,
                )
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = before.copy(loading = false, error = error.displayMessage())
            }
        }
    }

    fun remove(item: PlaylistItem) {
        if (_state.value.loading) return
        val snapshot = current() ?: return
        viewModelScope.launch {
            val before = _state.value
            _state.value = before.copy(loading = true, error = null)
            try {
                data.removeFromPlaylist(snapshot, playlistId, item.playlistItemId)
                if (current() == snapshot) {
                    _state.value = before.copy(items = before.items.filterNot { it.playlistItemId == item.playlistItemId })
                }
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = before.copy(error = error.displayMessage())
            }
        }
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
        viewModelScope.launch { identityChanges.collect { request?.cancel(); _state.value = DetailState(); reload() } }
        reload()
    }

    fun reload() {
        request?.cancel()
        val snapshot = current() ?: return
        request = viewModelScope.launch {
            _state.value = DetailState()
            try {
                val detail = data.media(snapshot, ratingKey)
                val seasons = if (detail.type == "show") data.children(snapshot, ratingKey, null) else Page(emptyList(), null, 0)
                if (current() == snapshot) _state.value = DetailState(
                    detail = detail,
                    seasons = orderSeasons(seasons.items),
                    seasonsCursor = seasons.nextCursor,
                    seasonsEndReached = seasons.nextCursor == null,
                    loading = false,
                )
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = DetailState(loading = false, error = error.displayMessage())
            }
        }
    }

    fun loadSeason(season: MediaSummary) {
        val key = season.ratingKey ?: return
        if (_state.value.episodes.containsKey(key)) return
        loadChildren(key)
    }

    fun loadSeasonsNear(index: Int) {
        val state = _state.value
        if (index < state.seasons.lastIndex - 8 || state.seasonsLoading || state.seasonsEndReached) return
        val snapshot = current() ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(seasonsLoading = true, seasonsError = null)
            try {
                val page = data.children(snapshot, ratingKey, state.seasonsCursor)
                if (current() == snapshot) _state.value = _state.value.copy(
                    seasons = orderSeasons((_state.value.seasons + page.items).distinctBy { it.ratingKey }),
                    seasonsCursor = page.nextCursor,
                    seasonsLoading = false,
                    seasonsEndReached = page.nextCursor == null,
                )
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = _state.value.copy(
                    seasonsLoading = false,
                    seasonsError = error.displayMessage(),
                )
            }
        }
    }

    fun retrySeasons() = loadSeasonsNear(_state.value.seasons.lastIndex)

    fun loadEpisodesNear(seasonKey: String, index: Int) {
        val page = _state.value.episodes[seasonKey] ?: return
        if (index >= page.items.lastIndex - 8) loadChildren(seasonKey)
    }

    fun retryEpisodes(seasonKey: String) = loadChildren(seasonKey)

    private fun loadChildren(parentKey: String) {
        val before = _state.value.episodes[parentKey] ?: PagedState()
        if (before.loading || before.endReached) return
        val snapshot = current() ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(episodes = _state.value.episodes + (parentKey to before.copy(loading = true, error = null)))
            try {
                val page = data.children(snapshot, parentKey, before.nextCursor)
                if (current() == snapshot) {
                    _state.value = _state.value.copy(episodes = _state.value.episodes + (parentKey to before.copy(
                        items = (before.items + page.items).distinctBy { it.ratingKey },
                        nextCursor = page.nextCursor,
                        loading = false,
                        endReached = page.nextCursor == null,
                    )))
                }
            } catch (error: Exception) {
                if (current() == snapshot) {
                    _state.value = _state.value.copy(episodes = _state.value.episodes + (parentKey to before.copy(
                        loading = false,
                        error = error.displayMessage(),
                    )))
                }
            }
        }
    }

    fun setWatched(watched: Boolean) = mutate {
        data.setWatched(it, ratingKey, watched)
        val detail = _state.value.detail ?: return@mutate
        _state.value = _state.value.copy(detail = detail.copy(viewCount = if (watched) maxOf(1, detail.viewCount) else 0))
    }

    fun setRating(rating: Double?) {
        if (_state.value.mutationInFlight) return
        val snapshot = current() ?: return
        val previous = _state.value.detail?.userRating
        _state.value = _state.value.copy(
            detail = _state.value.detail?.copy(userRating = rating),
            mutationInFlight = true,
            message = null,
            error = null,
        )
        viewModelScope.launch {
            try {
                data.setRating(snapshot, ratingKey, rating)
                if (current() == snapshot) _state.value = _state.value.copy(mutationInFlight = false, message = "Saved")
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = _state.value.copy(
                    detail = _state.value.detail?.copy(userRating = previous),
                    mutationInFlight = false,
                    error = error.displayMessage(),
                )
            }
        }
    }

    fun setWatchlist(add: Boolean) = mutate {
        data.setWatchlist(it, ratingKey, add)
        _state.value = _state.value.copy(detail = _state.value.detail?.copy(onWatchlist = add))
    }

    fun loadPlaylists() {
        if (_state.value.playlists is LoadState.Content || _state.value.playlists == LoadState.Loading) return
        val snapshot = current() ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(playlists = LoadState.Loading, error = null)
            try {
                val playlists = data.playlists(snapshot)
                if (current() == snapshot) _state.value = _state.value.copy(playlists = LoadState.Content(playlists))
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = _state.value.copy(playlists = LoadState.Error(error.displayMessage()))
            }
        }
    }

    fun addToPlaylist(playlistId: String) = mutate {
        data.addToPlaylist(it, playlistId, ratingKey)
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

class RequestActionsViewModel(
    private val type: String,
    private val tmdbId: Int?,
    private val enabled: Boolean,
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
    private val loadAvailability: Boolean = true,
) : ViewModel() {
    private val _state = MutableStateFlow(RequestState(enabled = enabled && tmdbId != null))
    val state: StateFlow<RequestState> = _state.asStateFlow()
    private var request: Job? = null

    init {
        viewModelScope.launch {
            identityChanges.collect {
                request?.cancel()
                _state.value = RequestState(enabled = enabled && tmdbId != null)
                load()
            }
        }
        load()
    }

    fun load() {
        val id = tmdbId ?: return
        if (!enabled || !loadAvailability) return
        request?.cancel()
        val snapshot = current() ?: return
        request = viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val availability = data.requestAvailability(snapshot, type, id)
                if (current() == snapshot) _state.value = _state.value.copy(loading = false, availability = availability)
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = _state.value.copy(loading = false, error = error.displayMessage())
            }
        }
    }

    fun request() = mutate { snapshot, id ->
        val availability = data.createRequest(snapshot, type, id)
        _state.value = _state.value.copy(availability = availability)
    }

    fun reportIssue(issueType: Int, message: String) = mutate { snapshot, id ->
        data.createIssue(snapshot, type, id, issueType, message.trim())
    }

    private fun mutate(block: suspend (SessionSnapshot, Int) -> Unit) {
        val id = tmdbId ?: return
        if (!enabled || _state.value.mutationInFlight) return
        val snapshot = current() ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(mutationInFlight = true, message = null, error = null)
            try {
                block(snapshot, id)
                if (current() == snapshot) _state.value = _state.value.copy(mutationInFlight = false, message = "Saved")
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = _state.value.copy(mutationInFlight = false, error = error.displayMessage())
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