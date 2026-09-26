# Watchtower: streaming replacement delivery plan

Status: implementation in progress as of 2026-09-26; automated checks pass, live acceptance remains open.
Audience: the next implementation agent and the maintainer reviewing delivery.
Scope: deliver all six priorities agreed in this conversation. This is a product delivery plan, not a claim of Netflix feature or device parity.

## Product contract

Make watching the default action. Keep library playback, discovering new titles, personal organization, and request management understandable as one product. Preserve the existing Plex, Seerr, Trakt, and IMDb integrations and the current visual language.

| Priority | Deliverable | Completion evidence |
| --- | --- | --- |
| Playback reliability | Fast startup, accurate cross-device resume, working tracks, safe next-episode transitions | Automated regressions plus measured, audible live playback on the supported matrix |
| Couch-friendly experience | Remote navigation, visible focus, large targets, TV playback/casting | Keyboard/remote walkthrough and at least one real TV/receiver playback session |
| One title, one destination | Shared detail page and availability-aware Play/Resume/Request actions | Same title resolves correctly from every entry point; collision and permissions tests |
| Personal Home | Continue Watching, new episodes, relevant recommendations | Per-user results, preference enforcement, useful empty/error states |
| Complete request journey | Request, approval, processing, availability, notification, playback | Full state transition and notification deduplication checks |
| Simpler navigation | Logo Home; Watch; Discover; My Stuff | Redirect, filtering, Back, mobile, and accessibility checks; no lost list data |

Do not mark a row complete with only a mock, screenshot, successful build, or an untested button. Missing credentials, devices, or service access remain explicit delivery blockers for the affected acceptance check; continue independent work.

## Working rules and existing evidence

