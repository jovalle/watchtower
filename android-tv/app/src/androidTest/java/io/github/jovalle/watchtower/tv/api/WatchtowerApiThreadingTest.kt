package io.github.jovalle.watchtower.tv.api

import android.os.StrictMode
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchtowerApiThreadingTest {
    @Test fun delayedResponseBodyNeverBlocksTheUiThread() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val original = AtomicReference<StrictMode.ThreadPolicy>()
        val server = MockWebServer()
        server.enqueue(MockResponse.Builder()
            .body("""{"hero":[],"rows":[],"errors":[]}""")
            .bodyDelay(400, TimeUnit.MILLISECONDS)
            .build())
        server.start()
        instrumentation.runOnMainSync {
            original.set(StrictMode.getThreadPolicy())
            StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.Builder().detectNetwork().penaltyDeathOnNetwork().build())
        }
        try {
            val snapshot = SessionSnapshot(server.url("/"), "wtd_fixture", "fixture", 1, Long.MAX_VALUE)
            val response = withContext(Dispatchers.Main) { WatchtowerApi(HttpClients("threading-test")).home(snapshot) }
            assertTrue(response.rows.isEmpty())
        } finally {
            instrumentation.runOnMainSync { StrictMode.setThreadPolicy(original.get()) }
            server.close()
        }
    }
}
