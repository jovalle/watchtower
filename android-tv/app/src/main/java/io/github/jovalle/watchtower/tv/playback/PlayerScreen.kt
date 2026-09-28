@file:OptIn(
	androidx.compose.foundation.ExperimentalFoundationApi::class,
	androidx.compose.ui.ExperimentalComposeUiApi::class,
)

package io.github.jovalle.watchtower.tv.playback

import android.os.SystemClock
import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.focusable
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
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
import io.github.jovalle.watchtower.tv.rooms.localizedRoomMessage

@Composable
@androidx.annotation.OptIn(UnstableApi::class)
fun PlayerScreen(graph: AppGraph, route: PlayerRoute, onExit: () -> Unit, onOpenItem: (PlayerRoute) -> Unit) {
	val context = LocalContext.current
	val lifecycle = LocalLifecycleOwner.current.lifecycle
	val view = LocalView.current
	val controller = remember(graph, route) { PlaybackController(context, graph, route, onExit, onOpenItem) }
	val state by controller.state.collectAsStateWithLifecycle()
	val roomPanelOpener = remember { FocusRequester() }
	val leaveOpener = remember { FocusRequester() }
	val playOpener = remember { FocusRequester() }
	val menuOpeners = remember { PlayerMenu.entries.associateWith { FocusRequester() } }
	val countdownHasActions = state.room?.isHost != false
	val countdownOverlay = state.nextDeadlineMs != null && countdownHasActions
	val overlayVisible = state.terminalRoom || state.confirmLeave || state.roomPanelVisible || state.menu != null || countdownOverlay
	RestoreFocusEffect(state.roomPanelVisible || state.terminalRoom, roomPanelOpener)
	RestoreFocusEffect(state.confirmLeave || state.terminalRoom, leaveOpener)
	RestoreFocusEffect(countdownOverlay || state.terminalRoom, playOpener)
	PlayerMenu.entries.forEach { menu ->
		RestoreFocusEffect(state.menu == menu || state.terminalRoom, requireNotNull(menuOpeners[menu]))
	}

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
		if (!state.terminalRoom) {
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
		}

		if (!state.terminalRoom && (state.controlsVisible || state.loading || state.error != null)) {
			Controls(
				state,
				controller,
				canFocus = !overlayVisible,
				roomPanelOpener = roomPanelOpener,
				playOpener = playOpener,
				menuOpeners = menuOpeners,
				modifier = Modifier.align(Alignment.BottomCenter),
			)
		}
		state.menu?.let {
			Menu(
				it,
				state,
				controller,
				active = !state.terminalRoom && !state.confirmLeave && !state.roomPanelVisible,
				modifier = Modifier.align(Alignment.CenterEnd),
			)
		}
		if (state.roomPanelVisible) {
			RoomPanel(
				state,
				RoomPanelActions(
					onPlay = { controller.submit(PlaybackIntent.Play) },
					onEnd = controller::endRoom,
					onRotate = controller::rotateInvitation,
					onRevoke = controller::revokeInvitation,
					onLeave = controller::requestLeave,
					onBack = controller::handleBack,
				),
				active = !state.terminalRoom && !state.confirmLeave,
				leaveOpener = leaveOpener,
				modifier = Modifier.align(Alignment.CenterEnd),
			)
		}
		if (state.confirmLeave) {
			LeaveConfirmation(
				onConfirm = controller::confirmLeave,
				onCancel = controller::cancelLeave,
				onBack = controller::handleBack,
				modifier = Modifier.align(Alignment.Center),
			)
		}
		state.nextDeadlineMs?.let { deadline ->
			NextEpisodeCard(
				seconds = ((deadline - SystemClock.elapsedRealtime()).coerceAtLeast(0) + 999) / 1_000,
				onPlay = controller::playNextNow,
				onCancel = controller::cancelNextCountdown,
				onBack = controller::handleBack,
				showActions = countdownHasActions,
				active = countdownOverlay && !state.terminalRoom && !state.confirmLeave && !state.roomPanelVisible && state.menu == null,
				modifier = Modifier.align(Alignment.BottomEnd),
			)
		}
		if (state.terminalRoom) {
			TerminalRoomOverlay(
				state.roomMessage ?: stringResource(R.string.room_ended_generic),
				controller::exit,
				controller::handleBack,
				Modifier.align(Alignment.Center),
			)
		}
		val announcement = when {
			state.error != null -> state.error
			state.buffering -> stringResource(R.string.player_buffering)
			!state.playWhenReady && !state.loading -> stringResource(R.string.player_paused)
			else -> null
		}
		announcement?.takeUnless { state.terminalRoom }?.let {
			Text(
				text = it,
				modifier = Modifier.align(Alignment.TopCenter).padding(24.dp).semantics {
					liveRegion = LiveRegionMode.Assertive
				},
				color = Color.White,
				fontSize = 20.sp,
			)
		}
		val renderedRoomMessage = state.room?.let {
			localizedRoomMessage(it.errorCode, it.endedReason, state.roomMessage ?: it.message)
		} ?: state.roomMessage
		renderedRoomMessage?.takeUnless { state.terminalRoom }?.let {
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
private fun Controls(
	state: PlaybackUiState,
	controller: PlaybackController,
	canFocus: Boolean,
	roomPanelOpener: FocusRequester,
	playOpener: FocusRequester,
	menuOpeners: Map<PlayerMenu, FocusRequester>,
	modifier: Modifier = Modifier,
) {
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
				PlayerButton(stringResource(R.string.player_retry), stringResource(R.string.player_retry_description), canFocus = canFocus, onClick = controller::retry)
				PlayerButton(stringResource(R.string.player_exit), stringResource(R.string.player_exit_description), canFocus = canFocus) {
					controller.submit(PlaybackIntent.Stop)
				}
			}
		} else {
			Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
				if (state.room != null) {
					PlayerButton(
						stringResource(R.string.room_controls),
						stringResource(R.string.room_controls),
						Modifier.focusRequester(roomPanelOpener),
						canFocus,
						controller::toggleRoomPanel,
					)
				}
				PlayerButton(stringResource(R.string.player_start_over), stringResource(R.string.player_start_over_description), canFocus = canFocus) {
					controller.submit(PlaybackIntent.StartOver)
				}
				if (state.descriptor?.previousItem != null) {
					PlayerButton(stringResource(R.string.player_previous), stringResource(R.string.player_previous_description), canFocus = canFocus) {
						controller.submit(PlaybackIntent.Previous)
					}
				}
				PlayerButton(stringResource(R.string.player_rewind), stringResource(R.string.player_rewind_description), canFocus = canFocus) {
					controller.submit(PlaybackIntent.SeekBy(-10_000))
				}
				PlayerButton(
					if (state.playWhenReady) stringResource(R.string.player_pause) else stringResource(R.string.player_play),
					if (state.playWhenReady) stringResource(R.string.player_pause_description) else stringResource(R.string.player_play_description),
					modifier = Modifier.focusRequester(playOpener),
					canFocus = canFocus,
				) { controller.submit(PlaybackIntent.Toggle) }
				PlayerButton(stringResource(R.string.player_forward), stringResource(R.string.player_forward_description), canFocus = canFocus) {
					controller.submit(PlaybackIntent.SeekBy(10_000))
				}
				state.skipIntroTargetMs?.let {
					PlayerButton(stringResource(R.string.player_skip_intro), stringResource(R.string.player_skip_intro_description), canFocus = canFocus, onClick = controller::skipIntro)
				}
				if (state.descriptor?.nextItem != null) {
					PlayerButton(stringResource(R.string.player_next), stringResource(R.string.player_next_description), canFocus = canFocus) {
						controller.submit(PlaybackIntent.Next)
					}
				}
			}
			Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
				PlayerButton(stringResource(R.string.player_audio), stringResource(R.string.player_audio_description), Modifier.focusRequester(requireNotNull(menuOpeners[PlayerMenu.AUDIO])), canFocus) {
					controller.toggleMenu(PlayerMenu.AUDIO)
				}
				PlayerButton(stringResource(R.string.player_subtitles), stringResource(R.string.player_subtitles_description), Modifier.focusRequester(requireNotNull(menuOpeners[PlayerMenu.SUBTITLES])), canFocus) {
					controller.toggleMenu(PlayerMenu.SUBTITLES)
				}
				PlayerButton(stringResource(R.string.player_quality), stringResource(R.string.player_quality_description), Modifier.focusRequester(requireNotNull(menuOpeners[PlayerMenu.QUALITY])), canFocus) {
					controller.toggleMenu(PlayerMenu.QUALITY)
				}
				PlayerButton(stringResource(R.string.player_diagnostics), stringResource(R.string.player_diagnostics_description), Modifier.focusRequester(requireNotNull(menuOpeners[PlayerMenu.DIAGNOSTICS])), canFocus) {
					controller.toggleMenu(PlayerMenu.DIAGNOSTICS)
				}
			}
		}
	}
}

