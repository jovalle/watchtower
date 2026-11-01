package io.github.jovalle.watchtower.tv.rooms

import io.github.jovalle.watchtower.tv.playback.AuthorityDecision
import io.github.jovalle.watchtower.tv.playback.PlaybackIntent
import io.github.jovalle.watchtower.tv.playback.TransportAuthority

class RoomAuthority(
    private val state: () -> RoomUiState,
    private val positionMs: () -> Long,
    private val send: (RoomCommand) -> Unit,
    private val requestLeave: () -> Unit,
) : TransportAuthority {
    override fun authorize(intent: PlaybackIntent): AuthorityDecision {
        val room = state()
        if (intent == PlaybackIntent.Stop) {
            requestLeave()
            return AuthorityDecision.Handled
        }
        if (room.status != RoomConnectionStatus.CONNECTED) {
            return AuthorityDecision.Deny("Room controls are unavailable while reconnecting.")
        }
        if (!room.isHost) return AuthorityDecision.Deny("Only the room host controls playback.")
        val command = when (intent) {
            PlaybackIntent.Play -> RoomCommand.Play
            PlaybackIntent.Pause -> RoomCommand.Pause
            PlaybackIntent.Toggle -> if (room.snapshot?.phase == "playing") RoomCommand.Pause else RoomCommand.Play
            is PlaybackIntent.SeekTo -> RoomCommand.Seek(intent.positionMs.coerceAtLeast(0))
            is PlaybackIntent.SeekBy -> RoomCommand.Seek((positionMs() + intent.deltaMs).coerceAtLeast(0))
            PlaybackIntent.StartOver -> RoomCommand.Seek(0)
            PlaybackIntent.Next -> RoomCommand.SelectNext(0)
            PlaybackIntent.Previous -> return AuthorityDecision.Deny("Previous item is unavailable in a room.")
            PlaybackIntent.Stop -> error("handled above")
        }
        send(command)
        return AuthorityDecision.Handled
    }

    override fun authorizeAutomatic(intent: PlaybackIntent) =
        AuthorityDecision.Deny("Automatic skip and next are controlled by the room.")
}