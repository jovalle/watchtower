package io.github.jovalle.watchtower.tv.catalog

import io.github.jovalle.watchtower.tv.api.*
import io.github.jovalle.watchtower.tv.auth.IdentityChange
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class HomeHeroStateTest {
    @After fun cleanup() { Dispatchers.resetMain() }
    private fun snapshot(version: Long) = SessionSnapshot("http://watchtower.test/".toHttpUrl(), "fixture", "device", version, Long.MAX_VALUE)
    private fun item(key: String = "10") = MediaSummary(key, "movie", key, 2026, null, null, null,
        600_000, 120_000, 0, null, null, null, null, null, null, null, null, null)
    private fun home(item: MediaSummary) = HomeResponse(listOf(item), listOf(
        HomeRow("cw", "continue_watching", "Continue Watching", listOf(item)),
        HomeRow("recent", "recently_added", "Recently Added", listOf(item))), emptyList())

    @Test fun dismissWaitsForConfirmationAndPreservesOtherRowsAndProgress() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler));val item = item()
        val confirmed = CompletableDeferred<Unit>()
        val data = FakeCatalogDataSource(homeBlock = { home(item) }, dismissBlock = { confirmed.await() })
        val model = HomeViewModel(data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle();model.selectHero(item);advanceUntilIdle();model.dismissHero();runCurrent()
        assertTrue(model.heroActions.value.busy)
        assertEquals(2, (model.state.value as LoadState.Content).value.rows.size)
        confirmed.complete(Unit);advanceUntilIdle()
        val result = (model.state.value as LoadState.Content).value
        assertEquals(listOf("recent"), result.rows.map { it.id })
        assertEquals(120_000L, result.rows.single().items.single().viewOffsetMs)
        assertEquals(0, result.rows.single().items.single().viewCount)
        assertEquals(120_000L, result.hero.single().viewOffsetMs)
        assertFalse(model.heroActions.value.busy)
    }

    @Test fun writesAreSerializedAndFailurePreservesTheItem() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler));val confirmed = CompletableDeferred<Unit>();var writes = 0
        val data = FakeCatalogDataSource(homeBlock = { home(item()) }, watchedBlock = {
            writes++;confirmed.await();throw IOException("Write failed")
        })
        val model = HomeViewModel(data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle();model.selectHero(item());advanceUntilIdle()
        model.setHeroWatched();model.setHeroWatched();runCurrent();assertEquals(1, writes)
        confirmed.complete(Unit);advanceUntilIdle()
        assertEquals("Write failed", model.heroActions.value.error)
        assertEquals(0, (model.state.value as LoadState.Content).value.hero.single().viewCount)
        assertFalse(model.heroActions.value.busy)
    }

    @Test fun watchlistIgnoresTheOldSelectedItemsResponse() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val first = CompletableDeferred<Boolean?>();val second = CompletableDeferred<Boolean?>();var reads = 0
        val data = FakeCatalogDataSource(watchlistStatusBlock = {
            withContext(NonCancellable) { if (++reads == 1) first.await() else second.await() }
        })
        val model = HomeViewModel(data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle();model.selectHero(item("a"));runCurrent();model.selectHero(item("b"));runCurrent()
        second.complete(false);runCurrent();first.complete(true);advanceUntilIdle()
        assertEquals("b", model.heroActions.value.ratingKey);assertEquals(false, model.heroActions.value.onWatchlist)
    }

    @Test fun unknownWatchlistChecksInsteadOfAdding() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler));var writes = 0
        val data = FakeCatalogDataSource(watchlistStatusBlock = { null }, watchlistBlock = { _, _ -> writes++ })
        val model = HomeViewModel(data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle();model.selectHero(item());advanceUntilIdle();model.setHeroWatchlist();advanceUntilIdle()
        assertEquals(0, writes);assertNull(model.heroActions.value.onWatchlist)
    }

    @Test fun oldProfileDismissCannotRemoveTheNewProfilesItem() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        var current = snapshot(1);val changes = MutableSharedFlow<IdentityChange>();val confirmed = CompletableDeferred<Unit>()
        val data = FakeCatalogDataSource(homeBlock = { home(item()) }, dismissBlock = { withContext(NonCancellable) { confirmed.await() } })
        val model = HomeViewModel(data, { current }, changes)
        advanceUntilIdle();model.selectHero(item());advanceUntilIdle();model.dismissHero();runCurrent()
        val old = current;current = snapshot(2);changes.emit(IdentityChange(old, current));runCurrent()
        confirmed.complete(Unit);advanceUntilIdle()
        assertEquals(2, (model.state.value as LoadState.Content).value.rows.size)
        assertFalse(model.heroActions.value.busy)
    }
    @Test fun oldHomeRefreshCannotReintroduceADismissedItem() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler));var reads = 0
        val stale = CompletableDeferred<HomeResponse>()
        val data = FakeCatalogDataSource(homeBlock = { if (++reads == 1) home(item()) else withContext(NonCancellable) { stale.await() } })
        val model = HomeViewModel(data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle();model.selectHero(item());advanceUntilIdle();model.reload();runCurrent()
        model.dismissHero();runCurrent()
        stale.complete(home(item()));advanceUntilIdle()
        assertEquals(listOf("recent"), (model.state.value as LoadState.Content).value.rows.map { it.id })
    }

    @Test fun returningToTheSameItemDuringAWriteCannotOverwriteConfirmedWatchlistState() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler));var reads = 0
        val stale = CompletableDeferred<Boolean?>();val written = CompletableDeferred<Unit>()
        val data = FakeCatalogDataSource(watchlistStatusBlock = {
            if (++reads < 3) false else withContext(NonCancellable) { stale.await() }
        }, watchlistBlock = { _, _ -> written.await() })
        val model = HomeViewModel(data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle();model.selectHero(item("a"));advanceUntilIdle();model.setHeroWatchlist();runCurrent()
        model.selectHero(item("b"));runCurrent();model.selectHero(item("a"));runCurrent()
        written.complete(Unit);runCurrent();assertEquals(true, model.heroActions.value.onWatchlist)
        stale.complete(false);advanceUntilIdle();assertEquals(true, model.heroActions.value.onWatchlist)
    }

    @Test fun confirmedWatchedChangesBothHeroAndRowsAndCanBeUndone() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler));val writes = mutableListOf<Boolean>()
        val data = FakeCatalogDataSource(homeBlock = { home(item()) }, watchedBlock = writes::add)
        val model = HomeViewModel(data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle();model.selectHero(item());advanceUntilIdle();model.setHeroWatched();advanceUntilIdle()
        assertEquals(1, (model.state.value as LoadState.Content).value.hero.single().viewCount)
        assertEquals(listOf("recent"), (model.state.value as LoadState.Content).value.rows.map { it.id })
        model.setHeroWatched();advanceUntilIdle()
        assertEquals(listOf(true, false), writes)
        assertEquals(0, (model.state.value as LoadState.Content).value.rows.single().items.single().viewCount)
    }

    @Test fun selectedHeroRatingsUseTheSharedEndpointAndIgnoreThePreviousSelection() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val old = CompletableDeferred<MediaRatingsResponse>();val fresh = CompletableDeferred<MediaRatingsResponse>()
        val data = FakeCatalogDataSource(ratingsBlock = { key -> withContext(NonCancellable) { if (key == "a") old.await() else fresh.await() } })
        val model = HomeViewModel(data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle();model.selectHero(item("a"));runCurrent();model.selectHero(item("b"));runCurrent()
        val expected = listOf(ProviderRating("imdb", "rating", 8.8, 10))
        fresh.complete(MediaRatingsResponse(expected));runCurrent()
        old.complete(MediaRatingsResponse(listOf(ProviderRating("imdb", "rating", 7.0, 10))));advanceUntilIdle()
        assertEquals("b", model.heroActions.value.ratingKey);assertEquals(expected, model.heroActions.value.ratings)
    }

    @Test fun confirmingWatchlistDoesNotCancelTheIndependentRatingsRead() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler));val pending = CompletableDeferred<MediaRatingsResponse>()
        val data = FakeCatalogDataSource(watchlistStatusBlock = { false }, ratingsBlock = { pending.await() })
        val model = HomeViewModel(data, { snapshot(1) }, MutableSharedFlow())
        advanceUntilIdle();model.selectHero(item());runCurrent();model.setHeroWatchlist();runCurrent()
        assertEquals(true, model.heroActions.value.onWatchlist)
        val expected = listOf(ProviderRating("imdb", "rating", 8.8, 10))
        pending.complete(MediaRatingsResponse(expected));advanceUntilIdle()
        assertEquals(expected, model.heroActions.value.ratings)
        assertEquals(true, model.heroActions.value.onWatchlist)
    }

}
