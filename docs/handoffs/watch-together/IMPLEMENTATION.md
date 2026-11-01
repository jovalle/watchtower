# Watch Together: implementation and acceptance handoff

Prepared 2026-09-27. Branch `codex/watch-together`; base `8578769`. Workspace `/Users/jay/.codex/worktrees/watch-together/watchtower`.

**Status: research and specification only.** No room code, integration test, deployment, or synchronization measurement has been produced in this task. Read [the shared contract](../shared-contract.md) first; it takes precedence over exploratory alternatives in [research notes](RESEARCH.md). [Repository audit](../repository-audit.md) records source evidence. [Agent prompt](AGENT-PROMPT.md) is the copyable execution instruction.

## Outcome

Two or more people watch the same accessible Plex movie or episode through Watchtower, with synchronized playback and predictable recovery. Watchtower owns coordination. Plex remains the authenticated media source and watch-history destination. Android TV uses the same room server and wire contract as the browser.

Support the same configured server, item, edition, and content timeline initially. No guest bypass of Plex login, no host stream redistribution, no dependency on Plex's discontinued synchronization feature. Different viewers may choose different local quality/audio/subtitles. Unsupported multipart/edition alignment is an explicit limitation, not an approximate title match.

## Required feature checklist

All WT rows below are required for the first complete release; phases only determine order. Each needs a link to test or recorded live evidence in `docs/handoffs/watch-together/ACCEPTANCE.md` created by the implementation agent.

| ID | Feature | Observable acceptance |
| --- | --- | --- |
| WT-01 | Create from playable movie/episode detail | Authorized user creates one room with exact edition identity; duplicate submission cannot create accidental repeated rooms |
| WT-02 | Invite/revoke | Shareable expiring invitation; host rotation prevents future use of old invite; no token/metadata leakage |
| WT-03 | Join and access check | Login preserved through invitation flow; every participant independently authorized for item; denial is actionable |
| WT-04 | Lobby | Title, host, members, readiness, preparation error, leave; loading is not mislabeled Ready |
| WT-05 | Coordinated start | Host starts after blocking members are ready; no early `canplay` autoplay; late command uses current anchor |
| WT-06 | Play/pause/seek | Buttons, click, keyboard, slider and platform controls obey host permission and one serialized intent path |
| WT-07 | Drift control | Absolute-content-time reconciliation with bounded corrections, clock uncertainty, rate reset, no command feedback |
| WT-08 | Late join | Viewer prepares locally, catches up to current position, does not rewind/pause existing viewers merely by joining |
| WT-09 | Buffering | Status identifies blocker; authoritative pause once; bounded blocker timeout; host explicitly resumes |
| WT-10 | Reconnect | Temporary network loss shows reconnecting and pauses after staleness limit; full snapshot recovery without replaying obsolete seeks |
| WT-11 | Host lifecycle | Transient disconnect grace, deterministic transfer, explicit transfer/leave/end; former host cannot continue controlling |
| WT-12 | Member management | Host removes member; events/commands denied immediately; invite revocation and member removal are separate operations |
| WT-13 | Local controls | Volume/mute/audio/subtitles/quality remain personal; source replacement preserves room and current target |
| WT-14 | Shared skips | Host intro/credits actions become room seeks; others do not auto-skip independently; missing markers mean no guessed skip |
| WT-15 | Shared next episode | One room countdown/advance with cancel; exact next media authorization for every viewer; no independent autoplay |
| WT-16 | Progress isolation | Each device reports actual observed progress using owned playback session and ordered sequence; no host progress fan-out |
| WT-17 | Leave/continue solo | Explicit Leave cleans membership and player; optional Continue Solo resumes actual local position only on explicit action |
| WT-18 | Room end/expiry | All clients stop room mode visibly; stale rooms/epochs cannot be resurrected by reconnect |
| WT-19 | Accessible responsive UI | Keyboard, touch, focus return, labels and concise live status; captions unobstructed |
| WT-20 | Production streaming | Authenticated SSE through real ingress without buffering; bounded queues/timers/listeners and cleanup |
| WT-21 | Diagnostics | Safe IDs, state/revision, drift/RTT/seek/reconnect counters; secrets and unnecessary private titles excluded |
| WT-22 | Native interoperability | Browser↔TV and TV↔TV share contract and roles, including MediaSession commands; blocked until TV integration exists |

Not included in this release: chat/voice/video calls, cross-server or different-cut matching, synchronized commercial catalogs, guaranteed frame accuracy, durable rooms across restart, multi-replica coordination, remote control of stock Plex clients, or synchronized casting. Record these boundaries in user docs. Do not add those systems speculatively.

