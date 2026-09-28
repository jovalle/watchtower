# Watchtower web / Android TV development contract

Prepared 2026-09-27 against Git base `8578769`. Status: **proposed implementation contract, not implemented**. This identical file is intentionally present in both feature branches. Keep the copies identical until the first integration; then maintain one file in the merged repository.

## Read first

- Watch Together: `docs/handoffs/watch-together/IMPLEMENTATION.md`, then `RESEARCH.md` and `AGENT-PROMPT.md` in that directory.
- Android TV: `docs/handoffs/android-tv/IMPLEMENTATION.md`, then `RESEARCH.md` and `AGENT-PROMPT.md` in that directory.
- Existing baseline: `README.md`, `docs/netflix-replacement-plan.md`, `docs/implementation-handoff.md`, and `docs/playback-evaluation.md`.
- Existing handoff logs describe an earlier checkout. Re-run `git status`, inspect the current code, and establish a fresh baseline. Do not assume an old server, terminal, test result, account, or media permission is still available.

The objective is reliable personal-library co-viewing and a complete native TV experience. A successful first slice is a milestone, not fulfillment of the full feature matrix. No claim of perfect synchronization, universal codec support, or parity is accepted without evidence.

## Workspaces and ownership

| Track | Workspace | Branch | Owns |
| --- | --- | --- | --- |
| Watch Together | `/Users/jay/.codex/worktrees/watch-together/watchtower` | `codex/watch-together` | Room protocol, coordinator, web room UI, web player integration, room tests |
| Android TV | `/Users/jay/.codex/worktrees/android-tv/watchtower` | `codex/android-tv` | Native app, device pairing, native JSON API, native playback capabilities, TV integration tests |

Both start at the same committed baseline. Neither worktree contains the other feature. Do not assume uncommitted work can be imported by branch name. Do not change `/Users/jay/Projects/watchtower` while implementing these tracks. Preserve unrelated changes, never reset/clean another agent's files, and do not share writable runtime data between development servers.

Shared-file hotspots: `app/lib/auth/*`, `app/lib/plex/client.server.ts`, `app/lib/plex/playback-session.server.ts`, `app/routes/app.watch.$ratingKey.tsx`, media proxies, `app/lib/settings/*`, `package.json`, lockfiles, `README.md`, and CI workflows. The integration lead owns any cross-track extraction. Assign one writer per file per phase; use patches/commits with exact SHAs, and rerun integration checks after applying them. Do not have two agents independently redesign the same helper.

Recommended sequence:

1. Both leads verify baseline and accept this contract; record intentional changes before dependent code.
2. WT implements pure room logic with a request-principal boundary and web-cookie adapter. TV implements the native shell and JSON contract fixtures independently.
3. TV implements device authentication and a shared principal resolver behind the agreed boundary. Integrate that small change before native room access, while retaining cookie behavior.
4. TV extracts only the playback logic actually shared with the web loader. Land that as a reviewable prerequisite or apply the exact reviewed commit into WT before further changes to the loader/client. WT can build its coordinator/UI in parallel.
5. WT stabilizes the room contract and shared JSON fixtures. TV consumes them; neither copies a coordinator into Kotlin nor maintains a private room endpoint.
6. Integrate both tracks in one checkout, test web↔TV and TV↔TV, resolve conflicts semantically, and run all relevant gates again. Feature-branch passes alone do not establish integration quality.

There is no need for a third permanent worktree, new service, Redis, or a message broker at this stage. Single-process deployment is an explicit constraint, not a claim of horizontal scalability.

## Verified baseline constraints

