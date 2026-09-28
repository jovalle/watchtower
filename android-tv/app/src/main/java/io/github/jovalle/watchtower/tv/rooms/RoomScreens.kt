package io.github.jovalle.watchtower.tv.rooms

import android.graphics.Bitmap
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Text
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import okhttp3.HttpUrl

@Serializable data object JoinRoomRoute
@Serializable data class RoomLobbyRoute(val roomId: String)

object InviteParser {
    fun parse(input: String): String? {
        val trimmed = input.trim()
        if (RoomProtocol.isInviteSecret(trimmed)) return trimmed
        val uri = runCatching { URI(trimmed) }.getOrNull() ?: return null
        if (uri.rawFragment.isNullOrBlank() || uri.rawQuery != null) return null
        return uri.rawFragment.orEmpty().split('&')
            .mapNotNull { component ->
                val parts = component.split('=', limit = 2)
                parts.takeIf { it.size == 2 && it[0] == "i" }?.get(1)
            }
            .singleOrNull()
            ?.let { URLDecoder.decode(it, StandardCharsets.UTF_8.name()) }
            ?.takeIf(RoomProtocol::isInviteSecret)
    }
}

@Composable
fun JoinRoomScreen(graph: AppGraph, initialValue: String = "", onJoined: (String) -> Unit) {
    var input by remember(initialValue) { mutableStateOf(initialValue) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val invalidInvite = stringResource(R.string.room_invalid_invite)
    val joinFailed = stringResource(R.string.room_join_failed)
    JoinRoomForm(
        value = input,
        onValueChange = { input = it; error = null },
        busy = busy,
        error = error,
        onJoin = {
            val secret = InviteParser.parse(input)
            if (secret == null) {
                error = invalidInvite
            } else if (!busy) {
                busy = true
                graph.appScope.launch {
                    try {
                        val session = graph.rooms.join(secret)
                        input = ""
                        onJoined(session.roomId)
                    } catch (failure: Exception) {
                        error = failure.message ?: joinFailed
                    } finally {
                        busy = false
                    }
                }
            }
        },
    )
}

@Composable
fun JoinRoomForm(
    value: String,
    onValueChange: (String) -> Unit,
    busy: Boolean,
    error: String?,
    onJoin: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val invitationDescription = stringResource(R.string.room_invitation_description)
    Column(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(52.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(stringResource(R.string.room_join_title), fontSize = 34.sp, fontWeight = FontWeight.Bold)
        Text(stringResource(R.string.room_join_prompt), fontSize = 18.sp)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth().background(Color.White)
                .border(if (focused) 4.dp else 2.dp, MaterialTheme.colorScheme.primary)
                .onFocusChanged { focused = it.isFocused }.padding(16.dp).focusable()
                .semantics { contentDescription = invitationDescription },
            textStyle = TextStyle(color = Color.Black, fontSize = 20.sp),
            singleLine = true,
        )
        error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
        }
        Button(onClick = onJoin, enabled = !busy) {
            Text(if (busy) stringResource(R.string.room_joining) else stringResource(R.string.room_join_action))
        }
    }
}

@Composable
fun RoomLobbyScreen(graph: AppGraph, onPlay: (PlayerRoute) -> Unit, onExit: () -> Unit) {
    val state by graph.rooms.state.collectAsStateWithLifecycle()
    val session = state.snapshot?.roomId?.let(graph.rooms::activeSession)
    RoomLobbyContent(
        state = state,
        inviteUrl = state.invitation?.let { invitation -> graph.session.current()?.baseUrl?.let { roomInvitationUrl(it, invitation.secret) } },
        onOpenPlayer = {
            val room = state.snapshot ?: return@RoomLobbyContent
            onPlay(PlayerRoute(room.media.ratingKey, room.media.mediaId, targetPositionMs(room, room.serverNowMs.toDouble()), room.roomId))
        },
        onPlay = { session?.let { graph.appScope.launch { it.send(RoomCommand.Play) } } },
        onRotate = { session?.let { graph.appScope.launch { it.updateInvitation("rotate") } } },
        onRevoke = { session?.let { graph.appScope.launch { it.updateInvitation("revoke") } } },
        onEnd = { session?.let { graph.appScope.launch { it.send(RoomCommand.End) } } },
        onLeave = { graph.appScope.launch { graph.rooms.leave(); onExit() } },
    )
}

