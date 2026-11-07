@file:OptIn(
	androidx.compose.foundation.ExperimentalFoundationApi::class,
	androidx.compose.ui.ExperimentalComposeUiApi::class,
)

package io.github.jovalle.watchtower.tv.playback

import android.os.SystemClock
import android.view.KeyEvent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.ui.SubtitleView
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.compose.ContentFrame
import androidx.media3.ui.compose.SURFACE_TYPE_SURFACE_VIEW
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.LocalContentColor
import androidx.tv.material3.Text
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.api.AudioTrack
import io.github.jovalle.watchtower.tv.api.QualityOption
import io.github.jovalle.watchtower.tv.api.SubtitleTrack
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import io.github.jovalle.watchtower.tv.settings.VideoDisplayMode
import io.github.jovalle.watchtower.tv.ui.pointerClick
import io.github.jovalle.watchtower.tv.ui.TvAction
import io.github.jovalle.watchtower.tv.ui.TvSymbol
import io.github.jovalle.watchtower.tv.ui.TvToggleIndicator
import java.text.NumberFormat
import java.util.Locale

@Composable
@androidx.annotation.OptIn(UnstableApi::class)
fun PlayerScreen(graph: AppGraph, route: PlayerRoute, onExit: () -> Unit, onOpenItem: (PlayerRoute) -> Unit) {
	val context = LocalContext.current
	val lifecycle = LocalLifecycleOwner.current.lifecycle
	val view = LocalView.current
	val controller = remember(graph, route) { PlaybackController(context, graph, route, onExit, onOpenItem) }
	val state by controller.state.collectAsStateWithLifecycle()
	val playOpener = remember { FocusRequester() }
	val retryOpener = remember { FocusRequester() }
	val playerFocus = remember { FocusRequester() }
	val menuOpeners = remember {
		val settings = FocusRequester()
		PlayerMenu.entries.associateWith { if (it == PlayerMenu.SUBTITLES) FocusRequester() else settings }
	}
	val countdownOverlay = state.nextDeadlineMs != null
	val overlayVisible = state.menu != null || countdownOverlay
	LaunchedEffect(state.controlsVisible, state.error) {
		if (!overlayVisible) {
			if (state.error != null) retryOpener.requestFocus()
			else if (state.controlsVisible) playOpener.requestFocus()
			else playerFocus.requestFocus()
		}
	}
	RestoreFocusEffect(countdownOverlay, playOpener)
	PlayerMenu.entries.forEach { menu ->
		RestoreFocusEffect(state.menu == menu, requireNotNull(menuOpeners[if (menu == PlayerMenu.DIAGNOSTICS) PlayerMenu.MORE else menu]))
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
			.onPreviewKeyEvent { event -> handlePlayerKey(event.nativeKeyEvent, state, controller) }
			.pointerClick(enabled = !overlayVisible, onClick = controller::showControls, requestFocusOnHover = false)
			.focusRequester(playerFocus)
			.focusable(),
	) {
		ContentFrame(
			player = controller.surfacePlayer,
			modifier = Modifier.fillMaxSize().clipToBounds(),
			surfaceType = SURFACE_TYPE_SURFACE_VIEW,
			contentScale = when (state.videoDisplayMode) {
				VideoDisplayMode.LETTERBOX -> ContentScale.Fit
				VideoDisplayMode.STRETCH -> ContentScale.FillBounds
				VideoDisplayMode.ZOOM -> ContentScale.Crop
			},
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
			Controls(
				state,
				controller,
				canFocus = !overlayVisible,
				playOpener = playOpener,
				retryOpener = retryOpener,
				menuOpeners = menuOpeners,
				modifier = Modifier.align(Alignment.BottomCenter),
			)
		}
		if (state.showStatistics) StatisticsOverlay(state, controller.surfacePlayer, Modifier.align(Alignment.TopStart).padding(start = 12.dp, end = 12.dp, top = 84.dp))
		state.menu?.let {
			PlayerMenuContent(
				it,
				state,
				active = true,
				onBack = controller::handleBack,
				onMenu = controller::toggleMenu,
				onIntent = { intent -> controller.submit(intent) },
				onAudio = controller::selectAudio,
				onSubtitle = controller::selectSubtitle,
				onQuality = controller::selectQuality,
				onSkipIntro = controller::skipIntro,
				onSpeed = controller::selectSpeed,
				onSleep = controller::selectSleepTimer,
				onDisplay = controller::selectDisplayMode,
				onStatistics = controller::setStatistics,
				modifier = Modifier.align(Alignment.CenterEnd),
			)
		}
		state.nextDeadlineMs?.let { deadline ->
			NextEpisodeCard(
				seconds = ((deadline - SystemClock.elapsedRealtime()).coerceAtLeast(0) + 999) / 1_000,
				onPlay = { controller.submit(PlaybackIntent.Next) },
				onCancel = controller::cancelNextCountdown,
				onBack = controller::handleBack,
				active = countdownOverlay && state.menu == null,
				modifier = Modifier.align(Alignment.BottomEnd),
			)
		}
		val announcement = when {
			state.error != null -> state.error
			state.buffering -> stringResource(R.string.player_buffering)
			!state.playWhenReady && !state.loading -> stringResource(R.string.player_paused)
			else -> null
		}
		if (state.loading || state.buffering) {
			val tint = MaterialTheme.colorScheme.primary.toArgb()
			AndroidView(factory = { android.widget.ProgressBar(it).apply {
				indeterminateTintList = android.content.res.ColorStateList.valueOf(tint)
			} }, modifier = Modifier.align(Alignment.Center).size(40.dp))
		}
		announcement?.let {
			if (state.error != null) Text(
				text = it, modifier = Modifier.align(Alignment.TopCenter).padding(24.dp).semantics {
					liveRegion = LiveRegionMode.Assertive
				}, color = Color.White, fontSize = 20.sp,
			) else Box(Modifier.size(1.dp).semantics {
				contentDescription = it
				liveRegion = LiveRegionMode.Polite
			})
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
private fun playerDuration(durationMs: Long): String {
	val hours = (durationMs / 3_600_000).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
	val minutes = ((durationMs / 60_000) % 60).toInt()
	return listOfNotNull(
		if (hours > 0) pluralStringResource(R.plurals.player_duration_hours, hours, hours) else null,
		if (minutes > 0 || hours == 0) pluralStringResource(R.plurals.player_duration_minutes, minutes, minutes) else null,
	).joinToString(" ")
}

@Composable
private fun Controls(
	state: PlaybackUiState,
	controller: PlaybackController,
	canFocus: Boolean,
	playOpener: FocusRequester,
	retryOpener: FocusRequester,
	menuOpeners: Map<PlayerMenu, FocusRequester>,
	modifier: Modifier = Modifier,
) {
	Box(modifier.fillMaxSize()) {
		Row(
			Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.65f), Color.Transparent)))
				.padding(horizontal = 36.dp, vertical = 24.dp),
			horizontalArrangement = Arrangement.spacedBy(24.dp),
		) {
			Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
				Text(state.title, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
				val metadata = listOfNotNull(state.descriptor?.item?.year?.toString(), state.subtitle,
					state.durationMs.takeIf { it > 0 }?.let { playerDuration(it) }).joinToString(" • ")
				val source = state.descriptor?.source
				val resolution = source?.let {
					when {
						(it.width ?: 0) >= 3840 || (it.height ?: 0) >= 2160 -> "4K"
						(it.width ?: 0) >= 1920 || (it.height ?: 0) >= 1080 -> "1080p"
						(it.width ?: 0) >= 1280 || (it.height ?: 0) >= 720 -> "720p"
						else -> it.height?.takeIf { height -> height > 0 }?.let { height -> "${height}p" }
					}
				}
				Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
					if (metadata.isNotBlank()) Text(metadata, color = Color.LightGray, fontSize = 12.sp, lineHeight = 16.sp)
					resolution?.let { Text(it, color = Color.LightGray, fontSize = 12.sp, lineHeight = 16.sp) }
				}
			}
			AndroidView(factory = { android.widget.TextClock(it).apply {
				setTextColor(android.graphics.Color.LTGRAY)
				textSize = 12f
				typeface = resources.getFont(R.font.inter)
			} })
		}
		Column(
			Modifier.align(Alignment.BottomCenter).fillMaxWidth()
				.background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.95f))))
				.padding(start = 36.dp, end = 36.dp, top = 24.dp, bottom = 28.dp),
			verticalArrangement = Arrangement.spacedBy(4.dp),
		) {
			Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
				PlayerButton(stringResource(R.string.player_subtitles), stringResource(R.string.player_subtitles_description),
						Modifier.focusRequester(requireNotNull(menuOpeners[PlayerMenu.SUBTITLES])), canFocus && state.descriptor != null) {
					controller.toggleMenu(PlayerMenu.SUBTITLES)
				}
				PlayerButton(stringResource(R.string.settings), stringResource(R.string.tv_more_actions),
						Modifier.focusRequester(requireNotNull(menuOpeners[PlayerMenu.MORE])), canFocus && state.descriptor != null) {
					controller.toggleMenu(PlayerMenu.MORE)
				}
			}
			if (state.error != null) {
				Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
						PlayerButton(stringResource(R.string.player_retry), stringResource(R.string.player_retry_description), Modifier.focusRequester(retryOpener), canFocus = canFocus, onClick = controller::retry)
					PlayerButton(stringResource(R.string.player_exit), stringResource(R.string.player_exit_description), canFocus = canFocus) {
						controller.submit(PlaybackIntent.Stop)
					}
				}
			} else {
				val position = state.scrubPositionMs ?: state.positionMs
				Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
					PlayerButton(
						if (state.playWhenReady) stringResource(R.string.player_pause) else stringResource(R.string.player_play),
						if (state.playWhenReady) stringResource(R.string.player_pause_description) else stringResource(R.string.player_play_description),
						Modifier.focusRequester(playOpener), canFocus,
					) { controller.submit(PlaybackIntent.Toggle) }
					Text(formatTime(position), color = Color.White, fontSize = 13.sp)
					PlayerTimeline(position, state.durationMs, canFocus, controller::beginScrub, controller::commitScrub, Modifier.weight(1f))
					Text("-${formatTime((state.durationMs - position).coerceAtLeast(0))}", color = Color.White, fontSize = 13.sp)
				}
			}
		}
	}
}

