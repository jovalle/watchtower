package io.github.jovalle.watchtower.tv.catalog

import io.github.jovalle.watchtower.tv.api.RequestAvailability
import io.github.jovalle.watchtower.tv.api.RequestEntry
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.auth.IdentityChange
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

class RequestActionsStateTest {
    @After fun tearDown() { Dispatchers.resetMain() }
    private fun owner(version: Long = 1) = SessionSnapshot("http://127.0.0.1:9002/".toHttpUrl(), "synthetic", "test-device", version, Long.MAX_VALUE)
    private fun availability(status: String = "unknown", allowed: Boolean? = null) =
        RequestAvailability(status, "available", emptyList(), emptyList(), allowed)

    @Test fun unavailableLookupNeverEnablesAWrite() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var writes = 0
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun requestAvailability(snapshot: SessionSnapshot, type: String, tmdbId: Int): RequestAvailability = error("Temporarily unavailable")
            override suspend fun createRequest(snapshot: SessionSnapshot, type: String, tmdbId: Int): RequestAvailability { writes++; return availability("pending", false) }
        }
        val model = RequestActionsViewModel("movie", 1, true, data, { owner() }, MutableSharedFlow())
        advanceUntilIdle(); model.request(); advanceUntilIdle()
        assertEquals(0, writes)
        assertNotNull(model.state.value.error)
    }

    @Test fun availablePendingProcessingAndBlockedTitlesNeverSubmitEvenWhenCalledDirectly() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        for (status in listOf("available", "pending", "processing", "blocklisted", "partially_available")) {
            var writes = 0
            val data = object : CatalogDataSource by FakeCatalogDataSource() {
                override suspend fun requestAvailability(snapshot: SessionSnapshot, type: String, tmdbId: Int) = availability(status, false)
                override suspend fun createRequest(snapshot: SessionSnapshot, type: String, tmdbId: Int): RequestAvailability { writes++; return availability("pending", false) }
            }
            val model = RequestActionsViewModel("movie", 1, true, data, { owner() }, MutableSharedFlow())
            advanceUntilIdle(); model.request(); advanceUntilIdle()
            assertEquals(status, 0, writes)
        }
    }

    @Test fun standardRequestIgnoresSeparate4kAvailabilityAndLocksBeforeLaunching() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var writes = 0
        val response = CompletableDeferred<RequestAvailability>()
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun requestAvailability(snapshot: SessionSnapshot, type: String, tmdbId: Int) = availability(allowed = true)
            override suspend fun createRequest(snapshot: SessionSnapshot, type: String, tmdbId: Int): RequestAvailability { writes++; return response.await() }
        }
        val model = RequestActionsViewModel("movie", 1, true, data, { owner() }, MutableSharedFlow())
        advanceUntilIdle(); model.request(); model.request(); runCurrent()
        assertEquals(1, writes)
        response.complete(availability("pending", false)); advanceUntilIdle()
        model.request(); advanceUntilIdle(); assertEquals(1, writes)
    }

    @Test fun legacyAvailabilityStillBlocksAvailableAndActiveStandardRequests() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        for (loaded in listOf(availability("available"), availability().copy(requests = listOf(RequestEntry(1, "approved", false, true))))) {
            var writes = 0
            val data = object : CatalogDataSource by FakeCatalogDataSource() {
                override suspend fun requestAvailability(snapshot: SessionSnapshot, type: String, tmdbId: Int) = loaded
                override suspend fun createRequest(snapshot: SessionSnapshot, type: String, tmdbId: Int): RequestAvailability { writes++; return loaded }
            }
            val model = RequestActionsViewModel("movie", 1, true, data, { owner() }, MutableSharedFlow())
            advanceUntilIdle(); model.request(); advanceUntilIdle(); assertEquals(0, writes)
        }
    }

    @Test fun partialTvCanRequestMissingSeasonsWhenServerAllowsIt() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var writes = 0
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun requestAvailability(snapshot: SessionSnapshot, type: String, tmdbId: Int) = availability("partially_available", true)
            override suspend fun createRequest(snapshot: SessionSnapshot, type: String, tmdbId: Int): RequestAvailability { writes++; return availability("pending", false) }
        }
        val model = RequestActionsViewModel("tv", 1, true, data, { owner() }, MutableSharedFlow())
        advanceUntilIdle(); model.request(); advanceUntilIdle(); assertEquals(1, writes)
    }

    @Test fun lateSuccessfulMutationNeverPublishesAnotherProfilesAvailability() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var current = owner()
        val changes = MutableSharedFlow<IdentityChange>()
        val response = CompletableDeferred<RequestAvailability>()
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun requestAvailability(snapshot: SessionSnapshot, type: String, tmdbId: Int) = availability(allowed = true)
            override suspend fun createRequest(snapshot: SessionSnapshot, type: String, tmdbId: Int) = withContext(NonCancellable) { response.await() }
        }
        val model = RequestActionsViewModel("movie", 1, true, data, { current }, changes)
        advanceUntilIdle(); model.request(); runCurrent(); current = owner(2)
        response.complete(availability("pending", false).copy(ratingKey = "old-profile-title")); advanceUntilIdle()
        assertNull(model.state.value.availability?.ratingKey)
        assertNull(model.state.value.message)
    }
}
