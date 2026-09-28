# Watch Together acceptance record

Evidence for the WT (feature) and WTT (test-matrix) IDs defined in [IMPLEMENTATION.md](IMPLEMENTATION.md). Everything below ran locally against a synthetic Plex upstream with isolated `DATA_PATH` and ports; no production credentials, real Plex server, real accounts or personal watch history were used. Operational guidance is in [OPERATIONS.md](OPERATIONS.md); the cross-team contract is in [DEPENDENCIES.md](DEPENDENCIES.md).

**Summary:** WT: 16 Pass, 5 Partial, 1 Blocked. WTT: 14 Pass, 2 Partial, 2 Blocked. Every Partial or Blocked row names its live gate.

## Tested revision and environment

| Item | Value |
| --- | --- |
| Branch / code commit | `codex/watch-together` at `f0fd030` (harness at `e0fac75`; later commits change documentation only) |
| Host | macOS 27.0 (26A428), Apple silicon, single machine, loopback networking |
| Runtimes | Node v26.10.0, Bun 1.4.2, Vitest 4.0.16 |
| Browser | Google Chrome 154.0.8037.58, headless, driven by playwright-core 1.57.0; one browser context per viewer, 1280×720 |
| Plex | Synthetic upstream `docs/handoffs/watch-together/harness/fake-plex.mjs` (no Plex Media Server, so no Plex version). Users: Alice (owner, both episodes), Bob (both), Carol (none), Dave (episode 4242 only) |
| Media | ffmpeg 9.0.2 `testsrc` + sine, 130 s, H.264/AAC MP4 and 2 s HLS segments; intro marker 5–15 s, credits 118–130 s |

## Commands and results

| Command | Result |
| --- | --- |
| `just check` (lint, typecheck, full test suite) | Pass: 48 files, 399 tests |
| `just build` | Pass |
| `git diff --check 8578769..HEAD` | Pass (no whitespace errors) |
| `node docs/handoffs/watch-together/harness/setup.mjs` | Prepares `tmp/wt-harness/` (media, config, secret, signed synthetic cookies) |
| `node docs/handoffs/watch-together/harness/run.mjs protocol` | 23/23 checks passed (started 2026-09-28T04:04:41Z) |
| `node docs/handoffs/watch-together/harness/run.mjs browser` | 18/18 scenarios passed in two consecutive runs (04:05:04Z and 04:07:53Z); every command and presence response in both runs was `200` and accepted (11 commands, 115 presence reports per run) |

Artifacts (local, gitignored, synthetic data only; regenerate with the commands above): `tmp/wt-harness/artifacts/protocol-e2e-final.json`, `browser-e2e-run7.json`, `browser-e2e-run8.json` (scenarios, commands, presence reports, player console lines), `server.log`, `fake-plex.jsonl` (upstream requests, timeline reports, scrobbles). Metrics below give the two browser runs as "run 7 / run 8".

Legend: **H:browser** / **H:protocol** = harness scenario; **U:** = Vitest file under `test/`. **Pass** means the expected result was observed with automated evidence on this setup. **Partial** means part is evidenced and the rest is a live gate. **Blocked** cannot run here. Timing is same-host loopback and is not device, Wi-Fi or WAN evidence.

## Feature matrix (WT)