@Composable
internal fun PlayerTimeline(positionMs: Long, durationMs: Long, canFocus: Boolean, onScrub: (Int) -> Unit, onCommit: () -> Unit, modifier: Modifier = Modifier) {
	var focused by remember { mutableStateOf(false) }
	val progress = (positionMs.toFloat() / durationMs.coerceAtLeast(1)).coerceIn(0f, 1f)
	val label = stringResource(R.string.player_seek)
	BoxWithConstraints(
		modifier.height(24.dp).onFocusChanged { focused = it.isFocused }
			.semantics { contentDescription = label; progressBarRangeInfo = ProgressBarRangeInfo(progress, 0f..1f) }
			.onPreviewKeyEvent { event ->
				val key = event.nativeKeyEvent
				if (canFocus && (key.keyCode == KeyEvent.KEYCODE_DPAD_LEFT || key.keyCode == KeyEvent.KEYCODE_DPAD_RIGHT)) {
					if (key.action == KeyEvent.ACTION_DOWN) onScrub(if (key.keyCode == KeyEvent.KEYCODE_DPAD_LEFT) -1 else 1)
					else if (key.action == KeyEvent.ACTION_UP) onCommit()
					true
				} else false
			}.focusable(enabled = canFocus),
		contentAlignment = Alignment.CenterStart,
	) {
		Box(Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.3f))) {
			Box(Modifier.fillMaxWidth(progress).height(3.dp).background(MaterialTheme.colorScheme.primary))
		}
		if (focused) Box(Modifier.offset(x = (maxWidth - 10.dp) * progress).size(10.dp).background(Color.White, RoundedCornerShape(50)))
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
	val symbol = when (label) {
		stringResource(R.string.player_pause) -> TvSymbol.Pause
		stringResource(R.string.player_start_over) -> TvSymbol.Restart
		stringResource(R.string.player_previous) -> TvSymbol.Previous
		stringResource(R.string.player_next), stringResource(R.string.player_play_next), stringResource(R.string.player_skip_intro) -> TvSymbol.Next
		stringResource(R.string.player_rewind) -> TvSymbol.Rewind
		stringResource(R.string.player_forward) -> TvSymbol.Forward
		stringResource(R.string.player_audio) -> TvSymbol.Audio
		stringResource(R.string.player_subtitles) -> TvSymbol.Subtitles
		stringResource(R.string.player_quality), stringResource(R.string.settings) -> TvSymbol.Settings
		stringResource(R.string.tv_more) -> TvSymbol.More
		stringResource(R.string.player_diagnostics) -> TvSymbol.Info
		stringResource(R.string.player_retry) -> TvSymbol.Refresh
		stringResource(R.string.player_exit), stringResource(R.string.player_cancel) -> TvSymbol.Close
		else -> TvSymbol.Play
	}
	TvAction(
		label, symbol, onClick,
		modifier = if (canFocus) modifier else modifier.focusProperties { this.canFocus = false },
		enabled = canFocus,
		primary = symbol == TvSymbol.Play || symbol == TvSymbol.Pause || label == stringResource(R.string.player_play_next),
		description = description,
		iconOnly = true,
	)
}