## Repository reading order and edit plan

Read the complete touched functions and all callers before editing:

1. `app/routes/app.watch.$ratingKey.tsx`: loader/props and `key={streamUrl}` remount boundary.
2. `app/components/player/VideoPlayer.tsx`: initial `canplay`, play/pause/seek, navigation/reload, all key handlers, tracks, markers, episode controls, `pagehide`, timeline, stop/ping and cleanup. Use `rg` for every referenced handler and navigation call.
3. `app/lib/plex/client.server.ts`, `playback-session.server.ts`, HLS/direct proxies and timeline route: session ownership, generation, absolute timeline, upstream conversion.
4. `app/lib/auth/*`, `app/routes/app.tsx`: account/server checks and resource-route gap.
5. Existing vote SSE as a framing example only; settings storage and UI components for reusable patterns.
6. Existing tests listed in the repository audit; historical evaluation findings must be compared with current source.

Likely additions (names are proposals): `app/lib/rooms/types.ts`, a pure transition/synchronization module, `app/lib/rooms/service.server.ts`, room resource routes, a route-level room hook/controller, and a small room panel/lobby. Do not create all these files automatically if fewer suffice. Put HTTP/authorization at the boundary and deterministic transitions in testable functions. Reuse current testing/UI packages.

The room controller must outlive player-source replacement. Prefer a route parent or stable route-level controller passing a narrow adapter into `VideoPlayer`. Avoid moving the whole 1,000+ line player into a new framework. The adapter needs observed position/readiness, absolute seek, desired play state, local error reporting, and a permission-aware intent callback. Room membership is never a Plex transcode session UUID.

## Product and state-machine decisions

Use [shared-contract.md](../shared-contract.md) for canonical API fields, clocks, host and buffering policy. Before code, finalize the runtime schema and JSON examples for each transition. The minimal transition table:

| Input | Precondition | Result |
| --- | --- | --- |
| Create | Authenticated, accessible supported media | Lobby with creator host; paused at proposed start position |
| Ready | Participant/session/media generation match; seek settled and usable buffered data | Update readiness; no implicit playback |
| Host Play | Current host/revision and all blockers ready | Scheduled playing anchor; cancel obsolete scheduled actions |
| Host Pause | Current host/revision | Anchor current authoritative position and pause |
| Host Seek | Valid target within duration; current generation | New preparation generation; preserve prior play intent; wait for ready before scheduled resume if previously playing |
| Blocking buffer | Valid recent report from active blocker | Anchor/pause once with buffering reason; later Ready cannot override a manual pause |
| Join during play | Valid invitation and media access | Nonblocking preparation, then catch-up; no global rewind |
| Host disappears | Presence lease stale | Group pause, grace timer; transfer after grace or end if no eligible participant |
| Explicit host Leave | Current host | Immediate deterministic transfer or end; no unnecessary grace |
| End | Host | Terminal ended state; no queued command resurrection |
| Next selection | Host and valid next item | New media generation, invalidate old readiness/reports, authorize each participant, prepare then explicit/scheduled room start |

Increment a separate preparation generation for a seek/stream-target barrier even when media identity is unchanged. Every Ready/buffering report includes the generation it observed; stale `seeked`/ready cannot release the new barrier. Finalize the exact field in the shared schema before adapters are written.

For next-episode behavior, store countdown deadline/cancellation in room state; the host's preference initializes room policy, then the visible room policy governs. A cancelled countdown stays cancelled for that generation. The countdown reveals no next-item identity before authorization. If the host lacks next-item access, remain paused on the current item. Remove any other member lacking access before broadcasting the new item; send only a safe terminal denial, stop that member's room playback, and close its stream. Do not retain it on an unfiltered snapshot subscription or substitute another title. Guard a pending authorization response against a subsequent media change/removal.

Creation start-position UI can offer host resume or beginning; once selected, the room anchor overrides every member's personal resume. Room reentry uses room truth. Audio/subtitle/quality choices do not become shared control commands. Explicitly document same-account preference side effects inherited from Plex.

## Implementation phases with exit gates

### Phase 0: establish baseline and ownership

- Confirm workspace and branch, inspect applicable `AGENTS.md`, status and worktree attachments. Do not create extra chats/worktrees automatically.
- Run dependency installation and existing checks using the repository's Bun/just workflow. Record failures before changes; fix task-relevant blockers without hiding unrelated failures.
- Agree shared boundaries with Android lead through authorized coordination or a written dependency note. Record exact commits exchanged; if the other agent is unavailable, proceed with fixture-defined boundaries and mark integration pending.
- Identify designated test media/accounts before live progress-changing validation. Do not reuse a stale permission from historical docs.

