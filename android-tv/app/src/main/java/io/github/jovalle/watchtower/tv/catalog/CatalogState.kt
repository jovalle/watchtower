package io.github.jovalle.watchtower.tv.catalog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import io.github.jovalle.watchtower.tv.api.ArtworkColors
import io.github.jovalle.watchtower.tv.api.HomeResponse
import io.github.jovalle.watchtower.tv.api.HomeRow
import io.github.jovalle.watchtower.tv.api.LibraryRecommendationsResponse
import io.github.jovalle.watchtower.tv.api.LibraryFiltersResponse
import io.github.jovalle.watchtower.tv.api.LibraryLetter
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
import kotlinx.coroutines.CancellationException
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
    suspend fun libraryRecommendations(snapshot: SessionSnapshot, sectionId: String): LibraryRecommendationsResponse = LibraryRecommendationsResponse(emptyList())
    suspend fun libraryItems(
        snapshot: SessionSnapshot,
        sectionId: String,
        sort: String,
        filter: String,
        cursor: String?,
        genre: String? = null,
    ): Page<MediaSummary>
    suspend fun libraryLetters(snapshot: SessionSnapshot, sectionId: String, sort: String, filter: String, genre: String? = null): List<LibraryLetter> = emptyList()
    suspend fun libraryFilters(snapshot: SessionSnapshot, sectionId: String): LibraryFiltersResponse = LibraryFiltersResponse(emptyList(), emptyList())
    suspend fun libraryCollections(snapshot: SessionSnapshot, sectionId: String): List<CollectionSummary>
    suspend fun collectionItems(snapshot: SessionSnapshot, collectionId: String, cursor: String?): Page<MediaSummary>
    suspend fun media(snapshot: SessionSnapshot, ratingKey: String): MediaDetail
    suspend fun watchlistStatus(snapshot: SessionSnapshot, ratingKey: String): Boolean? = null
    suspend fun mediaRatings(snapshot: SessionSnapshot, ratingKey: String): io.github.jovalle.watchtower.tv.api.MediaRatingsResponse =
        io.github.jovalle.watchtower.tv.api.MediaRatingsResponse()
    suspend fun person(snapshot: SessionSnapshot, ratingKey: String, personId: String): io.github.jovalle.watchtower.tv.api.PersonProfile =
        throw UnsupportedOperationException("Person profiles are unavailable.")
    suspend fun children(snapshot: SessionSnapshot, ratingKey: String, cursor: String?): Page<MediaSummary>
    suspend fun search(snapshot: SessionSnapshot, query: String): SearchResponse
    suspend fun watchlist(snapshot: SessionSnapshot, source: String): WatchlistResponse
    suspend fun dismissContinueWatching(snapshot: SessionSnapshot, ratingKey: String): Unit =
        throw UnsupportedOperationException("Continue Watching dismissal is unavailable.")
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
    override suspend fun libraryRecommendations(snapshot: SessionSnapshot, sectionId: String) = api.libraryRecommendations(snapshot, sectionId)
    override suspend fun libraryItems(
        snapshot: SessionSnapshot,
        sectionId: String,
        sort: String,
        filter: String,
        cursor: String?,
        genre: String?,
    ) = api.libraryItems(snapshot, sectionId, sort, filter, genre = genre, limit = 50, cursor = cursor)
    override suspend fun libraryLetters(snapshot: SessionSnapshot, sectionId: String, sort: String, filter: String, genre: String?) =
        api.libraryLetters(snapshot, sectionId, sort, filter, genre = genre, limit = 50).letters
    override suspend fun libraryFilters(snapshot: SessionSnapshot, sectionId: String) = api.libraryFilters(snapshot, sectionId)
    override suspend fun libraryCollections(snapshot: SessionSnapshot, sectionId: String) =
        api.libraryCollections(snapshot, sectionId).items
    override suspend fun collectionItems(snapshot: SessionSnapshot, collectionId: String, cursor: String?) =
        api.collectionItems(snapshot, collectionId, limit = 50, cursor = cursor)
    override suspend fun media(snapshot: SessionSnapshot, ratingKey: String) = api.media(snapshot, ratingKey)
    override suspend fun watchlistStatus(snapshot: SessionSnapshot, ratingKey: String) = api.watchlistStatus(snapshot, ratingKey).onWatchlist
    override suspend fun mediaRatings(snapshot: SessionSnapshot, ratingKey: String) = api.mediaRatings(snapshot, ratingKey)
    override suspend fun person(snapshot: SessionSnapshot, ratingKey: String, personId: String) = api.person(snapshot, ratingKey, personId)
    override suspend fun children(snapshot: SessionSnapshot, ratingKey: String, cursor: String?) =
        api.children(snapshot, ratingKey, limit = 100, cursor = cursor)
    override suspend fun search(snapshot: SessionSnapshot, query: String) = api.search(snapshot, query)
    override suspend fun watchlist(snapshot: SessionSnapshot, source: String) = api.watchlist(snapshot, source)
    override suspend fun dismissContinueWatching(snapshot: SessionSnapshot, ratingKey: String) = api.dismissContinueWatching(snapshot, ratingKey)
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
    val source: String = "recommended",
    val genre: String? = null,
    val genres: List<String> = emptyList(),
    val genresLoaded: Boolean = false,
    val genresLoading: Boolean = false,
    val genresError: String? = null,
    val focusedGenre: String? = null,
    val genreArtwork: Map<String, String> = emptyMap(),
    val letters: List<LibraryLetter> = emptyList(),
    val lettersError: String? = null,
    val jumpVersion: Int = 0,
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
    val selectedEpisodeKey: String? = null,
    val episodeLoading: Boolean = false,
    val seriesDetail: MediaDetail? = null,
    val selectedSeasonKey: String? = null,
    val detail: MediaDetail? = null,
    val requestTmdbId: Int? = null,
    val seasons: List<MediaSummary> = emptyList(),
    val seasonsCursor: String? = null,
    val seasonsLoading: Boolean = false,
    val seasonsEndReached: Boolean = false,
    val seasonsError: String? = null,
    val episodes: Map<String, PagedState<MediaSummary>> = emptyMap(),
    val loading: Boolean = true,
    val mutationInFlight: Boolean = false,
    val playlists: LoadState<List<PlaylistSummary>>? = null,
    val error: String? = null,
) {
    val actionsReady: Boolean get() = detail != null && !loading && !episodeLoading &&
        (selectedEpisodeKey?.let { it == detail?.ratingKey } ?: (selectedSeasonKey == null))
}