| ID | Status | Expected | Observed and evidence |
| --- | --- | --- | --- |
| WT-01 | Pass | One room per create with exact edition identity; no duplicates from repeated submission | H:browser: double-click on **Start from beginning** produced one room URL and a fragment invite. H:protocol: create `201` lobby envelope. U: `lib/rooms/coordinator.test.ts` (create dedupe, changed/expired retries), `lib/rooms-client.test.ts` (same request ID reuses the body), `routes/watch-room-identity.test.ts` (member plays only the room's media/part). |
| WT-02 | Pass | Expiring invite; rotation stops the old one; no leakage | H:protocol: old invite `404` after rotation; no invite, token or session secret in the 2.2 MB server log. H:browser: invite `…/join#i=<43 chars>`. U: coordinator rotate/revoke; `routes/rooms-security.test.ts`. |
| WT-03 | Partial | Login preserved through invite; each member authorized; actionable denial | H:protocol: Carol (no access) `403 media_forbidden` from her own Plex permissions; authorized join `200` without invite data. H:browser: fragment redeemed and removed from the URL and `sessionStorage`. U: `components/rooms/join-route.test.tsx` (stores fragment, strips history, routes login). **Live gate:** real Plex OAuth sign-in through `/join`. |
| WT-04 | Pass | Title, host, members, readiness; loading not shown as Ready | H:browser: no member Ready before the gesture; both Ready 212 / 215 ms after the taps. U: `components/rooms/RoomPanel.test.tsx` (loading, ready, buffering, reconnecting). |
| WT-05 | Pass | Start only after blockers ready; no early autoplay | H:browser: both paused before **Start**; both playing 1030 / 1031 ms after it (1000 ms start lead). U: `components/VideoPlayer.room.test.tsx` (no autoplay or personal resume on room `canplay`, no scheduled play before arming, late start seeks to the live target). |
| WT-06 | Pass | All transport inputs obey host permission through one intent path | H:browser: host Space paused both in 102 / 105 ms (0 ms paused skew); member Space, `k` and slider keys sent 0 commands, moved 0 s and explained host control; host slider seek reached the target on both in 311 / 310 ms, then resumed with p95 skew 23.4 / 0.3 ms. H:protocol: member command `403`. U: intent gate (click, Space, arrows, buttons, Media Session), seek-burst coalescing. |
| WT-07 | Partial | Bounded drift correction without feedback | H:browser, 60 samples over 30 s, both direct file: skew p50 0.1 / 0.1 ms, p95 0.1 / 0.2 ms, max 0.2 / 0.3 ms. With one HLS and one direct-file viewer: p95 21.8 / 30.0 ms. U: `lib/rooms-sync.test.ts`. **Live gate:** real devices and networks (see below). |
| WT-08 | Pass | Late joiner catches up without pausing others | H:browser: Dave joined mid-title; Alice and Bob never paused; Dave within 500 ms of the room 2 / 3 ms after his ready tap (skew −11 / −10 ms). Dave's first attempt reported `autoplay_blocked` as expected without a gesture. U: coordinator late joiners are nonblocking. |
| WT-09 | Pass | Blocker named; one authoritative pause; host resumes | H:browser: Alice throttled to 6 s per segment; room paused once 14.9 / 15.0 s later (buffer drained plus 1.5 s report delay); Bob saw "Buffering - blocking"; still paused 5 s after Alice was Ready; host resume restarted both. U: coordinator pause-once and per-blocker timeout (WTT-12), `VideoPlayer.room.test.tsx` paused-room buffering recovery. |
| WT-10 | Pass | Reconnecting state, local pause, snapshot recovery | H:browser: Bob offline → "Reconnecting" and paused after 106 / 4963 ms while Alice kept playing; online after 20 s → resynchronized 104 / 103 ms later (skew −1 / 0 ms). U: `lib/rooms-client.test.ts` (stale threshold, failed first contact retries, terminal statuses). |
| WT-11 | Pass | Grace, deterministic transfer, no split authority | H:browser: host offline → room paused 14.0 / 13.1 s later; Bob became host at 44.0 / 43.2 s (15 s stale + 30 s grace). H:protocol: non-host commands `403`. U: coordinator grace, returning host, explicit transfer, leave election. |
| WT-12 | Pass | Removal is immediate and separate from invite revocation | H:protocol: removal ends the member stream with a minimal `removed` envelope; removed member gets `403` and cannot rejoin with the old invite. U: coordinator bans, `lib/rooms/adversarial.test.ts` (stream terminated before later snapshots). |
| WT-13 | Pass | Personal quality/tracks; replacement keeps room and target | H:browser: Alice switched to 1080p (transcode, HLS): `room` kept, no personal `t`, Bob never paused, Alice playing again 106 / 107 ms later at the room position. U: replacement acknowledged before navigation; unacknowledged replacement restores readiness; `components/VideoPlayer.tracks.test.tsx`. Synthetic transcoder only (see WTT-07). |
| WT-14 | Pass | Host skip becomes one room seek; no independent auto-skip | H:browser: host **Skip Intro** visible 309 / 308 ms after entering the intro; exactly 1 seek command; members show no skip button. U: auto skip and auto next disabled in rooms; host shares Skip Intro. |
| WT-15 | Pass | One countdown and advance; every viewer authorized for the next item | H:browser: member saw "Next episode in" 307 / 305 ms after the host entered the credits, without the next title; Dave (no access to episode 2) received the access message at the advance (10.2 / 10.7 s) and never saw episode 2; Alice and Bob playing episode 2 1032 / 1143 ms after the advance (p95 skew 0.2 / 0.1 ms). U: coordinator removal before publishing, cancelled countdown stays cancelled, re-authorization of members joining during the check, slow authorization cannot overwrite newer seek/transfer/end. |
| WT-16 | Partial | Each device reports its own progress; no host fan-out | H:browser (`fake-plex.jsonl`): timeline reports Alice 29 / 29, Bob 23 / 23, Dave 10 / 10, each under its own token; 0 client IDs shared between users; 0 upstream requests with an unknown token apart from the pre-existing startup owner-token check (2). U: room scrobble only after continuous local playback crosses 90 %. **Live gate:** watch history on designated real Plex test accounts. |
| WT-17 | Pass | Leave cleans up; Continue solo uses the local position only when chosen | U: `components/rooms/useWatchRoom.test.tsx` (leave clears arming, terminal Continue solo navigates to the last local position without leaving), `routes/rooms-logout.test.ts`, coordinator idempotent leave. |
| WT-18 | Pass | All clients stop visibly; stale epochs cannot resurrect | H:browser: coordinator restart → Bob saw "The room is no longer available." with **Continue solo** and **Back**, player paused, 1.04 s after the restart. H:protocol: new epoch; old room `404`; stale-epoch presence `404` and create `409`. U: client epoch change ends the room. |
| WT-19 | Partial | Keyboard, touch, focus, labels, concise live status, captions clear | H:browser: every panel button has an accessible name; one polite live region. U: panel collapses while playing but keeps status, countdown and ready action visible; terminal focuses its message; takeover and terminal overlays are modal and keep Tab inside. **Live gate:** screen readers, touch devices, caption placement on real players. |
| WT-20 | Partial | Authenticated SSE through real ingress without buffering; bounded resources | H:protocol: `private, no-store, no-transform`; full snapshot 3 ms after connect despite a stale `Last-Event-ID`; heartbeat gaps 4508 / 4506 ms; command-to-peer delivery p50 3.0 ms, p95 3.9 ms (40 samples); burst rate-limited, not queued. U: backed-up consumers closed without evicting rooms. **Live gate:** production reverse proxy and TLS. |
| WT-21 | Pass | Safe diagnostics without secrets or unnecessary titles | H:protocol: log scan clean. U: diagnostics owner-only and free of names, titles, credentials and URLs; SSE and errors exclude cookies, tokens, invite secrets and Plex URLs. |
| WT-22 | Blocked | Browser ↔ TV and TV ↔ TV on one contract | No TV client in this branch. Next action: run once the Android client implements [DEPENDENCIES.md](DEPENDENCIES.md). |

## Test matrix (WTT)

| ID | Status | Observed and evidence |
| --- | --- | --- |
| WTT-01 | Pass | H:protocol: identical retry returns the cached result without a second transition; stale revision `409` with the current snapshot. U: client retries a lost response with the identical body; cached result is returned even after the room ended. |
| WTT-02 | Pass | U: `lib/rooms/adversarial.test.ts` (simultaneous host commands, slow next authorization vs. newer seek, transfer and end; no second advance in flight), coordinator re-authorization when the roster changes. |
| WTT-03 | Pass | U: joins and non-host leaves change only `presenceRevision`, so a pending host command stays valid; client accepts newer presence at the same control revision. |
| WTT-04 | Pass | H:protocol: full snapshot despite stale `Last-Event-ID`. U: epoch change ends the client; stale preparation or replaced sessions cannot release a barrier; outgoing media stays inert after a media change. |
| WTT-05 | Pass | H:protocol: cookie + bearer `401 identity_ambiguous` with no fallback; non-member room and SSE `404`; unowned `playbackSessionId` cannot claim readiness; restricted user `403`. U: `routes/rooms-security.test.ts`, device-scoped playback sessions. |
| WTT-06 | Pass | H:protocol: anonymous `401` JSON, cross-origin `403`, `text/plain` `415`, oversized `413`, log scan clean. U: `routes/rooms-http.test.ts` (method, origin, fetch metadata, size, JSON, unsafe numbers), invite guessing limits, parser rejections. |
| WTT-07 | Blocked | Real Plex offset and seek-beyond-buffer semantics are unverified: the synthetic transcoder serves the full playlist from 0 and Chrome 154 used native HLS. U covers the alignment rules (fresh transcode aligns in place; reload only after alignment or a room seek during the load; unbuffered room seeks reload). Next action: see live gates. |
| WTT-08 | Pass | U: remote play, pause and seek produce no echo commands; pending remote seek stays suppressed across revisions. H:browser: only host intents reached the server (11 commands in a full journey). |
| WTT-09 | Pass | U: no autoplay on room `canplay`; arming only after a successful gesture; refused starts report `autoplay_blocked`, interrupted starts do not. H:browser: late joiner reported `autoplay_blocked` and started after the tap. |
| WTT-10 | Pass | H:browser WT-13. U: replacement acknowledged before navigation; old cleanup cannot stop the new session; unacknowledged replacement restores presence. |
| WTT-11 | Pass | H:browser WT-11. U: returning host within grace keeps host; deterministic election after grace or explicit leave. |
| WTT-12 | Pass | H:browser WT-08 and WT-09. U: every unready blocker times out individually; late joiners are nonblocking. |
| WTT-13 | Pass | H:browser WT-15. U: cancelled countdown is not re-armed at media end; host without access pauses on the current item. Skip controls are driven only by Plex markers, so a missing marker shows no skip. |
| WTT-14 | Partial | U: two devices on one account are distinct participants; sessions scoped to another device cannot claim readiness. **Live gate:** real Plex, where one account has a single progress and track preference. |
| WTT-15 | Pass | U: logout closes that device's stream (`routes/rooms-logout.test.ts`); server change, identity revalidation failure and device logout close streams. |
| WTT-16 | Pass | H:protocol: burst rate-limited. U: backed-up consumer closed after 10 s, caps without evicting live rooms, counts return to baseline, bounded membership history (including new-device churn), one sweep timer. |
| WTT-17 | Partial | H:browser: desktop keyboard journey (Space, `k`, slider keys, buttons). U: Media Session handlers gated by host role; modal overlays. **Live gate:** mobile browsers, fullscreen and picture-in-picture, OS media keys. |
| WTT-18 | Blocked | Needs the TV client (see WT-22). |

## Defects found and fixed during acceptance

The browser journey initially passed 10 of 18 scenarios. Each failure below was reproduced, fixed with a regression test, and rerun.

| Symptom in the journey | Cause | Fix |
| --- | --- | --- |
| Quality menu unreachable | Room panel covered the player's settings menu | `fcc5ef0` |
| A transcode restarted about 40 times per second after a quality change | Reconciliation reloaded the fresh source to chase the moving room | `96a8269` |
| Room stayed paused after buffering ended | Paused media fires no `playing`; recovery was never reported | `96a8269` |
| Host's room ended on "no next episode" | Any `404` command response was treated as terminal | `b676c30` |
| Terminal screen showed an unrelated old notice | Transient message reused as the terminal reason | `b676c30` |
| Members paused and reconnected during rapid host seeks | Presence throttling triggered reconnects; key bursts flooded commands | `9b60433`, `f3648a5` |
| Host occasionally stuck "Loading" on the next episode (2 of 5 runs) | Outgoing player reloaded the old title during the advance, and an interrupted `play()` disarmed the member | `f3648a5`, `dd0758a` |
| Journey failed at 03:40–03:50Z | Another local harness used the synthetic Plex port | `e0fac75` |

An independent review then reported a join race during next-item authorization, loss of exact media identity on reloads and revalidation, a client stuck "connecting" after a failed first request, stale replacement presence after an unacknowledged replacement, a coalesced seek crossing a media change, unbounded membership history, loose snapshot validation, retries losing cached results, and non-modal overlays. All were fixed with tests in `b04b429`, `5063680`, `8211386` and `63bdfef`. Verification of the solo player then found that solo sessions had moved to a per-device scope; `f0fd030` restores the original scope.

## Known limitations

- Arrow keys only seek when the progress slider has focus; elsewhere they move focus (pre-existing remote-navigation behavior).
- Chrome 154 plays HLS natively, so this run did not exercise the hls.js path end to end; unit tests cover it.
- Loopback timing understates real-world skew and latency.
- No scrobble occurred in the final runs because no viewer crossed 90 % in one continuous stretch; the rule is unit-tested.

## Remaining live gates

Each needs resources that must not be improvised here (designated accounts, devices or infrastructure). Record results in this file with the same columns.

1. **Real Plex, designated test accounts** (WT-03, WT-13, WT-16, WTT-07, WTT-14): a test Plex server with an owner, a friend with the library shared, a managed/restricted user and an account without access. Sign in through `/join` with OAuth; confirm denial messages; after watching, check that watch history and progress land only on each viewer's own account; start at a nonzero position and seek beyond the buffer on direct play, direct stream and transcode, comparing the on-screen timecode with the room position.
2. **Production ingress** (WT-20): deploy to staging behind the real reverse proxy with TLS; confirm 5 s heartbeats and no "Reconnecting" over at least 10 minutes; check SSE is not buffered or compressed ([OPERATIONS.md](OPERATIONS.md#reverse-proxy-requirements)).
3. **Devices and networks** (WT-07, WT-08, WT-10): two or more physical devices on different networks for a 30-minute session; measure skew from a shared on-screen timecode and record p50/p95.
4. **Accessibility and platforms** (WT-19, WTT-17): VoiceOver with Safari (macOS and iOS), TalkBack with Chrome on Android, keyboard only; fullscreen, picture-in-picture and OS media keys; confirm the panel never covers captions.
5. **Android TV** (WT-22, WTT-18): after the TV client implements the contract.