- Remix/React/TypeScript web application with Express production hosting and HLS.js. No Android project or versioned native API exists at this base.
- Web sessions use `createCookieSessionStorage` with signed HttpOnly cookies. Signing is **not encryption**; do not describe the existing cookie as an encrypted server-side token store. Native credentials must not reuse or export that cookie.
- The `/app` layout validates the Plex account and configured server. Resource routes are separate entry points; a layout check is not their authentication middleware.
- Playback session ownership lives in process memory. Generation/sequence ordering prevents stale timeline writes, but the current scope uses server+token+title and can supersede a second device playing the same title under the same account.
- HLS requests have session ownership checks; the direct-file proxy reads the first media/part and is not an equivalent native playback negotiation API.
- The web loader detects `/Android/` as mobile, and Plex HLS negotiation advertises a Chrome profile. Do not route a native TV client through browser detection.
- Voting SSE is unauthenticated, polls a file every 1.5 seconds, and supplies invalidation hints. Reuse SSE framing knowledge only; it is not a suitable room coordinator or authorization model.
- No current evidence establishes all browser, receiver, TV, HDR, audio, or cross-device behavior. Existing passing mocked tests are not that evidence.

Source map and detailed evidence are in each track's research document.

## Identity and authorization boundary

Introduce a small server-only resolver only when the second caller needs it. The logical result is:

```ts
type PlaybackPrincipal = {
  userId: string;                 // verified effective Plex user/profile
  serverMachineId: string;        // current configured server
  serverToken: string;            // secret; server-only, never serialized
  deviceSessionId: string;        // server-issued, authenticated device scope
  identityVersion: number;        // current effective-profile context for this device
};
```

This is an implementation boundary, not a required new class hierarchy. Web uses its existing authenticated session plus a server-issued participant/device binding; TV uses a revocable Watchtower device credential. Resolve profile identity server-side. Never accept `userId`, owner status, server URL, server token, or profile permissions from a client payload as authority. A device ID is not a credential.

For every new resource route: validate method/content type/body limits and schema, authenticate, validate server binding and authorization, then perform the operation. Return JSON 401/403 for API calls, not an HTML OAuth redirect. Preserve existing browser redirects in page loaders. Reject ambiguous cookie+bearer identities rather than selecting an arbitrary account. Apply same-origin/CSRF protection to cookie mutations; bearer endpoints must not implicitly downgrade to cookie authentication.

Authorize metadata, art, streams, subtitle resources, track changes, timeline, room membership, and next-title transitions under the effective user's token. Never use `env.PLEX_TOKEN` for user-facing access. Cache by server and effective user/profile. Room membership cannot confer Plex library access. All devices must reach the same Watchtower deployment; Plex need not be directly reachable from the TV when using the authenticated proxy.

Server configuration change invalidates or re-verifies all device sessions, playback sessions, rooms, cached metadata, and pending pairings. Logout/revoke/profile switch cancels network requests and playback, closes room membership, removes personalized caches, and prevents stale callbacks from restoring the old identity.

Native pairing and `/me` return `identityVersion`; authenticated content/resource/mutation requests carry `X-Watchtower-Identity-Version`. Profile switch checks the expected version and atomically increments it. Reject a stale version before content access or side effects and recheck after awaited authorization, immediately before issuing an upstream mutation. Capture the effective principal immutably for each request; never reinterpret an old request using the newly selected profile. Already-dispatched upstream writes may finish for the old profile and cannot always be recalled; they must never be reassigned to the new one. Client responses are applied only if their captured identity version still matches. Room membership is also bound to this context. Browser adapters must provide equivalent effective-identity invalidation without exporting credentials.

## Stable media identity and playback contract

Use server machine ID + rating key + selected media/edition + part identity. Rating keys are server-scoped strings, not global integers; a movie title or TMDB ID is not sufficient for synchronized timelines. Initially rooms require the same item, edition, and timeline on the same configured server. Exclude unsupported multipart timelines explicitly until normalized and tested; do not silently play part zero. Different qualities/codecs are permitted if they map to the same content timeline.

Public time units are integer **milliseconds** with `Ms` suffix. Plex offset parameters remain seconds at the single upstream conversion boundary. HTMLMediaElement time is seconds. Kotlin Media3 positions are milliseconds. All adapters expose absolute content position, not segment index or position relative to a transcoded sub-window.

