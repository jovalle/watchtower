package io.github.jovalle.watchtower.tv.playback

import android.os.SystemClock
import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.ui.SubtitleView
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.compose.PlayerSurface
import androidx.media3.ui.compose.SURFACE_TYPE_SURFACE_VIEW
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import io.github.jovalle.watchtower.tv.rooms.RoomConnectionStatus
import io.github.jovalle.watchtower.tv.rooms.RoomInvitationQr

@Composable
@androidx.annotation.OptIn(UnstableApi::class)
fun PlayerScreen(graph: AppGraph, route: PlayerRoute, onExit: () -> Unit, onOpenItem: (PlayerRoute) -> Unit) {
	val context = LocalContext.current
	val lifecycle = LocalLifecycleOwner.current.lifecycle
	val view = LocalView.current
	val controller = remember(graph, route) { PlaybackController(context, graph, route, onExit, onOpenItem) }
	val state by controller.state.collectAsStateWithLifecycle()

	DisposableEffect(controller, lifecycle) {
		val observer = LifecycleEventObserver { _, event ->
			when (event) {
				Lifecycle.Event.ON_STOP -> controller.onStop()
				Lifecycle.Event.ON_START -> controller.onStart()
				else -> Unit
			}
		}
		lifecycle.addObserver(observer)
		onDispose {
			lifecycle.removeObserver(observer)
			controller.dispose()
		}
	}
	DisposableEffect(view, state.isPlaying) {
		view.keepScreenOn = state.isPlaying
		onDispose { view.keepScreenOn = false }
	}
	BackHandler { controller.handleBack() }

	Box(
		Modifier
			.fillMaxSize()
			.background(Color.Black)
			.onPreviewKeyEvent { event -> handlePlayerKey(event.nativeKeyEvent, state, controller) },
	) {
		PlayerSurface(
			player = controller.surfacePlayer,
			modifier = Modifier.fillMaxSize(),
			surfaceType = SURFACE_TYPE_SURFACE_VIEW,
		)
		AndroidView(
			factory = {
				SubtitleView(it).apply {
					setUserDefaultStyle()
					setUserDefaultTextSize()
				}
			},
			update = { it.setCues(state.cues) },
			modifier = Modifier.fillMaxSize(),
		)

		if (state.controlsVisible || state.loading || state.error != null) {
			Controls(state, controller, Modifier.align(Alignment.BottomCenter))
		}
		state.menu?.let { Menu(it, state, controller, Modifier.align(Alignment.CenterEnd)) }
		if (state.roomPanelVisible) RoomPanel(state, controller, Modifier.align(Alignment.CenterEnd))
		if (state.confirmLeave) LeaveConfirmation(controller, Modifier.align(Alignment.Center))
		state.nextDeadlineMs?.let { deadline ->
			NextEpisodeCard(
				seconds = ((deadline - SystemClock.elapsedRealtime()).coerceAtLeast(0) + 999) / 1_000,
				onPlay = controller::playNextNow,
				onCancel = controller::cancelNextCountdown,
				modifier = Modifier.align(Alignment.BottomEnd),
			)
		}
		val announcement = when {
			state.error != null -> state.error
			state.buffering -> stringResource(R.string.player_buffering)
			!state.playWhenReady && !state.loading -> stringResource(R.string.player_paused)
			else -> null
		}
		announcement?.let {
			Text(
				text = it,
				modifier = Modifier.align(Alignment.TopCenter).padding(24.dp).semantics {
					liveRegion = LiveRegionMode.Assertive
				},
				color = Color.White,
				fontSize = 20.sp,
			)
		}
		state.roomMessage?.let {
			Text(
				text = it,
				modifier = Modifier.align(Alignment.TopStart).padding(24.dp).semantics { liveRegion = LiveRegionMode.Polite },
				color = Color.White,
				fontSize = 18.sp,
			)
		}
	}
}

