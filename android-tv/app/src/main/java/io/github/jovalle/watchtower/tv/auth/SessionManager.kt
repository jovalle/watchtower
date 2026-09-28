package io.github.jovalle.watchtower.tv.auth

import android.content.SharedPreferences
import android.os.SystemClock
import io.github.jovalle.watchtower.tv.api.ApiEvents
import io.github.jovalle.watchtower.tv.api.ApiException
import io.github.jovalle.watchtower.tv.api.CreateDeviceAuthorizationRequest
import io.github.jovalle.watchtower.tv.api.InstanceResponse
import io.github.jovalle.watchtower.tv.api.MeResponse
import io.github.jovalle.watchtower.tv.api.ServerAddress
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.api.SwitchProfileRequest
import io.github.jovalle.watchtower.tv.api.WatchtowerApi
import java.io.IOException
import javax.net.ssl.SSLException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

sealed interface AuthState {
    data object Starting : AuthState
    data class NeedsServer(val lastAddress: String?, val message: String?) : AuthState
    data class ReadyToPair(val baseUrl: HttpUrl, val instance: InstanceResponse?, val message: String?) : AuthState
    data class SignedIn(val session: SessionSnapshot, val me: MeResponse?) : AuthState
}

sealed interface PairingState {
    data object Requesting : PairingState
    data class Waiting(
        val userCode: String,
        val verificationUri: String,
        val verificationUriComplete: String,
        val expiresAtElapsedMs: Long,
    ) : PairingState
    data object Approved : PairingState
    data object Denied : PairingState
    data object Expired : PairingState
    data class Failed(val message: String) : PairingState
}

/** A new effective identity (or none). Consumers drop personalized caches, players and pending work. */
data class IdentityChange(val previous: SessionSnapshot?, val current: SessionSnapshot?)

internal sealed interface StoredCredentialAction {
    data class Restore(val snapshot: SessionSnapshot, val me: MeResponse?) : StoredCredentialAction
    data class Discard(val identityChange: IdentityChange) : StoredCredentialAction
}

data class DeviceInfo(val name: String, val model: String?, val versionName: String, val versionCode: Int)

internal interface SessionCredentialStore {
    fun read(): StoredCredential?
    fun write(credential: StoredCredential)
    fun clear()
}

private class EncryptedSessionCredentialStore(private val store: CredentialStore) : SessionCredentialStore {
    override fun read() = store.read()
    override fun write(credential: StoredCredential) = store.write(credential)
    override fun clear() = store.clear()
}