The native playback descriptor must cover: authenticated playback session ID, media identity, duration, resume position, proxy URL(s), delivery type (`file` or `hls`), actual/negotiated method when known, content timeline origin, audio/subtitle track IDs, selected tracks, markers, next item, available quality options, and expiry/recovery semantics. No credential in URLs or JSON. Requested quality, source metadata, and measured delivered output are separate fields. Do not call a remux a video transcode.

Keep playback progress local to each participant's actual observed position; never write the host's position as everybody's watched progress. A room command is not a Plex timeline report. Scope independent sessions by effective user+server+device/player and preserve replacement generation ordering within a player. A same-account second device may have conflicting Plex history semantics: report its own observations, document last accepted progress behavior, and test that it cannot stop another device's transcoder.

Changing tracks/quality replaces only that participant's stream. The room state survives the replacement; rejoin/resynchronize once ready. Plex stored track preferences can be account-wide; do not promise per-device isolation until session-level behavior is verified.

## Proposed room API v1

These paths and payloads are proposed, **not existing routes**. WT owns their implementation. Use Remix resource routes with JSON, and one authenticated SSE stream per participating player. Web sends same-origin cookies; native clients send an Authorization header. An established streaming HTTP client can supply that header on TV; browser `EventSource` cannot set arbitrary headers.

| Method/path | Behavior |
| --- | --- |
| `POST /api/v1/rooms` | Authorize exact media; create room and host participant; return snapshot and join invitation |
| `POST /api/v1/rooms/join` | Redeem invitation in body; authorize media; create/recover participant bound to caller device |
| `GET /api/v1/rooms/:roomId` | Current snapshot plus private membership/counter recovery envelope for the authenticated member |
| `GET /api/v1/rooms/:roomId/events` | Authenticated snapshot SSE; initial snapshot and every accepted change |
| `POST /api/v1/rooms/:roomId/commands` | Host transport/settings commands; membership/host/revision checked atomically |
| `POST /api/v1/rooms/:roomId/presence` | Participant readiness, buffering, observed position, heartbeat; never authoritative transport |
| `POST /api/v1/rooms/:roomId/leave` | Idempotent participant departure; server derives participant binding |
| `POST /api/v1/rooms/:roomId/invitations` | Host rotates/revokes invite; old credentials stop joining |
| `GET /api/v1/clock` | Authenticated, uncached server process clock sample and epoch |

Use high-entropy, expiring invite secrets. Do not put credentials in logged URL query strings. Browser invite link may carry the secret in a fragment, redeem it in a POST after login, then clear it from history; ensure the login flow does not lose or leak it. A TV-friendly short code needs a separate bounded, rate-limited redemption design; it does not replace the high-entropy secret. Never expose room metadata to anonymous invite probes. Set `Cache-Control: private, no-store`, avoid referrer leakage, and redact codes/secrets in logs.

Create/join/invite-rotation are retryable mutations too. Require a `requestId`, current process `epoch` and a server-clock `expiresAtMs` at most 60 s ahead (sample the clock after authentication). Cache the payload digest and result by authenticated identity/device/request ID through that expiry; reject expired requests and reject admission rather than evict unexpired deduplication entries at capacity. Reuse returns the same result; a changed body under the same ID is a conflict. Join retries recover the same membership, not another participant slot. Room commands use their separate sequence/idempotency rules below. After a lost response, retry the identical request within its window or query current membership; never blindly generate another create operation.

### Logical snapshot

```ts
type RoomSnapshot = {
  protocolVersion: 1;
  roomId: string;
  epoch: string;                  // changes on coordinator process restart
  revision: number;               // accepted control-state revision, not heartbeat count
  presenceRevision: number;       // roster/presence ordering, independent of control revision
  mediaGeneration: number;        // changes when content/edition/timeline changes
  preparationGeneration: number;  // changes when readiness barrier/seek target is replaced
  serverNowMs: number;            // server monotonic clock, only valid within epoch
  hostParticipantId: string | null;
  phase: 'lobby' | 'preparing' | 'paused' | 'playing' | 'ended';
  reason: string | null;          // bounded enum in implementation
  resumeAfterPrepare: boolean;    // true only for accepted play/playing-seek/next intent
  nextCountdown: { deadlineMs: number } | null; // target identity remains private until authorized
  media: { serverMachineId: string; ratingKey: string; mediaId: string; partId: string };
  durationMs: number;
  anchor: { positionMs: number; effectiveAtMs: number; rate: 1 };
  participants: Array<{
    participantId: string;
    displayName: string;
    connected: boolean;
    ready: boolean;
    buffering: boolean;
    blocking: boolean;
  }>;
};
```