@Composable
internal fun RoomPanel(
	state: PlaybackUiState,
	actions: RoomPanelActions,
	active: Boolean,
	leaveOpener: FocusRequester,
	modifier: Modifier = Modifier,
) {
	val room = state.room ?: return
	val snapshot = room.snapshot
	val primary = remember { FocusRequester() }
	OverlayFocusEffect(active, primary)
	LazyColumn(
		modifier.handleOverlayBack(actions.onBack).focusGroup().focusProperties { onExit = { cancelFocusChange() } }
			.width(420.dp).fillMaxHeight().background(Color(0xF20D0D0D)).padding(24.dp),
		verticalArrangement = Arrangement.spacedBy(10.dp),
	) {
		item { Text(stringResource(R.string.room_controls), color = Color.White, fontSize = 26.sp) }
		item {
			Text(
				when (room.status) {
					RoomConnectionStatus.CONNECTED -> snapshot?.phase ?: ""
					RoomConnectionStatus.RECONNECTING -> stringResource(R.string.room_reconnecting)
					RoomConnectionStatus.ENDED, RoomConnectionStatus.ERROR ->
						localizedRoomMessage(room.errorCode, room.endedReason, room.message)
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
					PlayerButton(stringResource(R.string.room_start), stringResource(R.string.room_start), canFocus = active, onClick = actions.onPlay)
					PlayerButton(stringResource(R.string.room_end_everyone), stringResource(R.string.room_end_everyone), canFocus = active, onClick = actions.onEnd)
				}
			}
			item {
				Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
					PlayerButton(stringResource(R.string.room_rotate_invite), stringResource(R.string.room_rotate_invite), canFocus = active, onClick = actions.onRotate)
					PlayerButton(stringResource(R.string.room_revoke_invite), stringResource(R.string.room_revoke_invite), canFocus = active, onClick = actions.onRevoke)
				}
			}
		}
		item {
			PlayerButton(
				stringResource(R.string.room_leave),
				stringResource(R.string.room_leave),
				Modifier.focusRequester(primary).focusRequester(leaveOpener),
				active,
				actions.onLeave,
			)
		}
		state.roomInviteUrl?.let { url ->
			item { RoomInvitationQr(url) }
			item { Text(url, color = Color.White, fontSize = 14.sp) }
		}
	}
}