class SessionManager internal constructor(
    private val api: WatchtowerApi,
    private val store: SessionCredentialStore,
    private val prefs: SharedPreferences,
    private val appScope: CoroutineScope,
    private val device: DeviceInfo,
    private val allowCleartext: Boolean,
    private val elapsedRealtime: () -> Long = SystemClock::elapsedRealtime,
    private val wallClock: () -> Long = System::currentTimeMillis,
) : ApiEvents {
    constructor(
        api: WatchtowerApi,
        store: CredentialStore,
        prefs: SharedPreferences,
        appScope: CoroutineScope,
        device: DeviceInfo,
        allowCleartext: Boolean,
        elapsedRealtime: () -> Long = SystemClock::elapsedRealtime,
        wallClock: () -> Long = System::currentTimeMillis,
    ) : this(
        api,
        EncryptedSessionCredentialStore(store),
        prefs,
        appScope,
        device,
        allowCleartext,
        elapsedRealtime,
        wallClock,
    )

    private val _state = MutableStateFlow<AuthState>(AuthState.Starting)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    private val _identityChanges = MutableSharedFlow<IdentityChange>(extraBufferCapacity = 8)
    val identityChanges: SharedFlow<IdentityChange> = _identityChanges.asSharedFlow()

    private val mutex = Mutex()
    private var identityJob: Job = SupervisorJob()

    /** Scope for work that belongs to the current identity; cancelled when it changes. */
    val identityScope: CoroutineScope get() = CoroutineScope(appScope.coroutineContext + identityJob)

    fun current(): SessionSnapshot? = (_state.value as? AuthState.SignedIn)?.session

    fun currentMe(): MeResponse? = (_state.value as? AuthState.SignedIn)?.me

    init {
        api.events = this
    }

    /** Restores a remembered device session without waiting for the network. */
    suspend fun start() = mutex.withLock {
        val stored = store.read()
        when (val action = stored?.let { storedCredentialAction(it, wallClock()) }) {
            is StoredCredentialAction.Restore -> {
                _state.value = AuthState.SignedIn(action.snapshot, action.me)
                _identityChanges.tryEmit(IdentityChange(null, action.snapshot))
                appScope.launch { runCatching { refreshMe() } }
                return@withLock
            }
            is StoredCredentialAction.Discard -> {
                store.clear()
                _identityChanges.tryEmit(action.identityChange)
            }
            null -> Unit
        }
        val lastAddress = prefs.getString(PREF_BASE_URL, null)
        _state.value = lastAddress?.toHttpUrlOrNull()?.let { AuthState.ReadyToPair(it, null, null) }
            ?: AuthState.NeedsServer(null, null)
    }

    /** Validates the address and instance metadata. Returns an error message, or null on success. */
    suspend fun chooseServer(input: String): String? {
        val base = when (val parsed = ServerAddress.parse(input, allowCleartext)) {
            is ServerAddress.Result.Invalid -> return parsed.reason
            is ServerAddress.Result.Valid -> parsed.baseUrl
        }
        val instance = try {
            api.instance(base)
        } catch (e: IOException) {
            return describe(e, base)
        }
        val minVersion = instance.compatibility.minClientVersionCode
        when {
            instance.apiVersion != 1 -> return "This Watchtower server uses an unsupported API version (${instance.apiVersion})."
            minVersion != null && minVersion > device.versionCode ->
                return instance.compatibility.upgradeMessage ?: "Update the Watchtower TV app to use this server."
            !instance.configured -> return "This Watchtower server hasn't finished setup. Ask its owner to complete setup."
            !instance.features.pairing -> return "This Watchtower server doesn't allow TV sign-in."
        }
        mutex.withLock {
            prefs.edit().putString(PREF_BASE_URL, base.toString()).apply()
            _state.value = AuthState.ReadyToPair(base, instance, null)
        }
        return null
    }

    fun changeServer() {
        val address = (state.value as? AuthState.ReadyToPair)?.baseUrl?.toString() ?: prefs.getString(PREF_BASE_URL, null)
        _state.value = AuthState.NeedsServer(address, null)
    }

    /**
     * Browser-approved pairing. Polls with the server's interval, backs off on slow_down, and retries the
     * identical poll after a network failure so a lost approval response is recovered (the server replays the
     * grant for 60 seconds). Cancelling collection abandons the attempt; the server expires it.
     */
    fun pair(): Flow<PairingState> = flow {
        val base = (state.value as? AuthState.ReadyToPair)?.baseUrl
        if (base == null) {
            emit(PairingState.Failed("Choose a Watchtower server first."))
            return@flow
        }
        emit(PairingState.Requesting)
        val authorization = try {
            api.createDeviceAuthorization(
                base,
                CreateDeviceAuthorizationRequest(
                    deviceName = device.name,
                    model = device.model,
                    appVersion = "${device.versionName} (${device.versionCode})",
                ),
            )
        } catch (e: IOException) {
            emit(PairingState.Failed(describe(e, base)))
            return@flow
        }
        val expiresAt = elapsedRealtime() + authorization.expiresInMs
        emit(PairingState.Waiting(authorization.userCode, authorization.verificationUri, authorization.verificationUriComplete, expiresAt))
        var intervalMs = authorization.intervalMs.coerceAtLeast(MIN_POLL_INTERVAL_MS)
        while (true) {
            delay(intervalMs)
            if (elapsedRealtime() >= expiresAt) {
                emit(PairingState.Expired)
                return@flow
            }
            val result = try {
                api.pollDeviceAuthorization(base, authorization.pollingSecret)
            } catch (e: ApiException) {
                when {
                    e.status == 429 -> {
                        intervalMs = maxOf(intervalMs + MIN_POLL_INTERVAL_MS, e.retryAfterMs ?: 0)
                        continue
                    }
                    e.status == 404 -> {
                        emit(PairingState.Expired)
                        return@flow
                    }
                    e.retryable -> continue
                    else -> {
                        emit(PairingState.Failed(e.message ?: "Pairing failed."))
                        return@flow
                    }
                }
            } catch (_: IOException) {
                continue
            }
            when (result.status) {
                "pending" -> result.intervalMs?.let { intervalMs = maxOf(intervalMs, it) }
                "approved" -> {
                    val grant = result.session
                    val me = result.me
                    if (grant == null || me == null || grant.tokenType != "Bearer" || grant.accessToken.isBlank() ||
                        me.deviceSessionId != grant.deviceSessionId
                    ) {
                        emit(PairingState.Failed("Watchtower returned an invalid sign-in. Try again."))
                        return@flow
                    }
                    val snapshot = SessionSnapshot(base, grant.accessToken, grant.deviceSessionId, grant.identityVersion, wallClock() + grant.expiresInMs)
                    signIn(snapshot, me)
                    emit(PairingState.Approved)
                    return@flow
                }
                "denied" -> {
                    emit(PairingState.Denied)
                    return@flow
                }
                "expired" -> {
                    emit(PairingState.Expired)
                    return@flow
                }
                else -> {
                    emit(PairingState.Failed("Unexpected pairing response."))
                    return@flow
                }
            }
        }
    }

    /** Reloads /me; applies a changed identity version (for example after a lost profile-switch response). */
    suspend fun refreshMe(): MeResponse? {
        val snapshot = current() ?: return null
        val me = api.me(snapshot)
        mutex.withLock {
            if (current() != snapshot) return null
            if (me.identityVersion != snapshot.identityVersion) {
                replaceIdentity(snapshot, me)
            } else {
                _state.value = AuthState.SignedIn(snapshot, me)
                persist(snapshot, me)
            }
        }
        return me
    }

    /** Switches the effective Plex Home profile. The PIN is verified upstream by the server, never locally. */
    suspend fun switchProfile(profileId: String, pin: String?): MeResponse {
        val snapshot = current() ?: throw IllegalStateException("Not signed in")
        val me = try {
            api.switchProfile(snapshot, SwitchProfileRequest(profileId, pin, snapshot.identityVersion))
        } catch (e: IOException) {
            if (e !is ApiException) runCatching { refreshMe() }
            throw e
        }
        mutex.withLock { if (current() == snapshot) replaceIdentity(snapshot, me) }
        return me
    }

    /** Signs out locally immediately, then revokes the server session best-effort. */
    suspend fun signOut(message: String? = null) {
        val snapshot = mutex.withLock {
            val snapshot = current() ?: return
            clearIdentity(snapshot, message)
            snapshot
        }
        appScope.launch { withTimeoutOrNull(REVOKE_TIMEOUT_MS) { runCatching { api.signOut(snapshot) } } }
    }

    override fun onAuthenticatedFailure(snapshot: SessionSnapshot, error: ApiException) {
        appScope.launch {
            if (error.isIdentityMismatch) {
                runCatching { refreshMe() }
                return@launch
            }
            mutex.withLock {
                if (current() == snapshot) clearIdentity(snapshot, signedOutMessage(error.code))
            }
        }
    }

    private suspend fun signIn(snapshot: SessionSnapshot, me: MeResponse) = mutex.withLock {
        val previous = current()
        persist(snapshot, me)
        prefs.edit().putString(PREF_BASE_URL, snapshot.baseUrl.toString()).apply()
        resetIdentityScope()
        _state.value = AuthState.SignedIn(snapshot, me)
        _identityChanges.tryEmit(IdentityChange(previous, snapshot))
    }

    private fun replaceIdentity(old: SessionSnapshot, me: MeResponse) {
        val updated = old.copy(identityVersion = me.identityVersion)
        persist(updated, me)
        resetIdentityScope()
        _state.value = AuthState.SignedIn(updated, me)
        _identityChanges.tryEmit(IdentityChange(old, updated))
    }

    private fun clearIdentity(snapshot: SessionSnapshot, message: String?) {
        store.clear()
        resetIdentityScope()
        _identityChanges.tryEmit(IdentityChange(snapshot, null))
        _state.value = AuthState.ReadyToPair(snapshot.baseUrl, null, message)
    }

    private fun resetIdentityScope() {
        identityJob.cancel()
        identityJob = SupervisorJob()
    }

    private fun persist(snapshot: SessionSnapshot, me: MeResponse?) {
        store.write(
            StoredCredential(
                baseUrl = snapshot.baseUrl.toString(),
                accessToken = snapshot.accessToken,
                deviceSessionId = snapshot.deviceSessionId,
                identityVersion = snapshot.identityVersion,
                expiresAtMs = snapshot.expiresAtMs,
                me = me,
            ),
        )
    }

    companion object {
        private const val PREF_BASE_URL = "base_url"
        private const val MIN_POLL_INTERVAL_MS = 5_000L
        private const val REVOKE_TIMEOUT_MS = 5_000L
        fun signedOutMessage(code: String): String = when (code) {
            "session_expired" -> "Your sign-in on this TV expired. Link it again to continue."
            "session_revoked" -> "This TV was signed out from another device. Link it again to continue."
            "server_changed" -> "Watchtower's Plex server changed. Link this TV again."
            "upstream_auth_failed" -> "Plex access for this account changed. Link this TV again."
            else -> "Sign in again to continue."
        }

        fun describe(error: IOException, base: HttpUrl): String = when (error) {
            is ApiException -> error.message ?: "Watchtower returned an error."
            is SSLException -> "The HTTPS certificate for ${base.host} isn't trusted by this TV."
            else -> "Can't reach Watchtower at ${base.host}. Check the address and network."
        }
    }
}

internal fun storedCredentialAction(stored: StoredCredential, wallClockMs: Long): StoredCredentialAction {
    val previous = stored.baseUrl.toHttpUrlOrNull()?.let { baseUrl ->
        SessionSnapshot(
            baseUrl = baseUrl,
            accessToken = stored.accessToken,
            deviceSessionId = stored.deviceSessionId,
            identityVersion = stored.identityVersion,
            expiresAtMs = stored.expiresAtMs,
        )
    }
    return if (previous != null && wallClockMs < stored.expiresAtMs + CLOCK_SKEW_GRACE_MS) {
        StoredCredentialAction.Restore(previous, stored.me)
    } else {
        StoredCredentialAction.Discard(IdentityChange(previous, null))
    }
}

private const val CLOCK_SKEW_GRACE_MS = 24L * 60 * 60 * 1000
