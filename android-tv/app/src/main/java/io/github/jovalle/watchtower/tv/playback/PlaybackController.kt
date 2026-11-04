package io.github.jovalle.watchtower.tv.playback

import android.app.Activity
import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.hardware.display.DisplayManager
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.Timeline
import androidx.media3.common.VideoSize
import androidx.media3.common.text.Cue
import androidx.media3.common.text.CueGroup
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.session.MediaSession
import io.github.jovalle.watchtower.tv.AppGraph
import io.github.jovalle.watchtower.tv.R
import io.github.jovalle.watchtower.tv.api.AudioTrack
import io.github.jovalle.watchtower.tv.api.DeviceCapabilities
import io.github.jovalle.watchtower.tv.api.PlaybackDescriptor
import io.github.jovalle.watchtower.tv.api.SessionSnapshot
import io.github.jovalle.watchtower.tv.api.StopPlaybackRequest
import io.github.jovalle.watchtower.tv.api.SubtitleTrack
import io.github.jovalle.watchtower.tv.api.TimelineRequest
import io.github.jovalle.watchtower.tv.navigation.PlayerRoute
import io.github.jovalle.watchtower.tv.settings.ProfilePlaybackPrefs
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class PlayerMenu { AUDIO, SUBTITLES, QUALITY, DIAGNOSTICS }

data class PlaybackUiState(
    val loading: Boolean = true,
    val title: String = "",
    val subtitle: String? = null,
    val durationMs: Long = 0,
    val positionMs: Long = 0,
    val playWhenReady: Boolean = false,
    val isPlaying: Boolean = false,
    val buffering: Boolean = false,
    val controlsVisible: Boolean = true,
    val menu: PlayerMenu? = null,
    val scrubPositionMs: Long? = null,
    val error: String? = null,
    val cues: List<Cue> = emptyList(),
    val descriptor: PlaybackDescriptor? = null,
    val diagnostics: List<String> = emptyList(),
    val nextDeadlineMs: Long? = null,
    val skipIntroTargetMs: Long? = null,
)

