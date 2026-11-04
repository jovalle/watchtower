# Watch Together

Watch Together lets people who each have access to the same title on this Plex server watch it in sync through Watchtower. Watchtower coordinates play, pause and position; every viewer streams from Plex with their own account, so Plex library permissions, restrictions and watch history stay personal.

## Start a room

1. Open a movie or episode and choose **Watch Together**.
2. Choose **Start from beginning** or, when you have saved progress, **Start from saved position**. The room starts paused in a lobby.
3. Copy the invite link from the **Watch Together** panel and share it privately. The secret part of the link is after `#` and is not sent to servers in the address or in logs. Anyone signed in to Watchtower with access to the title can use it until it expires (at most 24 hours) or you rotate or revoke it.
4. Everyone selects **I'm Ready**. That tap also lets the browser play sound later. When every participant shows **Ready**, the host selects **Start**; playback begins together about one second later.

Invitations never grant library access. A person without access to the title gets an access message, and no room details are shown to them.

## Controls

The host controls the shared timeline: play, pause, seeking (keyboard, progress bar, skip buttons and system media keys), **Skip Intro** when Plex has an intro marker, and the next episode. Other viewers see the same controls, but they only explain that the host is in control. Everyone controls their own volume, mute, subtitles, audio track, quality, fullscreen and picture-in-picture. Changing quality or an audio track restarts only your stream; the room keeps going and you rejoin at the current position.

Keyboard seeking works when the progress bar has focus; elsewhere the arrow keys move focus between controls.

The **Watch Together** controls sit at the top right inside the player, including in fullscreen. They fade with the player controls and stay visible while loading, waiting for **I'm Ready**, counting down, or reconnecting. Select **Watch Together** to open members, invitations, and **Room Details**. Player settings temporarily hide the room controls without resetting the panel.

The host can transfer host control, remove a viewer and end the room. Removing a viewer does not change the invite link; use **Also rotate invite link** to stop the old link. A removed viewer cannot rejoin that room.

Episode rooms show a shared countdown during the credits when the room's auto-advance setting is on (it starts from the host's **Autoplay next episode** preference). The host can cancel it. Before the next episode starts, Watchtower checks every viewer's access to it; viewers without access leave the room and do not see which episode is next. The episode list is disabled in a room: create a new room to watch a different episode.

## Waiting, buffering and reconnecting

- If a viewer who is part of the start barrier buffers, the room pauses once and names who is buffering. The host presses play when ready; the room never resumes on its own after buffering. A viewer who stays stuck for 30 seconds stops blocking the room.
- Someone joining while the room plays catches up on their own without pausing others.
- If your connection to Watchtower drops, your player pauses and shows **Reconnecting**. When it returns, it rejoins the current position; missed actions are not replayed.
- If the host disappears, the room pauses. After about 15 seconds without contact plus a 30-second grace period, the earliest-joined ready viewer becomes host. If nobody is eligible, the room ends.
- Restarting or updating Watchtower ends all rooms. Players stop visibly; create a new room to continue.

## Leaving

**Leave** stops room playback on this device. **Continue solo** leaves the room and keeps watching from your own current position. Each viewer's progress and watched status are saved from their own playback; the host's seeks do not mark the title watched for others.

Opening the same room in a second tab on the same browser asks you to **Take over here**; the first tab then stops.

## Not supported

Chat, voice or video calls; different servers, editions or cuts of a title; multipart items; casting or AirPlay while in a room; rooms that survive a Watchtower restart; running more than one Watchtower process; controlling Plex's own apps; guaranteed frame-accurate sync. Synchronization accuracy depends on devices, networks and playback method, and has only been measured on a local test setup so far.

Two devices signed in to the same Plex account can join as separate viewers, but Plex stores one progress position and one set of audio/subtitle preferences per account, so the last reported position and track choice win.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| **Tap to start playback** | The browser blocked sound. Tap the button; if it repeats, allow sound for this site. |
| Invite says it is invalid or expired | Ask the host for a new link; rotated, revoked and expired links stop working. |
| "Your Plex profile cannot access this title" | The Plex owner must share that library with you, or remove the restriction. |
| Stuck on **Reconnecting** | Check your network. If Watchtower restarted, the room has ended; create a new one. |
| One viewer is always behind or buffering | Lower that viewer's quality. Plex transcoding load affects everyone on the server. |
| The room ended unexpectedly | The host ended it, the room expired, Watchtower restarted, or the Plex server changed. |
| "This room's title changed on Plex" | The title's file changed on Plex after the room started. Create a new room. |
