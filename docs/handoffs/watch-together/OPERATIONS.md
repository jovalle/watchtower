# Watch Together operations

Watch Together coordinates synchronized playback between Watchtower viewers. Each viewer streams from Plex with their own Plex account; Watchtower only coordinates play, pause, position and the shared next item. This page covers running, limiting, observing and rolling back the feature. The user guide is [docs/watch-together.md](../../watch-together.md); the evidence record is [ACCEPTANCE.md](ACCEPTANCE.md).

## Architecture and its limits

- **One process.** Rooms, members, invitations, command results and playback-session ownership live in memory in the single Watchtower process (`getRoomCoordinator()` in `app/lib/rooms/coordinator.server.ts`). Run exactly one Watchtower process per deployment. Replicas, sticky sessions and load balancing across processes are not supported: each process would hold different rooms.
- **Restarts end every room.** A new process has a new coordinator epoch. Clients detect it and show "The room is no longer available" or "The room ended because the server restarted"; players stop. Nothing about rooms is written to `DATA_PATH`, so there is nothing to clean up or migrate.
- **Transport.** Clients send `POST` requests (JSON, same origin) and receive one Server-Sent Events stream per member (`GET /api/v1/rooms/:roomId/events`). The stream starts with a full snapshot and sends a named `heartbeat` event every 5 s.
- **Identity.** Web members use the existing signed session cookie plus a signed, HttpOnly `__wt_device` cookie (SameSite=Lax, `Secure` when `SECURE_COOKIES=true`, one year) that separates devices of one account. Requests with an `Authorization` header are rejected (`401 bearer_unsupported`, or `identity_ambiguous` together with a cookie); there is no fallback to the configured owner token.
- **Authorization.** Every create, join, playback load, periodic revalidation (5 min) and next-episode advance checks the member's own Plex token against the room's exact media and part. Invitations never grant library access. A member whose access is lost, or whose Plex copy of the title changes, is removed with a minimal terminal event.

## Configuration

| Variable | Effect |
| --- | --- |
| `WATCH_TOGETHER=disabled` | Rejects new rooms and joins with `503 feature_disabled` and hides the entry points. Rooms that already exist keep running until they end; changing the variable requires a restart, which ends them. Any other value, or unset, enables the feature. |
| `SECURE_COOKIES=true` | Required behind HTTPS so the `__wt_device` cookie is `Secure`. |

Fixed limits (from `ROOM_POLICY` in `app/lib/rooms/protocol.ts` and the coordinator):

| Limit | Value |
| --- | --- |
| Rooms per process / members per room | 100 / 8 (new requests are refused; live rooms are never evicted) |
| Room lifetime / empty room / ended room retention | 24 h / 30 min / 5 min |
| Invitation lifetime | Up to the room lifetime; rotate or revoke at any time. The secret is only in the URL fragment and is stored as a SHA-256 hash. |
| Request body | 16 KiB, `application/json`, same-origin `Origin` required |
| Rate limits | Room creation 5/min per user; invalid invitations 20/min per user and 300/min globally; commands 30 per 2 s per member; presence 20 per 5 s per member |
| Liveness | Member stale after 15 s without presence; host grace 30 s; an unready blocking member stops blocking after 30 s |
| SSE backpressure | A consumer that cannot keep up for 10 s is disconnected; its client reconnects and receives a fresh snapshot |

## Reverse proxy requirements

The event stream must reach the browser unbuffered and stay open.

- Disable response buffering for `/api/v1/rooms/*/events`. Watchtower sends `X-Accel-Buffering: no` (honored by nginx) and `Cache-Control: private, no-store, no-transform`; other proxies need buffering turned off explicitly.
- Do not compress `text/event-stream` responses.
- Set the upstream read/idle timeout well above the 5 s heartbeat (60 s or more). A timeout below 15 s makes every member reconnect repeatedly.
- Forward `Host` and `X-Forwarded-Proto` correctly. State-changing requests are rejected unless `Origin` matches the public origin (`csrf_rejected`). `server.ts` already sets `trust proxy`.
- One member holds one long-lived connection per open player. Size connection limits for up to 8 members × 100 rooms.

Verify after deploying: open a room, watch the browser's network panel for `heartbeat` events about every 5 s, and confirm the connection survives at least a minute without a "Reconnecting" message.

## Observability

- **Diagnostics endpoint:** `GET /api/v1/rooms/diagnostics`, server owner only. Returns counts (rooms, participants, connected members, open streams, retry-cache entries) and per room: an 8-character room id prefix, phase, control and presence revisions, member counts and drift estimates. It contains no names, titles, tokens, invite secrets or URLs.
- **In the player:** members can open **Room details** in the Watch Together panel for the room and epoch id prefixes, control/presence revisions, phase and reason, drift, clock RTT and uncertainty, hard seeks, rate corrections, reconnects and the last error code.
- **Logs:** the request log records room API paths and status codes. Invitation secrets, session cookies and Plex tokens are not logged (checked by the WT-21 harness assertion). Upstream Plex failures during revalidation are logged with the room id prefix only.

## Rollback

1. Set `WATCH_TOGETHER=disabled` and restart, or deploy the previous release. Either ends all rooms immediately and visibly; solo playback is unaffected.
2. No data migration or cleanup is needed. The `__wt_device` cookie is harmless to older releases, which ignore it.
3. Solo playback is unchanged: its playback sessions keep the original shared per-account scope. Only room playback sessions are additionally scoped to the browser's `__wt_device` cookie.

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| Members show "Reconnecting" every 15–60 s | Proxy idle timeout or buffering on the event stream | Apply the proxy requirements above |
| Every room ended at once | Restart, deploy or crash | Expected; rooms are in memory. Create new rooms |
| `409` "This room's title changed on Plex" when opening the player | The item's Plex media or part changed after the room was created (for example an upgraded file) | Create a new room; the old one cannot continue with a different file |
| `403 csrf_rejected` on room actions | The public origin differs from what reaches Watchtower | Forward `Host`/`X-Forwarded-Proto`; use one public origin |
| `429` on join or commands | Rate limit (invite guessing, key-repeat bursts from old clients) | Wait a minute; current web clients coalesce seek bursts |
| One member is always behind or buffering | That member's network or the Plex transcoder | Lower that member's quality; a blocking member stops blocking after 30 s |
| Members see "Your Plex profile cannot access…" | The member's Plex account lost access, or cannot see the next episode | Share the library with that account; invitations do not grant access |

## Security notes

- No room identifier or invitation grants anything without a signed Watchtower session for the same Plex server; non-members get `404` for rooms and streams.
- Only the host's commands change the room. Readiness claims require a playback session owned by that member's account and device for the room's current media.
- The configured owner token is never used for member playback or room authorization. Existing owner-token uses (startup validation, server health) are unchanged.