@androidx.annotation.OptIn(UnstableApi::class)
class PlaybackController(
    private val context: Context,
    private val graph: AppGraph,
    private val route: PlayerRoute,
    private val onExit: () -> Unit,
    private val onOpenItem: (PlayerRoute) -> Unit,
) : Player.Listener {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val player = ExoPlayer.Builder(context).build().apply {
        setAudioAttributes(DeviceCapabilityDetector.MEDIA_AUDIO_ATTRIBUTES, true)
        setHandleAudioBecomingNoisy(true)
    }
    private val gate = PlaybackIntentGate(SoloAuthority, ::executeIntent)
    private val sessionPlayer = GatedPlayer(player, gate) { index, position ->
        mapper?.toAbsolute(index, position) ?: position
    }
    val mediaSession: MediaSession = MediaSession.Builder(context, sessionPlayer)
        .setId("watchtower-player-${java.util.UUID.randomUUID()}")
        .build()
    val surfacePlayer: Player get() = player

    private val _state = MutableStateFlow(PlaybackUiState())
    val state: StateFlow<PlaybackUiState> = _state.asStateFlow()
    private val capabilityDetector = DeviceCapabilityDetector(context.applicationContext)
    private val scrubController = ScrubController()
    private val bingePolicy = BingePolicy()
    private val recoveryPolicy = RecoveryPolicy()
    private val resourcesReleased = AtomicBoolean()
    private val exited = AtomicBoolean()
    private val audioManager = context.getSystemService(AudioManager::class.java)
    private val displayMode = DisplayModeController(context)
    private var snapshot: SessionSnapshot? = null
    private var prefs = ProfilePlaybackPrefs()
    private var detail: io.github.jovalle.watchtower.tv.api.MediaDetail? = null
    private var descriptor: PlaybackDescriptor? = null
    private var mapper: TimelineMapper? = null
    private var reporter: ProgressReporter? = null
    private var trackIntent: TrackIntent? = null
    private var lastCapabilities: DeviceCapabilities? = null
    private var quality = "original"
    private var controlsGeneration = 0L
    private var lifecycleStopped = false
    private var nextCountdownCancelled = false
    private var decoderName: String? = null
    private var droppedFrames = 0
    private var ticker: Job? = null
    private var replacementJob: Job? = null

    private val analyticsListener = object : AnalyticsListener {
        override fun onVideoDecoderInitialized(
            eventTime: AnalyticsListener.EventTime,
            decoderName: String,
            initializedTimestampMs: Long,
            initializationDurationMs: Long,
        ) {
            this@PlaybackController.decoderName = decoderName
            refreshDiagnostics()
        }

        override fun onDroppedVideoFrames(eventTime: AnalyticsListener.EventTime, droppedFrames: Int, elapsedMs: Long) {
            this@PlaybackController.droppedFrames += droppedFrames
            refreshDiagnostics()
        }
    }

    private val audioDeviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) = routeChanged()
        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) = routeChanged()
    }

    init {
        player.addListener(this)
        player.addAnalyticsListener(analyticsListener)
        audioManager.registerAudioDeviceCallback(audioDeviceCallback, Handler(Looper.getMainLooper()))
        scope.launch {
            graph.session.identityChanges.collect { change ->
                if (snapshot != null && change.current != snapshot) exit()
            }
        }
        scope.launch { initialize() }
    }

    fun submit(intent: PlaybackIntent): AuthorityDecision {
        showControls()
        return gate.submitUserIntent(intent)
    }

    fun toggleMenu(menu: PlayerMenu) {
        _state.value = _state.value.copy(menu = menu.takeUnless { _state.value.menu == it }, controlsVisible = true)
        showControls()
    }

    fun handleBack() {
        when {
            _state.value.menu != null -> _state.value = _state.value.copy(menu = null)
            _state.value.nextDeadlineMs != null -> cancelNextCountdown()
            _state.value.controlsVisible -> _state.value = _state.value.copy(controlsVisible = false)
            else -> exit()
        }
    }

    fun beginScrub(direction: Int) {
        if (scrubController.preview() == null) scrubController.begin(absolutePosition())
        val preview = scrubController.repeat(direction, _state.value.durationMs)
        _state.value = _state.value.copy(scrubPositionMs = preview, controlsVisible = true)
        controlsGeneration += 1
    }

    fun commitScrub() {
        val target = scrubController.commit() ?: return
        _state.value = _state.value.copy(scrubPositionMs = null)
        submit(PlaybackIntent.SeekTo(target))
    }

    fun cancelNextCountdown() {
        nextCountdownCancelled = true
        _state.value = _state.value.copy(nextDeadlineMs = null)
    }

    fun skipIntro() {
        _state.value.skipIntroTargetMs?.let { submit(PlaybackIntent.SeekTo(it)) }
    }

    fun selectAudio(track: AudioTrack) {
        val current = descriptor ?: return
        val requestedTrackIntent = TrackIntent(track.streamId, trackIntent?.subtitleStreamId, trackIntent?.subtitlesOff ?: false)
        if (current.delivery.type == "hls") {
            replace("track_change", absolutePosition(), requestedTrackIntent = requestedTrackIntent)
        }
        else {
            trackIntent = requestedTrackIntent
            applyFileTrack(track.streamId, TrackKind.AUDIO)
            updateSelectedTracks(audioStreamId = track.streamId)
        }
        _state.value = _state.value.copy(menu = null)
    }

    fun selectSubtitle(track: SubtitleTrack?) {
        val current = descriptor ?: return
        val requestedTrackIntent = TrackIntent(trackIntent?.audioStreamId, track?.streamId, track == null)
        if (current.delivery.type == "hls") {
            replace("track_change", absolutePosition(), requestedTrackIntent = requestedTrackIntent)
        }
        else if (track == null) {
            trackIntent = requestedTrackIntent
            player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build()
        } else {
            trackIntent = requestedTrackIntent
            player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false).build()
            applyFileTrack(track.streamId, TrackKind.TEXT)
        }
        if (current.delivery.type == "file") updateSelectedTracks(subtitleStreamId = track?.streamId, subtitlesOff = track == null)
        _state.value = _state.value.copy(menu = null)
    }

    fun selectQuality(id: String) {
        if (quality == id) return
        _state.value = _state.value.copy(menu = null)
        replace("quality_change", absolutePosition(), requestedQuality = id)
    }

    fun retry() {
        _state.value = _state.value.copy(error = null, loading = true)
        replace("retry", absolutePosition())
    }

    fun onStop() {
        if (resourcesReleased.get()) return
        lifecycleStopped = true
        gate.applyState {
            player.pause()
            player.stop()
        }
        _state.value = _state.value.copy(controlsVisible = true)
    }

    fun onStart() {
        if (resourcesReleased.get()) return
        if (lifecycleStopped) {
            lifecycleStopped = false
            gate.applyState { player.prepare() }
            _state.value = _state.value.copy(controlsVisible = true)
        }
    }

    fun exit() {
        releaseAndStop()
        if (exited.compareAndSet(false, true)) onExit()
    }

    fun dispose() {
        releaseAndStop()
    }

    /** Reads the final position on the player thread, then releases; the stop report outlives the screen. */
    private fun releaseAndStop() {
        if (!resourcesReleased.compareAndSet(false, true)) return
        val finalReporter = reporter
        val finalPosition = absolutePosition()
        release()
        graph.appScope.launch(Dispatchers.IO) { finalReporter?.stopFinal(finalPosition) }
    }

    private suspend fun initialize() {
        val captured = graph.session.current() ?: return exit()
        val me = graph.session.currentMe() ?: return exit()
        snapshot = captured
        prefs = graph.localPlaybackPrefs.get(me.server.machineId, me.profile.userId)
        try {
            val loadedDetail = withContext(Dispatchers.IO) { graph.api.media(captured, route.ratingKey) }
            detail = loadedDetail
            quality = prefs.defaultQuality
            val capabilities = capabilityDetector.detect(prefs.maxBitrateKbps)
            lastCapabilities = capabilities
            val request = PlaybackRequestFactory.create(
                loadedDetail, route.mediaId, route.startPositionMs, prefs, capabilities, quality = quality,
            )
            trackIntent = PlaybackRequestFactory.selectTracks(loadedDetail, request.mediaId, prefs)
            val playback = withContext(Dispatchers.IO) { graph.api.createPlayback(captured, request) }
            install(playback)
        } catch (error: Exception) {
            if (!resourcesReleased.get()) _state.value = _state.value.copy(
                loading = false,
                error = error.message ?: context.getString(R.string.player_error_start),
            )
        }
    }

    private fun install(playback: PlaybackDescriptor) {
        if (resourcesReleased.get()) return
        descriptor = playback
        nextCountdownCancelled = false
        decoderName = null
        droppedFrames = 0
        quality = playback.quality.requested
        mapper = TimelineMapper.from(playback.delivery, playback.durationMs)
        val captured = requireNotNull(snapshot)
        val sources = PlaybackMediaSourceFactory(captured, graph.http.forSession(captured)).create(playback)
        player.setMediaSources(sources)
        when (playback.delivery.type) {
            "file" -> mapper?.seekPlan(playback.startPositionMs)?.playerPosition?.let {
                player.seekTo(it.mediaItemIndex, it.positionMs)
            }
            "hls" -> if (playback.delivery.timeline.mapping == "absolute") {
                val part = playback.delivery.parts.first { it.index == playback.delivery.activePartIndex }
                player.seekTo((playback.startPositionMs - part.startMs).coerceAtLeast(0))
            }
        }
        reporter = ProgressReporter(
            playback.playbackId,
            playback.durationMs,
            playback.timelineIntervalMs,
            playback.heartbeatIntervalMs,
            scope,
            ApiProgressTransport(graph, captured),
            ::absolutePosition,
            onSessionExpired = { position -> scope.launch { replaceSessionExpired(position) } },
        ).also(ProgressReporter::start)
        _state.value = PlaybackUiState(
            loading = false,
            title = playback.item.title,
            subtitle = playback.item.showTitle,
            durationMs = playback.durationMs,
            positionMs = playback.startPositionMs,
            playWhenReady = true,
            buffering = true,
            descriptor = playback,
            diagnostics = playback.diagnostics + timelineDiagnostic(),
        )
        player.playWhenReady = true
        player.prepare()
        ticker?.cancel()
        ticker = scope.launch { tick() }
        showControls()
    }

    private fun executeIntent(intent: PlaybackIntent) {
        when (intent) {
            PlaybackIntent.Play -> player.play()
            PlaybackIntent.Pause -> player.pause()
            PlaybackIntent.Toggle -> if (player.playWhenReady) player.pause() else player.play()
            is PlaybackIntent.SeekBy -> seekAbsolute(absolutePosition() + intent.deltaMs)
            is PlaybackIntent.SeekTo -> seekAbsolute(intent.positionMs)
            PlaybackIntent.StartOver -> seekAbsolute(0)
            PlaybackIntent.Next -> descriptor?.nextItem?.ratingKey?.let { openItem(it) }
            PlaybackIntent.Previous -> descriptor?.previousItem?.ratingKey?.let { openItem(it) }
            PlaybackIntent.Stop -> exit()
        }
    }

    private fun seekAbsolute(targetMs: Long) {
        val plan = mapper?.seekPlan(targetMs) ?: return
        if (plan.replacementReason != null) {
            replace(plan.replacementReason, targetMs)
            return
        }
        plan.playerPosition?.let { player.seekTo(it.mediaItemIndex, it.positionMs) }
    }

    private fun replace(
        reason: String,
        positionMs: Long,
        forceTranscode: Boolean = false,
        requestedQuality: String? = null,
        requestedTrackIntent: TrackIntent? = null,
    ) {
        if (resourcesReleased.get()) return
        if (replacementJob?.isActive == true) return
        val captured = snapshot ?: return
        val current = descriptor ?: return
        val loadedDetail = detail ?: return
        replacementJob = scope.launch {
            try {
                player.pause()
                _state.value = _state.value.copy(loading = true, buffering = true, controlsVisible = true)
                val capabilities = capabilityDetector.detect(prefs.maxBitrateKbps)
                val request = PlaybackRequestFactory.create(
                    loadedDetail,
                    current.media.mediaId,
                    positionMs,
                    prefs,
                    capabilities,
                    requestedQuality ?: quality,
                    forceTranscode,
                    current.playbackId,
                    reason,
                    requestedTrackIntent ?: trackIntent,
                )
                val replacement = withContext(Dispatchers.IO) { graph.api.createPlayback(captured, request) }
                lastCapabilities = capabilities
                requestedQuality?.let { quality = it }
                requestedTrackIntent?.let { trackIntent = it }
                val oldReporter = reporter
                oldReporter?.stopFinal(absolutePosition())
                install(replacement)
            } catch (error: Exception) {
                _state.value = _state.value.copy(
                    loading = false,
                    buffering = false,
                    error = error.message ?: context.getString(R.string.player_error_reconfigure),
                )
            } finally {
                replacementJob = null
            }
        }
    }

    private suspend fun replaceSessionExpired(positionMs: Long) {
        if (!resourcesReleased.get()) replace("retry", positionMs)
    }

    private fun applyFileTrack(streamId: String, kind: TrackKind) {
        val current = descriptor ?: return
        val plex = buildList {
            current.tracks.audio.forEach { add(PlexTrackFact(it.streamId, TrackKind.AUDIO, it.languageCode ?: it.language, false)) }
            current.tracks.subtitles.forEach { add(PlexTrackFact(it.streamId, TrackKind.TEXT, it.languageCode ?: it.language, it.external)) }
        }
        val playerFacts = buildPlayerTrackFacts(player.currentTracks)
        val target = TrackMapper.mapByContainerOrder(streamId, plex, playerFacts, kind) ?: return
        val group = player.currentTracks.groups[target.groupIndex].mediaTrackGroup
        val override = TrackSelectionOverride(group, target.trackIndex)
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .clearOverridesOfType(if (kind == TrackKind.AUDIO) C.TRACK_TYPE_AUDIO else C.TRACK_TYPE_TEXT)
            .addOverride(override)
            .build()
    }

    private fun buildPlayerTrackFacts(tracks: Tracks): List<PlayerTrackFact> = tracks.groups.mapIndexedNotNull { index, group ->
        val kind = when (group.type) {
            C.TRACK_TYPE_AUDIO -> TrackKind.AUDIO
            C.TRACK_TYPE_TEXT -> TrackKind.TEXT
            else -> null
        } ?: return@mapIndexedNotNull null
        (0 until group.length).map { trackIndex ->
            PlayerTrackFact(index, trackIndex, kind, group.getTrackFormat(trackIndex).language)
        }
    }.flatten()

    private fun routeChanged() {
        scope.launch {
            val capabilities = capabilityDetector.detect(prefs.maxBitrateKbps)
            val codec = descriptor?.source?.audioCodec?.lowercase(Locale.ROOT) ?: return@launch
            val previous = lastCapabilities?.audio?.firstOrNull { it.codec == codec }
            val current = capabilities.audio.firstOrNull { it.codec == codec }
            val channels = descriptor?.source?.audioChannels ?: 2
            val lostPassthrough = previous?.passthrough == true && current?.passthrough != true
            val unsupportedChannels = current != null && channels > current.maxChannels && !current.passthrough
            if (current == null || lostPassthrough || unsupportedChannels) {
                replace("track_change", absolutePosition(), forceTranscode = true)
            } else {
                lastCapabilities = capabilities
            }
        }
    }

    private fun updateSelectedTracks(
        audioStreamId: String? = descriptor?.tracks?.selectedAudioStreamId,
        subtitleStreamId: String? = descriptor?.tracks?.selectedSubtitleStreamId,
        subtitlesOff: Boolean = false,
    ) {
        val current = descriptor ?: return
        val tracks = current.tracks.copy(
            audio = current.tracks.audio.map { it.copy(selected = it.streamId == audioStreamId) },
            subtitles = current.tracks.subtitles.map { it.copy(selected = !subtitlesOff && it.streamId == subtitleStreamId) },
            selectedAudioStreamId = audioStreamId,
            selectedSubtitleStreamId = subtitleStreamId.takeUnless { subtitlesOff },
        )
        descriptor = current.copy(tracks = tracks)
        _state.value = _state.value.copy(descriptor = descriptor)
    }

    private suspend fun tick() {
        while (!resourcesReleased.get()) {
            val current = descriptor
            if (current != null) {
                val position = absolutePosition()
                var nextDeadline = _state.value.nextDeadlineMs
                val introEnd = current.markers.firstOrNull {
                    it.type == "intro" && position in it.startMs until it.endMs
                }?.endMs
                bingePolicy.skipTarget(position, current.markers, current.autoplay.autoSkipIntro)?.let {
                    gate.submitAutomaticIntent(PlaybackIntent.SeekTo(it))
                }
                if (nextDeadline == null && !nextCountdownCancelled) {
                    nextDeadline = bingePolicy.nextCountdown(
                        position,
                        current.durationMs,
                        current.markers,
                        current.nextItem != null,
                        current.autoplay.autoPlayNextEpisode,
                        android.os.SystemClock.elapsedRealtime(),
                    )?.deadlineMs
                }
                if (nextDeadline != null && android.os.SystemClock.elapsedRealtime() >= nextDeadline) {
                    _state.value = _state.value.copy(nextDeadlineMs = null)
                    nextCountdownCancelled = true
                    gate.submitAutomaticIntent(PlaybackIntent.Next)
                    return
                }
                _state.value = _state.value.copy(
                    positionMs = position,
                    nextDeadlineMs = nextDeadline,
                    skipIntroTargetMs = introEnd,
                )
            }
            delay(500)
        }
    }

    private fun openItem(ratingKey: String) {
        if (!exited.compareAndSet(false, true)) return
        releaseAndStop()
        onOpenItem(PlayerRoute(ratingKey))
    }

    private fun showControls() {
        val generation = ++controlsGeneration
        _state.value = _state.value.copy(controlsVisible = true)
        scope.launch {
            delay(5_000)
            if (generation == controlsGeneration && player.isPlaying && _state.value.menu == null && _state.value.scrubPositionMs == null) {
                _state.value = _state.value.copy(controlsVisible = false)
            }
        }
    }

    private fun absolutePosition(): Long = mapper?.toAbsolute(player.currentMediaItemIndex.coerceAtLeast(0), player.currentPosition)
        ?: _state.value.positionMs

    override fun onPlaybackStateChanged(playbackState: Int) {
        val buffering = playbackState == Player.STATE_BUFFERING
        _state.value = _state.value.copy(buffering = buffering, loading = false)
        if (playbackState == Player.STATE_READY) {
            resolveHlsTimelineIfPossible()
            displayMode.requestOnce(player.videoFormat?.frameRate, prefs.matchFrameRate)
        }
        if (playbackState == Player.STATE_ENDED) {
            val current = descriptor ?: return
            val active = current.delivery.activePartIndex
            if (current.delivery.type == "hls" && active < current.delivery.parts.lastIndex) {
                replace("part_change", current.delivery.parts[active + 1].startMs)
            } else if (current.nextItem != null && current.autoplay.autoPlayNextEpisode && !nextCountdownCancelled) {
                if (gate.submitAutomaticIntent(PlaybackIntent.Next) is AuthorityDecision.Deny) {
                    _state.value = _state.value.copy(controlsVisible = true, playWhenReady = false, isPlaying = false)
                }
            } else if (current.nextItem != null) {
                _state.value = _state.value.copy(controlsVisible = true, playWhenReady = false, isPlaying = false)
            } else {
                exit()
            }
        }
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
        _state.value = _state.value.copy(isPlaying = isPlaying, playWhenReady = player.playWhenReady)
        scope.launch { reporter?.transition(if (player.playWhenReady) "playing" else "paused") }
        if (isPlaying) showControls()
    }

    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
        _state.value = _state.value.copy(playWhenReady = playWhenReady)
        scope.launch { reporter?.transition(if (playWhenReady) "playing" else "paused") }
    }

    override fun onPositionDiscontinuity(oldPosition: Player.PositionInfo, newPosition: Player.PositionInfo, reason: Int) {
        if (reason == Player.DISCONTINUITY_REASON_SEEK) scope.launch { reporter?.seekCompleted() }
    }

    override fun onPlayerError(error: PlaybackException) {
        val current = descriptor ?: return
        when (recoveryPolicy.onFailure(current.delivery.method)) {
            RecoveryAction.DECODER_FALLBACK -> replace("decoder_fallback", absolutePosition(), forceTranscode = true)
            RecoveryAction.RETRY_HLS -> replace("retry", absolutePosition())
            RecoveryAction.SHOW_ERROR -> _state.value = _state.value.copy(
                loading = false,
                buffering = false,
                controlsVisible = true,
                error = context.getString(R.string.player_error_failed, error.errorCodeName),
            )
        }
    }

    override fun onCues(cueGroup: CueGroup) {
        _state.value = _state.value.copy(cues = cueGroup.cues)
    }

    override fun onTimelineChanged(timeline: Timeline, reason: Int) {
        resolveHlsTimelineIfPossible()
    }

    override fun onVideoSizeChanged(videoSize: VideoSize) {
        displayMode.requestOnce(player.videoFormat?.frameRate, prefs.matchFrameRate)
    }

    private fun timelineDiagnostic(): String = "timeline mapping: ${descriptor?.delivery?.timeline?.mapping ?: "unknown"}"

    private fun resolveHlsTimelineIfPossible() {
        val currentMapper = mapper
        if (currentMapper?.hlsMapping != HlsTimelineMapping.UNKNOWN || player.duration == C.TIME_UNSET) return
        val resolution = currentMapper.resolveUnknownHls(player.duration)
        mapper = resolution.mapper
        if (resolution.initialSeekMs > 0) player.seekTo(resolution.initialSeekMs)
        refreshDiagnostics(resolution.diagnostic)
    }

    private fun refreshDiagnostics(extra: String? = null) {
        val current = descriptor ?: return
        val delivered = player.videoFormat?.let { format ->
            "delivered: ${format.sampleMimeType ?: "unknown"} ${format.width}x${format.height} ${format.bitrate.takeIf { it > 0 }?.let { "$it bps" } ?: "bitrate unknown"}"
        }
        _state.value = _state.value.copy(
            diagnostics = current.diagnostics + listOfNotNull(
                "timeline mapping: ${mapper?.hlsMapping?.name?.lowercase() ?: current.delivery.timeline.mapping}",
                delivered,
                decoderName?.let { "decoder: $it" },
                "dropped frames: $droppedFrames",
                extra,
            ),
        )
    }

    private fun release() {
        ticker?.cancel()
        replacementJob?.cancel()
        audioManager.unregisterAudioDeviceCallback(audioDeviceCallback)
        displayMode.restore()
        player.removeListener(this)
        player.removeAnalyticsListener(analyticsListener)
        mediaSession.release()
        player.release()
        scope.cancel()
    }
}