internal data class RoomPanelActions(
	val onPlay: () -> Unit,
	val onEnd: () -> Unit,
	val onRotate: () -> Unit,
	val onRevoke: () -> Unit,
	val onLeave: () -> Unit,
	val onBack: () -> Unit,
)

@Composable
internal fun LeaveConfirmation(
	onConfirm: () -> Unit,
	onCancel: () -> Unit,
	onBack: () -> Unit,
	modifier: Modifier = Modifier,
) {
	val primary = remember { FocusRequester() }
	OverlayFocusEffect(active = true, primary)
	Column(
		modifier.handleOverlayBack(onBack).focusGroup().focusProperties { onExit = { cancelFocusChange() } }
			.width(440.dp).background(Color(0xFA171717)).padding(28.dp),
		verticalArrangement = Arrangement.spacedBy(14.dp),
	) {
		Text(stringResource(R.string.room_leave_confirm), color = Color.White, fontSize = 26.sp)
		Text(stringResource(R.string.room_leave_confirm_detail), color = Color(0xFFCCCCCC), fontSize = 17.sp)
		Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
			PlayerButton(
				stringResource(R.string.room_leave),
				stringResource(R.string.room_leave),
				Modifier.focusRequester(primary),
				onClick = onConfirm,
			)
			PlayerButton(stringResource(R.string.room_stay), stringResource(R.string.room_stay), onClick = onCancel)
		}
	}
}