private fun handlePlayerKey(event: KeyEvent, state: PlaybackUiState, controller: PlaybackController): Boolean {
	val down = event.action == KeyEvent.ACTION_DOWN
	return when (event.keyCode) {
		KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> {
			if (state.menu != null || (state.controlsVisible && state.scrubPositionMs == null)) return false
			if (down) controller.beginScrub(if (event.keyCode == KeyEvent.KEYCODE_DPAD_LEFT) -1 else 1)
			else controller.commitScrub()
			true
		}
		KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
			if (down && event.repeatCount == 0 && !state.controlsVisible) {
				controller.submit(PlaybackIntent.Toggle)
				true
			} else false
		}
		KeyEvent.KEYCODE_MEDIA_PLAY -> down.also { if (it) controller.submit(PlaybackIntent.Play) }
		KeyEvent.KEYCODE_MEDIA_PAUSE -> down.also { if (it) controller.submit(PlaybackIntent.Pause) }
		KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> down.also { if (it) controller.submit(PlaybackIntent.Toggle) }
		KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> down.also { if (it) controller.submit(PlaybackIntent.SeekBy(10_000)) }
		KeyEvent.KEYCODE_MEDIA_REWIND -> down.also { if (it) controller.submit(PlaybackIntent.SeekBy(-10_000)) }
		KeyEvent.KEYCODE_MEDIA_NEXT -> down.also { if (it) controller.submit(PlaybackIntent.Next) }
		KeyEvent.KEYCODE_MEDIA_PREVIOUS -> down.also { if (it) controller.submit(PlaybackIntent.Previous) }
		KeyEvent.KEYCODE_MEDIA_STOP -> down.also { if (it) controller.submit(PlaybackIntent.Stop) }
		else -> false
	}
}

@Composable
private fun Controls(state: PlaybackUiState, controller: PlaybackController, modifier: Modifier = Modifier) {
	Column(
		modifier.fillMaxWidth().background(Color(0xD9000000)).padding(horizontal = 36.dp, vertical = 22.dp),
		verticalArrangement = Arrangement.spacedBy(12.dp),
	) {
		Text(state.title, color = Color.White, fontSize = 24.sp)
		state.subtitle?.let { Text(it, color = Color(0xFFCCCCCC), fontSize = 16.sp) }
		val position = state.scrubPositionMs ?: state.positionMs
		Box(Modifier.fillMaxWidth().height(6.dp).background(Color(0xFF555555))) {
			Box(
				Modifier.fillMaxWidth((position.toFloat() / state.durationMs.coerceAtLeast(1)).coerceIn(0f, 1f))
					.height(6.dp).background(MaterialTheme.colorScheme.primary),
			)
		}
		Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
			Text(formatTime(position), color = Color.White)
			Text("-${formatTime((state.durationMs - position).coerceAtLeast(0))}", color = Color.White)
		}
		if (state.error != null) {
			Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
				PlayerButton(stringResource(R.string.player_retry), stringResource(R.string.player_retry_description), controller::retry)
				PlayerButton(stringResource(R.string.player_exit), stringResource(R.string.player_exit_description)) {
					controller.submit(PlaybackIntent.Stop)
				}
			}
		} else {
			Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
				if (state.room != null) {
					PlayerButton(stringResource(R.string.room_controls), stringResource(R.string.room_controls), controller::toggleRoomPanel)
				}
				PlayerButton(stringResource(R.string.player_start_over), stringResource(R.string.player_start_over_description)) {
					controller.submit(PlaybackIntent.StartOver)
				}
				if (state.descriptor?.previousItem != null) {
					PlayerButton(stringResource(R.string.player_previous), stringResource(R.string.player_previous_description)) {
						controller.submit(PlaybackIntent.Previous)
					}
				}
				PlayerButton(stringResource(R.string.player_rewind), stringResource(R.string.player_rewind_description)) {
					controller.submit(PlaybackIntent.SeekBy(-10_000))
				}
				PlayerButton(
					if (state.playWhenReady) stringResource(R.string.player_pause) else stringResource(R.string.player_play),
					if (state.playWhenReady) stringResource(R.string.player_pause_description) else stringResource(R.string.player_play_description),
				) { controller.submit(PlaybackIntent.Toggle) }
				PlayerButton(stringResource(R.string.player_forward), stringResource(R.string.player_forward_description)) {
					controller.submit(PlaybackIntent.SeekBy(10_000))
				}
				state.skipIntroTargetMs?.let {
					PlayerButton(stringResource(R.string.player_skip_intro), stringResource(R.string.player_skip_intro_description), controller::skipIntro)
				}
				if (state.descriptor?.nextItem != null) {
					PlayerButton(stringResource(R.string.player_next), stringResource(R.string.player_next_description)) {
						controller.submit(PlaybackIntent.Next)
					}
				}
			}
			Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
				PlayerButton(stringResource(R.string.player_audio), stringResource(R.string.player_audio_description)) {
					controller.toggleMenu(PlayerMenu.AUDIO)
				}
				PlayerButton(stringResource(R.string.player_subtitles), stringResource(R.string.player_subtitles_description)) {
					controller.toggleMenu(PlayerMenu.SUBTITLES)
				}
				PlayerButton(stringResource(R.string.player_quality), stringResource(R.string.player_quality_description)) {
					controller.toggleMenu(PlayerMenu.QUALITY)
				}
				PlayerButton(stringResource(R.string.player_diagnostics), stringResource(R.string.player_diagnostics_description)) {
					controller.toggleMenu(PlayerMenu.DIAGNOSTICS)
				}
			}
		}
	}
}