/**
 * The only player MediaSession controllers see. Every transport path (play/pause, playWhenReady, seeks, next/previous,
 * stop) goes through the intent gate; commands that could swap media or change speed are not offered at all.
 */
@androidx.annotation.OptIn(UnstableApi::class)
private class GatedPlayer(
    player: Player,
    private val gate: PlaybackIntentGate,
    private val toAbsolute: (Int, Long) -> Long,
) : ForwardingPlayer(player) {
    override fun play() { gate.submitUserIntent(PlaybackIntent.Play) }
    override fun pause() { gate.submitUserIntent(PlaybackIntent.Pause) }
    override fun setPlayWhenReady(playWhenReady: Boolean) {
        gate.submitUserIntent(if (playWhenReady) PlaybackIntent.Play else PlaybackIntent.Pause)
    }
    override fun seekTo(positionMs: Long) { gate.submitUserIntent(PlaybackIntent.SeekTo(toAbsolute(currentMediaItemIndex, positionMs))) }
    override fun seekTo(mediaItemIndex: Int, positionMs: Long) { gate.submitUserIntent(PlaybackIntent.SeekTo(toAbsolute(mediaItemIndex, positionMs))) }
    override fun seekToDefaultPosition() { gate.submitUserIntent(PlaybackIntent.StartOver) }
    override fun seekToDefaultPosition(mediaItemIndex: Int) { gate.submitUserIntent(PlaybackIntent.SeekTo(toAbsolute(mediaItemIndex, 0))) }
    override fun seekBack() { gate.submitUserIntent(PlaybackIntent.SeekBy(-10_000)) }
    override fun seekForward() { gate.submitUserIntent(PlaybackIntent.SeekBy(10_000)) }
    override fun seekToNext() { gate.submitUserIntent(PlaybackIntent.Next) }
    override fun seekToNextMediaItem() { gate.submitUserIntent(PlaybackIntent.Next) }
    override fun seekToPrevious() { gate.submitUserIntent(PlaybackIntent.Previous) }
    override fun seekToPreviousMediaItem() { gate.submitUserIntent(PlaybackIntent.Previous) }
    override fun stop() { gate.submitUserIntent(PlaybackIntent.Stop) }

    override fun getAvailableCommands(): Player.Commands =
        super.getAvailableCommands().buildUpon().removeAll(*BLOCKED_COMMANDS).build()

    override fun isCommandAvailable(command: Int): Boolean = command !in BLOCKED_COMMANDS && super.isCommandAvailable(command)

    private companion object {
        val BLOCKED_COMMANDS = intArrayOf(
            Player.COMMAND_SET_MEDIA_ITEM,
            Player.COMMAND_CHANGE_MEDIA_ITEMS,
            Player.COMMAND_SEEK_TO_MEDIA_ITEM,
            Player.COMMAND_SET_SPEED_AND_PITCH,
            Player.COMMAND_SET_SHUFFLE_MODE,
            Player.COMMAND_SET_REPEAT_MODE,
            Player.COMMAND_SET_PLAYLIST_METADATA,
            Player.COMMAND_SET_TRACK_SELECTION_PARAMETERS,
            Player.COMMAND_PREPARE,
            Player.COMMAND_RELEASE,
        )
    }
}

