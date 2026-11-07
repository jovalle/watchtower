package io.github.jovalle.watchtower.tv.catalog

import io.github.jovalle.watchtower.tv.api.PersonProfile
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

class PersonProfileStateTest {
    @After fun tearDown() { Dispatchers.resetMain() }
    private fun owner(version: Long = 1) = SessionSnapshot("http://127.0.0.1:9002/".toHttpUrl(), "synthetic", "test-device", version, Long.MAX_VALUE)
    private fun profile(name: String = "Actor") = PersonProfile("person-7", name, "Character", null, null, null, null, null, null, emptyList(), emptyList(), emptyList())

    @Test fun retryRetainsTheLoadedProfileDuringRefreshAndFailure() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val refresh = CompletableDeferred<PersonProfile>()
        var calls = 0
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun person(snapshot: SessionSnapshot, ratingKey: String, personId: String): PersonProfile {
                assertEquals("source-42", ratingKey); assertEquals("person-7", personId)
                return if (calls++ == 0) profile() else refresh.await()
            }
        }
        val model = PersonProfileViewModel("source-42", "person-7", data, { owner() }, MutableSharedFlow())
        advanceUntilIdle()
        model.reload(); runCurrent()
        assertEquals("Actor", model.state.value.profile?.name)
        assertTrue(model.state.value.loading)
        refresh.completeExceptionally(IllegalStateException("Credits unavailable")); advanceUntilIdle()
        assertEquals("Actor", model.state.value.profile?.name)
        assertEquals("Credits unavailable", model.state.value.error)
        assertFalse(model.state.value.loading)
    }

    @Test fun changingIdentityDropsOldFactsAndRejectsACancellationIgnoringResponse() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var current = owner()
        val changes = MutableSharedFlow<IdentityChange>()
        val late = CompletableDeferred<PersonProfile>()
        val replacement = CompletableDeferred<PersonProfile>()
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun person(snapshot: SessionSnapshot, ratingKey: String, personId: String) =
                withContext(NonCancellable) { if (snapshot.identityVersion == 1L) late.await() else replacement.await() }
        }
        val model = PersonProfileViewModel("source-42", "person-7", data, { current }, changes)
        runCurrent()
        val previous = current; current = owner(2)
        changes.emit(IdentityChange(previous, current)); runCurrent()
        assertNull(model.state.value.profile)
        late.complete(profile("Old identity facts")); runCurrent()
        assertNull(model.state.value.profile)
        replacement.complete(profile("Current identity facts")); advanceUntilIdle()
        assertEquals("Current identity facts", model.state.value.profile?.name)
    }

    @Test fun newerRetryWinsEvenWhenTheCancelledRequestCompletesLast() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val late = CompletableDeferred<PersonProfile>()
        var calls = 0
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun person(snapshot: SessionSnapshot, ratingKey: String, personId: String) =
                if (calls++ == 0) withContext(NonCancellable) { late.await() } else profile("Fresh facts")
        }
        val model = PersonProfileViewModel("source-42", "person-7", data, { owner() }, MutableSharedFlow())
        runCurrent(); model.reload(); runCurrent()
        late.complete(profile("Stale facts")); advanceUntilIdle()
        assertEquals("Fresh facts", model.state.value.profile?.name)
    }
}