Exit: baseline report, file ownership, definitive initial schema fixtures, and no ambiguity over milliseconds/identity.

### Phase 1: contract and reducer

- Add bounded runtime validation and fixtures for create/join, snapshot, commands, presence, clock, errors and terminal states.
- Implement deterministic transitions with injectable monotonic clock. Keep network access outside reducer; apply completed authorization results only after rechecking generation/actor under room serialization.
- Define room admission and cleanup limits. Suggested initial caps: 8 participants, 100 active rooms, 24-hour room lifetime, 16 KiB command bodies, 256 retained command results per room, 30-minute empty-room cleanup. These are tunable policies; command retry lifetime must not exceed retained deduplication guarantee. Reject expired command reuse rather than executing it anew.
- Add reducer tests for every state transition and race, including revision/presence separation, stale readiness generation, host transfer and duplicate command payload mismatch.

Exit: deterministic unit tests prove invariants before media wiring.

### Phase 2: authenticated service and transport

- Implement authoritative single-process rooms, invitation redemption, membership/device binding, permission checks and rate limits.
- Register event listener and initial snapshot atomically; publish immediately after accepted changes. Never poll JSON files for timing-critical room state.
- Implement SSE cancel/abort/close cleanup, observable named heartbeat events (optional comment keepalives are not liveness evidence to JavaScript), latest-state coalescing or bounded disconnect for slow clients. Ensure production build and Vite dev runtime each use the intended singleton; hot reload must not leave orphan timers.
- Enforce per-request authorization and bounded revalidation for long-lived streams, with explicit removal/revoke notifications. Scope command idempotency to authenticated actor, room and payload.
- Test GET has no side effects, CSRF/body size limits, invalid numbers/strings/IDs, removed membership, expired invites and proxy behavior.

Exit: two authenticated test clients can create/join/control a fake room; unauthorized clients cannot observe it.

### Phase 3: room UI and player integration

- Add Create/Join/Lobby/Room/End flows, copy invitation, errors, role display, and focus behavior.
- Integrate one intent gate across every player path; implement remote state reconciliation without media-event echoes. Scheduled starts must be cancellable by newer state.
- Disable local automatic start/skip/next in room mode. Keep solo behavior unchanged and regression-covered.
- Preserve room query/context across quality/audio/retry/navigation remounts and recompute latest anchor after readiness.
- Normalize content time for each playback method. Do not invent an offset fix before measuring real HLS timestamps.

Exit: browser↔browser scenarios run with independent streams; existing player regressions pass.

### Phase 4: fault handling and shared episode flow

- Implement late join, buffer pause, blocker timeout, host reconnect/transfer, explicit solo continuation, room expiry and coordinator restart.
- Add next-episode selection/countdown/cancel and access-denied member behavior.
- Test stale async results, repeated connection cycling, auth change during stream replacement, and simultaneous same-account devices.
- Add diagnostics and reversible enable/disable rollout control using an existing configuration mechanism if suitable. Do not add a configuration framework.

Exit: all WT rows except cross-TV/live hardware gates have evidence.

### Phase 5: native integration and release readiness

- Consume reviewed device-auth/playback foundation from Android track; do not rewrite its principal/credentials layer.
- Run golden fixtures through TypeScript and Kotlin clients, then real web↔TV and TV↔TV journeys.
- Load-test target room/member caps through actual ingress, measure synchronization, and document supported browser/device/pipeline combinations.
- Complete operations, troubleshooting, acceptance ledger and final gap report. No release claim while critical security or timing gates fail.

## Required test scenarios

Use Vitest/fake clocks for logic and Testing Library for player/UI boundaries. Add browser automation only as needed for actual multi-client journeys; mocks alone do not prove video synchronization.