private class ApiProgressTransport(
    private val graph: AppGraph,
    private val snapshot: SessionSnapshot,
) : PlaybackProgressTransport {
    override suspend fun timeline(playbackId: String, request: TimelineRequest) {
        graph.api.reportTimeline(snapshot, playbackId, request)
    }

    override suspend fun heartbeat(playbackId: String) {
        graph.api.heartbeat(snapshot, playbackId)
    }

    override suspend fun stop(playbackId: String, request: StopPlaybackRequest) {
        graph.api.stopPlayback(snapshot, playbackId, request)
    }
}

private class DisplayModeController(context: Context) {
    private val activity = context as? Activity
    private val originalModeId = activity?.window?.attributes?.preferredDisplayModeId ?: 0
    private var requested = false

    fun requestOnce(frameRate: Float?, enabled: Boolean) {
        val window = activity?.window ?: return
        if (!enabled || requested || frameRate == null || frameRate <= 0) return
        val display = activity.getSystemService(DisplayManager::class.java).getDisplay(android.view.Display.DEFAULT_DISPLAY)
            ?: return
        val current = display.mode
        val candidate = display.supportedModes
            .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
            .minByOrNull { mode -> integerMultipleDistance(mode.refreshRate.toDouble(), frameRate.toDouble()) }
            ?.takeIf { integerMultipleDistance(it.refreshRate.toDouble(), frameRate.toDouble()) < 0.02 }
            ?: return
        requested = true
        window.attributes = window.attributes.apply { preferredDisplayModeId = candidate.modeId }
    }

    fun restore() {
        val window = activity?.window ?: return
        if (requested) window.attributes = window.attributes.apply { preferredDisplayModeId = originalModeId }
    }

    private fun integerMultipleDistance(refreshRate: Double, frameRate: Double): Double {
        val ratio = refreshRate / frameRate
        return kotlin.math.abs(ratio - ratio.toInt().coerceAtLeast(1))
    }
}