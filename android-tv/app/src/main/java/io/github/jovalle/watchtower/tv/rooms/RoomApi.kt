package io.github.jovalle.watchtower.tv.rooms

import android.os.SystemClock
import io.github.jovalle.watchtower.tv.api.HttpClients
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.api.WatchtowerJson
import io.github.jovalle.watchtower.tv.api.await
import java.io.IOException
import java.util.UUID
import kotlin.math.floor
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources

fun interface MonotonicClock {
    fun nowMs(): Long
}

class RoomApiException(
    val status: Int,
    val code: String?,
    override val message: String,
    val snapshot: RoomSnapshot? = null,
) : IOException(message)

sealed interface RoomEvent {
    data class Snapshot(val value: RoomSnapshot) : RoomEvent
    data class Heartbeat(val value: HeartbeatEvent) : RoomEvent
    data class Ended(val value: EndedEvent) : RoomEvent
}

fun parseRoomEvent(type: String?, data: String, json: Json = WatchtowerJson): RoomEvent? = when (type) {
    "snapshot" -> RoomEvent.Snapshot(json.decodeFromString(RoomSnapshot.serializer(), data))
    "heartbeat" -> RoomEvent.Heartbeat(json.decodeFromString(HeartbeatEvent.serializer(), data))
    "ended" -> RoomEvent.Ended(json.decodeFromString(EndedEvent.serializer(), data))
    else -> null
}

interface RoomEventListener {
    fun onOpen() = Unit
    fun onEvent(event: RoomEvent)
    fun onFailure(error: Throwable)
    fun onClosed() = Unit
}

fun interface RoomEventStream {
    fun cancel()
}

interface RoomTransport {
    suspend fun sampleClock(snapshot: SessionSnapshot, samples: Int = 3): ClockEstimate
    suspend fun create(snapshot: SessionSnapshot, media: CreateMedia, startPositionMs: Long, autoAdvance: Boolean, requestId: String): RoomEnvelope
    suspend fun join(snapshot: SessionSnapshot, invite: String, requestId: String): RoomEnvelope
    suspend fun takeover(snapshot: SessionSnapshot, roomId: String, requestId: String): RoomEnvelope
    suspend fun recover(snapshot: SessionSnapshot, roomId: String): RoomEnvelope
    suspend fun command(snapshot: SessionSnapshot, roomId: String, body: CommandEnvelope): CommandResult
    suspend fun presence(snapshot: SessionSnapshot, roomId: String, body: PresenceReport): PresenceResult
    suspend fun invitation(snapshot: SessionSnapshot, roomId: String, membershipVersion: Long, action: String, requestId: String): RoomEnvelope
    suspend fun leave(snapshot: SessionSnapshot, roomId: String, body: LeaveRequest)
    fun events(snapshot: SessionSnapshot, roomId: String, listener: RoomEventListener): RoomEventStream
}

