package io.github.jovalle.watchtower.tv.auth

import android.content.SharedPreferences
import io.github.jovalle.watchtower.tv.api.ApiException
import io.github.jovalle.watchtower.tv.api.HttpClients
import io.github.jovalle.watchtower.tv.api.WatchtowerApi
import java.lang.reflect.Proxy
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SessionManagerIdentityTest {
    @Test fun expiredStoredCredentialEmitsOneRemovalBeforeSignedOutState() = runTest {
        val stored = StoredCredential(
            baseUrl = "https://watchtower.test/",
            accessToken = "token",
            deviceSessionId = "device",
            identityVersion = 7,
            expiresAtMs = 1_000,
            me = null,
        )
        val credentialStore = FakeSessionCredentialStore(stored)
        val manager = manager(credentialStore, backgroundScope)
        val observed = mutableListOf<Pair<IdentityChange, AuthState>>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
            manager.identityChanges.collect { observed += it to manager.state.value }
        }

        manager.start()

        val (change, stateAtEmission) = observed.single()
        assertEquals("https://watchtower.test/", change.previous?.baseUrl.toString())
        assertEquals("device", change.previous?.deviceSessionId)
        assertEquals(7L, change.previous?.identityVersion)
        assertNull(change.current)
        assertEquals(AuthState.Starting, stateAtEmission)
        assertTrue(manager.state.value is AuthState.NeedsServer)
        assertEquals(1, credentialStore.clearCount)
    }

    @Test fun malformedStoredCredentialStillRequestsIdentityRemoval() {
        val stored = StoredCredential("not a URL", "token", "device", 7, 1_000, null)

        val action = storedCredentialAction(stored, wallClockMs = 0)
        val change = (action as StoredCredentialAction.Discard).identityChange

        assertNull(change.previous)
        assertNull(change.current)
    }

    @Test fun unexpiredStoredCredentialIsRestored() {
        val stored = StoredCredential("https://watchtower.test/", "token", "device", 7, 10_000, null)

        val action = storedCredentialAction(stored, wallClockMs = 9_999)

        assertEquals("device", (action as StoredCredentialAction.Restore).snapshot.deviceSessionId)
    }

    @Test fun authenticatedFailureEmitsExactlyOneRemovalAndSignsOut() = runTest {
        val stored = StoredCredential("https://watchtower.test/", "token", "device", 7, 100_000_000, null)
        val credentialStore = FakeSessionCredentialStore(stored)
        val managerScope = CoroutineScope(SupervisorJob() + UnconfinedTestDispatcher(testScheduler))
        val manager = manager(credentialStore, managerScope)
        val observed = mutableListOf<Pair<IdentityChange, AuthState>>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
            manager.identityChanges.collect { observed += it to manager.state.value }
        }
        manager.start()
        observed.clear()
        val snapshot = requireNotNull(manager.current())

        manager.onAuthenticatedFailure(snapshot, ApiException(401, "session_expired", "Expired", false, null, null))

        val change = observed.single().first
        assertEquals(snapshot, change.previous)
        assertNull(change.current)
        assertTrue(manager.state.value is AuthState.ReadyToPair)
        assertEquals(1, credentialStore.clearCount)
        managerScope.cancel()
    }

    private fun manager(
        store: SessionCredentialStore,
        scope: kotlinx.coroutines.CoroutineScope,
    ) = SessionManager(
        api = WatchtowerApi(HttpClients("session-test")),
        store = store,
        prefs = emptyPreferences(),
        appScope = scope,
        device = DeviceInfo("Test TV", null, "test", 1),
        allowCleartext = false,
        wallClock = { 86_401_001 },
    )

    private fun emptyPreferences(): SharedPreferences = Proxy.newProxyInstance(
        SharedPreferences::class.java.classLoader,
        arrayOf(SharedPreferences::class.java),
    ) { _, method, arguments ->
        when (method.name) {
            "getString" -> arguments?.get(1)
            "contains" -> false
            "getAll" -> emptyMap<String, Any>()
            else -> throw UnsupportedOperationException("Unexpected SharedPreferences call: ${method.name}")
        }
    } as SharedPreferences
}

private class FakeSessionCredentialStore(private var credential: StoredCredential?) : SessionCredentialStore {
    var clearCount = 0
        private set

    override fun read() = credential
    override fun write(credential: StoredCredential) { this.credential = credential }
    override fun clear() { credential = null; clearCount++ }
}