Create/join and authenticated membership recovery return `{snapshot, membership: {participantId, membershipVersion, nextCommandSequence, nextPresenceSequence}}`. Membership is bound to the authenticated user+device/player. A reconnect on the same valid membership retains its version and counters and recovers both next sequences from the server; never assume client memory survived a reload. An explicit replacement invalidates it and issues a higher version. Room commands and presence contain that version; old requests are rejected. The server keeps a deterministic join ordinal (participant ID breaks ties). The version is not a credential. Room GET/events derive the caller from authentication and membership, not a client-supplied actor claim. Do not include email addresses, Plex tokens, device credentials, or private network addresses. Bound names/counts/payload sizes and treat names as text, not HTML.

Initial policy is one active room player per authenticated device context in a room; distinct devices may share a Plex account. Browser tabs sharing the same device cookie must explicitly take over the same membership or reuse one active player, not silently act as independent hosts. Bind web device identity server-side and invalidate prior connection/player generation on takeover. Recover membership and counters before opening a replacement stream; ensure old requests/cleanup cannot replace or stop the new player.

Presence contains `epoch`, `membershipVersion`, `mediaGeneration`, `preparationGeneration`, monotonic `presenceSequence`, owned `playbackSessionId`, observed absolute `positionMs`, `ready`, `buffering`, and a bounded error enum. Ignore older/equal sequence reports; readiness additionally requires current preparation generation and the participant's current playback session. A participant registers a replacement owned playback session before reporting it ready; callbacks from the prior session cannot restore readiness. Bind that registration through the existing playback prepare response or a validated presence transition, not a caller-chosen arbitrary UUID. Global seek resets the preparation generation and affected readiness; a local quality replacement resets only that member until a group barrier actually changes.

SSE `id` can be `epoch:revision` for control snapshots. Presence can update without increasing control revision; use a separate monotonic `presenceRevision` in the finalized envelope, and never discard a presence update solely because control revision is unchanged. One serialized publisher generates each envelope with both counters. A reconnect always receives a complete latest snapshot, even if `Last-Event-ID` was supplied. Replaying every historical event is unnecessary. Do not use one counter both for frequent heartbeats and optimistic concurrency of host commands.

Commands contain `commandId` (UUID), `commandSequence`, `membershipVersion`, `epoch`, `mediaGeneration`, `expectedRevision`, and a bounded type-specific payload. Types include play, pause, seek, select-next, cancel-next, transfer-host, remove-participant, end, and room-policy changes. Seek carries an absolute `positionMs`. `select-next` resolves the next episode server-side from the current media; no arbitrary URI is accepted. An arbitrary episode picker in room mode requires an explicit separately validated `select-media` command or is disabled with guidance to create a new room. `cancel-next` clears the room countdown for the current generation. The server derives actor identity. Serialize mutations per room, check authorization and revision within that serialization, and increment revision exactly once per accepted change.

Keep a bounded idempotency result cache scoped to room+actor+command ID. A duplicate with identical payload returns the same result; the same ID with different payload is rejected. Look up an already accepted duplicate before rejecting its now-stale expected revision, but never before authenticating/authorizing the caller. Also retain the membership's highest accepted command sequence. An old sequence whose cached result has expired returns `409 command_result_expired`; it must never execute again. Clients serialize their commands and issue increasing sequences; a conflict requires a fresh action/sequence. Unaccepted stale commands return 409 and the current authorized snapshot. Do not replay offline play/seek commands after reconnect.

