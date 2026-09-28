package io.github.jovalle.watchtower.tv.api

import java.io.File
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.serializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Strict decoding of the shared golden fixtures: any drift between fixture and DTO fails. */
class ContractFixturesTest {
    private val strict = Json { ignoreUnknownKeys = false }
    private val root = File(System.getProperty("watchtower.contracts") ?: "../../contracts", "native/v1")

    private inline fun <reified T> fixture(name: String): T = decode(serializer(), name)

    private fun <T> decode(serializer: KSerializer<T>, name: String): T {
        val text = File(root, name).readText()
        val value = strict.decodeFromString(serializer, text)
        // Round trip keeps the same field set (no silently dropped or renamed fields).
        assertEquals(paths(strict.parseToJsonElement(text)), paths(strict.parseToJsonElement(WatchtowerJson.encodeToString(serializer, value))))
        return value
    }

    private fun paths(element: JsonElement, prefix: String = ""): Set<String> = when (element) {
        is JsonObject -> element.flatMap { (key, child) -> paths(child, "$prefix.$key") + "$prefix.$key" }.toSet()
        is JsonArray -> element.flatMap { paths(it, "$prefix[]") }.toSet()
        else -> emptySet()
    }

    @Test fun instance() = assertEquals(1, fixture<InstanceResponse>("instance.json").apiVersion)

    @Test fun pairing() {
        assertEquals(5000L, fixture<DeviceAuthorizationResponse>("device-authorization.json").intervalMs)
        // Poll responses are a status union; absent fields decode to null, so no round-trip comparison.
        val poll = { name: String -> strict.decodeFromString<PollDeviceAuthorizationResponse>(File(root, name).readText()) }
        val approved = poll("poll-approved.json")
        assertEquals("approved", approved.status)
        assertEquals(approved.session!!.deviceSessionId, approved.me!!.deviceSessionId)
        assertEquals("denied", poll("poll-denied.json").status)
        assertEquals(5000L, poll("poll-pending.json").intervalMs)
    }

    @Test fun session() {
        fixture<MeResponse>("me.json")
        assertEquals(2, fixture<Items<DeviceSummary>>("devices.json").items.size)
        assertEquals(2, fixture<Items<HomeProfile>>("profiles.json").items.size)
        assertEquals("identity_version_mismatch", fixture<ErrorEnvelope>("error.json").error.code)
    }

    @Test fun catalog() {
        val home = fixture<HomeResponse>("home.json")
        assertNull(home.rows.first { it.kind == "trending" }.items.single().ratingKey)
        fixture<Items<LibrarySection>>("libraries.json")
        assertEquals(212, fixture<Page<MediaSummary>>("library-items-page.json").totalCount)
        fixture<LibraryFiltersResponse>("library-filters.json")
        val detail = fixture<MediaDetail>("media-detail-movie.json")
        assertEquals(listOf(0L, 3600000L), detail.versions.first().parts.map { it.durationMs!! }.runningFold(0L) { a, b -> a + b }.dropLast(1))
        fixture<Page<MediaSummary>>("children-page.json")
        fixture<AdjacentResponse>("adjacent.json")
        fixture<SearchResponse>("search.json")
        fixture<WatchlistResponse>("watchlist.json")
        fixture<Items<PlaylistSummary>>("playlists.json")
        fixture<Page<PlaylistItem>>("playlist-items-page.json")
        fixture<Items<CollectionSummary>>("collections.json")
        fixture<Preferences>("preferences.json")
        fixture<RequestAvailability>("request-availability.json")
    }

    @Test fun playback() {
        fixture<PlaybackRequest>("playback-request.json")
        val file = fixture<PlaybackDescriptor>("playback-descriptor-file.json")
        assertEquals("file", file.delivery.type)
        assertEquals(3600000L, file.delivery.parts[1].startMs)
        val hls = fixture<PlaybackDescriptor>("playback-descriptor-hls.json")
        assertEquals("unknown", hls.delivery.timeline.mapping)
        fixture<TimelineRequest>("timeline-request.json")
        fixture<TimelineResponse>("timeline-response.json")
    }
}
