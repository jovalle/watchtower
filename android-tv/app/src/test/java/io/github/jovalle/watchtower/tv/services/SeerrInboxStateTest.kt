package io.github.jovalle.watchtower.tv.services

import io.github.jovalle.watchtower.tv.api.IssueDetail
import io.github.jovalle.watchtower.tv.api.ServicePage
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.api.WatchtowerJson
import io.github.jovalle.watchtower.tv.api.RequestSummary
import io.github.jovalle.watchtower.tv.auth.IdentityChange
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SeerrInboxStateTest {
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun filterReturnsToFirstPageAndKeepsTheServerPageCount() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val calls = mutableListOf<Pair<Int, String>>()
        val model = SeerrInboxViewModel({ snapshot(1) }, MutableSharedFlow()) { _, page, filter ->
            calls += page to filter
            ServicePage(listOf("$filter-$page"), page, 3, 45)
        }
        advanceUntilIdle()
        model.goToPage(2)
        advanceUntilIdle()
        model.setFilter("pending")
        advanceUntilIdle()
        assertEquals(listOf(1 to "all", 2 to "all", 1 to "pending"), calls)
        assertEquals(listOf("pending-1"), model.state.value.items)
        assertEquals(3, model.state.value.pages)
    }

    @Test fun identityChangeDropsOldItemsAndDiscardsItsLateResponse() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val current = arrayOf<SessionSnapshot?>(snapshot(1))
        val changes = MutableSharedFlow<IdentityChange>(extraBufferCapacity = 1)
        val oldResponse = CompletableDeferred<ServicePage<String>>()
        val model = SeerrInboxViewModel({ current[0] }, changes) { owner, _, _ ->
            if (owner.identityVersion == 1L) oldResponse.await() else ServicePage(listOf("new-profile"), 1, 1, 1)
        }
        runCurrent()
        val old = current[0]
        current[0] = snapshot(2)
        changes.emit(IdentityChange(old, current[0]))
        oldResponse.complete(ServicePage(listOf("old-profile"), 1, 1, 1))
        advanceUntilIdle()
        assertEquals(listOf("new-profile"), model.state.value.items)
        assertNull(model.state.value.error)
    }

    @Test fun unavailableResponseCanBeRetried() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var fail = true
        val model = SeerrInboxViewModel({ snapshot(1) }, MutableSharedFlow()) { _, _, _ ->
            if (fail) throw java.io.IOException("Seerr is unavailable.")
            ServicePage(listOf("restored"), 1, 1, 1)
        }
        advanceUntilIdle()
        assertEquals("Seerr is unavailable.", model.state.value.error)
        fail = false
        model.reload()
        advanceUntilIdle()
        assertEquals(listOf("restored"), model.state.value.items)
        assertNull(model.state.value.error)
    }

    @Test fun changingPageAndFilterClearsRowsFromThePreviousQuery() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var pending: CompletableDeferred<ServicePage<String>>? = null
        val model = SeerrInboxViewModel({ snapshot(1) }, MutableSharedFlow()) { _, page, filter ->
            pending?.await() ?: ServicePage(listOf("$filter-$page"), page, 3, 45)
        }
        advanceUntilIdle()
        pending = CompletableDeferred()
        model.goToPage(2)
        runCurrent()
        assertEquals(emptyList<String>(), model.state.value.items)
        pending.complete(ServicePage(listOf("all-2"), 2, 3, 45))
        advanceUntilIdle()

        pending = CompletableDeferred()
        model.setFilter("pending")
        runCurrent()
        assertEquals(emptyList<String>(), model.state.value.items)
        pending.complete(ServicePage(listOf("pending-1"), 1, 3, 45))
        advanceUntilIdle()
        assertEquals(listOf("pending-1"), model.state.value.items)
    }

    @Test fun signingOutClearsTheLoadedIssueDetail() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val current = arrayOf<SessionSnapshot?>(snapshot(1))
        val changes = MutableSharedFlow<IdentityChange>(extraBufferCapacity = 1)
        val model = SeerrIssueDetailViewModel({ current[0] }, changes) {
            IssueDetail(1, "movie", 10, "Fixture", null, null, "open", 1, "Private report", "2026-11-04", emptyList())
        }
        advanceUntilIdle()
        assertEquals("Private report", model.state.value.issue?.message)
        val old = current[0]
        current[0] = null
        changes.emit(IdentityChange(old, null))
        advanceUntilIdle()
        assertNull(model.state.value.issue)
        assertEquals(false, model.state.value.loading)
    }

    @Test fun requestDtoRetainsNullableLocalIdentityAndStatus() {
        val item = WatchtowerJson.decodeFromString<RequestSummary>("""{"id":1,"type":"movie","tmdbId":10,"title":"Fixture","posterUrl":null,"ratingKey":null,"status":"Awaiting approval","is4k":false,"createdAt":"2026-11-04"}""")
        assertNull(item.ratingKey)
        assertEquals("Awaiting approval", item.status)
    }

    private fun snapshot(version: Long) = SessionSnapshot("http://localhost/".toHttpUrl(), "wtd_fixture", "fixture", version, Long.MAX_VALUE)
}