Use 400 invalid input, 401 unauthenticated, 403 unauthorized, 404 inaccessible/not found, 409 stale/wrong phase, 410 known expired membership/room where disclosure is safe, 422 unsupported media/negotiation, 429 limit, and 503 dependency/coordinator unavailable. Include stable machine error codes and a safe user message, never raw upstream credentials. Rate-limit presence and commands separately.

### Clock and synchronization rules

- Use a process monotonic clock and random epoch; wall-clock timestamps are for logs/expiry displays only. Return epoch in clock samples and room snapshots.
- The clock response contains `epoch`, `receivedAtMs` (`s1`) and `sentAtMs` (`s2`). Record client monotonic send `c0` and receive `c3`. Estimate server-minus-client offset as `((s1-c0)+(s2-c3))/2` and network RTT as `(c3-c0)-(s2-s1)`. Reject implausible samples. This assumes roughly symmetric delay and is an estimate, not exact time. Gather several samples, prefer low RTT, resample after reconnect/resume, and retain RTT/uncertainty.
- For playing state, `targetMs = clamp(anchor.positionMs + max(0, estimatedServerNowMs - anchor.effectiveAtMs), 0, durationMs)`. For all paused/preparing/lobby states target is `anchor.positionMs`. Before a future `effectiveAtMs`, prepare and stay paused, then start. The `max` does not by itself authorize early playback.
- Host play schedules a near-future anchor after required participants are ready. Late delivery seeks to the current target; it does not rewind everyone to the original anchor. Seek while playing enters preparing with `resumeAfterPrepare=true`, then automatically schedules the already-requested continuation once ready; seek while paused sets it false and stays paused after preparation. A newer explicit pause clears this intent. Ordinary buffering/host-loss pause always clears it and needs a fresh host Play.
- For every group pause, evaluate the current authoritative target at acceptance time and freeze that position; do not reuse the old playing anchor position, which would rewind the room.
- Use small bounded rate adjustments only when reliable for that device/output. Seek large errors; avoid rate changes when paused, buffering, seeking, unready, or incompatible with passthrough. Restore rate 1 on pause, room exit, stream replacement, and errors. If rates are unsuitable, use a documented seek-only tolerance.
- Start with named, tunable policy constants: 250 ms deadband, 1,500 ms hard-seek threshold, rate range 0.97–1.03, 1,000 ms start lead, 2 s observations, 5 s presence heartbeat, 15 s stale presence. These are proposed tuning values, not researched guarantees. Validate and adjust from measurements; hardware/network jitter may require larger lead or wider tolerances.
- Server desired state, media events, and user intents are separate. Applying a received snapshot cannot generate another transport command. Every keyboard, native media-session, skip, next, seek, and visible-control path uses the same permission/intent gate.

### Deterministic room policies

Initial policy: host controls shared transport; others control their local volume, tracks, and quality and can leave. UI explains host-only controls. Volume and in-player track changes never cause a global pause. For a user-requested local quality/track source replacement, first mark that participant temporarily nonblocking and unready through an acknowledged authenticated presence transition, then replace the source. The room continues; that member catches up and becomes blocking after proven readiness. If the membership itself already caused a global buffering pause, a replacement cannot undo that pause or auto-resume. Unexpected buffering of a currently blocking member still follows the group-pause policy below. This distinguishes intentional personal reconfiguration from a synchronization failure.

Creation opens a lobby. Start requires host readiness and all currently blocking participants ready. A new participant joining an already playing room prepares locally as nonblocking and joins at current target; joining must not pause an existing room. A current blocking participant that buffers triggers one authoritative group pause with a reason. Once ready, resume requires the host's explicit Play; a stale ready callback cannot resume a manually paused room. After a proposed 30 s blocker timeout, make that participant nonblocking, notify the host, and allow remaining ready viewers to continue. Slow clients can catch up later; do not loop endless global pause/resume cycles.

