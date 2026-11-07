package io.github.jovalle.watchtower.tv.api

import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody

val WatchtowerJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
}

/** Session-level reactions to authenticated failures (sign out on 401, refresh identity on 409). */
fun interface ApiEvents {
    fun onAuthenticatedFailure(snapshot: SessionSnapshot, error: ApiException)
}

class WatchtowerApi(private val http: HttpClients, val json: Json = WatchtowerJson) {
    @Volatile
    var events: ApiEvents? = null

    // Public endpoints (paired origin only).
    suspend fun instance(base: HttpUrl): InstanceResponse =
        decode(send(http.anonymous(base), get(base, "instance"), null))

    suspend fun createDeviceAuthorization(base: HttpUrl, body: CreateDeviceAuthorizationRequest): DeviceAuthorizationResponse =
        decode(send(http.anonymous(base), post(base, "device-authorizations", encode(body)), null))

    suspend fun pollDeviceAuthorization(base: HttpUrl, pollingSecret: String): PollDeviceAuthorizationResponse =
        decode(send(http.anonymous(base), post(base, "device-authorizations/poll", encode(PollDeviceAuthorizationRequest(pollingSecret))), null))

    // Session and device management. /me and revocation work without the identity version header.
    suspend fun me(s: SessionSnapshot): MeResponse = decode(authed(s, get(s.baseUrl, "me"), sendIdentity = false))

    suspend fun devices(s: SessionSnapshot): Items<DeviceSummary> = decode(authed(s, get(s.baseUrl, "devices")))

    suspend fun revokeDevice(s: SessionSnapshot, deviceSessionId: String) {
        authed(s, Request.Builder().url(url(s.baseUrl, "devices", deviceSessionId)).delete().build(), sendIdentity = false)
    }

    suspend fun signOut(s: SessionSnapshot) {
        authed(s, Request.Builder().url(url(s.baseUrl, "session")).delete().build(), sendIdentity = false)
    }

    suspend fun profiles(s: SessionSnapshot): Items<HomeProfile> = decode(authed(s, get(s.baseUrl, "profiles")))

    suspend fun switchProfile(s: SessionSnapshot, body: SwitchProfileRequest): MeResponse =
        decode(authed(s, post(s.baseUrl, "profiles/switch", encode(body))))

    // Catalog.
    suspend fun home(s: SessionSnapshot): HomeResponse = decode(authed(s, get(s.baseUrl, "home")))

    suspend fun libraries(s: SessionSnapshot): Items<LibrarySection> = decode(authed(s, get(s.baseUrl, "libraries")))

    suspend fun libraryItems(
        s: SessionSnapshot,
        sectionId: String,
        sort: String? = null,
        filter: String? = null,
        genre: String? = null,
        limit: Int = 50,
        cursor: String? = null,
    ): Page<MediaSummary> {
        val url = url(s.baseUrl, "libraries", sectionId, "items").newBuilder()
            .apply {
                sort?.let { addQueryParameter("sort", it) }
                filter?.let { addQueryParameter("filter", it) }
                genre?.let { addQueryParameter("genre", it) }
                addQueryParameter("limit", limit.toString())
                cursor?.let { addQueryParameter("cursor", it) }
            }.build()
        return decode(authed(s, Request.Builder().url(url).get().build()))
    }

    suspend fun libraryLetters(
        s: SessionSnapshot,
        sectionId: String,
        sort: String = "titleSort:asc",
        filter: String = "all",
        genre: String? = null,
        limit: Int = 100,
    ): LibraryLettersResponse {
        val target = url(s.baseUrl, "libraries", sectionId, "letters").newBuilder()
            .addQueryParameter("sort", sort).addQueryParameter("filter", filter)
            .addQueryParameter("limit", limit.toString())
            .apply { genre?.let { addQueryParameter("genre", it) } }.build()
        return decode(authed(s, Request.Builder().url(target).get().build()))
    }

    suspend fun libraryRecommendations(s: SessionSnapshot, sectionId: String): LibraryRecommendationsResponse =
        decode(authed(s, Request.Builder().url(url(s.baseUrl, "libraries", sectionId, "recommendations")).get().build()))

    suspend fun libraryFilters(s: SessionSnapshot, sectionId: String): LibraryFiltersResponse =
        decode(authed(s, Request.Builder().url(url(s.baseUrl, "libraries", sectionId, "filters")).get().build()))

    suspend fun libraryCollections(s: SessionSnapshot, sectionId: String): Items<CollectionSummary> =
        decode(authed(s, Request.Builder().url(url(s.baseUrl, "libraries", sectionId, "collections")).get().build()))

    suspend fun collectionItems(s: SessionSnapshot, collectionId: String, limit: Int = 50, cursor: String? = null): Page<MediaSummary> =
        decode(authed(s, Request.Builder().url(paged(url(s.baseUrl, "collections", collectionId, "items"), limit, cursor)).get().build()))

    suspend fun media(s: SessionSnapshot, ratingKey: String): MediaDetail =
        decode(authed(s, Request.Builder().url(url(s.baseUrl, "media", ratingKey)).get().build()))