- Start with `git status --short`, repository instructions, and the current code. This checkout contains substantial mixed, uncommitted work. Preserve it; do not reset, clean, stash wholesale, rewrite history, or stage everything. Make new commits only when requested or authorized in the implementation session, with clearly owned changes.
- Read [playback evaluation](playback-evaluation.md) for known failures, prior observations, and remaining device gaps. Reproduce each finding before treating it as current. Do not duplicate its incident history here.
- `.planning/STATE.md` describes an older milestone and is not proof of this roadmap's completion. Do not silently overwrite it or renumber its phases.
- Use [local development instructions](../README.md#local-development) and [justfile](../justfile). `just dev` runs Vite HMR; `just start` serves a built snapshot. Keep one hostname/port throughout OAuth testing.
- Existing settings and media state belong to real users. Preserve watch history, imported sources, playlists, and stored credentials. Never use bulk state resets as test setup. Live request, comment, and notification tests need an explicitly designated test account/title/recipient or a local fixture service.
- Reuse existing components, integration clients, and storage. Prefer native browser features. Add no generic playback framework, notification platform, recommendation service, or new dependency without a concrete gap in the existing stack.
- All user-specific loaders/actions independently authenticate. Use the user's authorized Plex server token and mapped Seerr identity. Test owner and shared-user accounts; owner success is not evidence of shared-user access.
- Secrets stay server-side. Redact URLs containing tokens, headers, cookies, local config contents, and personal account data in logs, screenshots, evidence, and documents.

## Phase 0 — Establish the baseline and supported target

1. Inventory existing behavior and tests against the six-row contract. Record present, broken, and missing behavior in this document's delivery ledger, with source paths.
2. Run `just check` and `just build`. Attribute failures to the baseline or new work; never silently suppress a failing check. Existing tests may emit a tsconfig warning from `local/flixor`; do not edit that reference checkout to make application checks green.
3. Establish a real authenticated evaluation session. Ask early for missing browser/device information only when it affects delivery; continue server and component work while waiting.
4. Proposed validation target: Chromium desktop, Safari desktop/iOS, and Waterfox for existing playback compatibility; keyboard-only interaction; and one user-selected TV/receiver route. Record actual OS/browser/device versions. Unsupported combinations must be described honestly, not presented as working.
5. Measure startup, seek latency, resume error, buffering, and next-episode transition with a named sample set. Reuse existing playback diagnostics, with token-free measurements. Treat the timing thresholds below as proposed local-network acceptance targets, not benchmark claims.

Exit: reproducible baseline, selected test media/accounts/devices, and a mapped list of implementation gaps. No placeholder claims of verification.

## Phase 1 — Make playback dependable

Primary code: `app/components/player/VideoPlayer.tsx`, `NextEpisodeCard.tsx`, `app/routes/app.watch.$ratingKey.tsx`, `api.plex.hls.$ratingKey.$.ts`, `api.plex.stream.$ratingKey.ts`, `api.plex.streams.ts`, `api.plex.timeline.ts`, `api.plex.scrobble.ts`, `app/lib/plex/client.server.ts`, `tracks.ts`, `app/lib/playback-caps.ts`, and `playback-prefs.ts`.

- Reproduce and fix outstanding findings from the playback evaluation at the shared boundary, after tracing every caller. Preserve negotiated stream identities, cleanup, keepalive, authenticated proxies, Range semantics, and cancellation.
- Distinguish explicit start-at-zero from absent resume position. Synchronize progress on pause, navigation, completion, and session teardown without regressing position due to stale responses.
- Confirm selected audio is audible and selected subtitles render. Exercise embedded, external text, and image/burned tracks where supported; handle unsupported formats explicitly. Preserve preferences at the correct user/title/language scope.
- Keep buffering and error UI actionable. Provide a bounded retry/restart path; never leave an indefinite spinner or replay a failed mutation as success.
- Make next-episode selection, countdown cancellation, autoplay preference, and completion reporting reliable. Cancel old sessions and report completion exactly as intended when switching episodes.

Acceptance:

- Explicit `t=0`, pause/resume, backward/forward and unbuffered seeks, end-of-episode transitions, and recovery work. Browser Back returns to the previous library/search page with its filters.
- Independent users/streams cannot stop, read, or advance each other's sessions. Malformed inputs fail safely. Upstream errors remain observable and retryable where safe.
- At least 20 measured startup/seek samples per supported direct-play and transcode mode on the selected local-network setup. Proposed p95 targets: first moving frame within 3 seconds direct or 8 seconds transcode; seek recovery within 3 or 8 seconds respectively. Record misses and their causes; do not silently weaken the target.
- After confirmed progress persistence, another device resumes within 5 seconds of the saved position. Test a long pause, navigation away, an interrupted connection, and a 30-minute continuous session.
- Report requested versus actually delivered quality separately. Verify dimensions/codec where available and audible output directly.

## Phase 2 — Unify title identity and actions

Primary code: `app/routes/app.media.$type.$ratingKey.tsx`, `app.search.tsx`, `app.discover.tsx`, `app.watchlist.tsx`, `app.lists_.$type.$ratingKey.tsx`, `app.actor.$id.tsx`, `app/components/media/*`, `app/lib/search.ts`, `app/lib/plex/types.ts`, and Seerr/TMDB clients.

- Extend the existing detail experience rather than creating a competing Seerr detail UI. Keep playback URLs separate from browse/detail routes.
- Resolve titles using provider IDs plus media type: Plex identifiers, TMDB IDs, and existing GUID mappings. Movie and TV IDs can collide. Title/year matching may assist discovery but must not authorize Play on an uncertain match.
- Use one normalized detail/action decision across Home, Watch, Discover, search, My Stuff, actor pages, related titles, and request notifications. Support externally discovered titles with no Plex rating key.
- Primary actions: Resume when progress exists, Play when accessible and available, Request when requestable, and a clear status when pending/processing/blocked/declined/failed. Partial series availability must select an accessible episode and distinguish missing seasons. Preserve regular versus 4K status.
- Reuse request and quota enforcement; revalidate availability after mutations. Missing Seerr/TMDB must leave the playable library usable.

Acceptance: every entry point reaches the same title experience; remakes, movie/TV ID collisions, multiple library editions, unavailable titles, missing metadata, partial series, and shared-user restrictions produce correct actions. Old deep links still work. No Play button leads to an inaccessible item and no available title offers only an external metadata link.

## Phase 3 — Simplify navigation without losing anything

Final information architecture:

- Logo → Home (`/app`). Accessible name communicates Home.
- Watch → playable library; Movies and Series remain its tabs. Put library-only new/popular material here, as a clearly named section or tab.
- Discover → new/external titles, trending, and upcoming/requestable content. Honor the existing discovery-disabled preference.
- My Stuff → Watchlist and Lists tabs, with all current sources and operations intact.
- Profile menu → Requests, Issues, Settings, then logout. Keep equivalent mobile access.

Implementation:

- Consolidate `app.new.tsx` by auditing each feed: library content goes to Watch; external discovery goes to Discover. Remove duplicate rows and retire the top-level New & Popular link.
- Reuse `app.watchlist.tsx` and `app.lists.tsx` content under My Stuff rather than rebuilding their data paths. Decide canonical URLs once; preserve old bookmarks, detail URLs, filters, sorting, and source selections through redirects.
- Keep `app.watch.$ratingKey.tsx` playback separate from Movies/Series routes. Update playback-return recognition for any added Watch subroute; do not assume everything below `/app/watch/` is a player.
- Update desktop/mobile navigation, active states, page titles, headings, internal links, and focus restoration together.

Acceptance: old `/app/new`, `/app/watchlist`, `/app/lists`, `/app/movies`, `/app/tv`, and `/app/discover/{movies,series}` URLs land on equivalent content without loops or lost query state. Imported lists, source badges, and playlist operations remain available. No duplicated Home link or dead tab. Test browser Back and direct reloads.

## Phase 4 — Make Home personal and useful

Primary code: `app/routes/app._index.tsx`, `app/lib/settings/*`, `app/lib/watchlist/*`, Plex/TMDB/Trakt clients, and existing media row/billboard components.

- Order Home around Continue Watching, new unwatched episodes of followed/in-progress shows, then relevant recommendations and curated/recently added library content.
- Use existing per-user progress, watchlists, preferences, and ratings. Do not infer personal viewing behavior from the server owner's account or substitute global popularity while labeling it personalized.
- Begin with understandable recommendation rules using existing metadata: related to watched/liked titles, favorite genres, and unwatched availability. Deduplicate rows, handle cold start, and label recommendation reasons honestly.
- Respect discoveryDisabled and existing row preferences on the server as well as in rendering. Library-only mode must not fetch/show external discovery accidentally.
- Keep row failures isolated, reserve poster dimensions, and avoid a serial per-poster network waterfall. Measure before adding caching; any cache containing personal data must be scoped to the user/server identity.

Acceptance: two users with different state get appropriate independent rows. A new user sees a useful library fallback. Continue Watching and new episodes refresh after playback. Discovery-disabled, missing integrations, empty library, slow upstreams, and individual feed failures remain usable.

## Phase 5 — Complete requests and notifications

Primary code: `app/lib/integrations/seerr.server.ts`, `seerr-pages.server.ts`, `app/routes/api.seerr.ts`, `app.requests.tsx`, `app.issues.tsx`, `app.issues_.$id.tsx`, `app/components/media/RequestModal.tsx`, and the canonical title/action experience from Phase 2.

- Model the actual service states, including pending approval, approved/processing, partial availability, available, declined, failed, cancelled/deleted, and blocked. Distinguish request status from media status and regular from 4K.
- Preserve mapped-user permissions, quotas, ownership checks, actionable errors, and status refresh after request/cancel/report/comment/resolve operations.
- Implement persistent per-user in-app notifications for meaningful transitions, with read/unread state and a direct title/Play link when available. Existing ephemeral toast UI is not a durable notification inbox.
- Choose the simplest reliable update mechanism supported by the deployed Seerr version: bounded authenticated polling with deduplication, or an authenticated/idempotent webhook if justified. Document the freshness interval, restart behavior, and operational setup. Never embed a service API key in browser code.
- Detect partial availability without declaring an entire series complete. Match available media back to a Plex item the recipient can actually access.
- Verify API schema and implementation against the deployed Seerr version. The prior `createdBy` query failed validation; its removal is intentional. Listing and reading issues follow Seerr permissions; local mutations currently require ownership. Do not restore the invalid filter or silently broaden mutation rights.
- Do not add or send email/push/SMS by default. Those channels require explicit opt-in and a named test recipient; the required initial delivery is persistent in-app notification.

Acceptance: request → approval → processing → available → notification → correct Play/Resume destination works. Repeat events/polls and application restarts do not duplicate notifications. Different users do not see each other's private requests or notifications. Cancellation, denial, failure, partial series, 4K, lost upstream connectivity, and unimported Plex accounts are covered. Unsupported service features are disclosed, not simulated as successful.

## Phase 6 — Deliver the couch experience

Primary code: shared navigation, media rows/cards, title controls, dialogs, player controls, and any browser/device capability helpers.

- Audit the completed flows with keyboard and directional remote input. Establish predictable arrow/Enter/Back behavior, visible focus, scroll-into-view, sensible focus restoration, and no focus traps outside dialogs. Reuse DOM order and native scrolling before introducing a spatial-navigation library.
- All actions must work without hover. Make primary touch/remote targets at least 44×44 CSS pixels, respect reduced motion, preserve text contrast, and check at narrow/mobile and television viewing distances.
- Add feature-detected casting/remote playback for the selected supported browser/receiver path. Account for receiver reachability, authenticated stream URLs, codecs, subtitles, and progress reconciliation. Never expose the Plex token to a receiver through a public URL or weaken proxy authentication to make casting work.
- Distinguish browser fullscreen/PWA installation from actual TV playback. If native AirPlay/Remote Playback suffices, use it; if it cannot meet receiver authentication or codec requirements, document the evidence and implement the smallest working supported path. A cosmetic Cast button or unsupported-device message alone does not complete this priority.
- Preserve local playback when remote playback disconnects; make ownership and resume behavior clear. Prevent duplicate local/remote playback or stale progress writes.

Acceptance: remote-only browse → title → play → track selection → next episode → back is usable, with no hidden controls. Complete a real session on at least one agreed TV/receiver, including pause, seek, resume, disconnect, and audio/subtitle verification. Record the supported combination and remaining limitations. Lack of device access leaves this phase unverified, not complete.

## Phase 7 — Integration, evidence, and delivery

- Re-run `just check` and `just build`; verify route generation and old-URL redirects. Add focused tests at the real failure boundaries; avoid mock-only proof, fixed sleeps, or tests that merely restate implementation.
- Test the full journey with owner and shared-user accounts: logo Home → Watch → title → playback → resume elsewhere; Discover → request → status/notification → Play; My Stuff list persistence; report/read/update issue.
- Include desktop, narrow viewport, keyboard-only, the supported browser matrix, and the real receiver check. Capture sanitized screenshots and playback observations. Automated tests cannot prove audible output or device compatibility.
- Update README only for behavior that actually shipped. Add operational instructions for notifications, receiver limitations, configuration migrations, and rollback. Preserve existing data; migrations must be additive/idempotent or have a tested recovery path.
- Keep an evidence ledger below with date, revision/worktree state, command or manual procedure, result, environment, and artifact link. Record baseline warnings separately from new failures.
- Deliver a concise report: implemented behaviors, where to evaluate them with `just dev`, checks passed, unresolved blockers, and actual supported devices. Do not deploy, publish, send third-party messages, rewrite history, or create a separate task unless separately authorized.

## Delivery ledger

This ledger describes the uncommitted working tree based on `8544e95`, including pre-existing integration/navigation work. No commit or deployment was made. Tests exercise application code with fixture transports; they do not establish live service or device compatibility.

| Phase | Status | Evidence / blocker |
| --- | --- | --- |
| 0 Baseline | Checks complete; live setup open | Baseline `just check`: 135 tests / 21 files; `just build` passed. User selected casting plus desktop/mobile browsers but has not named a receiver or test titles. The evaluation browser remains signed out. |
| 1 Playback | Implemented regressions; live acceptance open | Explicit zero/invalid resume input; bounded HLS failures; redirected playlist rewriting and Range/416; authenticated session ownership; ordered progress and teardown position; retryable watched reports; autoplay preference. See `playback-inputs`, `playback-proxy`, `playback-timeline`, `VideoPlayer`, and tracks tests. No timing samples, audible checks, 30-minute session, or second-device resume measurements. |
| 2 Unified title | Implemented main routes; full entry-point audit open | Exact provider/type match with edition preference, external details on the existing route, shared-user fixture restrictions, request/4K/season availability, GUID-only watchlist playback matching. `title-identity`, `watchlist-identity`, and `request-availability` tests pass. IMDb-only items now resolve exact accessible IDs, then TMDB mappings, then an internal metadata fallback; missing metadata and partial-series playback need live checks. |
| 3 Navigation | Implemented; authenticated visual/Back checks open | Watch / Discover / My Stuff, New in library, query-preserving legacy redirects, URL-backed watchlist filters, preserved list-detail routes and active state. `navigation-redirects` and `playback-navigation` tests pass. Real imported lists, mobile navigation, and focus restoration remain to evaluate. |
| 4 Home | Implemented; live responsiveness checks open | Per-user in-progress/next-episode rows, related unwatched library titles with an honest reason, row deduplication, feed errors, refresh invalidation, user/server cache scope. `personal-home` exercises two users and discovery-disabled behavior. No measured upstream latency or authenticated empty/slow-service walkthrough. |
| 5 Requests | Implemented durable inbox; deployed schema/live journey open | Mapped status reads, regular/4K and season state, correct no-seasons response handling, per-user atomic inbox/read state, restart and repeated-poll deduplication, outage and confirmed-deletion tests. `request-notifications`, `seerr`, `seerr-permissions`, and `request-availability` pass. Polling limits and single-process requirement are documented in README. Deployed Seerr version and live request-to-play sequence are unverified. |
| 6 Couch | Native controls implemented; delivery incomplete | Native horizontal scrolling, focus rings, card key handling, modal mobile navigation, directional focus, larger player controls, browser receiver feature detection. Component checks pass. No real TV/receiver session, full remote-only journey, narrow-screen authenticated review, or focus-restoration acceptance. |
| 7 Delivery | Partial; continuation required | Latest `just check`: 198 tests / 32 files, lint and typecheck pass; `just build` passes. `git diff --check` passes. Live acceptance and remaining integration review are listed in the [handoff](implementation-handoff.md). |

### Evidence recorded 2026-09-26

Environment: local macOS checkout; Node `v26.9.0`, Bun `1.4.2`, just `1.58.0`. Dev server: `just dev 9021`, `http://127.0.0.1:9021`. In-app browser inspection showed the signed-out landing page. No authenticated screenshots or device measurements were collected, and no real watch/request state was used as disposable test data.

Commands: `just check`, `just build`, `git diff --check`. Local logs: `/tmp/watchtower-baseline-check.log`, `/tmp/watchtower-baseline-build.log`, `/tmp/watchtower-final-check.log`, `/tmp/watchtower-final-build.log`. Baseline warnings about the `local/flixor` Expo tsconfig, React Router future flags, and build chunk output remain; they were not suppressed.

Seerr implementation was checked against upstream [request routes](https://github.com/seerr-team/seerr/blob/develop/server/routes/request.ts), [media status constants](https://github.com/seerr-team/seerr/blob/develop/server/constants/media.ts), and [media/season relationships](https://github.com/seerr-team/seerr/blob/develop/server/entity/Media.ts). These sources establish the implemented API assumptions, not compatibility with the uninspected deployed version.

### Continuation evidence recorded 2026-09-26

`just check` passes lint, TypeScript and 198 tests in 32 files; `just build` and `git diff --check` pass. Logs: `/tmp/watchtower-resume-full.log`, `/tmp/watchtower-resume-build.log`. New regressions cover Plex pagination and repeated-page failures, all library sections, separate account/server tokens, exact search identity, IMDb routing, repeated notification transitions, viewer-only title request decisions, and browse focus restoration. Watchlist cache version 4 invalidates older truncated snapshots without changing stored lists.

Normal Plex sign-in succeeded in Waterfox on `http://localhost:9021`. Server setup remains pending; the setup code was found in process output at the user’s request, but browser actions were interrupted by user activity. Seerr is not configured in this development data directory. Receiver selection, designated media, deployed schema, and all measured/audible playback acceptance remain open. No live playback/request state was changed.

### Authenticated continuation

Plex setup completed in Waterfox through the reachable local connection. Home and the 1,160-item Movies library rendered, the TMDB deep link resolved to an accessible Plex title with Play Again, and browser Back returned to Movies. Live secondary-GUID lookup failed before the fix; paginated GUID metadata now resolves both TMDB and IMDb to the same library item (one combined read-only check: ~736 ms). Concurrent lookups share a client-local scan; no global cross-user index was added. Home's trending cache key now invalidates prior false-unavailable entries.

`just check`: 198 tests/32 files, lint/types pass. `just build` passes. Logs: `/tmp/watchtower-live-check.log`, `/tmp/watchtower-live-build.log`; red regression `/tmp/watchtower-guid-red.log`. Seerr detection found no configured service. Safe progress-changing media and receiver selection remain pending. No live playback, request, list, or rating mutation was performed. This supersedes earlier notes that Plex setup was blocked.

### Watchlist refresh regression

Live Trakt requests returned HTTP 403, which rejected the combined watchlist promise and hid otherwise available Plex entries. Source fetches now settle independently, show source-specific recovery guidance, and never cache an incomplete aggregate. Waterfox hard reload verified the three Plex items remain visible alongside the Trakt warning. A regression covers refusal followed by successful recovery. `just check` passes 199 tests/32 files plus lint/types; build and diff checks pass. Logs: `/tmp/watchtower-watchlist-check.log`, `/tmp/watchtower-watchlist-build.log`. Trakt access itself still requires valid service/account access; no settings or stored lists were changed by this fix.

### Helium runtime investigation

Authenticated Helium checks covered Home → My Stuff/Watchlist → Lists → Discover → external title → availability dialog, a full title reload, Movies, and the existing library detail for “10 Things I Hate About You.” The reported null React dispatcher/useContext crash did not reproduce; its cause remains unconfirmed. No playback or request submission was performed. A separate reproducible Home warning used the same React key for both “Popular from IMDb” rows; row keys now distinguish their positions and the warning did not recur on Home navigation. Browser console inspection found no dispatcher/invalid-hook error during these checks. `just check` passed 201 tests/32 files plus lint/typecheck, build and diff checks passed. Logs: `/tmp/watchtower-helium-check.log`, `/tmp/watchtower-helium-build.log`. Helium is the user's preferred browser for this chat; OS defaults were not changed.
