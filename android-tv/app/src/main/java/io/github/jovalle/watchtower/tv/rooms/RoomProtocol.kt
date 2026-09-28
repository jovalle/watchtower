package io.github.jovalle.watchtower.tv.rooms

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

const val ROOM_PROTOCOL_VERSION = 1

object RoomPolicy {
    const val DEAD_BAND_MS = 250L
    const val HARD_SEEK_MS = 1_500L
    const val MIN_RATE = 0.97
    const val MAX_RATE = 1.03
    const val HARD_SEEK_COOLDOWN_MS = 5_000L
    const val START_LEAD_MS = 1_000L
    const val OBSERVATION_INTERVAL_MS = 2_000L
    const val PRESENCE_HEARTBEAT_MS = 5_000L
    const val PRESENCE_STALE_MS = 15_000L
    const val SSE_HEARTBEAT_MS = 5_000L
    const val CLIENT_STALE_MS = 15_000L
    const val BUFFERING_REPORT_DELAY_MS = 1_500L
    const val HOST_GRACE_MS = 30_000L
    const val BLOCKER_TIMEOUT_MS = 30_000L
    const val NEXT_COUNTDOWN_MS = 10_000L
    const val MAX_PARTICIPANTS = 8
    const val MUTATION_WINDOW_MS = 60_000L
}

@Serializable
data class MediaIdentity(
    val serverMachineId: String,
    val ratingKey: String,
    val mediaId: String,
    val partId: String,
)

@Serializable data class RoomAnchor(val positionMs: Long, val effectiveAtMs: Long, val rate: Int)
@Serializable data class RoomPolicyState(val autoAdvance: Boolean)
@Serializable data class NextCountdown(val deadlineMs: Long)

@Serializable
data class RoomParticipant(
    val participantId: String,
    val displayName: String,
    val connected: Boolean,
    val ready: Boolean,
    val buffering: Boolean,
    val blocking: Boolean,
    val error: String?,
)

@Serializable
data class RoomSnapshot(
    val protocolVersion: Int,
    val roomId: String,
    val epoch: String,
    val revision: Long,
    val presenceRevision: Long,
    val mediaGeneration: Long,
    val preparationGeneration: Long,
    val serverNowMs: Long,
    val hostParticipantId: String?,
    val phase: String,
    val reason: String?,
    val resumeAfterPrepare: Boolean,
    val nextCountdown: NextCountdown?,
    val policy: RoomPolicyState,
    val media: MediaIdentity,
    val durationMs: Long,
    val anchor: RoomAnchor,
    val participants: List<RoomParticipant>,
)

@Serializable
data class RoomMembership(
    val participantId: String,
    val membershipVersion: Long,
    val nextCommandSequence: Long,
    val nextPresenceSequence: Long,
)

@Serializable data class RoomInvitation(val secret: String, val expiresAtMs: Long)

@Serializable
data class RoomEnvelope(
    val snapshot: RoomSnapshot,
    val membership: RoomMembership,
    val invitation: RoomInvitation?,
)

@Serializable
data class ClockSample(
    val protocolVersion: Int,
    val epoch: String,
    val receivedAtMs: Long,
    val sentAtMs: Long,
)

@Serializable data class MutationEnvelope(val requestId: String, val epoch: String, val expiresAtMs: Long)
@Serializable data class CreateMedia(val ratingKey: String, val mediaId: String, val partId: String)

@Serializable
data class CreateRoomRequest(
    val requestId: String,
    val epoch: String,
    val expiresAtMs: Long,
    val media: CreateMedia,
    val startPositionMs: Long,
    val autoAdvance: Boolean,
)

@Serializable
data class JoinRoomRequest(
    val requestId: String,
    val epoch: String,
    val expiresAtMs: Long,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val invite: String? = null,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val roomId: String? = null,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val takeover: Boolean? = null,
)

@Serializable
data class InvitationRequest(
    val requestId: String,
    val epoch: String,
    val expiresAtMs: Long,
    val membershipVersion: Long,
    val action: String,
)

@Serializable data class LeaveRequest(val epoch: String, val membershipVersion: Long)