@Composable
internal fun PlayerButton(
	label: String,
	description: String,
	modifier: Modifier = Modifier,
	canFocus: Boolean = true,
	onClick: () -> Unit,
) {
	val baseModifier = Modifier.semantics { contentDescription = description }.then(modifier)
	val focusModifier = if (canFocus) baseModifier else baseModifier.focusProperties { this.canFocus = false }
	Button(
		onClick = onClick,
		modifier = focusModifier,
	) {
		Text(label, maxLines = 1)
	}
}

@Composable
private fun Menu(
	menu: PlayerMenu,
	state: PlaybackUiState,
	controller: PlaybackController,
	active: Boolean,
	modifier: Modifier = Modifier,
) {
	val descriptor = state.descriptor ?: return
	val primary = remember(menu) { FocusRequester() }
	OverlayFocusEffect(active, primary)
	LazyColumn(
		modifier.handleOverlayBack(controller::handleBack).focusGroup().focusProperties { onExit = { cancelFocusChange() } }
			.width(390.dp).fillMaxHeight().background(Color(0xF20D0D0D)).padding(24.dp),
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
			PlayerMenu.AUDIO -> itemsIndexed(descriptor.tracks.audio, key = { _, track -> track.streamId }) { index, track ->
				val details = listOfNotNull(track.language, track.codec, track.channels?.let { "$it ch" },
					stringResource(R.string.player_audio_description_label).takeIf { track.audioDescription })
					.joinToString(" / ")
				MenuButton(
					selectionLabel(track.title, track.streamId == descriptor.tracks.selectedAudioStreamId) + "\n" + details,
					modifier = if (index == 0) Modifier.focusRequester(primary) else Modifier,
					canFocus = active,
				) {
					controller.selectAudio(track)
				}
			}
			PlayerMenu.SUBTITLES -> {
				item {
					MenuButton(
						stringResource(R.string.player_subtitles_off),
						modifier = Modifier.focusRequester(primary),
						canFocus = active,
					) { controller.selectSubtitle(null) }
				}
				items(descriptor.tracks.subtitles, key = { it.streamId }) { track ->
					val traits = listOfNotNull(
						track.language,
						stringResource(R.string.player_forced).takeIf { track.forced },
						stringResource(R.string.player_sdh).takeIf { track.hearingImpaired },
						stringResource(if (track.external) R.string.player_external else R.string.player_embedded),
						stringResource(R.string.player_burned).takeIf { descriptor.tracks.subtitleDelivery == "burned" },
					).joinToString(" / ")
					MenuButton(selectionLabel(track.title, track.streamId == descriptor.tracks.selectedSubtitleStreamId) + "\n" + traits, canFocus = active) {
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
				itemsIndexed(descriptor.quality.options, key = { _, option -> option.id }) { index, option ->
					MenuButton(
						selectionLabel(option.label, option.id == descriptor.quality.requested),
						modifier = if (index == 0) Modifier.focusRequester(primary) else Modifier,
						canFocus = active,
					) {
						controller.selectQuality(option.id)
					}
				}
			}
			PlayerMenu.DIAGNOSTICS -> {
				item { Box(Modifier.focusRequester(primary).focusProperties { canFocus = active }.focusable()) }
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
private fun MenuButton(label: String, modifier: Modifier = Modifier, canFocus: Boolean = true, onClick: () -> Unit) {
	val focusModifier = if (canFocus) modifier else modifier.focusProperties { this.canFocus = false }
	Button(onClick = onClick, modifier = focusModifier.fillMaxWidth()) { Text(label) }
}

@Composable
private fun DiagnosticLine(label: String, value: String) {
	Column(Modifier.padding(vertical = 6.dp)) {
		Text(label, color = Color(0xFFAAAAAA), fontSize = 14.sp)
		Text(value, color = Color.White, fontSize = 17.sp)
	}
}

@Composable
internal fun NextEpisodeCard(
	seconds: Long,
	onPlay: () -> Unit,
	onCancel: () -> Unit,
	onBack: () -> Unit,
	showActions: Boolean,
	active: Boolean,
	modifier: Modifier = Modifier,
) {
	val primary = remember { FocusRequester() }
	OverlayFocusEffect(active, primary)
	Column(
		modifier.handleOverlayBack(onBack).focusGroup().focusProperties { onExit = { cancelFocusChange() } }
			.padding(24.dp).width(320.dp).background(Color(0xF21A1A1A)).padding(20.dp),
		verticalArrangement = Arrangement.spacedBy(12.dp),
	) {
		Text(pluralStringResource(R.plurals.player_next_in, seconds.toInt(), seconds.toInt()), color = Color.White, fontSize = 20.sp)
		if (showActions) {
			Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
				PlayerButton(
					stringResource(R.string.player_play_next),
					stringResource(R.string.player_play_next_description),
					Modifier.focusRequester(primary),
					active,
					onPlay,
				)
				PlayerButton(stringResource(R.string.player_cancel), stringResource(R.string.player_cancel_description), canFocus = active, onClick = onCancel)
			}
		}
	}
}

@Composable
internal fun OverlayFocusEffect(active: Boolean, primary: FocusRequester) {
	LaunchedEffect(active, primary) {
		if (active) primary.requestFocus()
	}
}

@Composable
internal fun RestoreFocusEffect(overlayVisible: Boolean, opener: FocusRequester) {
	var wasVisible by remember { mutableStateOf(false) }
	LaunchedEffect(overlayVisible, opener) {
		if (!overlayVisible && wasVisible) opener.requestFocus()
		wasVisible = overlayVisible
	}
}

@Composable
private fun TerminalRoomOverlay(
	message: String,
	onExitAction: () -> Unit,
	onBack: () -> Unit,
	modifier: Modifier = Modifier,
) {
	val primary = remember { FocusRequester() }
	OverlayFocusEffect(active = true, primary)
	Column(
		modifier.handleOverlayBack(onBack).focusGroup().focusProperties { onExit = { cancelFocusChange() } }
			.width(500.dp).background(Color(0xFA171717)).padding(28.dp),
		verticalArrangement = Arrangement.spacedBy(16.dp),
	) {
		Text(message, color = Color.White, fontSize = 22.sp)
		PlayerButton(
			stringResource(R.string.player_exit),
			stringResource(R.string.player_exit_description),
			Modifier.focusRequester(primary),
			onClick = onExitAction,
		)
	}
}

private fun Modifier.handleOverlayBack(onBack: () -> Unit): Modifier = onPreviewKeyEvent { event ->
	if (event.nativeKeyEvent.keyCode == KeyEvent.KEYCODE_BACK && event.nativeKeyEvent.action == KeyEvent.ACTION_DOWN) {
		onBack()
		true
	} else {
		false
	}
}

private fun formatTime(milliseconds: Long): String {
	val totalSeconds = milliseconds.coerceAtLeast(0) / 1_000
	val hours = totalSeconds / 3_600
	val minutes = (totalSeconds % 3_600) / 60
	val seconds = totalSeconds % 60
	return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds) else "%d:%02d".format(minutes, seconds)
}
