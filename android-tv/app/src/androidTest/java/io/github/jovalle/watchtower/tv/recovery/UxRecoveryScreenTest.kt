package io.github.jovalle.watchtower.tv.recovery

import android.app.Application
import android.view.KeyEvent
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import androidx.test.platform.app.InstrumentationRegistry
import androidx.tv.material3.MaterialTheme
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.api.*
import io.github.jovalle.watchtower.tv.auth.AuthState
import io.github.jovalle.watchtower.tv.auth.SessionManager
import io.github.jovalle.watchtower.tv.catalog.ApiCatalogDataSource
import io.github.jovalle.watchtower.tv.catalog.SearchScreen
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import io.github.jovalle.watchtower.tv.pairing.ProfileChooser
import io.github.jovalle.watchtower.tv.pairing.ProfileGateController
import io.github.jovalle.watchtower.tv.playback.PlaybackController
import io.github.jovalle.watchtower.tv.playback.PlayerScreen
import io.github.jovalle.watchtower.tv.settings.ProfilePlaybackPrefs
import io.github.jovalle.watchtower.tv.settings.SettingsScreen
import io.github.jovalle.watchtower.tv.ui.AppRoot
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okio.Buffer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class UxRecoveryScreenTest {
    @get:Rule val compose = createComposeRule()
    private val server = MockWebServer()
    private lateinit var graph: AppGraph
    private var playback: PlaybackController? = null
    private val unavailable = AtomicBoolean(true)
    private val starts = AtomicInteger()
    private val homeLoads = AtomicInteger()
    private val requestLoads = AtomicInteger()
    private val issueLoads = AtomicInteger()
    private val playlistLoads = AtomicInteger()
    private var homeShowsFixture = false
    private var failingPath = "/profiles"
    private lateinit var sample: ByteArray

    @Before fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().context
        sample = context.assets.open("playback-sample.mp4").use { it.readBytes() }
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.url.encodedPath.removePrefix("/api/v1")
                if (path == failingPath && unavailable.get()) return json("""{"error":{"code":"upstream_unavailable","message":"Fixture temporarily unavailable","retryable":true,"requestId":"fixture"}}""", 503)
                return when (path) {
                    "/profiles" -> json("""{"items":[{"profileId":"fixture","title":"Fixture Profile","restricted":false,"protected":false,"admin":true,"current":true}]}""")
                    "/libraries" -> json("""{"items":[{"sectionId":"movies","title":"Fixture Movies","type":"movie"}]}""")
                    "/home" -> {
                        val item = if (homeLoads.getAndIncrement() == 0) summaryJson else summaryJson.replace("\"viewOffsetMs\":0", "\"viewOffsetMs\":60000")
                        json(if (homeShowsFixture) """{"hero":[$item],"rows":[],"errors":[]}""" else """{"hero":[],"rows":[],"errors":[]}""")
                    }
                    "/preferences" -> json("""{"autoSkipIntro":false,"autoPlayNextEpisode":true,"showContinueWatching":true,"showRecentlyAdded":true,"showTrending":true,"showCollections":true,"discoveryDisabled":false}""")
                    "/devices" -> json("""{"items":[]}""")
                    "/requests" -> {
                        val status = if (requestLoads.getAndIncrement() == 0) "Pending" else "Available"
                        json("""{"items":[{"id":1,"type":"movie","tmdbId":1,"title":"Fixture Movie","posterUrl":null,"ratingKey":"movie","status":"$status","is4k":false,"createdAt":"2026-11-05"}],"page":1,"pages":1,"totalResults":1}""")
                    }
                    "/issues" -> {
                        val status = if (issueLoads.getAndIncrement() == 0) "open" else "resolved"
                        json("""{"items":[{"id":1,"type":"movie","tmdbId":1,"title":"Fixture Issue","posterUrl":null,"ratingKey":"movie","status":"$status","issueType":1,"message":"Synthetic report","createdAt":"2026-11-05"}],"page":1,"pages":1,"totalResults":1}""")
                    }
                    "/issues/1" -> json("""{"id":1,"type":"movie","tmdbId":1,"title":"Fixture Issue","posterUrl":null,"ratingKey":"movie","status":"open","issueType":1,"message":"Synthetic report","createdAt":"2026-11-05","comments":[]}""")
                    "/playlists" -> {
                        val count = playlistLoads.incrementAndGet()
                        json("""{"items":[{"playlistId":"fixture-playlist","title":"Fixture Playlist","itemCount":$count,"durationMs":null,"smart":false,"thumbUrl":null}]}""")
                    }
                    "/watchlist" -> json("""{"items":[],"counts":{"all":0,"plex":0,"trakt":0,"imdb":0},"errors":[]}""")
                    "/search" -> json("""{"library":[$summaryJson],"external":[]}""")
                    "/media/movie" -> json(mediaJson)
                    "/playback" -> { starts.incrementAndGet(); json(descriptorJson) }
                    "/fixture.mp4" -> MockResponse.Builder().code(200).addHeader("Content-Type", "video/mp4").body(Buffer().write(sample)).build()
                    else -> MockResponse.Builder().code(204).build()
                }
            }
        }
        server.start()
        // The instrumentation APK owns these preferences; no paired-app credentials are read or changed.
        val app = object : Application() { init { attachBaseContext(context) } }
        graph = AppGraph(app)
        val snapshot = SessionSnapshot(server.url("/"), "wtd_synthetic_recovery", "fixture-device", 1, Long.MAX_VALUE)
        val me = MeResponse("fixture-device", 1, Long.MAX_VALUE, ServerInfo("fixture-server", "Fixture Server"),
            AccountInfo("fixture-user", "Fixture Account"), ProfileSummary("fixture-user", "Fixture Profile", false, true, false),
            MeFeatures(false, true, false, false))
        @Suppress("UNCHECKED_CAST")
        val state = SessionManager::class.java.getDeclaredField("_state").apply { isAccessible = true }
            .get(graph.session) as MutableStateFlow<AuthState>
        state.value = AuthState.SignedIn(snapshot, me)
        graph.localPlaybackPrefs.clear("fixture-server", "fixture-user")
    }

    @After fun tearDown() {
        compose.runOnIdle { playback?.dispose(); graph.appScope.cancel() }
        graph.localPlaybackPrefs.clear("fixture-server", "fixture-user")
        server.close()
    }

    @Test fun profileLoadingFailureCanRetryWithoutLeavingTheGate() {
        compose.setContent { MaterialTheme { ProfileChooser(graph, androidx.compose.runtime.remember { ProfileGateController(graph) }) } }
        waitForError()
        unavailable.set(false)
        clickDescription("Retry")
        compose.onNodeWithText("Fixture Profile").assertIsDisplayed()
    }

    @Test fun failedLibrariesRemainVisibleAndCanBeRetriedFromTheRail() {
        failingPath = "/libraries"
        compose.setContent { AppRoot(graph) }
        waitForError()
        unavailable.set(false)
        clickDescription("Retry")
        compose.waitUntil(5_000) { compose.onAllNodesWithContentDescription("Fixture Movies").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("Fixture Movies").assertIsDisplayed()
    }

    @Test fun failedSearchRetriesItsUnchangedQuery() {
        failingPath = "/search"
        compose.setContent { MaterialTheme { SearchScreen(graph, ApiCatalogDataSource(graph.api)) {} } }
        compose.onNodeWithContentDescription("Search query").performTextInput("fixture")
        waitForError()
        unavailable.set(false)
        clickDescription("Retry")
        compose.waitUntil(5_000) { compose.onAllNodesWithContentDescription("Fixture Movie").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("Fixture Movie").assertIsDisplayed()
    }

    @Test fun returningHomeRefreshesProgressWithoutLeavingTheSession() {
        failingPath = "/none"
        homeShowsFixture = true
        compose.setContent { AppRoot(graph) }
        compose.waitUntil(5_000) { compose.onAllNodesWithContentDescription("Play").fetchSemanticsNodes().isNotEmpty() }
        clickDescription("Watchtower")
        compose.onNodeWithText("Account").assertIsDisplayed()
        clickDescription("Home")
        compose.waitUntil(5_000) { compose.onAllNodesWithContentDescription("Resume").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("Resume").assertIsDisplayed()
    }

    @Test fun returningToServiceInboxesRefreshesRequestAndIssueStatus() {
        failingPath = "/none"
        compose.setContent { AppRoot(graph) }
        clickDescription("Requests")
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Pending").fetchSemanticsNodes().isNotEmpty() }
        clickText("Fixture Movie")
        compose.waitUntil(5_000) { compose.onAllNodesWithContentDescription("Play").fetchSemanticsNodes().isNotEmpty() }
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Available").fetchSemanticsNodes().isNotEmpty() }

        clickDescription("Issues")
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Video / Open").fetchSemanticsNodes().isNotEmpty() }
        clickText("Fixture Issue")
        compose.onNodeWithText("Issue Details").assertIsDisplayed()
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Video / Resolved").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Video / Resolved").assertIsDisplayed()
    }

    @Test fun returningToMyListsRefreshesPlaylistCounts() {
        failingPath = "/none"
        compose.setContent { AppRoot(graph) }
        clickDescription("My Lists")
        compose.waitUntil(5_000) { compose.onAllNodesWithContentDescription("Fixture Playlist, 1 items").fetchSemanticsNodes().isNotEmpty() }
        clickDescription("Watchtower")
        compose.onNodeWithText("Account").assertIsDisplayed()
        clickDescription("My Lists")
        compose.waitUntil(5_000) { compose.onAllNodesWithContentDescription("Fixture Playlist, 2 items").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("Fixture Playlist, 2 items").assertIsDisplayed()
    }

    @Test fun settingsDeviceFailureCannotResetUnrelatedLocalPreferences() {
        failingPath = "/devices"
        val saved = ProfilePlaybackPrefs(preferredAudioLanguage = "ja", preferredSubtitleLanguage = "es", playbackSpeed = 1.25f)
        graph.localPlaybackPrefs.set("fixture-server", "fixture-user", saved)
        compose.setContent { MaterialTheme { SettingsScreen(graph) } }
        waitForError()
        clickText("Video & Audio")
        clickText("Quality")
        clickText("720p · 4 Mbps")
        assertEquals(saved.copy(defaultQuality = "720p-4"), graph.localPlaybackPrefs.get("fixture-server", "fixture-user"))
    }

    @Test fun settingsLoadingFailureCanRetryWithoutLosingItsCategory() {
        failingPath = "/preferences"
        compose.setContent { MaterialTheme { SettingsScreen(graph) } }
        waitForError()
        clickText("Experience")
        unavailable.set(false)
        clickText("Retry")
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Continue Watching").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Continue Watching").assertIsDisplayed()
    }

    @Test fun initialMediaFailureRetriesInitialization() = retryInitialPlayback("/media/movie")

    @Test fun initialPlaybackPostFailureRetriesInitialization() = retryInitialPlayback("/playback")

    @Test fun initialFailureCannotOpenMenusWithoutAPlaybackDescriptor() {
        failingPath = "/media/movie"
        compose.setContent { MaterialTheme { PlayerScreen(graph, PlayerRoute("movie"), {}, {}) } }
        waitForError()
        compose.onNodeWithContentDescription("Retry playback").assertIsFocused()
        compose.onNodeWithContentDescription("More Actions").assertIsNotEnabled()
        compose.onNodeWithContentDescription("Choose subtitles").assertIsNotEnabled()
    }

    private fun retryInitialPlayback(path: String) {
        failingPath = path
        compose.runOnIdle { playback = PlaybackController(InstrumentationRegistry.getInstrumentation().targetContext, graph, PlayerRoute("movie"), {}, {}) }
        compose.waitUntil(5_000) { playback?.state?.value?.error != null }
        unavailable.set(false)
        compose.runOnIdle { playback!!.retry(); playback!!.retry() }
        compose.waitUntil(5_000) { playback?.state?.value?.descriptor != null }
        compose.runOnIdle {
            assertNull(playback!!.state.value.error)
            assertFalse(playback!!.state.value.loading)
            assertEquals("movie", playback!!.state.value.descriptor?.media?.ratingKey)
            assertEquals("retry must create one initial session", 1, starts.get())
        }
    }

    private fun waitForError() {
        compose.waitUntil(5_000) { compose.onAllNodesWithText("Fixture temporarily unavailable").fetchSemanticsNodes().isNotEmpty() }
    }
    private fun clickDescription(value: String) = compose.onNodeWithContentDescription(value).performSemanticsAction(SemanticsActions.OnClick)
    private fun clickText(value: String) = compose.onNodeWithText(value).performSemanticsAction(SemanticsActions.OnClick)
    private fun json(body: String, code: Int = 200) = MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build()

    private val summaryJson = """{"ratingKey":"movie","type":"movie","title":"Fixture Movie","year":null,"posterUrl":null,"backdropUrl":null,"thumbUrl":null,"durationMs":2000,"viewOffsetMs":0,"viewCount":0,"leafCount":null,"viewedLeafCount":null,"contentRating":null,"showTitle":null,"seasonNumber":null,"episodeNumber":null,"parentRatingKey":null,"grandparentRatingKey":null,"external":null}"""
    private val mediaJson get() = summaryJson.dropLast(1) + """, "summary":null,"tagline":null,"studio":null,"genres":[],"directors":[],"cast":[],"audienceRating":null,"criticRating":null,"userRating":null,"originallyAvailableAt":null,"editionTitle":null,"editions":[],"guids":{"imdb":null,"tmdb":null,"tvdb":null,"plex":null},"versions":[],"markers":[],"onWatchlist":false,"playable":true}"""
    private val descriptorJson get() = """{
      "playbackId":"fixture-playback","expiresInMs":60000,"media":{"serverMachineId":"fixture-server","ratingKey":"movie","mediaId":"media","partId":"part"},
      "item":$summaryJson,"durationMs":2000,"startPositionMs":0,"resumeSource":"request",
      "delivery":{"type":"file","method":"direct_play","plexDecision":null,"mimeType":"video/mp4","parts":[{"partId":"part","index":0,"startMs":0,"durationMs":2000,"url":"/api/v1/fixture.mp4"}],"activePartIndex":0,"timeline":{"mapping":"absolute","requestedOffsetMs":0}},
      "source":{"videoCodec":"h264","width":320,"height":180,"hdr":null,"bitrateKbps":90,"audioCodec":"aac","audioChannels":2,"container":"mp4"},
      "quality":{"requested":"original","options":[],"transcodeTarget":null},"tracks":{"audio":[],"subtitles":[],"selectedAudioStreamId":null,"selectedSubtitleStreamId":null,"subtitleDelivery":"none","sidecarUrl":null},
      "markers":[],"nextItem":null,"previousItem":null,"autoplay":{"autoSkipIntro":false,"autoPlayNextEpisode":false},"heartbeatIntervalMs":30000,"timelineIntervalMs":10000,"diagnostics":[]
    }"""
}