    suspend fun watchlistStatus(s: SessionSnapshot, ratingKey: String): WatchlistStatusResponse =
        decode(authed(s, Request.Builder().url(url(s.baseUrl, "media", ratingKey, "watchlist")).get().build()))

    suspend fun mediaRatings(s: SessionSnapshot, ratingKey: String): MediaRatingsResponse =
        decode(authed(s, Request.Builder().url(url(s.baseUrl, "media", ratingKey, "ratings")).get().build()))

    suspend fun person(s: SessionSnapshot, ratingKey: String, personId: String): PersonProfile =
        decode(authed(s, Request.Builder().url(url(s.baseUrl, "media", ratingKey, "cast", personId)).get().build()))

    suspend fun children(s: SessionSnapshot, ratingKey: String, limit: Int = 100, cursor: String? = null): Page<MediaSummary> =
        decode(authed(s, Request.Builder().url(paged(url(s.baseUrl, "media", ratingKey, "children"), limit, cursor)).get().build()))

    suspend fun adjacent(s: SessionSnapshot, ratingKey: String): AdjacentResponse =
        decode(authed(s, Request.Builder().url(url(s.baseUrl, "media", ratingKey, "adjacent")).get().build()))

    suspend fun dismissContinueWatching(s: SessionSnapshot, ratingKey: String) {
        authed(s, Request.Builder().url(url(s.baseUrl, "media", ratingKey, "continue-watching")).delete().build())
    }

    suspend fun setWatched(s: SessionSnapshot, ratingKey: String, watched: Boolean) {
        val builder = Request.Builder().url(url(s.baseUrl, "media", ratingKey, "watched"))
        authed(s, if (watched) builder.put(EMPTY_JSON).build() else builder.delete().build())
    }

    suspend fun setRating(s: SessionSnapshot, ratingKey: String, rating: Double?) {
        authed(s, Request.Builder().url(url(s.baseUrl, "media", ratingKey, "rating")).put(encode(RatingBody(rating))).build())
    }

    suspend fun search(s: SessionSnapshot, query: String, limit: Int = 30): SearchResponse {
        val url = url(s.baseUrl, "search").newBuilder().addQueryParameter("q", query).addQueryParameter("limit", limit.toString()).build()
        return decode(authed(s, Request.Builder().url(url).get().build()))
    }

    suspend fun watchlist(s: SessionSnapshot, source: String = "all"): WatchlistResponse {
        val url = url(s.baseUrl, "watchlist").newBuilder().addQueryParameter("source", source).build()
        return decode(authed(s, Request.Builder().url(url).get().build()))
    }

    suspend fun addToWatchlist(s: SessionSnapshot, body: WatchlistMutationRequest) {
        authed(s, Request.Builder().url(url(s.baseUrl, "watchlist")).put(encode(body)).build())
    }

    suspend fun removeFromWatchlist(s: SessionSnapshot, body: WatchlistMutationRequest) {
        authed(s, Request.Builder().url(url(s.baseUrl, "watchlist")).delete(encode(body)).build())
    }

    suspend fun playlists(s: SessionSnapshot): Items<PlaylistSummary> = decode(authed(s, get(s.baseUrl, "playlists")))

    suspend fun playlistItems(s: SessionSnapshot, playlistId: String, limit: Int = 50, cursor: String? = null): Page<PlaylistItem> =
        decode(authed(s, Request.Builder().url(paged(url(s.baseUrl, "playlists", playlistId, "items"), limit, cursor)).get().build()))

    suspend fun addToPlaylist(s: SessionSnapshot, playlistId: String, ratingKey: String) {
        authed(s, Request.Builder().url(url(s.baseUrl, "playlists", playlistId, "items")).post(encode(RatingKeyBody(ratingKey))).build())
    }

    suspend fun removeFromPlaylist(s: SessionSnapshot, playlistId: String, playlistItemId: String) {
        authed(s, Request.Builder().url(url(s.baseUrl, "playlists", playlistId, "items", playlistItemId)).delete().build())
    }

    suspend fun preferences(s: SessionSnapshot): Preferences = decode(authed(s, get(s.baseUrl, "preferences")))

    /** Sends only the changed boolean preferences. */
    suspend fun updatePreferences(s: SessionSnapshot, changes: JsonObject): Preferences =
        decode(authed(s, Request.Builder().url(url(s.baseUrl, "preferences")).patch(changes.toString().toRequestBody(JSON)).build()))

    suspend fun requestInbox(s: SessionSnapshot, page: Int = 1, filter: String = "all"): ServicePage<RequestSummary> {
        val target = url(s.baseUrl, "requests").newBuilder()
            .addQueryParameter("page", page.toString()).addQueryParameter("filter", filter).build()
        return decode(authed(s, Request.Builder().url(target).get().build()))
    }