@Composable
private fun RoomPanel(state: PlaybackUiState, controller: PlaybackController, modifier: Modifier = Modifier) {
	val room = state.room ?: return
	val snapshot = room.snapshot
	LazyColumn(
		modifier.width(420.dp).fillMaxHeight().background(Color(0xF20D0D0D)).padding(24.dp),
		verticalArrangement = Arrangement.spacedBy(10.dp),
	) {
		item { Text(stringResource(R.string.room_controls), color = Color.White, fontSize = 26.sp) }
		item {
			Text(
				when (room.status) {
					RoomConnectionStatus.CONNECTED -> snapshot?.phase ?: ""
					RoomConnectionStatus.RECONNECTING -> stringResource(R.string.room_reconnecting)
					RoomConnectionStatus.ENDED, RoomConnectionStatus.ERROR -> room.message.orEmpty()
					else -> stringResource(R.string.room_preparing)
				},
				color = Color(0xFFCCCCCC),
			)
		}
		items(snapshot?.participants.orEmpty(), key = { it.participantId }) { participant ->
			val status = when {
				participant.buffering -> stringResource(R.string.room_buffering)
				participant.ready -> stringResource(R.string.room_ready)
				else -> stringResource(R.string.room_waiting)
			}
			val host = if (participant.participantId == snapshot?.hostParticipantId) " ${stringResource(R.string.room_host_badge)}" else ""
			Text("${participant.displayName}$host  $status", color = Color.White, fontSize = 18.sp)
		}
		if (room.isHost) {
			item {
				Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
					PlayerButton(stringResource(R.string.room_start), stringResource(R.string.room_start)) { controller.submit(PlaybackIntent.Play) }
					PlayerButton(stringResource(R.string.room_end_everyone), stringResource(R.string.room_end_everyone), controller::endRoom)
				}
			}
			item {
				Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
					PlayerButton(stringResource(R.string.room_rotate_invite), stringResource(R.string.room_rotate_invite), controller::rotateInvitation)
					PlayerButton(stringResource(R.string.room_revoke_invite), stringResource(R.string.room_revoke_invite), controller::revokeInvitation)
				}
			}
		}
		item { PlayerButton(stringResource(R.string.room_leave), stringResource(R.string.room_leave), controller::requestLeave) }
		state.roomInviteUrl?.let { url ->
			item { RoomInvitationQr(url) }
			item { Text(url, color = Color.White, fontSize = 14.sp) }
		}
	}
}

@Composable
private fun LeaveConfirmation(controller: PlaybackController, modifier: Modifier = Modifier) {
	Column(
		modifier.width(440.dp).background(Color(0xFA171717)).padding(28.dp),
		verticalArrangement = Arrangement.spacedBy(14.dp),
	) {
		Text(stringResource(R.string.room_leave_confirm), color = Color.White, fontSize = 26.sp)
		Text(stringResource(R.string.room_leave_confirm_detail), color = Color(0xFFCCCCCC), fontSize = 17.sp)
		Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
			PlayerButton(stringResource(R.string.room_leave), stringResource(R.string.room_leave), controller::confirmLeave)
			PlayerButton(stringResource(R.string.room_stay), stringResource(R.string.room_stay), controller::cancelLeave)
		}
	}
}

@Composable
private fun PlayerButton(label: String, description: String, onClick: () -> Unit) {
	Button(onClick = onClick, modifier = Modifier.semantics { contentDescription = description }) {
		Text(label, maxLines = 1)
	}
}