class RoomApi(
    private val http: HttpClients,
    private val json: Json = WatchtowerJson,
    private val clock: MonotonicClock = MonotonicClock(SystemClock::elapsedRealtime),
    private val newId: () -> String = { UUID.randomUUID().toString() },
) : RoomTransport {
    override suspend fun sampleClock(snapshot: SessionSnapshot, samples: Int): ClockEstimate {
        val probes = buildList {
            repeat(samples) {
                val sent = clock.nowMs()
                val sample = get(snapshot, listOf("clock"), ClockSample.serializer())
                val received = clock.nowMs()
                add(ClockProbe(sample, sent, received))
            }
        }
        return selectClockEstimate(probes) ?: throw IOException("Could not establish the room clock.")
    }

    override suspend fun create(
        snapshot: SessionSnapshot,
        media: CreateMedia,
        startPositionMs: Long,
        autoAdvance: Boolean,
        requestId: String,
    ): RoomEnvelope {
        val mutation = mutation(snapshot, requestId)
        return postRetrying(
            snapshot,
            listOf("rooms"),
            CreateRoomRequest(
                requestId = mutation.requestId,
                epoch = mutation.epoch,
                expiresAtMs = mutation.expiresAtMs,
                media = media,
                startPositionMs = startPositionMs,
                autoAdvance = autoAdvance,
            ),
            CreateRoomRequest.serializer(),
            RoomEnvelope.serializer(),
        )
    }

    override suspend fun join(snapshot: SessionSnapshot, invite: String, requestId: String): RoomEnvelope {
        require(RoomProtocol.isInviteSecret(invite)) { "Invite must be a 43-character secret." }
        val mutation = mutation(snapshot, requestId)
        return postRetrying(
            snapshot,
            listOf("rooms", "join"),
            JoinRoomRequest(mutation.requestId, mutation.epoch, mutation.expiresAtMs, invite = invite),
            JoinRoomRequest.serializer(),
            RoomEnvelope.serializer(),
        )
    }

    override suspend fun takeover(snapshot: SessionSnapshot, roomId: String, requestId: String): RoomEnvelope {
        val mutation = mutation(snapshot, requestId)
        return postRetrying(
            snapshot,
            listOf("rooms", "join"),
            JoinRoomRequest(mutation.requestId, mutation.epoch, mutation.expiresAtMs, roomId = roomId, takeover = true),
            JoinRoomRequest.serializer(),
            RoomEnvelope.serializer(),
        )
    }

    override suspend fun recover(snapshot: SessionSnapshot, roomId: String): RoomEnvelope =
        get(snapshot, listOf("rooms", roomId), RoomEnvelope.serializer())

    override suspend fun command(snapshot: SessionSnapshot, roomId: String, body: CommandEnvelope): CommandResult =
        postRetrying(snapshot, listOf("rooms", roomId, "commands"), body, CommandEnvelope.serializer(), CommandResult.serializer())

    override suspend fun presence(snapshot: SessionSnapshot, roomId: String, body: PresenceReport): PresenceResult =
        requireNotNull(post(snapshot, listOf("rooms", roomId, "presence"), body, PresenceReport.serializer(), PresenceResult.serializer()))

    override suspend fun invitation(
        snapshot: SessionSnapshot,
        roomId: String,
        membershipVersion: Long,
        action: String,
        requestId: String,
    ): RoomEnvelope {
        val mutation = mutation(snapshot, requestId)
        return postRetrying(
            snapshot,
            listOf("rooms", roomId, "invitations"),
            InvitationRequest(mutation.requestId, mutation.epoch, mutation.expiresAtMs, membershipVersion, action),
            InvitationRequest.serializer(),
            RoomEnvelope.serializer(),
        )
    }

    override suspend fun leave(snapshot: SessionSnapshot, roomId: String, body: LeaveRequest) {
        post<LeaveRequest, Unit>(snapshot, listOf("rooms", roomId, "leave"), body, LeaveRequest.serializer(), null)
    }

    override fun events(snapshot: SessionSnapshot, roomId: String, listener: RoomEventListener): RoomEventStream {
        val request = Request.Builder().url(url(snapshot, listOf("rooms", roomId, "events"))).get().build()
        val source = EventSources.createFactory(http.streaming(snapshot)).newEventSource(
            request,
            object : EventSourceListener() {
                override fun onOpen(eventSource: EventSource, response: Response) = listener.onOpen()

                override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                    val event = runCatching {
                        parseRoomEvent(type, data, json)
                    }.getOrElse {
                        listener.onFailure(IOException("Watchtower sent an invalid room event.", it))
                        eventSource.cancel()
                        return
                    }
                    if (event != null) listener.onEvent(event)
                }

                override fun onClosed(eventSource: EventSource) = listener.onClosed()

                override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                    listener.onFailure(t ?: IOException("The room event stream closed (${response?.code ?: "network"})."))
                }
            },
        )
        return RoomEventStream(source::cancel)
    }

    suspend fun create(snapshot: SessionSnapshot, media: CreateMedia, startPositionMs: Long, autoAdvance: Boolean) =
        create(snapshot, media, startPositionMs, autoAdvance, newId())

    suspend fun join(snapshot: SessionSnapshot, invite: String) = join(snapshot, invite, newId())

    suspend fun takeover(snapshot: SessionSnapshot, roomId: String) = takeover(snapshot, roomId, newId())

    suspend fun invitation(snapshot: SessionSnapshot, roomId: String, membershipVersion: Long, action: String) =
        invitation(snapshot, roomId, membershipVersion, action, newId())

    private suspend fun mutation(snapshot: SessionSnapshot, requestId: String): MutationEnvelope {
        require(RoomProtocol.isUuid(requestId)) { "requestId must be a lowercase UUID." }
        val estimate = sampleClock(snapshot)
        return MutationEnvelope(
            requestId = requestId,
            epoch = estimate.epoch,
            expiresAtMs = floor(clock.nowMs() + estimate.offsetMs + MUTATION_EXPIRY_MS).toLong(),
        )
    }

    private suspend fun <RequestType, ResponseType> postRetrying(
        snapshot: SessionSnapshot,
        segments: List<String>,
        body: RequestType,
        requestSerializer: KSerializer<RequestType>,
        responseSerializer: KSerializer<ResponseType>,
    ): ResponseType {
        val encoded = json.encodeToString(requestSerializer, body)
        var failure: IOException? = null
        repeat(2) { attempt ->
            try {
                return requireNotNull(execute(snapshot, postRequest(snapshot, segments, encoded), responseSerializer))
            } catch (error: RoomApiException) {
                throw error
            } catch (error: IOException) {
                failure = error
                if (attempt == 1) throw error
            }
        }
        throw requireNotNull(failure)
    }

    private suspend fun <RequestType, ResponseType> post(
        snapshot: SessionSnapshot,
        segments: List<String>,
        body: RequestType,
        requestSerializer: KSerializer<RequestType>,
        responseSerializer: KSerializer<ResponseType>?,
    ): ResponseType? = execute(
        snapshot,
        postRequest(snapshot, segments, json.encodeToString(requestSerializer, body)),
        responseSerializer,
    )

    private suspend fun <ResponseType> get(
        snapshot: SessionSnapshot,
        segments: List<String>,
        serializer: KSerializer<ResponseType>,
    ): ResponseType = requireNotNull(execute(snapshot, Request.Builder().url(url(snapshot, segments)).get().build(), serializer))

    private fun postRequest(snapshot: SessionSnapshot, segments: List<String>, body: String): Request = Request.Builder()
        .url(url(snapshot, segments))
        .post(body.toRequestBody(JSON))
        .build()

    private suspend fun <ResponseType> execute(
        snapshot: SessionSnapshot,
        request: Request,
        serializer: KSerializer<ResponseType>?,
    ): ResponseType? = http.forSession(snapshot).newCall(request).await().use { response ->
        val body = response.body.string()
        if (!response.isSuccessful) {
            val parsed = runCatching { json.decodeFromString(RoomErrorBody.serializer(), body) }.getOrNull()
            throw RoomApiException(
                status = response.code,
                code = parsed?.error?.code,
                message = parsed?.error?.message ?: "Room request failed (${response.code}).",
                snapshot = parsed?.snapshot,
            )
        }
        if (serializer == null) return@use null
        if (body.isEmpty()) throw IOException("Watchtower returned an empty room response.")
        json.decodeFromString(serializer, body)
    }

    private fun url(snapshot: SessionSnapshot, segments: List<String>) = snapshot.baseUrl.newBuilder()
        .encodedPath("/")
        .addPathSegments("api/v1")
        .apply { segments.forEach(::addPathSegment) }
        .build()

    private companion object {
        const val MUTATION_EXPIRY_MS = 30_000L
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}

fun roomErrorMessage(code: String?, fallback: String): String = when (code) {
    "not_host" -> "Only the room host can do that."
    "participants_not_ready" -> "Waiting for everyone to be ready."
    "stale_revision" -> "The room changed. Try again."
    "stale_epoch" -> "The Watch Together server restarted. Create a new room."
    "removed" -> "The host removed this TV from the room."
    "access_denied", "media_forbidden" -> "This profile cannot access the room's media."
    "room_ended", "membership_ended" -> "This Watch Together room has ended."
    "identity_version_mismatch", "unauthenticated" -> "This TV's sign-in changed. Rejoin the room."
    "feature_disabled" -> "Watch Together is unavailable on this server."
    "upstream_unavailable" -> "Watchtower is unavailable. Reconnecting..."
    else -> fallback
}