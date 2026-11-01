package io.github.jovalle.watchtower.tv.rooms

import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.auth.IdentityChange
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class RoomConnectionStatus { IDLE, CONNECTING, CONNECTED, RECONNECTING, ENDED, ERROR }

data class RoomUiState(
    val status: RoomConnectionStatus = RoomConnectionStatus.IDLE,
    val snapshot: RoomSnapshot? = null,
    val membership: RoomMembership? = null,
    val invitation: RoomInvitation? = null,
    val clock: ClockEstimate? = null,
    val endedReason: String? = null,
    val errorCode: String? = null,
    val message: String? = null,
    val reconnects: Int = 0,
) {
    val isHost: Boolean get() = snapshot?.hostParticipantId == membership?.participantId
    val isActive: Boolean get() = status !in setOf(RoomConnectionStatus.IDLE, RoomConnectionStatus.ENDED, RoomConnectionStatus.ERROR)
}

data class PresenceObservation(
    val playbackSessionId: String? = null,
    val positionMs: Long? = null,
    val ready: Boolean = false,
    val buffering: Boolean = false,
    val replacingSource: Boolean = false,
    val error: String? = null,
)

class RoomSession(
    val identity: SessionSnapshot,
    val roomId: String,
    initialEnvelope: RoomEnvelope?,
    private val transport: RoomTransport,
    parentScope: CoroutineScope,
    private val nowMs: () -> Long,
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    private val job = SupervisorJob(parentScope.coroutineContext[Job])
    private val scope = CoroutineScope(parentScope.coroutineContext + job)
    private val commandMutex = Mutex()
    private val stateMutex = Mutex()
    private val _state = MutableStateFlow(
        RoomUiState(
            snapshot = initialEnvelope?.snapshot,
            membership = initialEnvelope?.membership,
            invitation = initialEnvelope?.invitation,
        ),
    )
    val state: StateFlow<RoomUiState> = _state.asStateFlow()

    private var commandSequence = initialEnvelope?.membership?.nextCommandSequence ?: 0
    private var presenceSequence = initialEnvelope?.membership?.nextPresenceSequence ?: 0
    private var latestPresence = PresenceObservation()
    private var stream: RoomEventStream? = null
    private var reconnectJob: Job? = null
    private var livenessJob: Job? = null
    private var presenceJob: Job? = null
    private var presenceRetryJob: Job? = null
    private var lastAcknowledgementMs = nowMs()
    private var stopped = false

    suspend fun start() {
        if (_state.value.status != RoomConnectionStatus.IDLE) return
        update { it.copy(status = RoomConnectionStatus.CONNECTING) }
        try {
            if (_state.value.membership == null) applyEnvelope(transport.recover(identity, roomId))
            val estimate = transport.sampleClock(identity)
            val current = _state.value.snapshot ?: throw IOException("Room membership is unavailable.")
            if (estimate.epoch != current.epoch) return terminate("server_restarted")
            update { it.copy(status = RoomConnectionStatus.CONNECTED, clock = estimate, message = null) }
            acknowledge()
            openEvents()
            startTimers()
        } catch (error: Throwable) {
            handleFailure(error)
        }
    }

    suspend fun send(command: RoomCommand): Boolean = commandMutex.withLock {
        val current = _state.value
        val snapshot = current.snapshot ?: return false
        val membership = current.membership ?: return false
        if (current.status != RoomConnectionStatus.CONNECTED) return false
        val body = CommandEnvelope(
            commandId = newId(),
            commandSequence = commandSequence++,
            membershipVersion = membership.membershipVersion,
            epoch = snapshot.epoch,
            mediaGeneration = snapshot.mediaGeneration,
            expectedRevision = snapshot.revision,
            type = command.type,
            payload = command.payload(),
        )
        try {
            applySnapshot(transport.command(identity, roomId, body).snapshot)
            acknowledge()
            true
        } catch (error: RoomApiException) {
            if (handleTerminalFailure(error)) {
                false
            } else {
                error.snapshot?.let { applySnapshot(it) }
                    ?: if (error.status == 409) recoverOnce() else Unit
                update { it.copy(errorCode = error.code, message = roomErrorMessage(error.code, error.message)) }
                false
            }
        } catch (error: Throwable) {
            beginReconnect()
            false
        }
    }

    fun observePresence(observation: PresenceObservation, reportImmediately: Boolean = false) {
        latestPresence = observation
        if (reportImmediately) scope.launch { reportPresence(observation) }
    }

    suspend fun reportPresence(observation: PresenceObservation = latestPresence): Boolean {
        latestPresence = observation
        val current = _state.value
        val snapshot = current.snapshot ?: return false
        val membership = current.membership ?: return false
        if (current.status != RoomConnectionStatus.CONNECTED) return false
        val body = PresenceReport(
            epoch = snapshot.epoch,
            membershipVersion = membership.membershipVersion,
            mediaGeneration = snapshot.mediaGeneration,
            preparationGeneration = snapshot.preparationGeneration,
            presenceSequence = presenceSequence++,
            playbackSessionId = observation.playbackSessionId,
            positionMs = observation.positionMs,
            ready = observation.ready,
            buffering = observation.buffering,
            replacingSource = observation.replacingSource,
            error = observation.error,
        )
        return try {
            val result = transport.presence(identity, roomId, body)
            applySnapshot(result.snapshot)
            acknowledge()
            !result.ack.ignored
        } catch (error: RoomApiException) {
            if (error.status == 429) {
                schedulePresenceRetry(error.retryAfterMs ?: PRESENCE_RETRY_DELAY_MS)
            } else {
                handleFailure(error)
            }
            false
        } catch (error: Throwable) {
            handleFailure(error)
            false
        }
    }

    suspend fun updateInvitation(action: String): Boolean {
        val membership = _state.value.membership ?: return false
        return try {
            applyEnvelope(transport.invitation(identity, roomId, membership.membershipVersion, action, newId()))
            true
        } catch (error: RoomApiException) {
            if (!handleTerminalFailure(error)) {
                error.snapshot?.let { applySnapshot(it) }
                update { it.copy(errorCode = error.code, message = roomErrorMessage(error.code, error.message)) }
            }
            false
        } catch (error: Throwable) {
            handleFailure(error)
            false
        }
    }

    suspend fun leave() {
        if (stopped) return
        stopped = true
        val current = _state.value
        closeTransport()
        update { it.copy(status = RoomConnectionStatus.ENDED, endedReason = "left") }
        try {
            val snapshot = current.snapshot
            val membership = current.membership
            if (snapshot != null && membership != null) {
                transport.leave(identity, roomId, LeaveRequest(snapshot.epoch, membership.membershipVersion))
            }
        } finally {
            scope.cancel()
        }
    }

    fun terminate(reason: String) {
        updateNow { it.copy(status = RoomConnectionStatus.ENDED, endedReason = reason, message = terminalMessage(reason)) }
        stop()
    }

    fun stop() {
        if (stopped) return
        stopped = true
        closeTransport()
        scope.cancel()
    }

    internal suspend fun applySnapshot(incoming: RoomSnapshot): Boolean = stateMutex.withLock {
        if (!RoomProtocol.validate(incoming) || incoming.roomId != roomId) return false
        val current = _state.value.snapshot
        if (current == null) {
            update { it.copy(snapshot = incoming) }
            acknowledge()
            return true
        }
        if (incoming.epoch != current.epoch) {
            terminate("server_restarted")
            return false
        }
        val newerControl = incoming.revision > current.revision
        val newerPresence = incoming.presenceRevision > current.presenceRevision
        if (!newerControl && !newerPresence) {
            if (incoming.revision == current.revision && incoming.presenceRevision == current.presenceRevision) acknowledge()
            return false
        }
        val next = when {
            newerControl && incoming.presenceRevision < current.presenceRevision -> incoming.copy(
                presenceRevision = current.presenceRevision,
                participants = current.participants,
            )
            newerControl -> incoming
            else -> current.copy(
                presenceRevision = incoming.presenceRevision,
                participants = incoming.participants,
                serverNowMs = incoming.serverNowMs,
            )
        }
        update { it.copy(snapshot = next) }
        acknowledge()
        true
    }

    private fun openEvents() {
        stream?.cancel()
        stream = transport.events(
            identity,
            roomId,
            object : RoomEventListener {
                override fun onOpen() = acknowledge()

                override fun onEvent(event: RoomEvent) {
                    scope.launch {
                        when (event) {
                            is RoomEvent.Snapshot -> applySnapshot(event.value)
                            is RoomEvent.Heartbeat -> {
                                val current = _state.value.snapshot
                                if (event.value.roomId != roomId) return@launch
                                if (current != null && event.value.epoch != current.epoch) terminate("server_restarted")
                                else acknowledge()
                            }
                            is RoomEvent.Ended -> {
                                if (event.value.roomId != roomId) return@launch
                                val current = _state.value.snapshot
                                if (current != null && event.value.epoch != current.epoch) return@launch
                                event.value.snapshot?.let { applySnapshot(it) }
                                terminate(event.value.reason)
                            }
                        }
                    }
                }

                override fun onFailure(error: Throwable) = beginReconnect()
                override fun onClosed() = beginReconnect()
            },
        )
    }

    private fun startTimers() {
        livenessJob?.cancel()
        livenessJob = scope.launch {
            while (true) {
                delay(1_000)
                if (nowMs() - lastAcknowledgementMs >= RoomPolicy.CLIENT_STALE_MS) beginReconnect()
            }
        }
        presenceJob?.cancel()
        presenceJob = scope.launch {
            while (true) {
                delay(RoomPolicy.PRESENCE_HEARTBEAT_MS)
                if (_state.value.status == RoomConnectionStatus.CONNECTED) reportPresence()
            }
        }
    }

    private fun beginReconnect() {
        if (stopped || _state.value.status in setOf(RoomConnectionStatus.ENDED, RoomConnectionStatus.ERROR)) return
        stream?.cancel()
        stream = null
        if (reconnectJob?.isActive == true) return
        updateNow { it.copy(status = RoomConnectionStatus.RECONNECTING, reconnects = it.reconnects + 1, message = "Reconnecting to the room...") }
        reconnectJob = scope.launch {
            while (!stopped) {
                try {
                    val envelope = transport.recover(identity, roomId)
                    val previousEpoch = _state.value.snapshot?.epoch
                    if (previousEpoch != null && envelope.snapshot.epoch != previousEpoch) {
                        terminate("server_restarted")
                        return@launch
                    }
                    applyEnvelope(envelope)
                    val estimate = transport.sampleClock(identity)
                    if (estimate.epoch != envelope.snapshot.epoch) {
                        terminate("server_restarted")
                        return@launch
                    }
                    update { it.copy(status = RoomConnectionStatus.CONNECTED, clock = estimate, message = null, errorCode = null) }
                    acknowledge()
                    openEvents()
                    return@launch
                } catch (error: Throwable) {
                    if (handleTerminalFailure(error)) return@launch
                    delay(RECONNECT_DELAY_MS)
                }
            }
        }
    }

    private suspend fun recoverOnce() {
        try {
            applyEnvelope(transport.recover(identity, roomId))
        } catch (error: Throwable) {
            handleFailure(error)
        }
    }

    private fun applyEnvelope(envelope: RoomEnvelope) {
        if (envelope.snapshot.roomId != roomId || !RoomProtocol.validate(envelope.snapshot)) {
            throw IOException("Watchtower returned an invalid room envelope.")
        }
        commandSequence = envelope.membership.nextCommandSequence
        presenceSequence = envelope.membership.nextPresenceSequence
        updateNow {
            it.copy(snapshot = envelope.snapshot, membership = envelope.membership, invitation = envelope.invitation)
        }
    }

    private fun acknowledge() {
        lastAcknowledgementMs = nowMs()
        if (_state.value.status in setOf(RoomConnectionStatus.CONNECTING, RoomConnectionStatus.RECONNECTING)) {
            updateNow { it.copy(status = RoomConnectionStatus.CONNECTED, message = null, errorCode = null) }
        }
    }

    private fun handleFailure(error: Throwable) {
        if (!handleTerminalFailure(error)) beginReconnect()
    }

    private fun handleTerminalFailure(error: Throwable): Boolean {
        if (error !is RoomApiException || (error.status != 410 && error.code !in TERMINAL_ERROR_CODES)) return false
        if (error.code == "stale_epoch") {
            terminate("server_restarted")
            return true
        }
        val ended = error.status == 410 || error.code in setOf("removed", "room_ended", "membership_ended")
        updateNow {
            it.copy(
                status = if (ended) RoomConnectionStatus.ENDED else RoomConnectionStatus.ERROR,
                endedReason = if (ended) error.code else null,
                errorCode = error.code,
                message = roomErrorMessage(error.code, error.message),
            )
        }
        stop()
        return true
    }

    private fun schedulePresenceRetry(delayMs: Long) {
        presenceRetryJob?.cancel()
        presenceRetryJob = scope.launch {
            delay(delayMs.coerceAtLeast(0))
            presenceRetryJob = null
            reportPresence(latestPresence)
        }
    }

    private fun closeTransport() {
        stream?.cancel()
        stream = null
        reconnectJob?.cancel()
        livenessJob?.cancel()
        presenceJob?.cancel()
        presenceRetryJob?.cancel()
        reconnectJob = null
        livenessJob = null
        presenceJob = null
        presenceRetryJob = null
    }

    private suspend fun update(transform: (RoomUiState) -> RoomUiState) {
        _state.emit(transform(_state.value))
    }

    private fun updateNow(transform: (RoomUiState) -> RoomUiState) {
        _state.value = transform(_state.value)
    }

    private fun terminalMessage(reason: String) = when (reason) {
        "server_restarted" -> "The Watch Together server restarted. Create a new room."
        "host_ended" -> "The host ended the room."
        "host_lost" -> "The host did not reconnect, so the room ended."
        "removed" -> "The host removed this TV from the room."
        "access_denied" -> "This profile cannot access the next item."
        "identity_changed" -> "The active profile changed. Rejoin the room."
        else -> "This Watch Together room has ended."
    }

    private companion object {
        const val RECONNECT_DELAY_MS = 1_000L
        const val PRESENCE_RETRY_DELAY_MS = 1_000L
        val TERMINAL_ERROR_CODES = setOf(
            "unauthenticated",
            "identity_version_mismatch",
            "identity_ambiguous",
            "server_changed",
            "removed",
            "room_ended",
            "membership_ended",
            "stale_epoch",
            "feature_disabled",
        )
    }
}

