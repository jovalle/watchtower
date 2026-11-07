package io.github.jovalle.watchtower.tv.catalog

import io.github.jovalle.watchtower.tv.api.HomeResponse
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.SearchResponse
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.After
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class UxRecoveryStateTest {
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun failedSearchCanRetryTheSameQueryWithoutLosingItsFilters() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var attempts = 0
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun search(snapshot: SessionSnapshot, query: String): SearchResponse {
                if (++attempts == 1) throw IOException("Search unavailable")
                return SearchResponse(listOf(summary("recovered")), emptyList())
            }
        }
        val model = SearchViewModel(data, { snapshot }, MutableSharedFlow())
        model.setMediaFilter("movies")
        model.setShowExternal(false)
        model.search("resident")
        advanceUntilIdle()
        assertEquals("Search unavailable", model.state.value.error)

        model.search("resident")
        advanceUntilIdle()

        assertNull(model.state.value.error)
        assertEquals("recovered", model.state.value.result?.library?.single()?.ratingKey)
        assertEquals("resident", model.state.value.query)
        assertEquals("movies", model.state.value.mediaFilter)
        assertFalse(model.state.value.showExternal)
    }

    @Test fun homeRefreshKeepsExistingContentUntilUpdatedProgressArrives() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val refreshed = CompletableDeferred<HomeResponse>()
        var attempts = 0
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun home(snapshot: SessionSnapshot): HomeResponse =
                if (++attempts == 1) HomeResponse(listOf(summary("movie")), emptyList(), emptyList()) else refreshed.await()
        }
        val model = HomeViewModel(data, { snapshot }, MutableSharedFlow())
        advanceUntilIdle()

        model.reload()
        runCurrent()
        assertTrue("refresh must keep the poster/focus composition mounted", model.state.value is LoadState.Content)
        refreshed.complete(HomeResponse(listOf(summary("movie").copy(viewOffsetMs = 60_000)), emptyList(), emptyList()))
        advanceUntilIdle()
        assertEquals(60_000L, (model.state.value as LoadState.Content).value.hero.single().viewOffsetMs)
    }

    @Test fun failedHomeRefreshKeepsItsPostersAndCanRetryTheRefresh() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var attempts = 0
        val data = object : CatalogDataSource by FakeCatalogDataSource() {
            override suspend fun home(snapshot: SessionSnapshot): HomeResponse {
                if (++attempts == 2) throw IOException("Home temporarily unavailable")
                return HomeResponse(listOf(summary("movie").copy(viewOffsetMs = if (attempts == 1) 0 else 90_000)), emptyList(), emptyList())
            }
        }
        val model = HomeViewModel(data, { snapshot }, MutableSharedFlow())
        advanceUntilIdle()

        model.reload()
        advanceUntilIdle()
        assertEquals(0L, (model.state.value as LoadState.Content).value.hero.single().viewOffsetMs)
        assertEquals("Home temporarily unavailable", model.refreshError.value)

        model.reload()
        advanceUntilIdle()
        assertNull(model.refreshError.value)
        assertEquals(90_000L, (model.state.value as LoadState.Content).value.hero.single().viewOffsetMs)
    }

    private val snapshot = SessionSnapshot("http://localhost/".toHttpUrl(), "fixture", "fixture", 1, Long.MAX_VALUE)
    private fun summary(key: String) = MediaSummary(key, "movie", key, null, null, null, null, 120_000, 0,
        0, null, null, null, null, null, null, null, null, null)
}