| ID | Check | Required evidence |
| --- | --- | --- |
| WTT-01 | Same command retry, response lost, same ID/different body, stale revision, removed actor | Exactly one transition; no stale replay |
| WTT-02 | Two host actions race with authorization/next-item request | Serialized valid result; slow response cannot overwrite new state |
| WTT-03 | Presence updates at same control revision | UI updates presence without invalidating valid host command |
| WTT-04 | Missed SSE event, reconnect, old epoch, old media/preparation generation | Complete snapshot recovery; no obsolete scheduled start |
| WTT-05 | Forged member/host/device/media IDs; restricted Plex user | No metadata, stream, or controls obtained |
| WTT-06 | Cookie CSRF, token in URL/log, invalid body/NaN/huge payload, invite guessing | Rejected and safely logged; no credential artifacts |
| WTT-07 | Nonzero resume and seek beyond buffer, each pipeline | Canonical position and timeline reports match known video timestamps |
| WTT-08 | Remote pause/play/seek emits native media events | No echo command or correction storm |
| WTT-09 | Paused room reload/canplay/autoplay denied | Stays paused or shows blocked readiness; never claims playing falsely |
| WTT-10 | Source replacement, local tracks and quality | Same room/member, new owned stream, old cleanup cannot stop new |
| WTT-11 | Host disconnect/rejoin before and after grace; explicit leave/end | Exact policy and one host, no split authority |
| WTT-12 | Multiple blockers, slow member timeout, late join | Bounded wait; explicit resume; nonblocking catch-up |
| WTT-13 | Next countdown cancelled, episode lacks permission, marker missing | No unauthorized/duplicate next or guessed skip |
| WTT-14 | Same Plex account on two devices; different accounts | No session termination collision or cross-user progress writes |
| WTT-15 | Logout/revoke/configured server change while SSE open | Membership and resource access invalidated within documented bound |
| WTT-16 | Slow SSE consumer, repeated join/leave, cap exhaustion, shutdown | Bounded resources, no live-room silent eviction, cleanup counts recover |
| WTT-17 | Keyboard/mobile/focus/fullscreen/platform media controls | Complete journey, host policy enforced, usable local controls |
| WTT-18 | Browser↔TV↔TV with remote MediaSession and output changes | One shared protocol, measured skew, documented format limitations |

Live runs must include: two different authorized Plex accounts, a restricted/no-access account, direct file, direct-stream HLS, transcoded HLS, burned and sidecar subtitles, nonzero offset, long pause, 30-minute steady playback, simulated latency/loss and server restart. Use a visible timestamp test clip where possible; don't compare raw unsynchronized `Date.now()` logs to claim timing accuracy.

Proposed supported-environment budgets: p95 state-delivery latency ≤500 ms; p95 steady inter-client skew ≤500 ms after warm-up; return to ≤500 ms skew within 5 s of connection/stream readiness recovery. Record p50/p95/max and clock uncertainty. These are targets, not guarantees on every WAN or audio output. If a target fails, fix or narrow the published supported matrix with evidence; do not silently redefine the test.

## Operations and rollback instructions to produce

Document exact single-process deployment setting, reverse-proxy SSE buffering/compression/idle timeout requirements, maximum room/member/capacity choices, health checks and shutdown behavior. Keep state transient; process restart ends rooms, and clients must pause then recreate. Sticky routing is not a multi-process state solution.

Provide user-facing troubleshooting for login/access denial, blocked autoplay, Plex negotiation/transcoder overload, reconnect/expired room, incompatible media, and local time/quality mismatch. Distinguish Watchtower coordinator failure from Plex media failure. Metrics should identify failures without logging tokens or invite secrets.

Rollback: disable new rooms; notify/end existing rooms and pause clients; keep solo playback available; stop each departing participant's own transcode best-effort; retain personal history/settings; revert only feature code/config migrations with documented data compatibility. Do not erase unrelated settings or caches indiscriminately.

## Subagent execution plan

Use up to three subagents plus the parent when capacity allows, with explicit owned files:

1. **Room domain/API:** reducer, schema, authorization, SSE, server tests. No player edits.
2. **Web UI/player adapter:** lobby/panel and player intent/reconciliation. Consumes fixed schema, does not invent backend fields.
3. **Independent test/security reviewer:** adversarial cases, source-time analysis, leaked credentials, timer cleanup and progress regressions. Initially read-only; patches only in assigned test files or by agreement.

The parent owns contracts, shared-file coordination, integration, live evidence and final review. Subagents report exact changed files, tests actually run, assumptions and unresolved risks. Read their diffs; a reassuring summary is insufficient. Reassign reviewer after integration to inspect merged behavior, particularly async media-event echoes and authorization races.

## Done means

- All required WT and WTT rows mapped to implemented behavior and evidence; cross-TV gates cannot be marked complete against stubs.
- `just check`, `just build`, `git diff --check` pass on the integrated branch, or remaining external blockers are explicitly recorded without claiming completion.
- Shared schemas/fixtures match TV; source changes preserve solo playback and per-user rights/progress.
- Live timing/device/network evidence, supported limitations, operation/rollback guide and reviewable diff are available.
- Final developer response lists changes, checks, actual artifacts, and exact remaining gates; no blanket “no bugs” claim.