@Serializable
data class CommandEnvelope(
    val commandId: String,
    val commandSequence: Long,
    val membershipVersion: Long,
    val epoch: String,
    val mediaGeneration: Long,
    val expectedRevision: Long,
    val type: String,
    val payload: JsonObject,
)

@Serializable data class SeekPayload(val positionMs: Long)
@Serializable data class SelectNextPayload(val delayMs: Long)
@Serializable data class ParticipantPayload(val participantId: String)
@Serializable data class SetPolicyPayload(val autoAdvance: Boolean)
@Serializable data class CommandResult(val accepted: Boolean, val snapshot: RoomSnapshot)

sealed interface RoomCommand {
    val type: String
    fun payload(): JsonObject

    data object Play : RoomCommand {
        override val type = "play"
        override fun payload() = JsonObject(emptyMap())
    }
    data object Pause : RoomCommand {
        override val type = "pause"
        override fun payload() = JsonObject(emptyMap())
    }
    data class Seek(val positionMs: Long) : RoomCommand {
        override val type = "seek"
        override fun payload() = buildJsonObject { put("positionMs", positionMs) }
    }
    data class SelectNext(val delayMs: Long) : RoomCommand {
        override val type = "select-next"
        override fun payload() = buildJsonObject { put("delayMs", delayMs) }
    }
    data object CancelNext : RoomCommand {
        override val type = "cancel-next"
        override fun payload() = JsonObject(emptyMap())
    }
    data class TransferHost(val participantId: String) : RoomCommand {
        override val type = "transfer-host"
        override fun payload() = buildJsonObject { put("participantId", participantId) }
    }
    data class RemoveParticipant(val participantId: String) : RoomCommand {
        override val type = "remove-participant"
        override fun payload() = buildJsonObject { put("participantId", participantId) }
    }
    data class SetPolicy(val autoAdvance: Boolean) : RoomCommand {
        override val type = "set-policy"
        override fun payload() = buildJsonObject { put("autoAdvance", autoAdvance) }
    }
    data object End : RoomCommand {
        override val type = "end"
        override fun payload() = JsonObject(emptyMap())
    }
}

@Serializable
data class PresenceReport(
    val epoch: String,
    val membershipVersion: Long,
    val mediaGeneration: Long,
    val preparationGeneration: Long,
    val presenceSequence: Long,
    val playbackSessionId: String?,
    val positionMs: Long?,
    val ready: Boolean,
    val buffering: Boolean,
    val replacingSource: Boolean,
    val error: String?,
)

@Serializable data class PresenceAck(val presenceSequence: Long, val epoch: String, val serverNowMs: Long, val ignored: Boolean)
@Serializable data class PresenceResult(val ack: PresenceAck, val snapshot: RoomSnapshot)

@Serializable
data class HeartbeatEvent(
    val protocolVersion: Int,
    val roomId: String,
    val epoch: String,
    val serverNowMs: Long,
    val revision: Long,
    val presenceRevision: Long,
)

@Serializable
data class EndedEvent(
    val protocolVersion: Int,
    val roomId: String,
    val epoch: String,
    val reason: String,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val snapshot: RoomSnapshot? = null,
)

@Serializable data class RoomError(val code: String, val message: String)

@Serializable
data class RoomErrorBody(
    val error: RoomError,
    @OptIn(ExperimentalSerializationApi::class)
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    val snapshot: RoomSnapshot? = null,
)