Before publishing a next-item snapshot, authorize the host and each member against that exact next item. If host access fails, stay on the old item paused with a safe error. Remove members without next-item access **before** publishing new protected identity/duration/metadata. Send them only a terminal access-denied envelope containing no next-item details and close their subscriptions; they stop room playback and cannot fetch subsequent snapshots. The shared countdown exposes a deadline, not the next title/rating key/art. Do not retain denied members in an unfiltered broadcast. Recheck access on later joins and keep authorization checks generation-safe.

On host disconnection, pause and allow a proposed 30 s reconnect grace starting at the server's disconnection-detection time (after 15 s of stale authenticated presence), not at client-reported time. After grace, transfer to the connected ready participant with lowest server join ordinal (participant ID tie-break), or end if none. Explicit host Leave performs that transfer immediately. Host End ends for everyone. Transfer increments control revision and invalidates in-flight commands from the former host. Do not tie host identity to display name or Plex server owner status.

Client loss of fresh coordinator state must pause locally after a bounded staleness threshold, show reconnecting, and disable shared commands. On coordinator restart, expire rooms and show an ended/recreate state; do not reconstruct playback from stale client commands. Room state can remain memory-only initially. Bound rooms/members/queues/listeners and expiry; reject capacity exhaustion rather than silently evicting an active room. Proxy streaming timeouts and deployment restart behavior must be documented.

Use a named SSE `heartbeat` event with epoch/server time at most every 5 s, or authenticated presence-response acknowledgements, to prove coordinator liveness; comment pings alone are invisible to browser JavaScript. Proposed client stale threshold is 15 s without a valid observable acknowledgement. A transport keepalive never substitutes for authorization revalidation. Define event names `snapshot`, `heartbeat`, and `ended` in fixtures. Normal `ended` carries a final authorized snapshot; access-denied/removal uses a minimal terminal envelope `{protocolVersion, roomId, epoch, reason}` without protected media data. Register subscriptions and initial snapshots atomically and clean them up on cancellation/removal.

## Acceptance and evidence convention

Use stable IDs from track matrices. For each record: ID, commit SHA, command or reproduction steps, date, device/browser/OS, Plex version, redacted media format, expected, observed, artifact path, and status (`not-run`, `pass`, `fail`, `blocked`). Never use “pass” for unrun hardware checks. Proposed performance budgets are acceptance targets, not current measurements.

Backend gates: `bun install --frozen-lockfile`, `just check`, `just build`, `git diff --check`; inspect `justfile` and CI before use. Do not overwrite lockfiles using a second package manager. Run each development server with unique port and unique `DATA_PATH`; use normal setup/sign-in. Do not copy production tokens, cookie jars, or active data directories between worktrees. Real playback changes watch history; use designated test accounts/media and preserve pre-test progress when appropriate.

No deployment, external invitation/message, merge to main, store publication, production/release signing-key creation or use, paid service activation, or production migration follows automatically from this handoff. Normal disposable Android debug signing used by local builds is allowed. Prepare reviewable artifacts; follow the user's actual authorization at execution time. This is not a reason to stop ordinary local implementation or tests.

## Research boundaries

The design is an original proposal informed by the repository and these primary sources, checked 2026-09-27:

- [WHATWG server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html): streaming/reconnection semantics; not a room authorization system.
- [OAuth device authorization grant, RFC 8628](https://www.rfc-editor.org/rfc/rfc8628): device-code security and polling model; do not claim Plex exposes this grant merely because Watchtower borrows the pairing pattern.
- [Android TV playback](https://developer.android.com/training/tv/playback): native media session and TV playback integration.
- [ExoPlayer formats](https://developer.android.com/media/media3/exoplayer/supported-formats): distinguish containers, codecs, tracks, and device-dependent support.
- [Plex remote playback requirements](https://support.plex.tv/articles/requirements-for-remote-playback-of-personal-media/): upstream access conditions can change; do not promise Watchtower bypasses them or infer third-party enforcement from the network topology.

Recheck volatile library versions, store rules, and Plex behavior during implementation. Undocumented upstream endpoint behavior requires a narrow authenticated spike with sanitized fixtures; an inferred API must not be presented as verified.