@Composable
fun RoomLobbyContent(
    state: RoomUiState,
    inviteUrl: String?,
    onOpenPlayer: () -> Unit,
    onPlay: () -> Unit,
    onRotate: () -> Unit,
    onRevoke: () -> Unit,
    onEnd: () -> Unit,
    onLeave: () -> Unit,
) {
    val primary = remember { FocusRequester() }
    LaunchedEffect(state.snapshot?.roomId) { primary.requestFocus() }
    val snapshot = state.snapshot
    val hostLabel = stringResource(R.string.room_host_badge)
    Row(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).padding(42.dp),
        horizontalArrangement = Arrangement.spacedBy(34.dp),
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(stringResource(R.string.room_lobby_title), fontSize = 34.sp, fontWeight = FontWeight.Bold)
            Text(roomStatus(state), fontSize = 18.sp, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(snapshot?.participants.orEmpty(), key = RoomParticipant::participantId) { participant ->
                    val host = participant.participantId == snapshot?.hostParticipantId
                    val readiness = when {
                        participant.buffering -> stringResource(R.string.room_buffering)
                        participant.ready -> stringResource(R.string.room_ready)
                        else -> stringResource(R.string.room_waiting)
                    }
                    Text(
                        buildString {
                            append(participant.displayName)
                            if (host) append("  $hostLabel")
                            append("  $readiness")
                        },
                        fontSize = 19.sp,
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onOpenPlayer, modifier = Modifier.focusRequester(primary)) { Text(stringResource(R.string.room_open_player)) }
                val blockersReady = snapshot?.participants?.filter(RoomParticipant::blocking)?.all(RoomParticipant::ready) == true
                if (state.isHost) Button(onClick = onPlay, enabled = blockersReady) { Text(stringResource(R.string.room_start)) }
                OutlinedButton(onClick = onLeave) { Text(stringResource(R.string.room_leave)) }
            }
            if (state.isHost) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = onRotate) { Text(stringResource(R.string.room_rotate_invite)) }
                    OutlinedButton(onClick = onRevoke) { Text(stringResource(R.string.room_revoke_invite)) }
                    OutlinedButton(onClick = onEnd) { Text(stringResource(R.string.room_end_everyone)) }
                }
            }
        }
        inviteUrl?.let { url ->
            Column(Modifier.width(320.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                RoomInvitationQr(url)
                Text(url, fontSize = 15.sp, modifier = Modifier.padding(top = 10.dp))
            }
        }
    }
}

@Composable
fun RoomInvitationQr(value: String) {
    val image = remember(value) {
        val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 280, 280)
        val pixels = IntArray(matrix.width * matrix.height) { index ->
            if (matrix[index % matrix.width, index / matrix.width]) android.graphics.Color.BLACK else android.graphics.Color.WHITE
        }
        Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.RGB_565).apply {
            setPixels(pixels, 0, matrix.width, 0, 0, matrix.width, matrix.height)
        }.asImageBitmap()
    }
    Image(
        bitmap = image,
        contentDescription = stringResource(R.string.room_invite_qr_description),
        modifier = Modifier.size(250.dp).background(Color.White).padding(8.dp),
    )
}

fun roomInvitationUrl(base: HttpUrl, secret: String): String? {
    if (!RoomProtocol.isInviteSecret(secret)) return null
    return base.newBuilder().encodedPath("/join").query(null).fragment("i=$secret").build().toString()
}

@Composable
private fun roomStatus(state: RoomUiState): String = when {
    state.errorCode != null || state.endedReason != null -> localizedRoomMessage(
        state.errorCode,
        state.endedReason,
        state.message,
    )
    state.message != null -> state.message
    state.status == RoomConnectionStatus.RECONNECTING -> stringResource(R.string.room_reconnecting)
    state.snapshot?.reason == "host_transferred" -> stringResource(R.string.room_host_transferred)
    state.snapshot?.reason == "host_disconnected" -> stringResource(R.string.room_host_disconnected)
    state.snapshot?.phase == "preparing" -> stringResource(R.string.room_preparing)
    state.snapshot?.phase == "playing" -> stringResource(R.string.room_playing)
    else -> stringResource(R.string.room_waiting_for_start)
}

@Composable
fun localizedRoomMessage(errorCode: String?, endedReason: String?, fallback: String?): String = when {
    errorCode == "not_host" -> stringResource(R.string.room_error_not_host)
    errorCode == "participants_not_ready" -> stringResource(R.string.room_error_participants_not_ready)
    errorCode == "stale_revision" -> stringResource(R.string.room_error_stale_revision)
    errorCode == "stale_epoch" || endedReason == "server_restarted" -> stringResource(R.string.room_ended_server_restarted)
    errorCode == "removed" || endedReason == "removed" -> stringResource(R.string.room_ended_removed)
    errorCode == "access_denied" || errorCode == "media_forbidden" || endedReason == "access_denied" ->
        stringResource(R.string.room_error_access_denied)
    errorCode == "room_ended" || errorCode == "membership_ended" -> stringResource(R.string.room_ended_generic)
    errorCode == "identity_version_mismatch" || errorCode == "unauthenticated" || endedReason == "identity_changed" ->
        stringResource(R.string.room_ended_identity_changed)
    errorCode == "feature_disabled" -> stringResource(R.string.room_error_feature_disabled)
    errorCode == "upstream_unavailable" -> stringResource(R.string.room_error_upstream_unavailable)
    endedReason == "host_ended" -> stringResource(R.string.room_ended_by_host)
    endedReason == "host_lost" -> stringResource(R.string.room_ended_host_lost)
    endedReason == "left" -> stringResource(R.string.room_left)
    fallback != null -> fallback
    else -> stringResource(R.string.room_ended_generic)
}
