package io.github.jovalle.watchtower.tv.playback

import android.graphics.SurfaceTexture
import android.view.Surface
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.github.jovalle.watchtower.tv.api.Autoplay
import io.github.jovalle.watchtower.tv.api.Delivery
import io.github.jovalle.watchtower.tv.api.MediaIdentity
import io.github.jovalle.watchtower.tv.api.MediaSummary
import io.github.jovalle.watchtower.tv.api.PlaybackDescriptor
import io.github.jovalle.watchtower.tv.api.PlaybackPart
import io.github.jovalle.watchtower.tv.api.PlaybackTracks
import io.github.jovalle.watchtower.tv.api.QualityInfo
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.api.SourceInfo
import io.github.jovalle.watchtower.tv.api.TimelineMapping
import io.github.jovalle.watchtower.tv.api.HttpClients
import java.io.IOException
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.Request
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AuthenticatedPlaybackTest {
    private val server = MockWebServer()
    private val requests = Collections.synchronizedList(mutableListOf<RecordedRequest>())
    private lateinit var bytes: ByteArray

    @Before fun setUp() {
        val context = InstrumentationRegistry.getInstrumentation().context
        bytes = context.assets.open("playback-sample.mp4").use { it.readBytes() }
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requests += request
                if (request.headers["Authorization"] != "Bearer wtd_test_token" ||
                    request.headers["X-Watchtower-Identity-Version"] != "7"
                ) return MockResponse.Builder().code(401).build()
                val range = request.headers["Range"]?.let(RANGE::find)
                val start = range?.groupValues?.get(1)?.toIntOrNull() ?: 0
                val requestedEnd = range?.groupValues?.get(2)?.toIntOrNull()
                val end = (requestedEnd ?: bytes.lastIndex).coerceAtMost(bytes.lastIndex)
                if (start !in bytes.indices || start > end) {
                    return MockResponse.Builder().code(416).addHeader("Content-Range", "bytes */${bytes.size}").build()
                }
                val body = Buffer().write(bytes, start, end - start + 1)
                return MockResponse.Builder()
                    .code(if (range == null) 200 else 206)
                    .addHeader("Content-Type", "video/mp4")
                    .addHeader("Accept-Ranges", "bytes")
                    .addHeader("Content-Length", end - start + 1)
                    .apply { if (range != null) addHeader("Content-Range", "bytes $start-$end/${bytes.size}") }
                    .body(body)
                    .build()
            }
        }
        server.start()
    }

    @After fun tearDown() = server.close()

    @Test fun realPlayerUsesCapturedCredentialsForEveryMediaRequestAndBlocksOtherOrigins() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val snapshot = SessionSnapshot(server.url("/"), "wtd_test_token", "device-1", 7, Long.MAX_VALUE)
        val client = HttpClients("android-tv/instrumentation").forSession(snapshot)
        val source = PlaybackMediaSourceFactory(snapshot, client).create(descriptor(server.url("/media.mp4").toString())).single()
        val ready = CountDownLatch(1)
        val firstFrame = CountDownLatch(1)
        val failure = AtomicReference<Throwable?>()
        lateinit var player: ExoPlayer
        lateinit var texture: SurfaceTexture
        lateinit var surface: Surface
        instrumentation.runOnMainSync {
            texture = SurfaceTexture(0).apply { setDefaultBufferSize(320, 180) }
            surface = Surface(texture)
            player = ExoPlayer.Builder(context).build().apply {
                addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_READY) ready.countDown()
                    }

                    override fun onRenderedFirstFrame() {
                        firstFrame.countDown()
                    }

                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        failure.set(error)
                        ready.countDown()
                        firstFrame.countDown()
                    }
                })
                setVideoSurface(surface)
                setMediaSource(source)
                playWhenReady = true
                prepare()
            }
        }

        try {
            assertTrue("player did not become ready", ready.await(15, TimeUnit.SECONDS))
            assertTrue("player did not render a frame", firstFrame.await(15, TimeUnit.SECONDS))
            assertNull(failure.get()?.toString(), failure.get())
            val completedRequests = synchronized(requests) { requests.toList() }
            assertTrue(completedRequests.isNotEmpty())
            completedRequests.forEach { request ->
                assertEquals("Bearer wtd_test_token", request.headers["Authorization"])
                assertEquals("7", request.headers["X-Watchtower-Identity-Version"])
            }

            try {
                client.newCall(Request.Builder().url("https://example.invalid/media.mp4").build()).execute()
                fail("expected cross-origin request refusal")
            } catch (expected: IOException) {
                assertTrue(expected.message.orEmpty().contains("Blocked"))
            }
        } finally {
            instrumentation.runOnMainSync {
                player.release()
                surface.release()
                texture.release()
            }
        }
    }

    private fun descriptor(url: String) = PlaybackDescriptor(
        playbackId = "playback-1",
        expiresInMs = 60_000,
        media = MediaIdentity("server-1", "rating-1", "media-1", "part-1"),
        item = MediaSummary(
            ratingKey = "rating-1",
            type = "movie",
            title = "Sample",
            year = null,
            posterUrl = null,
            backdropUrl = null,
            thumbUrl = null,
            durationMs = 2_000,
            viewOffsetMs = 0,
            viewCount = 0,
            leafCount = null,
            viewedLeafCount = null,
            contentRating = null,
            showTitle = null,
            seasonNumber = null,
            episodeNumber = null,
            parentRatingKey = null,
            grandparentRatingKey = null,
            external = null,
        ),
        durationMs = 2_000,
        startPositionMs = 0,
        resumeSource = "request",
        delivery = Delivery(
            "file",
            "direct_play",
            null,
            "video/mp4",
            listOf(PlaybackPart("part-1", 0, 0, 2_000, url)),
            0,
            TimelineMapping("absolute", 0),
        ),
        source = SourceInfo("h264", 320, 180, null, 90, "aac", 2, "mp4"),
        quality = QualityInfo("original", emptyList(), null),
        tracks = PlaybackTracks(emptyList(), emptyList(), null, null, "none", null),
        markers = emptyList(),
        nextItem = null,
        previousItem = null,
        autoplay = Autoplay(false, false),
        heartbeatIntervalMs = 30_000,
        timelineIntervalMs = 10_000,
        diagnostics = emptyList(),
    )

    private companion object {
        val RANGE = Regex("bytes=(\\d+)-(\\d*)")
    }
}