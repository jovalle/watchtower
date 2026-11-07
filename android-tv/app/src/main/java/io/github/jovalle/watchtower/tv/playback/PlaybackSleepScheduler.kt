package io.github.jovalle.watchtower.tv.playback

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// A restored deadline may already be expired; navigation must wait until construction returns.
internal fun CoroutineScope.launchPlaybackSleepTimer(
    deadlineElapsedMs: Long,
    elapsedRealtime: () -> Long,
    onDeadline: () -> Unit,
): Job = launch(Dispatchers.Main) {
    delay((deadlineElapsedMs - elapsedRealtime()).coerceAtLeast(0))
    onDeadline()
}