    suspend fun issues(s: SessionSnapshot, page: Int = 1, filter: String = "all"): ServicePage<IssueSummary> {
        val target = url(s.baseUrl, "issues").newBuilder()
            .addQueryParameter("page", page.toString()).addQueryParameter("filter", filter).build()
        return decode(authed(s, Request.Builder().url(target).get().build()))
    }

    suspend fun issueDetail(s: SessionSnapshot, id: Int): IssueDetail =
        decode(authed(s, Request.Builder().url(url(s.baseUrl, "issues", id.toString())).get().build()))

    suspend fun requestAvailability(s: SessionSnapshot, type: String, tmdbId: Int): RequestAvailability {
        val url = url(s.baseUrl, "requests", "availability").newBuilder()
            .addQueryParameter("type", type).addQueryParameter("tmdbId", tmdbId.toString()).build()
        return decode(authed(s, Request.Builder().url(url).get().build()))
    }

    suspend fun createRequest(s: SessionSnapshot, body: CreateRequestBody): RequestAvailability =
        decode(authed(s, post(s.baseUrl, "requests", encode(body))))

    suspend fun createIssue(s: SessionSnapshot, body: CreateIssueBody) {
        authed(s, post(s.baseUrl, "issues", encode(body)))
    }

    // Playback.
    suspend fun createPlayback(s: SessionSnapshot, body: PlaybackRequest): PlaybackDescriptor =
        decode(authed(s, post(s.baseUrl, "playback", encode(body))))

    suspend fun reportTimeline(s: SessionSnapshot, playbackId: String, body: TimelineRequest): TimelineResponse =
        decode(authed(s, Request.Builder().url(url(s.baseUrl, "playback", playbackId, "timeline")).post(encode(body)).build()))

    suspend fun heartbeat(s: SessionSnapshot, playbackId: String) {
        authed(s, Request.Builder().url(url(s.baseUrl, "playback", playbackId, "heartbeat")).post(EMPTY_JSON).build())
    }

    suspend fun stopPlayback(s: SessionSnapshot, playbackId: String, body: StopPlaybackRequest) {
        authed(s, Request.Builder().url(url(s.baseUrl, "playback", playbackId, "stop")).post(encode(body)).build())
    }

    inline fun <reified T> encode(value: T): RequestBody = json.encodeToString(value).toRequestBody(JSON)

    inline fun <reified T> decode(body: String?): T =
        json.decodeFromString(body ?: throw IOException("Watchtower returned an empty response."))

    suspend fun authed(s: SessionSnapshot, request: Request, sendIdentity: Boolean = true): String? =
        send(http.forSession(s, sendIdentity), request, s)

    private suspend fun send(client: OkHttpClient, request: Request, snapshot: SessionSnapshot?): String? = withContext(Dispatchers.IO) {
        client.newCall(request).await().use { response ->
            val body = response.body.string()
            if (response.isSuccessful) return@withContext body.ifEmpty { null }
            val error = toApiException(response.code, response.header("Content-Type"), body, response.header("Retry-After"), response.header("X-Request-Id"))
            if (snapshot != null && (error.isAuthFailure || error.isIdentityMismatch)) {
                events?.onAuthenticatedFailure(snapshot, error)
            }
            throw error
        }
    }

    private fun toApiException(status: Int, contentType: String?, body: String, retryAfter: String?, requestId: String?): ApiException {
        val retryAfterMs = retryAfter?.trim()?.toLongOrNull()?.times(1000)
        if (contentType?.contains("json") == true) {
            runCatching { json.decodeFromString<ErrorEnvelope>(body).error }.getOrNull()?.let {
                return ApiException(status, it.code, it.message, it.retryable, retryAfterMs, it.requestId)
            }
        }
        val (code, message) = when {
            status in 300..399 -> "unexpected_redirect" to "The server redirected the request. Check the address and use https://."
            status == 404 -> ApiException.INCOMPATIBLE_SERVER to "This Watchtower server doesn't support the TV app yet. Update Watchtower and try again."
            status >= 500 -> "upstream_unavailable" to "Watchtower is unavailable (HTTP $status). Try again shortly."
            else -> "unexpected_response" to "Unexpected response from Watchtower (HTTP $status)."
        }
        return ApiException(status, code, message, status >= 500, retryAfterMs, requestId)
    }

    private fun get(base: HttpUrl, path: String) = Request.Builder().url(url(base, *path.split('/').toTypedArray())).get().build()

    private fun post(base: HttpUrl, path: String, body: RequestBody) =
        Request.Builder().url(url(base, *path.split('/').toTypedArray())).post(body).build()

    private fun url(base: HttpUrl, vararg segments: String): HttpUrl =
        base.newBuilder().encodedPath("/").addPathSegments("api/v1").apply { segments.forEach { addPathSegment(it) } }.build()

    private fun paged(url: HttpUrl, limit: Int, cursor: String?): HttpUrl =
        url.newBuilder().addQueryParameter("limit", limit.toString()).apply { cursor?.let { addQueryParameter("cursor", it) } }.build()

    companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
        private val EMPTY_JSON = "{}".toRequestBody(JSON)
    }
}