@Composable
internal fun PlayerMenuContent(
	menu: PlayerMenu,
	state: PlaybackUiState,
	active: Boolean,
	onBack: () -> Unit,
	onMenu: (PlayerMenu) -> Unit,
	onIntent: (PlaybackIntent) -> Unit,
	onAudio: (AudioTrack) -> Unit,
	onSubtitle: (SubtitleTrack?) -> Unit,
	onQuality: (String) -> Unit,
	onSkipIntro: () -> Unit,
	onSpeed: (Float) -> Unit = {},
	onSleep: (SleepTimerOption) -> Unit = {},
	onDisplay: (VideoDisplayMode) -> Unit = {},
	onStatistics: (Boolean) -> Unit = {},
	modifier: Modifier = Modifier,
) {
	val descriptor = state.descriptor ?: return
	BackHandler(enabled = active, onBack = onBack)
	val returnFocus = when (menu) {
		PlayerMenu.OPTIONS -> state.menuReturnFocus?.takeIf { it in listOf(PlayerMenu.SPEED, PlayerMenu.SLEEP, PlayerMenu.DISPLAY, PlayerMenu.DIAGNOSTICS) } ?: PlayerMenu.SPEED
		else -> state.menuReturnFocus?.takeIf { it in listOf(PlayerMenu.QUALITY, PlayerMenu.SUBTITLES, PlayerMenu.AUDIO, PlayerMenu.OPTIONS) }
			?.takeUnless { it == PlayerMenu.AUDIO && descriptor.tracks.audio.isEmpty() } ?: PlayerMenu.QUALITY
	}
	val primary = remember(menu, returnFocus) { FocusRequester() }
	val rowGap = when (menu) {
		PlayerMenu.AUDIO, PlayerMenu.SUBTITLES, PlayerMenu.QUALITY -> 8.dp
		PlayerMenu.DIAGNOSTICS -> 4.dp
		else -> 0.dp
	}
	val listStates = remember { PlayerMenu.entries.associateWith { LazyListState() } }
	val windowFocused = LocalWindowInfo.current.isWindowFocused
	LaunchedEffect(active, primary, windowFocused) {
		if (active && windowFocused) {
			// Forward entry starts at the first row; Back keeps the parent's origin visible.
			if (state.menuReturnFocus == null) requireNotNull(listStates[menu]).scrollToItem(0)
			withFrameNanos { }
			primary.requestFocus()
		}
	}
	val scrollSpec = remember {
		object : BringIntoViewSpec {
			override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float = when {
				offset < 0f -> offset
				offset + size > containerSize -> offset + size - containerSize
				else -> 0f
			}
		}
	}
	CompositionLocalProvider(LocalBringIntoViewSpec provides scrollSpec) {
	LazyColumn(
		state = requireNotNull(listStates[menu]),
		modifier = modifier.padding(16.dp).focusGroup().focusProperties { onExit = { cancelFocusChange() } }
			.width(320.dp).fillMaxHeight().clip(RoundedCornerShape(4.dp)).background(Color.Black)
			.border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(4.dp)),
		contentPadding = PaddingValues(32.dp),
		verticalArrangement = Arrangement.spacedBy(rowGap),
	) {
		item {
			Row(Modifier.fillMaxWidth().padding(bottom = 32.dp - rowGap), verticalAlignment = Alignment.CenterVertically,
				horizontalArrangement = Arrangement.spacedBy(12.dp)) {
				Text(
					when (menu) {
						PlayerMenu.AUDIO -> stringResource(R.string.player_audio)
						PlayerMenu.SUBTITLES -> stringResource(R.string.player_subtitles)
						PlayerMenu.QUALITY -> stringResource(R.string.player_quality)
						PlayerMenu.DIAGNOSTICS -> stringResource(R.string.player_diagnostics)
						PlayerMenu.MORE -> stringResource(R.string.settings)
						PlayerMenu.OPTIONS -> stringResource(R.string.player_playback_options)
						PlayerMenu.SPEED -> stringResource(R.string.player_playback_speed)
						PlayerMenu.SLEEP -> stringResource(R.string.player_sleep_timer)
						PlayerMenu.DISPLAY -> stringResource(R.string.player_display_mode)
					},
					color = Color.White,
					fontSize = 16.sp,
					fontWeight = FontWeight.SemiBold,
					modifier = Modifier.weight(1f),
				)
				TvAction(stringResource(R.string.panel_back), TvSymbol.Back, onBack, enabled = active, iconOnly = true)
			}
		}
		when (menu) {
			PlayerMenu.AUDIO -> {
				if (descriptor.tracks.audio.isEmpty()) item {
					MenuButton(stringResource(R.string.player_no_audio_tracks), Modifier.focusRequester(primary), active, onClick = onBack)
				}
				itemsIndexed(descriptor.tracks.audio, key = { _, track -> track.streamId }) { index, track ->
					val description = track.description?.takeIf { it.isNotBlank() } ?: listOfNotNull(
						track.codec?.uppercase(Locale.ROOT), track.channels?.takeIf { it > 0 }?.let { "$it ch" },
					).joinToString(" ")
					val details = listOfNotNull(description.takeIf { it.isNotBlank() },
						stringResource(R.string.player_audio_description_label).takeIf { track.audioDescription })
						.joinToString(" · ")
					MenuButton(
						track.title + details.takeIf { it.isNotBlank() }?.let { "\n$it" }.orEmpty(),
						modifier = if (index == 0) Modifier.focusRequester(primary) else Modifier,
						canFocus = active,
						selected = track.streamId == descriptor.tracks.selectedAudioStreamId,
					) {
						onAudio(track)
					}
				}
			}
			PlayerMenu.SUBTITLES -> {
				item {
					MenuButton(
						stringResource(R.string.player_subtitles_none),
						modifier = Modifier.focusRequester(primary),
						canFocus = active,
						selected = descriptor.tracks.selectedSubtitleStreamId == null,
					) { onSubtitle(null) }
				}
				items(descriptor.tracks.subtitles, key = { it.streamId }) { track ->
					val traits = listOfNotNull(
						track.language,
						stringResource(R.string.player_forced).takeIf { track.forced },
						stringResource(R.string.player_sdh).takeIf { track.hearingImpaired },
						stringResource(R.string.player_external).takeIf { track.external },
						stringResource(R.string.player_burned).takeIf { descriptor.tracks.subtitleDelivery == "burned" },
					).joinToString(" / ")
					MenuButton(track.title + "\n" + traits, canFocus = active, selected = track.streamId == descriptor.tracks.selectedSubtitleStreamId) {
						onSubtitle(track)
					}
				}
				if (descriptor.tracks.subtitleDelivery == "burned") {
					item { Text(stringResource(R.string.player_burned_style_notice), color = Color(0xFFFFCC80)) }
				}
			}
			PlayerMenu.QUALITY -> {
				if (descriptor.quality.options.isEmpty()) item {
					MenuButton(stringResource(R.string.player_no_quality_options), Modifier.focusRequester(primary), active, onClick = onBack)
				}
				itemsIndexed(descriptor.quality.options, key = { _, option -> option.id }) { index, option ->
					val details = qualityDetails(option, descriptor.source.bitrateKbps)
					MenuButton(
						if (details == null) option.label else option.label.substringBefore(" · ") + "\n" + details,
						modifier = if (index == 0) Modifier.focusRequester(primary) else Modifier,
						canFocus = active,
						selected = option.id == descriptor.quality.requested,
					) {
						onQuality(option.id)
					}
				}
				item { Text(stringResource(R.string.player_quality_status, descriptor.quality.requested, descriptor.delivery.method), color = Color.LightGray, fontSize = 12.sp) }
			}
			PlayerMenu.MORE -> {
				item {
					MenuButton(stringResource(R.string.player_quality), if (returnFocus == PlayerMenu.QUALITY) Modifier.focusRequester(primary) else Modifier, active,
						value = descriptor.quality.options.firstOrNull { it.id == descriptor.quality.requested }?.label ?: descriptor.quality.requested) {
						onMenu(PlayerMenu.QUALITY)
					}
				}
				item { MenuButton(stringResource(R.string.player_subtitles), if (returnFocus == PlayerMenu.SUBTITLES) Modifier.focusRequester(primary) else Modifier, canFocus = active,
					value = descriptor.tracks.subtitles.firstOrNull { it.streamId == descriptor.tracks.selectedSubtitleStreamId }?.title ?: stringResource(R.string.player_subtitles_none)) {
					onMenu(PlayerMenu.SUBTITLES)
				} }
				if (descriptor.tracks.audio.isNotEmpty()) item { MenuButton(stringResource(R.string.player_audio), if (returnFocus == PlayerMenu.AUDIO) Modifier.focusRequester(primary) else Modifier, canFocus = active,
					value = descriptor.tracks.audio.firstOrNull { it.streamId == descriptor.tracks.selectedAudioStreamId }?.title) {
					onMenu(PlayerMenu.AUDIO)
				} }
				item { MenuButton(stringResource(R.string.player_playback_options), if (returnFocus == PlayerMenu.OPTIONS) Modifier.focusRequester(primary) else Modifier, active) { onMenu(PlayerMenu.OPTIONS) } }
			}
			PlayerMenu.OPTIONS -> {
				item { MenuButton(stringResource(R.string.player_boost_dialog) + "\n" + stringResource(R.string.player_boost_dialog_unavailable), canFocus = false, checked = false) {} }
				item { MenuButton(stringResource(R.string.player_normalize_loudness) + "\n" + stringResource(R.string.player_normalize_loudness_unavailable), canFocus = false, checked = false) {} }
				item { MenuButton(stringResource(R.string.player_playback_speed), if (returnFocus == PlayerMenu.SPEED) Modifier.focusRequester(primary) else Modifier, active,
					value = speedLabel(state.playbackSpeed)) { onMenu(PlayerMenu.SPEED) } }
				item { MenuButton(stringResource(R.string.player_sleep_timer), if (returnFocus == PlayerMenu.SLEEP) Modifier.focusRequester(primary) else Modifier, active,
					value = sleepLabel(state.sleepTimer.option)) { onMenu(PlayerMenu.SLEEP) } }
				item { MenuButton(stringResource(R.string.player_display_mode), if (returnFocus == PlayerMenu.DISPLAY) Modifier.focusRequester(primary) else Modifier, active,
					value = displayLabel(state.videoDisplayMode)) { onMenu(PlayerMenu.DISPLAY) } }
				item { MenuButton(stringResource(R.string.player_nerd_statistics), canFocus = active, checked = state.showStatistics) { onStatistics(!state.showStatistics) } }

				item { MenuButton(stringResource(R.string.player_start_over), canFocus = active) {
					onMenu(PlayerMenu.OPTIONS)
					onIntent(PlaybackIntent.StartOver)
				} }
				if (descriptor.previousItem != null) item { MenuButton(stringResource(R.string.player_previous), canFocus = active) {
					onMenu(PlayerMenu.OPTIONS)
					onIntent(PlaybackIntent.Previous)
				} }
				item { MenuButton(stringResource(R.string.player_rewind), canFocus = active) {
					onMenu(PlayerMenu.OPTIONS)
					onIntent(PlaybackIntent.SeekBy(-10_000))
				} }
				item { MenuButton(stringResource(R.string.player_forward), canFocus = active) {
					onMenu(PlayerMenu.OPTIONS)
					onIntent(PlaybackIntent.SeekBy(10_000))
				} }
				if (state.skipIntroTargetMs != null) item { MenuButton(stringResource(R.string.player_skip_intro), canFocus = active) {
					onMenu(PlayerMenu.OPTIONS)
					onSkipIntro()
				} }
				if (descriptor.nextItem != null) item { MenuButton(stringResource(R.string.player_next), canFocus = active) {
					onMenu(PlayerMenu.OPTIONS)
					onIntent(PlaybackIntent.Next)
				} }
				item { MenuButton(stringResource(R.string.player_diagnostics), if (returnFocus == PlayerMenu.DIAGNOSTICS) Modifier.focusRequester(primary) else Modifier, canFocus = active) { onMenu(PlayerMenu.DIAGNOSTICS) } }
				item { MenuButton(stringResource(R.string.tv_exit_playback), canFocus = active) { onIntent(PlaybackIntent.Stop) } }
			}
			PlayerMenu.SPEED -> itemsIndexed(PLAYBACK_SPEEDS) { index, speed ->
				MenuButton(speedLabel(speed), if (index == 0) Modifier.focusRequester(primary) else Modifier, active, selected = state.playbackSpeed == speed) { onSpeed(speed) }
			}
			PlayerMenu.SLEEP -> itemsIndexed(SleepTimerOption.entries) { index, option ->
				MenuButton(sleepLabel(option), if (index == 0) Modifier.focusRequester(primary) else Modifier, active, selected = state.sleepTimer.option == option) { onSleep(option) }
			}
			PlayerMenu.DISPLAY -> itemsIndexed(VideoDisplayMode.entries) { index, mode ->
				MenuButton(displayLabel(mode), if (index == 0) Modifier.focusRequester(primary) else Modifier, active, selected = state.videoDisplayMode == mode) { onDisplay(mode) }
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
}

@Composable
private fun speedLabel(speed: Float): String = if (speed == 1f) stringResource(R.string.player_speed_normal) else "${speed}x"

@Composable
private fun qualityDetails(option: QualityOption, sourceBitrateKbps: Int?): String? {
	val bitrate = option.maxBitrateKbps?.takeIf { it > 0 }
		?: sourceBitrateKbps?.takeIf { option.id == "original" && it > 0 } ?: return null
	val numbers = remember { NumberFormat.getNumberInstance().apply { maximumFractionDigits = 1 } }
	val megabytesPerHour = bitrate * 3_600.0 / 8_000
	return stringResource(if (megabytesPerHour >= 1_000) R.string.player_quality_details_gb else R.string.player_quality_details_mb,
		numbers.format(bitrate / 1_000.0), numbers.format(if (megabytesPerHour >= 1_000) megabytesPerHour / 1_000 else megabytesPerHour))
}

@Composable
private fun sleepLabel(option: SleepTimerOption): String = stringResource(when (option) {
	SleepTimerOption.OFF -> R.string.player_subtitles_off
	SleepTimerOption.FIFTEEN_MINUTES -> R.string.player_sleep_15_minutes
	SleepTimerOption.THIRTY_MINUTES -> R.string.player_sleep_30_minutes
	SleepTimerOption.ONE_HOUR -> R.string.player_sleep_1_hour
	SleepTimerOption.TWO_HOURS -> R.string.player_sleep_2_hours
	SleepTimerOption.AFTER_THIS_ITEM -> R.string.player_sleep_after_item
})

@Composable
private fun displayLabel(mode: VideoDisplayMode): String = stringResource(when (mode) {
	VideoDisplayMode.LETTERBOX -> R.string.player_display_letterbox
	VideoDisplayMode.STRETCH -> R.string.player_display_stretch
	VideoDisplayMode.ZOOM -> R.string.player_display_zoom
})

@Composable
internal fun MenuButton(label: String, modifier: Modifier = Modifier, canFocus: Boolean = true, selected: Boolean? = null, value: String? = null, checked: Boolean? = null, onClick: () -> Unit) {
	var focused by remember { mutableStateOf(false) }
	val focusModifier = if (canFocus) modifier else modifier.focusProperties { this.canFocus = false }
	Button(
		onClick = onClick,
		enabled = canFocus,
		modifier = focusModifier.fillMaxWidth().heightIn(min = if ('\n' in label) 44.dp else 32.dp)
			.onFocusChanged { focused = it.isFocused }.pointerClick(canFocus, onClick)
			.semantics {
				selected?.let { this.selected = it }
				checked?.let { toggleableState = ToggleableState(it) }
			},
		contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
		shape = ButtonDefaults.shape(RoundedCornerShape(4.dp)),
		scale = ButtonDefaults.scale(focusedScale = 1f, pressedScale = 1f),
		colors = ButtonDefaults.colors(containerColor = Color.Transparent, contentColor = Color.White,
			focusedContainerColor = Color.White, focusedContentColor = Color.Black,
			disabledContainerColor = Color.Transparent, disabledContentColor = Color.White.copy(alpha = 0.4f)),
	) {
		Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
			Column(Modifier.weight(1f)) {
				Text(label.substringBefore('\n'), fontSize = 13.sp, lineHeight = if ('\n' in label) 15.sp else 16.sp, maxLines = if (focused) Int.MAX_VALUE else 1, overflow = TextOverflow.Ellipsis)
				if ('\n' in label) Text(label.substringAfter('\n'), fontSize = 10.sp, lineHeight = 12.sp, maxLines = if (focused) Int.MAX_VALUE else 1, overflow = TextOverflow.Ellipsis, color = LocalContentColor.current.copy(alpha = 0.7f))
			}
			if (value != null) Text(value, modifier = Modifier.widthIn(max = 128.dp), fontSize = 11.sp, textAlign = TextAlign.End, maxLines = if (focused) Int.MAX_VALUE else 1, overflow = TextOverflow.Ellipsis, color = LocalContentColor.current.copy(alpha = 0.7f))
			if (checked != null) TvToggleIndicator(checked = checked, enabled = canFocus)
			if (selected != null) Box(Modifier.size(16.dp).border(1.dp, Color.Gray, CircleShape), contentAlignment = Alignment.Center) {
				if (selected) Box(Modifier.size(8.dp).background(MaterialTheme.colorScheme.primary, CircleShape))
			}
		}
	}
}

@Composable
private fun DiagnosticLine(label: String, value: String) {
	Column(Modifier.padding(vertical = 6.dp)) {
		Text(label, color = Color(0xFFAAAAAA), fontSize = 12.sp)
		Text(value, color = Color.White, fontSize = 14.sp)
	}
}

@Composable
internal fun NextEpisodeCard(
	seconds: Long,
	onPlay: () -> Unit,
	onCancel: () -> Unit,
	onBack: () -> Unit,
	active: Boolean,
	modifier: Modifier = Modifier,
) {
	BackHandler(enabled = active, onBack = onBack)
	val primary = remember { FocusRequester() }
	OverlayFocusEffect(active, primary)
	Column(
		modifier.onPreviewKeyEvent { event ->
			val key = event.nativeKeyEvent
			if (active && key.keyCode == KeyEvent.KEYCODE_BACK) {
				if (key.action == KeyEvent.ACTION_UP && !key.isCanceled) onBack()
				true
			} else false
		}.focusGroup().focusProperties { onExit = { cancelFocusChange() } }
			.padding(16.dp).width(320.dp).clip(RoundedCornerShape(4.dp)).background(Color.Black)
			.border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(4.dp)).padding(24.dp),
		verticalArrangement = Arrangement.spacedBy(12.dp),
	) {
		Text(pluralStringResource(R.plurals.player_next_in, seconds.toInt(), seconds.toInt()), color = Color.White, fontSize = 16.sp)
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

@Composable
internal fun OverlayFocusEffect(active: Boolean, primary: FocusRequester) {
	val windowFocused = LocalWindowInfo.current.isWindowFocused
	LaunchedEffect(active, primary, windowFocused) {
		if (active && windowFocused) {
			// A menu can compose before its window and lazy items are ready for focus.
			withFrameNanos { }
			primary.requestFocus()
		}
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

private fun formatTime(milliseconds: Long): String {
	val totalSeconds = milliseconds.coerceAtLeast(0) / 1_000
	val hours = totalSeconds / 3_600
	val minutes = (totalSeconds % 3_600) / 60
	val seconds = totalSeconds % 60
	return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds) else "%d:%02d".format(minutes, seconds)
}