@Composable
private fun Menu(menu: PlayerMenu, state: PlaybackUiState, controller: PlaybackController, modifier: Modifier = Modifier) {
	val descriptor = state.descriptor ?: return
	LazyColumn(
		modifier.width(390.dp).fillMaxHeight().background(Color(0xF20D0D0D)).padding(24.dp),
		verticalArrangement = Arrangement.spacedBy(8.dp),
	) {
		item {
			Text(
				when (menu) {
					PlayerMenu.AUDIO -> stringResource(R.string.player_audio)
					PlayerMenu.SUBTITLES -> stringResource(R.string.player_subtitles)
					PlayerMenu.QUALITY -> stringResource(R.string.player_quality)
					PlayerMenu.DIAGNOSTICS -> stringResource(R.string.player_diagnostics)
				},
				color = Color.White,
				fontSize = 26.sp,
				modifier = Modifier.padding(bottom = 12.dp),
			)
		}
		when (menu) {
			PlayerMenu.AUDIO -> items(descriptor.tracks.audio, key = { it.streamId }) { track ->
				val details = listOfNotNull(track.language, track.codec, track.channels?.let { "$it ch" },
					stringResource(R.string.player_audio_description_label).takeIf { track.audioDescription })
					.joinToString(" / ")
				MenuButton(selectionLabel(track.title, track.streamId == descriptor.tracks.selectedAudioStreamId) + "\n" + details) {
					controller.selectAudio(track)
				}
			}
			PlayerMenu.SUBTITLES -> {
				item { MenuButton(stringResource(R.string.player_subtitles_off)) { controller.selectSubtitle(null) } }
				items(descriptor.tracks.subtitles, key = { it.streamId }) { track ->
					val traits = listOfNotNull(
						track.language,
						stringResource(R.string.player_forced).takeIf { track.forced },
						stringResource(R.string.player_sdh).takeIf { track.hearingImpaired },
						stringResource(if (track.external) R.string.player_external else R.string.player_embedded),
						stringResource(R.string.player_burned).takeIf { descriptor.tracks.subtitleDelivery == "burned" },
					).joinToString(" / ")
					MenuButton(selectionLabel(track.title, track.streamId == descriptor.tracks.selectedSubtitleStreamId) + "\n" + traits) {
						controller.selectSubtitle(track)
					}
				}
				if (descriptor.tracks.subtitleDelivery == "burned") {
					item { Text(stringResource(R.string.player_burned_style_notice), color = Color(0xFFFFCC80)) }
				}
			}
			PlayerMenu.QUALITY -> {
				item {
					Text(
						stringResource(R.string.player_quality_status, descriptor.quality.requested, descriptor.delivery.method),
						color = Color(0xFFCCCCCC),
					)
				}
				items(descriptor.quality.options, key = { it.id }) { option ->
					MenuButton(selectionLabel(option.label, option.id == descriptor.quality.requested)) {
						controller.selectQuality(option.id)
					}
				}
			}
			PlayerMenu.DIAGNOSTICS -> {
				item { DiagnosticLine(stringResource(R.string.player_method), descriptor.delivery.method) }
				item { DiagnosticLine(stringResource(R.string.player_plex_decision), descriptor.delivery.plexDecision?.toString() ?: "n/a") }
				item { DiagnosticLine(stringResource(R.string.player_source), listOfNotNull(descriptor.source.container, descriptor.source.videoCodec, descriptor.source.audioCodec).joinToString(" / ")) }
				item { DiagnosticLine(stringResource(R.string.player_bitrate), descriptor.source.bitrateKbps?.let { "$it kbps" } ?: "n/a") }
				items(state.diagnostics) { DiagnosticLine(stringResource(R.string.player_diagnostic), it) }
			}
		}
	}
}

@Composable
private fun selectionLabel(label: String, selected: Boolean): String =
	if (selected) stringResource(R.string.player_selected, label) else label

@Composable
private fun MenuButton(label: String, onClick: () -> Unit) {
	Button(onClick = onClick, modifier = Modifier.fillMaxWidth()) { Text(label) }
}

@Composable
private fun DiagnosticLine(label: String, value: String) {
	Column(Modifier.padding(vertical = 6.dp)) {
		Text(label, color = Color(0xFFAAAAAA), fontSize = 14.sp)
		Text(value, color = Color.White, fontSize = 17.sp)
	}
}

@Composable
private fun NextEpisodeCard(seconds: Long, onPlay: () -> Unit, onCancel: () -> Unit, modifier: Modifier = Modifier) {
	Column(
		modifier.padding(24.dp).width(320.dp).background(Color(0xF21A1A1A)).padding(20.dp),
		verticalArrangement = Arrangement.spacedBy(12.dp),
	) {
		Text(pluralStringResource(R.plurals.player_next_in, seconds.toInt(), seconds.toInt()), color = Color.White, fontSize = 20.sp)
		Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
			PlayerButton(stringResource(R.string.player_play_next), stringResource(R.string.player_play_next_description), onPlay)
			PlayerButton(stringResource(R.string.player_cancel), stringResource(R.string.player_cancel_description), onCancel)
		}
	}
}

private fun formatTime(milliseconds: Long): String {
	val totalSeconds = milliseconds.coerceAtLeast(0) / 1_000
	val hours = totalSeconds / 3_600
	val minutes = (totalSeconds % 3_600) / 60
	val seconds = totalSeconds % 60
	return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds) else "%d:%02d".format(minutes, seconds)
}
