package io.github.jovalle.watchtower.tv.catalog

import io.github.jovalle.watchtower.tv.api.MediaDetail
import io.github.jovalle.watchtower.tv.api.MediaRatingsResponse
import io.github.jovalle.watchtower.tv.api.ProviderRating
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.api.WatchtowerJson
import io.github.jovalle.watchtower.tv.auth.IdentityChange
import java.io.File
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.After
import org.junit.Assert.*
import org.junit.Test

class MediaRatingsStateTest {
    @After fun tearDown() { Dispatchers.resetMain() }
    private fun owner(version: Long = 1) = SessionSnapshot("http://127.0.0.1:9002/".toHttpUrl(), "synthetic", "test-device", version, Long.MAX_VALUE)
    private fun response(value: Double = 8.4) = MediaRatingsResponse(listOf(ProviderRating("imdb", "rating", value, 10)), listOf("TMDB is unavailable."))

    @Test fun delayedOptionalRatingsLeaveLoadedDetailsAndPlaybackReady() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val root = File(System.getProperty("watchtower.contracts") ?: "../../contracts", "native/v1")
        val detail = WatchtowerJson.decodeFromString<MediaDetail>(File(root, "media-detail-movie.json").readText())
        val ratingKey = requireNotNull(detail.ratingKey)
        val delayed = CompletableDeferred<MediaRatingsResponse>()
        val data = object : CatalogDataSource by FakeCatalogDataSource(detail = detail) {
            override suspend fun mediaRatings(snapshot: SessionSnapshot, ratingKey: String): MediaRatingsResponse {
                assertEquals(detail.ratingKey, ratingKey)
                return delayed.await()
            }
        }
        val details = DetailViewModel(ratingKey, data, { owner() }, MutableSharedFlow())
        val ratings = MediaRatingsViewModel(ratingKey, data, { owner() }, MutableSharedFlow())
        runCurrent()
        assertEquals(detail, details.state.value.detail)
        assertTrue(details.state.value.actionsReady)
        assertTrue(details.state.value.detail!!.playable)
        assertNull(ratings.state.value.ratings)
        assertTrue(ratings.state.value.loading)
        delayed.complete(response()); advanceUntilIdle()
        assertEquals(response().ratings, ratings.state.value.ratings)
        assertEquals(detail, details.state.value.detail)
        assertTrue(details.state.value.actionsReady)
    }

    @Test fun refreshingRetainsLoadedRatingsAndWarningsOnFailure() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val refresh = CompletableDeferred<MediaRatingsResponse>()
        var calls = 0
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun mediaRatings(snapshot: SessionSnapshot, ratingKey: String) = if (calls++ == 0) response() else refresh.await()
        }
        val model = MediaRatingsViewModel("source-42", data, { owner() }, MutableSharedFlow())
        advanceUntilIdle()
        assertEquals(response().ratings, model.state.value.ratings)
        assertEquals(response().warnings, model.state.value.warnings)
        model.reload(); runCurrent()
        assertTrue(model.state.value.loading)
        assertEquals(response().ratings, model.state.value.ratings)
        refresh.completeExceptionally(IOException("optional upstream implementation detail")); advanceUntilIdle()
        assertFalse(model.state.value.loading)
        assertEquals(response().ratings, model.state.value.ratings)
        assertEquals(response().warnings, model.state.value.warnings)
        assertEquals("Ratings could not be loaded. Try again.", model.state.value.error)
    }

    @Test fun identitySwitchClearsRatingsAndRejectsACancellationIgnoringOldResponse() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var current: SessionSnapshot? = owner()
        val changes = MutableSharedFlow<IdentityChange>()
        val old = CompletableDeferred<MediaRatingsResponse>()
        val replacement = CompletableDeferred<MediaRatingsResponse>()
        var calls = 0
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun mediaRatings(snapshot: SessionSnapshot, ratingKey: String): MediaRatingsResponse {
                if (calls++ == 0) return response()
                return withContext(NonCancellable) { if (snapshot.identityVersion == 1L) old.await() else replacement.await() }
            }
        }
        val model = MediaRatingsViewModel("source-42", data, { current }, changes)
        advanceUntilIdle()
        model.reload(); runCurrent()
        val previous = current; current = owner(2)
        changes.emit(IdentityChange(previous, current)); runCurrent()
        assertNull(model.state.value.ratings)
        assertTrue(model.state.value.warnings.isEmpty())
        old.complete(response(1.0)); runCurrent()
        assertNull(model.state.value.ratings)
        replacement.complete(response(9.0)); advanceUntilIdle()
        assertEquals(response(9.0).ratings, model.state.value.ratings)
    }

    @Test fun newerReloadWinsEvenIfTheCancelledRequestFinishesLast() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val late = CompletableDeferred<MediaRatingsResponse>()
        var calls = 0
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun mediaRatings(snapshot: SessionSnapshot, ratingKey: String) =
                if (calls++ == 0) withContext(NonCancellable) { late.await() } else response(9.0)
        }
        val model = MediaRatingsViewModel("source-42", data, { owner() }, MutableSharedFlow())
        runCurrent(); model.reload(); runCurrent()
        late.complete(response(1.0)); advanceUntilIdle()
        assertEquals(response(9.0).ratings, model.state.value.ratings)
        assertNull(model.state.value.error)
    }

    @Test fun signingOutClearsLoadedScoresAndStopsLoading() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var current: SessionSnapshot? = owner()
        val changes = MutableSharedFlow<IdentityChange>()
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun mediaRatings(snapshot: SessionSnapshot, ratingKey: String) = response()
        }
        val model = MediaRatingsViewModel("source-42", data, { current }, changes)
        advanceUntilIdle()
        assertEquals(response().ratings, model.state.value.ratings)
        val previous = current; current = null
        changes.emit(IdentityChange(previous, null)); advanceUntilIdle()
        assertNull(model.state.value.ratings)
        assertTrue(model.state.value.warnings.isEmpty())
        assertFalse(model.state.value.loading)
    }

    @Test fun changedSnapshotCannotPublishEvenBeforeItsIdentityEventArrives() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var current = owner()
        val late = CompletableDeferred<MediaRatingsResponse>()
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun mediaRatings(snapshot: SessionSnapshot, ratingKey: String) = late.await()
        }
        val model = MediaRatingsViewModel("source-42", data, { current }, MutableSharedFlow())
        runCurrent(); current = owner(2)
        late.complete(response()); advanceUntilIdle()
        assertNull(model.state.value.ratings)
        assertNull(model.state.value.error)
    }
}