data class PagedState<T>(
    val items: List<T> = emptyList(),
    val nextCursor: String? = null,
    val loading: Boolean = false,
    val endReached: Boolean = false,
    val error: String? = null,
    val focusedIndex: Int = 0,
)

enum class RequestOperation { Request, Issue }

data class RequestState(
    val enabled: Boolean,
    val loading: Boolean = false,
    val availability: RequestAvailability? = null,
    val mutationInFlight: Boolean = false,
    val message: String? = null,
    val error: String? = null,
    val completedOperation: RequestOperation? = null,
) {
    val requestEligible: Boolean
        get() = enabled && availability?.let { availability ->
            availability.canRequest ?: (availability.status == "unknown" &&
                availability.requests.none { !it.is4k && it.status in listOf("pending", "approved") })
        } == true
    val canRequest: Boolean get() = requestEligible && !loading && !mutationInFlight
}

data class SearchState(
    val mediaFilter: String = "all",
    val showLibrary: Boolean = true,
    val showExternal: Boolean = true,
    val useSystemKeyboard: Boolean = false,
    val recentQueries: List<String> = emptyList(),
    val focusedResultKey: String? = null,
    val query: String = "",
    val loading: Boolean = false,
    val result: SearchResponse? = null,
    val error: String? = null,
)

data class HeroActionsState(val ratingKey: String? = null, val onWatchlist: Boolean? = null,
    val busy: Boolean = false, val error: String? = null,
    val ratings: List<io.github.jovalle.watchtower.tv.api.ProviderRating>? = null)

