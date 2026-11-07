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
        assertEquals(listOf("#", "A", "Z"), fixture<LibraryLettersResponse>("library-letters.json").letters.map { it.letter })
        val recommended = fixture<LibraryRecommendationsResponse>("library-recommendations.json").rows.single().items.single()
        assertEquals("A fixture film synopsis.", recommended.summary)
        assertEquals("/api/v1/images?src=%2Flibrary%2Fmetadata%2F5001%2FclearLogo%2F1700000000&w=800&h=310", recommended.clearLogoUrl)
        val detail = fixture<MediaDetail>("media-detail-movie.json")
        assertEquals(detail.summary, detail.toSummary().summary)
        assertEquals(detail.clearLogoUrl, detail.toSummary().clearLogoUrl)
        val colors = ArtworkColors("44181b", "55140b", "9a3936", "31313a")
        assertEquals(colors, detail.copy(artworkColors = colors).toSummary().artworkColors)
        assertEquals(listOf(0L, 3600000L), detail.versions.first().parts.map { it.durationMs!! }.runningFold(0L) { a, b -> a + b }.dropLast(1))
        fixture<Page<MediaSummary>>("children-page.json")
        fixture<AdjacentResponse>("adjacent.json")
        fixture<SearchResponse>("search.json")
        fixture<WatchlistResponse>("watchlist.json")
        assertEquals(true, fixture<WatchlistStatusResponse>("watchlist-status.json").onWatchlist)
        fixture<Items<PlaylistSummary>>("playlists.json")
        fixture<Page<PlaylistItem>>("playlist-items-page.json")
        fixture<Items<CollectionSummary>>("collections.json")
        fixture<Preferences>("preferences.json")
        fixture<RequestAvailability>("request-availability.json")
        assertEquals(5, fixture<MediaRatingsResponse>("media-ratings.json").ratings.size)
        assertEquals("An Actor", fixture<PersonProfile>("person-profile.json").name)
    }

    @Test fun olderSummaryPayloadsKeepNullablePresentationDefaults() {
        val item = strict.parseToJsonElement(File(root, "library-items-page.json").readText())
            .let { (it as JsonObject)["items"] as JsonArray }.first() as JsonObject
        val older = JsonObject(item.filterKeys { it != "summary" && it != "clearLogoUrl" && it != "artworkColors" && it != "genres" && it != "ratings" })
        val decoded = strict.decodeFromString<MediaSummary>(older.toString())
        assertNull(decoded.summary)
        assertNull(decoded.clearLogoUrl)
        assertNull(decoded.artworkColors)
        assertEquals(emptyList<String>(), decoded.genres)
        assertEquals(emptyList<ProviderRating>(), decoded.ratings)
    }

    @Test fun olderDetailsKeepDefaultRatingsAndNullableCastIdentity() {
        val detail = strict.parseToJsonElement(File(root, "media-detail-movie.json").readText()) as JsonObject
        val older = JsonObject(detail.filterKeys { it != "ratings" }.toMutableMap().apply {
            put("cast", JsonArray((detail["cast"] as JsonArray).map { item ->
                JsonObject((item as JsonObject).filterKeys { it != "id" })
            }))
        })
        val decoded = strict.decodeFromString<MediaDetail>(older.toString())
        assertEquals(emptyList<ProviderRating>(), decoded.ratings)
        decoded.cast.forEach { assertNull(it.id) }
    }

    @Test fun audioDescriptionsRoundTripAndOlderTracksDefaultToNull() {
        val commentary = fixture<PlaybackDescriptor>("playback-descriptor-file.json").tracks.audio.first { it.streamId == "12" }
        assertEquals("English (FLAC Stereo)", commentary.title)
        assertEquals("Commentary by Film Historian Tim Lucas", commentary.description)
        val encoded = WatchtowerJson.encodeToString(AudioTrack.serializer(), commentary)
        assertEquals(commentary, strict.decodeFromString<AudioTrack>(encoded))
        val older = JsonObject((strict.parseToJsonElement(encoded) as JsonObject).filterKeys { it != "description" })
        assertNull(strict.decodeFromString<AudioTrack>(older.toString()).description)
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