class RoomManager(
    private val transport: RoomTransport,
    private val appScope: CoroutineScope,
    private val currentIdentity: () -> SessionSnapshot?,
    private val roomsEnabled: () -> Boolean,
    identityChanges: Flow<IdentityChange>,
    private val nowMs: () -> Long,
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    private val operationMutex = Mutex()
    private var active: RoomSession? = null
    private var stateJob: Job? = null
    private val _state = MutableStateFlow(RoomUiState())
    val state: StateFlow<RoomUiState> = _state.asStateFlow()

    init {
        appScope.launch {
            identityChanges.collect {
                operationMutex.withLock {
                    val session = active ?: return@withLock
                    session.terminate("identity_changed")
                    active = null
                    stateJob?.cancel()
                    stateJob = null
                    _state.value = RoomUiState(status = RoomConnectionStatus.ENDED, endedReason = "identity_changed")
                }
            }
        }
    }

    fun activeSession(roomId: String? = null): RoomSession? = active?.takeIf {
        it.state.value.isActive && (roomId == null || it.roomId == roomId)
    }

    suspend fun create(media: CreateMedia, startPositionMs: Long, autoAdvance: Boolean): RoomSession = operationMutex.withLock {
        val identity = requireEnabledIdentity()
        val envelope = transport.create(identity, media, startPositionMs, autoAdvance, newId())
        replace(identity, envelope)
    }

    suspend fun join(invite: String): RoomSession = operationMutex.withLock {
        require(RoomProtocol.isInviteSecret(invite)) { "Enter a valid Watch Together invitation." }
        val identity = requireEnabledIdentity()
        val envelope = transport.join(identity, invite, newId())
        replace(identity, envelope)
    }

    suspend fun recover(roomId: String): RoomSession = operationMutex.withLock {
        val identity = requireEnabledIdentity()
        val envelope = transport.recover(identity, roomId)
        replace(identity, envelope)
    }

    suspend fun leave() = operationMutex.withLock {
        val session = active ?: return@withLock
        try {
            session.leave()
        } finally {
            active = null
            stateJob?.cancel()
            stateJob = null
            _state.value = session.state.value
        }
    }

    fun endForIdentityChange() {
        active?.terminate("identity_changed")
        active = null
        stateJob?.cancel()
        stateJob = null
    }

    private suspend fun replace(identity: SessionSnapshot, envelope: RoomEnvelope): RoomSession {
        active?.leave()
        stateJob?.cancel()
        val session = RoomSession(identity, envelope.snapshot.roomId, envelope, transport, appScope, nowMs, newId)
        active = session
        stateJob = appScope.launch { session.state.collect { _state.value = it } }
        session.start()
        return session
    }

    private fun requireEnabledIdentity(): SessionSnapshot {
        check(roomsEnabled()) { "Watch Together is unavailable for this profile." }
        return checkNotNull(currentIdentity()) { "Sign in before joining a room." }
    }
}