class HomeViewModel(
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<HomeResponse>>(LoadState.Loading)
    val state: StateFlow<LoadState<HomeResponse>> = _state.asStateFlow()
    private val _refreshError = MutableStateFlow<String?>(null)
    val refreshError = _refreshError.asStateFlow()
    private var request: Job? = null
    private var homeGeneration = 0
    private var heroRead: Job? = null
    private var heroRatingsRead: Job? = null
    private var heroRatingsGeneration = 0
    private var heroMutation: Job? = null
    private var heroGeneration = 0
    private var selectedHero: MediaSummary? = null
    private val _heroActions = MutableStateFlow(HeroActionsState())
    val heroActions = _heroActions.asStateFlow()

    init {
        viewModelScope.launch {
            identityChanges.collect {
                homeGeneration++;request?.cancel(); heroRead?.cancel(); heroRatingsRead?.cancel(); heroMutation?.cancel()
                heroGeneration++;heroRatingsGeneration++; selectedHero = null; _heroActions.value = HeroActionsState()
                _refreshError.value = null
                _state.value = LoadState.Loading
                reload()
            }
        }
        reload()
    }

    fun reload() {
        request?.cancel()
        val snapshot = current() ?: return
        val generation = ++homeGeneration
        _refreshError.value = null
        request = viewModelScope.launch {
            if (_state.value !is LoadState.Content) _state.value = LoadState.Loading
            try {
                val result = data.home(snapshot)
                if (current() == snapshot && generation == homeGeneration) _state.value = LoadState.Content(result)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (current() == snapshot && generation == homeGeneration) {
                    if (_state.value is LoadState.Content) _refreshError.value = error.displayMessage()
                    else _state.value = LoadState.Error(error.displayMessage())
                }
            }
        }
    }
    fun selectHero(item: MediaSummary) {
        selectedHero = item
        val key = item.ratingKey?.takeIf { item.external == null }
        if (_heroActions.value.ratingKey == key) return
        heroRead?.cancel();heroRatingsRead?.cancel(); heroGeneration++;heroRatingsGeneration++
        _heroActions.value = HeroActionsState(ratingKey = key, busy = heroMutation?.isActive == true)
        if (key != null && item.type in listOf("movie", "show")) { loadHeroWatchlist();loadHeroRatings() }
    }

    private fun loadHeroWatchlist() {
        val snapshot = current() ?: return
        val key = _heroActions.value.ratingKey ?: return
        val generation = ++heroGeneration
        heroRead?.cancel()
        heroRead = viewModelScope.launch {
            try {
                val saved = data.watchlistStatus(snapshot, key)
                if (current() == snapshot && generation == heroGeneration) _heroActions.value = _heroActions.value.copy(onWatchlist = saved)
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) {
                if (current() == snapshot && generation == heroGeneration) _heroActions.value = _heroActions.value.copy(error = error.displayMessage())
            }
        }
    }

    private fun loadHeroRatings() {
        val snapshot = current() ?: return
        val key = _heroActions.value.ratingKey ?: return
        val generation = ++heroRatingsGeneration
        heroRatingsRead?.cancel()
        heroRatingsRead = viewModelScope.launch {
            try {
                val ratings = data.mediaRatings(snapshot, key)
                if (current() == snapshot && generation == heroRatingsGeneration) _heroActions.value = _heroActions.value.copy(
                    ratings = ratings.ratings.takeIf { it.isNotEmpty() })
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { /* Listing ratings remain available when enrichment fails. */ }
        }
    }

    fun setHeroWatchlist() {
        val item = selectedHero ?: return
        if (item.type !in listOf("movie", "show") || _heroActions.value.busy) return
        val saved = _heroActions.value.onWatchlist
        if (saved == null) { loadHeroWatchlist(); return }
        mutateHero { snapshot, key ->
            data.setWatchlist(snapshot, key, !saved)
            if (current() == snapshot && _heroActions.value.ratingKey == key) {
                heroRead?.cancel();heroGeneration++
                _heroActions.value = _heroActions.value.copy(onWatchlist = !saved)
            }
        }
    }

    fun setHeroWatched() {
        val item = selectedHero ?: return
        if (item.type !in listOf("movie", "episode")) return
        val watched = item.viewCount == 0
        mutateHero { snapshot, key ->
            data.setWatched(snapshot, key, watched)
            if (current() == snapshot) updateHomeItem(key, { it.copy(viewCount = if (watched) maxOf(1, it.viewCount) else 0) }, removeContinue = watched)
        }
    }

    fun dismissHero() {
        val key = selectedHero?.ratingKey ?: return
        val home = (_state.value as? LoadState.Content)?.value ?: return
        if (home.rows.none { row -> row.kind == "continue_watching" && row.items.any { it.ratingKey == key } }) return
        mutateHero { snapshot, target ->
            data.dismissContinueWatching(snapshot, target)
            if (current() == snapshot) updateHomeItem(target, { it }, removeContinue = true)
        }
    }

    private fun updateHomeItem(key: String, update: (MediaSummary) -> MediaSummary, removeContinue: Boolean) {
        homeGeneration++;request?.cancel()
        val home = (_state.value as? LoadState.Content)?.value ?: return
        fun updated(item: MediaSummary) = if (item.ratingKey == key && item.external == null) update(item) else item
        _state.value = LoadState.Content(home.copy(hero = home.hero.map(::updated), rows = home.rows.mapNotNull { row ->
            val items = if (removeContinue && row.kind == "continue_watching") row.items.filterNot { it.ratingKey == key && it.external == null }
                else row.items.map(::updated)
            row.copy(items = items).takeIf { items.isNotEmpty() }
        }))
        selectedHero = selectedHero?.let(::updated)
    }

    private fun mutateHero(operation: suspend (SessionSnapshot, String) -> Unit) {
        val item = selectedHero ?: return
        val key = item.ratingKey?.takeIf { item.external == null } ?: return
        if (_heroActions.value.busy) return
        val snapshot = current() ?: return
        homeGeneration++;request?.cancel()
        _heroActions.value = _heroActions.value.copy(busy = true, error = null)
        heroMutation = viewModelScope.launch {
            try { operation(snapshot, key) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) {
                if (current() == snapshot && _heroActions.value.ratingKey == key) _heroActions.value = _heroActions.value.copy(error = error.displayMessage())
            } finally {
                if (current() == snapshot) _heroActions.value = _heroActions.value.copy(busy = false)
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
    private var request: Job? = null

    init {
        viewModelScope.launch { identityChanges.collect { _state.value = LoadState.Loading; load() } }
        load()
    }

    fun load() {
        request?.cancel()
        val snapshot = current() ?: return
        _state.value = LoadState.Loading
        request = viewModelScope.launch {
            try {
                val result = data.libraries(snapshot)
                if (current() == snapshot) _state.value = LoadState.Content(result)
            } catch (cancelled: CancellationException) {
                throw cancelled
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
    private var lettersRequest: Job? = null
    private var generation = 0
    private var genresRequest: Job? = null
    private var genresGeneration = 0

    init {
        viewModelScope.launch { identityChanges.collect { reset() } }
        reload()
    }

    fun setSource(value: String) {
        _state.value = _state.value.copy(source = value)
        if (value == "categories" && !_state.value.genresLoaded && !_state.value.genresLoading) loadGenres()
    }

    fun selectGenre(value: String) {
        if (value !in _state.value.genres) return
        _state.value = _state.value.copy(source = "browse", genre = value, focusedGenre = value,
            focusedKey = null, focusedIndex = 0, jumpVersion = _state.value.jumpVersion + 1)
        reload()
    }

    fun clearGenre() {
        _state.value = _state.value.copy(source = "browse", genre = null, filter = "all",
            focusedKey = null, focusedIndex = 0, jumpVersion = _state.value.jumpVersion + 1)
        reload()
    }

    fun loadGenres() {
        genresRequest?.cancel()
        genresGeneration += 1
        val requestGeneration = genresGeneration
        val snapshot = current() ?: return
        _state.value = _state.value.copy(genresLoading = true, genresError = null)
        genresRequest = viewModelScope.launch {
            try {
                val genres = data.libraryFilters(snapshot, sectionId).genres.filter { it.isNotBlank() }.distinct()
                if (current() == snapshot && genresGeneration == requestGeneration) {
                    _state.value = _state.value.copy(genres = genres, genresLoaded = true, genresLoading = false)
                }
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (current() == snapshot && genresGeneration == requestGeneration) {
                    _state.value = _state.value.copy(genresLoading = false, genresError = error.displayMessage())
                }
            }
        }
    }
    fun rememberGenre(value: String) { _state.value = _state.value.copy(focusedGenre = value) }

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
        lettersRequest?.cancel()
        generation += 1
        _state.value = _state.value.copy(items = emptyList(), nextCursor = null, loading = false, endReached = false,
            error = null, letters = emptyList(), lettersError = null)
        loadLetters()
        loadNext()
    }

    fun jumpToLetter(cursor: String) {
        if (cursor.isBlank()) return
        request?.cancel()
        lettersRequest?.cancel()
        generation += 1
        _state.value = _state.value.copy(items = emptyList(), focusedKey = null, focusedIndex = 0,
            nextCursor = cursor, loading = false, endReached = false, error = null, jumpVersion = _state.value.jumpVersion + 1)
        loadNext()
    }

    fun loadLetters() {
        lettersRequest?.cancel()
        val before = _state.value
        if (!before.sort.startsWith("titleSort:")) {
            _state.value = before.copy(letters = emptyList(), lettersError = null)
            return
        }
        val snapshot = current() ?: return
        val requestGeneration = generation
        lettersRequest = viewModelScope.launch {
            try {
                val letters = data.libraryLetters(snapshot, sectionId, before.sort, before.filter, before.genre)
                if (current() == snapshot && generation == requestGeneration) {
                    _state.value = _state.value.copy(letters = letters, lettersError = null)
                }
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (current() == snapshot && generation == requestGeneration) {
                    _state.value = _state.value.copy(letters = emptyList(), lettersError = error.displayMessage())
                }
            }
        }
    }

    fun loadNext() {
        val before = _state.value
        if (before.loading || before.endReached) return
        val snapshot = current() ?: return
        val requestGeneration = generation
        _state.value = _state.value.copy(loading = true, error = null)
        request = viewModelScope.launch {
            try {
                val page = data.libraryItems(snapshot, sectionId, before.sort, before.filter, before.nextCursor, before.genre)
                if (current() != snapshot || generation != requestGeneration) return@launch
                val combined = (before.items + page.items).distinctBy { it.ratingKey }
                val genreArtwork = if (before.genre != null) {
                    val path = _state.value.genreArtwork[before.genre] ?: page.items.firstNotNullOfOrNull { it.backdropUrl }
                    if (path != null) _state.value.genreArtwork + (before.genre to path) else _state.value.genreArtwork
                } else _state.value.genreArtwork
                _state.value = _state.value.copy(
                    items = combined,
                    genreArtwork = genreArtwork,
                    nextCursor = page.nextCursor,
                    loading = false,
                    endReached = page.nextCursor == null,
                )
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (current() == snapshot && generation == requestGeneration) _state.value = _state.value.copy(loading = false, error = error.displayMessage())
            }
        }
    }

    private fun reset() {
        genresRequest?.cancel()
        genresGeneration += 1
        request?.cancel()
        lettersRequest?.cancel()
        generation += 1
        _state.value = LibraryState(sort = _state.value.sort, filter = _state.value.filter)
        loadLetters()
        loadNext()
    }
}

class LibraryRecommendationsViewModel(
    private val sectionId: String,
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<List<HomeRow>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<HomeRow>>> = _state.asStateFlow()
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
                val collections = data.libraryRecommendations(snapshot, sectionId).rows
                if (current() == snapshot) _state.value = LoadState.Content(collections)
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = LoadState.Error(error.displayMessage())
            }
        }
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
        _state.value = LoadState.Loading
        val snapshot = current() ?: return
        request = viewModelScope.launch {
            try {
                val playlists = data.playlists(snapshot)
                if (current() == snapshot) _state.value = LoadState.Content(playlists)
            } catch (cancelled: CancellationException) {
                throw cancelled
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

    fun retry() {
        if (_state.value.endReached && _state.value.error != null) {
            _state.value = PagedState(focusedIndex = _state.value.focusedIndex)
        }
        loadNext()
    }

    fun rememberFocus(index: Int) {
        _state.value = _state.value.copy(focusedIndex = index)
    }

    fun loadNext() {
        val before = _state.value
        if (before.loading || before.endReached) return
        val snapshot = current() ?: return
        _state.value = before.copy(loading = true, error = null)
        request = viewModelScope.launch {
            try {
                val page = data.playlistItems(snapshot, playlistId, before.nextCursor)
                if (current() != snapshot) return@launch
                val items = (before.items + page.items).distinctBy { it.playlistItemId }
                _state.value = _state.value.copy(
                    items = items,
                    nextCursor = page.nextCursor,
                    loading = false,
                    endReached = page.nextCursor == null,
                    focusedIndex = _state.value.focusedIndex.coerceAtMost(items.lastIndex.coerceAtLeast(0)),
                )
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = _state.value.copy(loading = false, error = error.displayMessage())
            }
        }
    }

    fun remove(item: PlaylistItem) {
        if (_state.value.loading) return
        val snapshot = current() ?: return
        val before = _state.value
        _state.value = before.copy(loading = true, error = null)
        request = viewModelScope.launch {
            try {
                data.removeFromPlaylist(snapshot, playlistId, item.playlistItemId)
                if (current() == snapshot) {
                    // Offset cursors become invalid after deletion; reload before requesting more items.
                    _state.value = PagedState(focusedIndex = _state.value.focusedIndex.coerceAtMost((before.items.size - 2).coerceAtLeast(0)))
                    loadNext()
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = _state.value.copy(loading = false, error = error.displayMessage())
            }
        }
    }
}

@OptIn(FlowPreview::class)
class SearchViewModel(
    private val data: CatalogDataSource,
    private val current: () -> SessionSnapshot?,
    identityChanges: Flow<IdentityChange>,
    private val history: RecentSearches? = null,
    private val historyScope: () -> Pair<String, String>? = { null },
) : ViewModel() {
    private val query = MutableStateFlow("" to 0)
    private val _state = MutableStateFlow(SearchState(recentQueries = storedHistory()))
    val state: StateFlow<SearchState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            identityChanges.collect { query.value = "" to query.value.second + 1; _state.value = SearchState(recentQueries = storedHistory()) }
        }
        viewModelScope.launch {
            query.debounce(300).collectLatest { (value, _) ->
                if (value.isBlank()) {
                    _state.value = _state.value.copy(query = value, loading = false, result = null, error = null, focusedResultKey = null)
                    return@collectLatest
                }
                val snapshot = current() ?: return@collectLatest
                _state.value = _state.value.copy(query = value, loading = true, error = null)
                try {
                    val result = data.search(snapshot, value)
                    if (current() == snapshot && query.value.first == value) {
                        _state.value = _state.value.copy(query = value, result = result, loading = false, error = null)
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    if (current() == snapshot && query.value.first == value) {
                        _state.value = _state.value.copy(query = value, loading = false, result = null, error = error.displayMessage())
                    }
                }
            }
        }
    }

    fun setMediaFilter(value: String) { _state.value = _state.value.copy(mediaFilter = value, focusedResultKey = null) }
    fun setShowLibrary(value: Boolean) { _state.value = _state.value.copy(showLibrary = value, focusedResultKey = null) }
    fun setShowExternal(value: Boolean) { _state.value = _state.value.copy(showExternal = value, focusedResultKey = null) }
    fun setUseSystemKeyboard(value: Boolean) { _state.value = _state.value.copy(useSystemKeyboard = value, focusedResultKey = null) }
    fun rememberFocus(key: String) { _state.value = _state.value.copy(focusedResultKey = key) }

    fun rememberResult(item: MediaSummary) {
        val value = _state.value.query.trim()
        if (value.isBlank()) return
        val scope = historyScope()
        val recent = if (history != null && scope != null) {
            history.remember(scope.first, scope.second, value)
            history.get(scope.first, scope.second)
        } else (listOf(value) + _state.value.recentQueries).distinct().take(10)
        _state.value = _state.value.copy(recentQueries = recent, focusedResultKey = item.stableKey)
    }

    fun clearRecentSearches() {
        historyScope()?.let { history?.clear(it.first, it.second) }
        _state.value = _state.value.copy(recentQueries = emptyList())
    }

    private fun storedHistory(): List<String> = historyScope()?.let { history?.get(it.first, it.second) }.orEmpty()

    fun search(value: String) {
        if (query.value.first == value && _state.value.error == null) return
        query.value = value to query.value.second + 1
        _state.value = _state.value.copy(query = value, loading = value.isNotBlank(), result = null, error = null, focusedResultKey = null)
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
    private var episodeRequest: Job? = null
    private var selectionGeneration = 0

    private var watchlistRequest: Job? = null
    private var watchlistGeneration = 0

    fun loadWatchlist() {
        val detail = _state.value.detail ?: return
        val key = detail.ratingKey ?: return
        if (detail.type !in listOf("movie", "show") || watchlistRequest?.isActive == true) return
        val snapshot = current() ?: return
        val generation = ++watchlistGeneration
        watchlistRequest = viewModelScope.launch {
            try {
                val saved = data.watchlistStatus(snapshot, key)
                if (current() == snapshot && generation == watchlistGeneration) {
                    _state.value = _state.value.copy(
                        detail = _state.value.detail?.let { if (it.ratingKey == key) it.copy(onWatchlist = saved) else it },
                        seriesDetail = _state.value.seriesDetail?.let { if (it.ratingKey == key) it.copy(onWatchlist = saved) else it },
                    )
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // Unknown membership offers a check/retry, never a false Add action.
            }
        }
    }

    init {
        viewModelScope.launch { identityChanges.collect { request?.cancel(); _state.value = DetailState(); reload() } }
        reload()
    }

    fun reload() {
        selectionGeneration += 1
        watchlistGeneration += 1
        watchlistRequest?.cancel()
        watchlistRequest = null
        request?.cancel()
        episodeRequest?.cancel()
        val requestGeneration = selectionGeneration
        val snapshot = current() ?: return
        request = viewModelScope.launch {
            _state.value = DetailState()
            try {
                val detail = data.media(snapshot, ratingKey)
                val seriesKey = when (detail.type) {
                    "season" -> detail.parentRatingKey
                    "episode" -> detail.grandparentRatingKey
                    else -> null
                }
                val seasonKey = when (detail.type) {
                    "season" -> ratingKey
                    "episode" -> detail.parentRatingKey
                    else -> null
                }
                val seasonsParent = if (detail.type == "show") ratingKey else seriesKey
                val seasons = seasonsParent?.let { data.children(snapshot, it, null) } ?: Page(emptyList(), null, 0)
                val selectedSeason = seasonKey ?: orderSeasons(seasons.items).firstOrNull()?.ratingKey
                val episodes = selectedSeason?.let { data.children(snapshot, it, null) }
                val requestTitle = if (detail.type == "episode" || detail.type == "season") {
                    seriesKey?.let { key ->
                        try { data.media(snapshot, key) }
                        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
                        catch (_: Exception) { null }
                    }
                } else detail
                if (current() == snapshot && selectionGeneration == requestGeneration) {
                    _state.value = DetailState(
                        detail = detail,
                        selectedEpisodeKey = detail.ratingKey.takeIf { detail.type == "episode" },
                        seriesDetail = requestTitle?.takeIf { it.type == "show" },
                        selectedSeasonKey = selectedSeason,
                        requestTmdbId = requestTitle?.guids?.tmdb?.toIntOrNull()?.takeIf { it > 0 },
                        seasons = orderSeasons(seasons.items),
                        seasonsCursor = seasons.nextCursor,
                        seasonsEndReached = seasons.nextCursor == null,
                        episodes = episodes?.let { mapOf(requireNotNull(selectedSeason) to PagedState(
                            items = if (detail.type == "episode") orderEpisodes((it.items + detail.toSummary()).distinctBy { episode -> episode.ratingKey }) else it.items,
                            nextCursor = it.nextCursor,
                            endReached = it.nextCursor == null,
                        )) } ?: emptyMap(),
                        loading = false,
                    )
                    if (detail.onWatchlist == null) loadWatchlist()
                }
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (current() == snapshot && selectionGeneration == requestGeneration) _state.value = DetailState(loading = false, error = error.displayMessage())
            }
        }
    }

    fun loadSeason(season: MediaSummary) {
        val key = season.ratingKey ?: return
        selectionGeneration += 1
        episodeRequest?.cancel()
        _state.value = _state.value.copy(selectedSeasonKey = key, selectedEpisodeKey = null, episodeLoading = false, error = null)
        if (!_state.value.episodes.containsKey(key)) loadChildren(key)
    }

    fun selectShowOverview() {
        val series = _state.value.seriesDetail ?: return
        selectionGeneration += 1
        episodeRequest?.cancel()
        _state.value = _state.value.copy(detail = series, selectedSeasonKey = null, selectedEpisodeKey = null,
            episodeLoading = false, error = null)
        if (series.onWatchlist == null) loadWatchlist()
    }

    fun selectEpisode(key: String) {
        selectionGeneration += 1
        episodeRequest?.cancel()
        val requestGeneration = selectionGeneration
        val snapshot = current() ?: return
        val alreadyLoaded = _state.value.detail?.ratingKey == key
        _state.value = _state.value.copy(selectedEpisodeKey = key, episodeLoading = !alreadyLoaded, error = null)
        if (alreadyLoaded) return
        episodeRequest = viewModelScope.launch {
            try {
                val episode = data.media(snapshot, key)
                if (current() == snapshot && selectionGeneration == requestGeneration) {
                    _state.value = _state.value.copy(detail = episode, episodeLoading = false)
                }
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (current() == snapshot && selectionGeneration == requestGeneration) {
                    _state.value = _state.value.copy(episodeLoading = false, error = error.displayMessage())
                }
            }
        }
    }

    fun loadSeasonsNear(index: Int) {
        val state = _state.value
        if (index < state.seasons.lastIndex - 8 || state.seasonsLoading || state.seasonsEndReached) return
        val snapshot = current() ?: return
        viewModelScope.launch {
            _state.value = _state.value.copy(seasonsLoading = true, seasonsError = null)
            try {
                val parentKey = state.detail?.let { detail -> when (detail.type) {
                    "show" -> state.seriesDetail?.ratingKey ?: detail.ratingKey
                    "season" -> detail.parentRatingKey
                    "episode" -> detail.grandparentRatingKey
                    else -> null
                } } ?: ratingKey
                val page = data.children(snapshot, parentKey, state.seasonsCursor)
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
                        items = orderEpisodes((before.items + page.items).distinctBy { it.ratingKey }),
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

    fun setWatched(watched: Boolean) = mutate { snapshot, targetKey ->
        data.setWatched(snapshot, targetKey, watched)
        if (current() != snapshot) return@mutate
        val detail = _state.value.detail?.takeIf { it.ratingKey == targetKey } ?: return@mutate
        _state.value = _state.value.copy(detail = detail.copy(viewCount = if (watched) maxOf(1, detail.viewCount) else 0))
    }

    fun setRating(rating: Double?) {
        if (_state.value.mutationInFlight || !_state.value.actionsReady) return
        val snapshot = current() ?: return
        val targetKey = _state.value.detail?.ratingKey ?: ratingKey
        val previous = _state.value.detail?.userRating
        _state.value = _state.value.copy(
            detail = _state.value.detail?.copy(userRating = rating),
            mutationInFlight = true,
            error = null,
        )
        viewModelScope.launch {
            try {
                data.setRating(snapshot, targetKey, rating)
                if (current() == snapshot) _state.value = _state.value.copy(mutationInFlight = false)
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = _state.value.copy(
                    detail = _state.value.detail?.let { if (it.ratingKey == targetKey) it.copy(userRating = previous) else it },
                    mutationInFlight = false,
                    error = error.displayMessage(),
                )
            }
        }
    }

    fun setWatchlist(add: Boolean) = mutate { snapshot, targetKey ->
        watchlistGeneration++
        watchlistRequest?.cancel()
        watchlistRequest = null
        data.setWatchlist(snapshot, targetKey, add)
        if (current() == snapshot) _state.value = _state.value.copy(
            detail = _state.value.detail?.let { if (it.ratingKey == targetKey) it.copy(onWatchlist = add) else it },
            seriesDetail = _state.value.seriesDetail?.let { if (it.ratingKey == targetKey) it.copy(onWatchlist = add) else it },
        )
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

    fun addToPlaylist(playlistId: String) = mutate { snapshot, targetKey ->
        data.addToPlaylist(snapshot, playlistId, targetKey)
    }

    private fun mutate(block: suspend (SessionSnapshot, String) -> Unit) {
        if (_state.value.mutationInFlight || !_state.value.actionsReady) return
        val snapshot = current() ?: return
        val targetKey = _state.value.detail?.ratingKey ?: ratingKey
        _state.value = _state.value.copy(mutationInFlight = true, error = null)
        viewModelScope.launch {
            try {
                block(snapshot, targetKey)
                if (current() == snapshot) _state.value = _state.value.copy(mutationInFlight = false)
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
    private var generation = 0

    init {
        viewModelScope.launch {
            identityChanges.collect {
                generation++
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
        if (_state.value.mutationInFlight) return
        val ticket = ++generation
        request?.cancel()
        val snapshot = current() ?: return
        _state.value = _state.value.copy(loading = true, error = null)
        request = viewModelScope.launch {
            try {
                val availability = data.requestAvailability(snapshot, type, id)
                if (ticket == generation && current() == snapshot) _state.value = _state.value.copy(loading = false, availability = availability)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (ticket == generation && current() == snapshot) _state.value = _state.value.copy(loading = false, availability = null, error = error.displayMessage())
            }
        }
    }

    fun request() {
        if (!_state.value.canRequest) return
        mutate(RequestOperation.Request) { snapshot, id -> data.createRequest(snapshot, type, id).copy(canRequest = false) }
    }

    fun reportIssue(issueType: Int, message: String) = mutate(RequestOperation.Issue) { snapshot, id ->
        data.createIssue(snapshot, type, id, issueType, message.trim())
        null
    }

    fun clearFeedback() {
        _state.value = _state.value.copy(message = null, error = null, completedOperation = null)
    }

    private fun mutate(operation: RequestOperation, block: suspend (SessionSnapshot, Int) -> RequestAvailability?) {
        val id = tmdbId ?: return
        if (!enabled || _state.value.mutationInFlight) return
        val snapshot = current() ?: return
        _state.value = _state.value.copy(mutationInFlight = true, message = null, error = null, completedOperation = null)
        viewModelScope.launch {
            try {
                val availability = block(snapshot, id)
                if (current() == snapshot) _state.value = _state.value.copy(mutationInFlight = false, message = "Saved",
                    availability = availability ?: _state.value.availability, completedOperation = operation)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                if (current() == snapshot) _state.value = _state.value.copy(mutationInFlight = false, error = error.displayMessage())
            }
        }
    }
}

private fun orderEpisodes(items: List<MediaSummary>): List<MediaSummary> =
    items.sortedBy { it.episodeNumber ?: Int.MAX_VALUE }

fun orderSeasons(items: List<MediaSummary>): List<MediaSummary> =
    items.sortedWith(compareBy<MediaSummary> { it.seasonNumber == 0 }.thenBy { it.seasonNumber ?: Int.MAX_VALUE })

fun restoredFocusIndex(previousKey: String?, previousIndex: Int, currentKeys: List<String>): Int {
    if (currentKeys.isEmpty()) return -1
    val exact = previousKey?.let(currentKeys::indexOf) ?: -1
    return if (exact >= 0) exact else previousIndex.coerceIn(0, currentKeys.lastIndex)
}

private fun Exception.displayMessage(): String = message?.takeIf { it.isNotBlank() } ?: "Something went wrong. Try again."
internal fun focusedHomeItem(home: HomeResponse, focusedKey: String?): MediaSummary? =
    home.rows.asSequence().flatMap { it.items.asSequence() }.firstOrNull { it.stableKey == focusedKey }
        ?: home.rows.firstOrNull { it.items.isNotEmpty() }?.items?.firstOrNull()
        ?: home.hero.firstOrNull()

internal const val LIBRARY_RELEASE_DATE_SORT = "originallyAvailableAt:desc"

internal fun artworkColorPixels(colors: ArtworkColors?): IntArray? {
    if (colors == null) return null
    return listOf(colors.topLeft, colors.topRight, colors.bottomLeft, colors.bottomRight).map { value ->
        if (value.length != 6 || value.any { it !in "0123456789abcdefABCDEF" }) return null
        0xFF000000.toInt() or (value.toIntOrNull(16) ?: return null)
    }.toIntArray()
}