object RoomProtocol {
    val phases = setOf("lobby", "preparing", "paused", "playing", "ended")
    val reasons = setOf(
        "created", "host_played", "host_paused", "host_seeked", "prepared", "buffering",
        "blocker_timeout", "host_disconnected", "host_reconnected", "host_transferred",
        "host_left", "host_lost", "participant_joined", "participant_left", "participant_removed",
        "next_scheduled", "next_cancelled", "next_selected", "next_unavailable", "media_ended",
        "policy_changed", "host_ended", "expired", "server_changed", "feature_disabled",
    )
    val terminalReasons = setOf(
        "host_ended", "host_lost", "expired", "server_changed", "feature_disabled", "left",
        "removed", "access_denied", "replaced", "identity_changed",
    )
    val presenceErrors = setOf(
        "autoplay_blocked", "media_error", "network_error", "unsupported_media", "access_denied",
        "stream_unavailable",
    )
    val commandTypes = setOf(
        "play", "pause", "seek", "select-next", "cancel-next", "transfer-host",
        "remove-participant", "set-policy", "end",
    )
    val errorStatuses = mapOf(
        "invalid_request" to 400, "unsupported_protocol" to 400, "unauthenticated" to 401,
        "bearer_unsupported" to 401, "identity_ambiguous" to 401, "server_changed" to 401,
        "csrf_rejected" to 403, "forbidden" to 403, "not_host" to 403, "media_forbidden" to 403,
        "removed" to 403, "not_found" to 404, "method_not_allowed" to 405, "stale_epoch" to 409,
        "stale_revision" to 409, "stale_membership" to 409, "stale_generation" to 409,
        "identity_version_mismatch" to 409, "wrong_phase" to 409, "participants_not_ready" to 409,
        "command_conflict" to 409, "command_result_expired" to 409, "request_conflict" to 409,
        "takeover_required" to 409, "room_ended" to 410, "membership_ended" to 410,
        "request_expired" to 410, "payload_too_large" to 413, "unsupported_media_type" to 415,
        "media_unsupported" to 422, "media_mismatch" to 422, "rate_limited" to 429,
        "capacity_exceeded" to 429, "feature_disabled" to 503, "upstream_unavailable" to 503,
    )

    private val uuid = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    private val invite = Regex("^[A-Za-z0-9_-]{43}$")
    private val ratingKey = Regex("^[0-9]{1,12}$")

    fun isUuid(value: String?) = value != null && uuid.matches(value)
    fun isInviteSecret(value: String?) = value != null && invite.matches(value)
    fun isRatingKey(value: String?) = value != null && ratingKey.matches(value)

    fun validate(snapshot: RoomSnapshot): Boolean =
        snapshot.protocolVersion == ROOM_PROTOCOL_VERSION &&
            isUuid(snapshot.roomId) && isUuid(snapshot.epoch) && snapshot.revision >= 0 &&
            snapshot.presenceRevision >= 0 && snapshot.mediaGeneration >= 0 &&
            snapshot.preparationGeneration >= 0 && snapshot.serverNowMs >= 0 &&
            snapshot.durationMs >= 0 && snapshot.phase in phases &&
            snapshot.anchor.positionMs >= 0 && snapshot.anchor.effectiveAtMs >= 0 &&
            snapshot.anchor.rate == 1 && snapshot.participants.size <= RoomPolicy.MAX_PARTICIPANTS &&
            // Mirrors WT parseSnapshot: exact media identity, host and participant IDs.
            with(snapshot.media) { listOf(serverMachineId, ratingKey, mediaId, partId).none(String::isEmpty) } &&
            (snapshot.hostParticipantId == null || isUuid(snapshot.hostParticipantId)) &&
            snapshot.participants.all { isUuid(it.participantId) }
}

fun targetPositionMs(snapshot: RoomSnapshot, serverNowMs: Double): Long {
    val elapsed = if (snapshot.phase == "playing") maxOf(0.0, serverNowMs - snapshot.anchor.effectiveAtMs) else 0.0
    return (snapshot.anchor.positionMs + elapsed).coerceIn(0.0, snapshot.durationMs.toDouble()).toLong()
}

data class ClockCalculation(val offsetMs: Double, val rttMs: Double, val uncertaintyMs: Double)

fun estimateClock(sample: ClockSample, clientSentAtMs: Long, clientReceivedAtMs: Long): ClockCalculation? {
    val serverReceived = sample.receivedAtMs.toDouble()
    val serverSent = sample.sentAtMs.toDouble()
    val clientSent = clientSentAtMs.toDouble()
    val clientReceived = clientReceivedAtMs.toDouble()
    val rtt = clientReceived - clientSent - (serverSent - serverReceived)
    if (clientReceived < clientSent || serverSent < serverReceived || rtt < 0) return null
    return ClockCalculation(
        offsetMs = (serverReceived - clientSent + (serverSent - clientReceived)) / 2,
        rttMs = rtt,
        uncertaintyMs = rtt / 2,
    )
}