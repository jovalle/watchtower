package io.github.jovalle.watchtower.tv.e2e

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import io.github.jovalle.watchtower.tv.auth.CredentialStore
import io.github.jovalle.watchtower.tv.auth.StoredCredential
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Local E2E harness hook (scripts/tv-e2e/room-e2e.ts): stores a synthetic device credential issued by an
 * isolated test server so adb-driven journeys start signed in. Skipped unless the harness passes arguments.
 */
@RunWith(AndroidJUnit4::class)
class SeedCredentialTest {
    @Test
    fun storesHarnessCredential() {
        val args = InstrumentationRegistry.getArguments()
        val token = args.getString("wtToken")
        assumeTrue("Run by the local E2E harness only", token != null)
        CredentialStore(InstrumentationRegistry.getInstrumentation().targetContext).write(
            StoredCredential(
                baseUrl = requireNotNull(args.getString("wtBaseUrl")),
                accessToken = requireNotNull(token),
                deviceSessionId = requireNotNull(args.getString("wtDeviceSessionId")),
                identityVersion = requireNotNull(args.getString("wtIdentityVersion")).toLong(),
                expiresAtMs = requireNotNull(args.getString("wtExpiresAtMs")).toLong(),
                me = null,
            ),
        )
    }
}
