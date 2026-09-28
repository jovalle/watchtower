# Watch Together dependencies and shared contract

This page records what the web branch (`work/watch-together`) provides to, and needs from, the Android TV work, so either side can integrate without re-reading the other's history. Ownership follows the handoff: Android owns device credentials, the native JSON facade and shared playback/auth extraction; this branch owns rooms and browser integration.

## Contract

- **Frozen:** room protocol v1 at commit `0d0033e`: [`app/lib/rooms/protocol.ts`](../../../app/lib/rooms/protocol.ts) (`PROTOCOL_VERSION = 1`, `ROOM_POLICY`, reasons, error codes, request/response types and parsers) and the golden fixtures in [`test/fixtures/rooms/v1/fixtures.json`](../../../test/fixtures/rooms/v1/fixtures.json).
- **Changes since the freeze are compatible:** no wire field was renamed or removed, and no status code changed.
  - `5063680` makes `parseSnapshot` stricter (media identity strings, `hostParticipantId`, participant shapes). Snapshots produced by the server already satisfied it; the Android branch mirrors it (`3a7bde7`).
  - `b04b429` changes server behavior only: joins during a next-item authorization are re-checked, a member whose Plex media changed is removed with `access_denied`, and identical command retries return the cached result before phase and rate checks (an ended room answers a retried `end` with its original `200`).
  - `3848e23` fixes `play` from the lobby or a pause: the new anchor now starts at the held position instead of adding the wait (the bug the Android room E2E reported).
  - Everything else after the freeze is client-side or player-side.
- **Additive changes on the Android side (not in this branch):** error code `identity_version_mismatch` (`409`), bearer principals in `resolveRoomPrincipal`, same-origin checks skipped for requests that carry `Authorization`, and a native device-revocation hook that calls `leaveDeviceMemberships`. The web client treats any unknown `409` as a dropped intent and applies the returned snapshot, so it is compatible.

### Endpoints (same origin, JSON, `protocolVersion` 1)

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/clock` | Epoch and server time for clock sampling (authenticated) |
| `POST /api/v1/rooms` | Create a room (`requestId`, `epoch`, `expiresAtMs`, exact `media`, `startPositionMs`, `autoAdvance`) |
| `POST /api/v1/rooms/join` | Join with `invite`, or `{ roomId, takeover: true }` for the same device |
| `GET /api/v1/rooms/:roomId` | Current envelope for a member |
| `GET /api/v1/rooms/:roomId/events` | Member SSE: `snapshot`, `heartbeat` (every 5 s), `ended` |
| `POST /api/v1/rooms/:roomId/commands` | Host commands with `commandId`, `commandSequence`, `expectedRevision`, `mediaGeneration` |
| `POST /api/v1/rooms/:roomId/presence` | Member presence with `presenceSequence` and an owned `playbackSessionId` |
| `POST /api/v1/rooms/:roomId/leave` | Idempotent leave |
| `POST /api/v1/rooms/:roomId/invitations` | Host rotate/revoke |
| `GET /api/v1/rooms/diagnostics` | Server owner only; no names, titles, credentials or URLs |

### Boundaries the TV client must honor

- **Principal:** `resolveRoomPrincipal(request)` in [`app/lib/rooms/principal.server.ts`](../../../app/lib/rooms/principal.server.ts) is the single identity boundary. It returns a `PlaybackPrincipal` (`kind`, `userId`, `displayName`, `serverMachineId`, `serverToken`, `deviceSessionId`, `identityVersion`). A request with both a bearer credential and a browser session is `identity_ambiguous`; there is never an owner-token fallback.
- **Playback ownership:** readiness claims are accepted only for a playback session registered for the member's account, the room's current media and `scope === principal.deviceSessionId`. TV playback must call `getPlaybackInfo(..., { deviceScope: deviceSessionId })` (or `registerPlaybackSession(..., scope)`) for room playback. Solo playback keeps the original empty scope (`f0fd030`).
- **Exact media identity:** rooms carry `{ serverMachineId, ratingKey, mediaId, partId }`. Authorization compares the member's Plex `Media[0]`/`Part[0]` ids; multipart items are rejected. A TV client must play exactly that media and part, never another version.
- **Invitations:** the invite secret is 43 URL-safe characters carried only in a URL fragment (`/join#i=…`). A TV has no fragment flow; a short code or QR hand-off is not part of v1 and needs a contract addition.

### Client behavior learned from the web acceptance runs

Each item caused a real failure in the browser journey before it was fixed; a native client should follow the same rules.

| Rule | Web commit |
| --- | --- |
| Command rejections other than `401`, `removed`, `forbidden`, `room_ended` and `membership_ended` drop only that intent; they must not end or reconnect the room. `not_found` is ambiguous (no next episode vs. missing room): re-read the room to decide. | `b676c30` |
| A `429` on presence schedules one resend of the newest presence; do not reconnect. | `9b60433` |
| Only a refused start (`NotAllowedError`) is "autoplay blocked"; an interrupted start is not. | `dd0758a` |
| When the room moves to another title, pause the outgoing media and stop aligning, claiming readiness or auto-advancing it. | `f3648a5` |
| Do not reload a freshly opened transcode to chase a playing room; reload only once aligned, or when the room seeked during the load. | `96a8269` |
| A paused room produces no "playing" event: report buffering recovery and readiness when data becomes available. | `96a8269` |
| Coalesce bursts of relative host seeks into one command. | `f3648a5` |
| Stay at the end of ended media while the room runs out the title; starting it again restarts from 0. | `dd0758a` |

## Shared files and merge order

Both branches edit these files; merge the web branch first, then rebase or merge Android:

- `app/lib/rooms/principal.server.ts` (Android adds the bearer branch)
- `app/lib/rooms/http.server.ts`, `app/lib/rooms/coordinator.server.ts`, `app/lib/rooms/protocol.ts` (small Android additions listed above)
- `app/lib/plex/playback-session.server.ts`, `app/lib/plex/client.server.ts` (device scope here; Android also refactors playback extraction and an HLS proxy)
- `app/routes/auth.logout.ts`
- `app/routes/app.watch.$ratingKey.tsx` (web only)

The Android integration branch last merged this branch at `63bdfef`; it still needs `f0fd030` (solo playback scope), `3848e23` (play anchor) and `e0fac75`/`eff04db` (harness only).

## Worktrees and local harnesses

- The original web and Android worktrees were emptied externally at 21:53 on 2026-09-27. The web worktree was recreated at `75a18dd` with the user's approval; the Android work now continues in `[local workspace]` on `work/tv-wt-integration`, which merged this branch at `63bdfef`.
- Local ports: the web harness uses Watchtower `9331` and synthetic Plex `32519` (`WT_HARNESS_APP_PORT`, `WT_HARNESS_PLEX_PORT`). The Android `scripts/tv-e2e` harness uses `32499`. Between 03:40Z and 03:50Z on 2026-09-28 both used `32499`; the web runs from that window are discarded and the harness now refuses occupied ports (`e0fac75`). Those runs sent only synthetic tokens to the Android fake server.

## Blocked on Android

- WT-22 and WTT-18 (browser ↔ TV ↔ TV) need a TV client that implements this contract and a device harness. Record them in [ACCEPTANCE.md](ACCEPTANCE.md) once runnable.
