# Android TV / Google TV: implementation and acceptance handoff

> Historical document: this records the earlier combined Android TV and Watch Together work. After the 2026-11-03 split, `codex/android-tv` contains standalone TV functionality only; room implementation, room-only tests, harness, and evidence were removed. The complete combined snapshot and original evidence remain on `codex/watch-together`. Room requirements and results below do not describe the current Android branch. Current setup and commands are in [`android-tv/README.md`](../../../android-tv/README.md).

Prepared 2026-09-27. Branch `codex/android-tv`; base `8578769`. Workspace `/Users/jay/.codex/worktrees/android-tv/watchtower`.

**Status: research and specification only.** No Android scaffold, APK, AAB, device test, store submission, or native backend API exists as a result of this documentation task. The user explicitly selected **both sideloading and Google Play** distribution. Specific TV models remain unspecified.

Read [shared-contract.md](../shared-contract.md), [research notes](RESEARCH.md), [repository audit](../repository-audit.md), and [agent prompt](AGENT-PROMPT.md). This document and the shared contract govern implementation; research alternatives are supporting evidence. Existing implementation/evaluation docs are historical context, not proof that today's branch is verified.

## Outcome and meaning of parity

Build a native Kotlin TV app for Watchtower's Plex personal movie/series library, with a complete couch experience comparable to Plex and Netflix: profiles, discovery, remote navigation, reliable playback, tracks, binge controls, progress, accessibility, and platform integration. Use Compose for TV and Media3; a WebView wrapper does not satisfy the native playback or remote requirements.

“Parity” is a measurable feature matrix, not a blanket marketing claim. The user has not explicitly excluded the broader Plex domains. Therefore keep two ledgers: required personal-video parity below and broader product gaps requiring a scope decision before claiming *full Plex/Netflix parity*. Do not silently drop hard rows or call a browsing demo complete. Proprietary catalogs, paid licenses and vendor certifications are not supplied by implementing a client.

### Required personal-video parity

All rows remain required; conditional integrations are tested when configured and show an honest unavailable state otherwise.

| ID | Feature | Completion criterion |
| --- | --- | --- |
| TV-01 | Install and launch | TV launcher icon/banner, remote-first startup; fresh sideload and Play-ready AAB |
| TV-02 | Instance setup and pairing | HTTPS address entry, QR/short code, browser approval, expiry/deny/retry; no TV password typing required |
| TV-03 | Returning device and revoke | Remembered login, bounded expiry, device list/revoke/logout; stolen/expired credential denied |
| TV-04 | Accounts and Plex Home profiles | Correct effective user, profile chooser, PIN flow where upstream supports it; protected profile remains protected after restart/deep link |
| TV-05 | Profile isolation/parental controls | Libraries, search, images, metadata, progress, preferences, requests and rooms use effective profile permissions |
| TV-06 | Home | Continue Watching, next unwatched episode, recent titles, recommendations/collections; personalized and discovery opt-out respected |
| TV-07 | Library navigation | Movies/series/recent, sort/filter/pagination; large libraries do not load every poster eagerly |
| TV-08 | Details | Art, synopsis, year/runtime/ratings/cast, play/resume/start over, watched badge and availability |
| TV-09 | Series hierarchy | Seasons/episodes, specials ordering, watched/resume state, next/previous episode without skipping season boundary incorrectly |
| TV-10 | Search | Remote keyboard and available voice input, loading/empty/error state, cancelled stale requests, no forbidden results |
| TV-11 | Lists | Existing unified watchlist and source identity, add/remove, Plex playlists/collections; clear permission failure |
| TV-12 | Ratings/history | Supported rating, watched/unwatched actions and progress; failed writes not displayed as persisted success |
| TV-13 | Playback basics | Play/pause, accurate seek/scrub, resume/start over, retry, next/previous/replay; D-pad/media keys |
| TV-14 | Direct/remux/transcode | Explicit capabilities, authorized server decision, bounded fallback and correct method diagnostics |
| TV-15 | Versions and parts | Edition/version selector and ordered multipart playback with absolute timeline; no silent Media[0]/Part[0] fallback |
| TV-16 | Audio | Language/track/channel choices, accessibility labels, defaults, verified audible output and route changes |
| TV-17 | Subtitles | Off/default/forced/SDH, embedded/text/sidecar/burned distinction, style/system preferences where renderable |
| TV-18 | Quality | Original/available bitrate-resolution options, actual delivered output distinguished from requested/source metadata |
| TV-19 | Binge controls | Marker-based skip intro/credits, next countdown/cancel, autoplay preference, sensible end-of-series state |
| TV-20 | Trickplay | Timestamp scrubbing required; Plex thumbnail previews when source assets/endpoint/entitlement verified, otherwise explicit thumbnail parity gap |
| TV-21 | Premium formats | 4K/HDR and surround capability matrix; supported combinations verified, fallback/errors for others; no universal Dolby promise |
| TV-22 | Lifecycle/recovery | Home/sleep/audio focus/network loss/process death/restart; bounded retries, no orphan player/transcode or stale progress |
| TV-23 | Watch Together | Same server protocol as web, lobby/readiness/roles/seek/next/reconnect/leave; all system controls permission-gated |
| TV-24 | Settings | Per-profile autoplay/skip/discovery/language/quality and connection diagnostics; restricted administration |
| TV-25 | Requests/issues | Existing Seerr availability/request/issue flows when configured and allowed; no admin privilege fallback |
| TV-26 | Remote navigation | Visible stable focus, predictable Back, key repeats, overlay/dialog handling, focus restore after pagination/return |
| TV-27 | Accessibility | TalkBack/semantics, caption preferences, audio-description choices, contrast/readability/reduced motion, no color-only status |
| TV-28 | MediaSession | Correct state/metadata/media keys/audio focus; no route around room host restrictions |
| TV-29 | Deep links and home integration | Auth/profile/PIN before content; supported Watch Next/home entries and privacy-safe cleanup; no guarantee of launcher placement |
| TV-30 | Voice and display/audio integration | Voice search where available, refresh-rate matching where supported, audio-output changes; graceful unavailable paths |
| TV-31 | Performance/diagnostics | Measured startup/seek/memory/jank, bounded image cache, redacted actionable errors; no hidden retry loops |
| TV-32 | Release/update | Debug APK, reproducible release artifact path, signed-release procedure, Play checklist, installation/update/rollback instructions |

### Broader parity ledger (must remain visible)

| Domain | Current backend / required decision |
| --- | --- |
| Multiple Plex servers | One configured server today. Full server switching needs account/server-scoped configuration, data migration and APIs; do not improvise this inside TV screens. Record a follow-on implementation plan and obtain scope decision before full-Plex-parity claim. |
| Music, photos, live TV/DVR | Not provided by current movie/series backend. Requires dedicated domains, browsing/player/EPG/recording permissions, entitlement and device validation; not covered by a Media3 dependency alone. |
| Offline downloads | Treat as explicit extension, not assumed TV parity. Requires storage limits, authorization expiry and synchronization semantics. Do not expose a nonfunctional download button. |
| Netflix/Plex commercial catalogs, rentals, ads, games | Separate products/agreements/DRM/catalog APIs. This project does not supply access or emulate their service credentials. |
| Proprietary recommendation ranking | Offer Watchtower's available personal-library recommendations; do not claim Netflix algorithm equivalence. |
| Casting / Cast Connect | Existing browser receiver support is unverified and is not an Android receiver implementation. Specify a separate sender/receiver/auth/control plan if included; never advertise room casting without receiver synchronization evidence. |

These scope boundaries are proposals inferred from Watchtower's current purpose. Clearly report them; do not imply the user has approved every exclusion. Continue all independent required personal-video work while documenting broader scope decisions.

## Native architecture and source layout

Use one `android-tv/` Gradle application module initially. Packages by feature (`auth`, `catalog`, `playback`, `rooms`, `settings`) are enough. Use Compose for TV components, Kotlin coroutines/StateFlow, ViewModels, Media3 ExoPlayer, and a small shared HTTP/serialization stack. Choose an established HTTP client that supports cancellation, auth headers and streaming; reuse it through the Media3 network data source where practical. Do not hand-write HTTP, TLS, cryptography, an image pipeline, or a DI framework to avoid a justified dependency.

Pin a compatible stable toolchain, version catalog and Gradle wrapper/checksum. Verify Kotlin↔Compose plugin, AGP↔Gradle↔JDK, Media3 module version alignment and minSdk compatibility from primary release docs at execution time. Do not paste stale example versions from research. Record exact versions and clean-machine setup in `android-tv/README.md`. Prefer a single app module and manual construction until additional modules/DI solve actual complexity.

Use a SurfaceView-capable Media3 rendering path with TV controls around it; verify the selected Compose/media surface API at pinned versions. Lifecycle ownership must avoid creating multiple ExoPlayers from recomposition. Define one owner for player/session per active playback screen/service; release it deterministically. Background video pauses; a foreground service is not required merely to keep video playing invisibly.

Use request cancellation and immutable UI state. Cache metadata/art by effective profile+server; bound image sizes and memory. Do not cache private data across account switches or show it while a new identity is loading. No server credentials or signing keys in resources, BuildConfig, screenshots, fixtures, crash reports or committed `local.properties`.

## Backend changes: reuse services, not HTML

The Android track owns the native API and necessary shared playback/auth extraction. Preserve existing web behavior and coordinate shared-file edits with WT lead. Do not scrape Remix HTML or rely on private loader transport serialization.

### Versioned API contract to finalize before client screens

All below are **new proposed endpoints**; freeze exact DTOs, error codes and golden JSON fixtures in the repository before implementation. Every endpoint resolves the effective principal independently. Pagination has bounded `limit`, explicit continuation, deterministic ordering/tie-break and cancellation. IDs are strings scoped by server; timestamps/positions use named milliseconds. Nullable/optional fields have documented meaning. Unsupported API versions fail visibly.

| Endpoint family | Required behavior / reuse |
| --- | --- |
| `GET /api/v1/instance` | Minimal version/protocol/capability metadata, no libraries, credentials or internal server URLs before auth |
| `POST /api/v1/device-authorizations` | Begin bounded pairing; returns human code, high-entropy polling secret, verification URL, expiry and poll interval |
| `POST /api/v1/device-authorizations/poll` | Polling secret in body; pending/denied/expired/approved; atomically claim approved session |
| Browser device approval page/action | Existing Plex login followed by explicit named-device approval; CSRF/origin protection; not GET approval |
| `GET /api/v1/me`, device list/revoke/logout | Safe profile/session summary and device management; current session revocable |
| Profiles list/switch | Upstream-verified Home identity/PIN transition; never accept arbitrary profile ID as authorization |
| Home/libraries/media/children/search | Reuse `home.server.ts`, Plex/title/search services; distinguish external IDs and accessible local IDs |
| Watchlist/playlists/collections | Reuse existing service/deduplication rules and verify actual upstream mutation support |
| Preferences/rating/watched/request/issue | Reuse validation/permissions; no copied integration policy in Kotlin |
| `POST /api/v1/playback` | Authorize exact media/version/parts/tracks; negotiate explicit native capabilities and create owned session |
| Playback reconfigure/timeline/heartbeat/stop | Per-device replacement/sequence, actual-position reporting, bounded cleanup; derive ownership server-side |
| Image/subtitle/file/HLS resources | Authorize every nested fetch; normalized response/Range; protect redirects and credentials |
| `/api/v1/rooms/*`, `/api/v1/clock` | Implemented by WT owner; consume exact shared room protocol |

Use one error envelope, for example `{error: {code, message, retryable, requestId}}`, and safe structured success envelopes. Match HTTP status to meaning, include Retry-After when applicable, and do not retry all 4xx indiscriminately. No HTML OAuth redirect responses to native clients. Feature capabilities control availability, not security authorization.

### Pairing and credentials: proposed concrete first implementation

Use Watchtower browser-approved device linking inspired by [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628); do not claim Plex supports that OAuth grant. The phone/browser authenticates normally with Plex, then approves a displayed device/Watchtower instance. A short code alone never redeems credentials.

1. TV creates an authorization request. Generate a cryptographic 256-bit polling secret, separate 8-character unambiguous human code, 10-minute expiry, and minimum 5-second polling interval. These values are proposed policies; enforce server-side rate limits/capacity and code uniqueness. Store only hashes of redemption secrets. QR contains verification location/code, not the polling secret or final credential.
2. Browser enters/confirms code, sees device name and instance origin, authenticates and passes configured-server verification, then approves through a CSRF-protected POST. Rate-limit human-code/PIN guesses, return non-enumerating errors, and defend unsolicited pairing/social engineering with a clear device confirmation screen.
3. Only the device holding the polling secret can claim approval. Define atomic claim and bounded retry recovery for a lost success response before shipping. Suggested approach: persist an encrypted short-lived result bound to the polling secret, allow identical retries for ≤60 seconds, then delete it; after that, require a fresh link. The human code must not retrieve this result.
4. Start with one random opaque **revocable device session**, proposed 30-day absolute expiry, rather than implementing unneeded access/refresh rotation. Hash the bearer credential for lookup; persist device ID, effective identity, server binding, issued/expiry/revoked state. Re-pair at expiry. If product requirements later need silent long-term refresh, implement rotation/replay detection deliberately; don't pretend the opaque token refreshes itself.
5. Upstream Plex credentials required to act for the user stay in a protected server-side record, encrypted at rest using authenticated encryption and a separately stored/persisted key with restricted permissions. The key is not the credential hash and is not committed or delivered to TV. Reuse a suitable existing secret facility only if its security model fits; document backup/restore/key-loss behavior and atomic writes. Single-writer deployment remains explicit. Never fall back to server owner credentials.
6. TV stores its opaque credential encrypted in app-private storage with an Android Keystore-held key, excludes credential files from backup, removes them on logout/revoke, and handles key invalidation as signed-out. Do not store an arbitrary token directly “in Keystore”; Keystore manages keys. Do not claim hardware backing on every device.
7. Validate session expiry/revocation/current server on every request; refresh upstream identity/access on a bounded documented schedule and immediately on upstream 401/403/profile/config change. Successful device auth is not sufficient media authorization. Revoke stops active app requests, room connections and owned playback as soon as observed; bound long-lived SSE revalidation explicitly.

Persist remembered device sessions across application restart; pending pairing requests may expire on restart with a clear retry outcome. Use versioned atomic storage and in-process locks consistent with existing storage patterns, or justify a transactional database if actual concurrency requires it. Do not persist plaintext copies of tokens beside their hashes.

Production TV↔Watchtower requires HTTPS with normal certificate validation. Debug LAN HTTP may be narrowly enabled in a debug-only network configuration; never ship a global cleartext or trust-all exception. Validate manually entered origins/schemes and show connection errors. The backend must not perform arbitrary proxy fetches to a URL supplied by a TV.

### Profiles and PINs

Plex Home/managed users are a required parity target but currently absent in Watchtower. Official user-facing docs describe behavior, not a complete stable developer API. Conduct an authorized spike against the relevant upstream API and record sanitized response shapes before building DTOs. Verify server access and effective token after each switch, enforce PIN/rate limits server-side, and reject unknown/restricted profiles. An account-name dropdown with the owner's token is a security failure.

The server may retain link-owner identity privately to support switching, but all content/progress actions use the effective profile. Local PIN overlays do not replace server enforcement. Switch cancels playback/room participation, invalidates prior generation, clears images/search/history/paging state, and blocks stale asynchronous responses from repopulating it. Handle wrong PIN, upstream denial, revoked Home membership and unavailable profile gracefully. If valid test accounts/API behavior are unavailable, continue other phases and record TV-04/05 as blocked; do not call parity complete.

Enforce the shared contract's identity version on the wire: pairing/`me` returns `identityVersion`, each native content/resource/mutation request includes `X-Watchtower-Identity-Version`, and profile switch atomically advances it. Reject stale-context requests and recheck immediately before upstream side effects after awaited validation. Never resolve an old request under a newly selected profile. Already-dispatched old-profile operations cannot necessarily be recalled, but their principal stays immutable and their responses must not update the new-profile UI. Test delayed watched/rating/track/room requests across a switch, not only visible cache clearing.

## Playback implementation requirements

Read current `app.watch.$ratingKey.tsx`, `PlexClient.getPlaybackInfo`, stream/HLS/subtitle/track/timeline routes and complete player flow first. Preserve web regression tests. Extract shared selection/authorization logic rather than duplicating the loader; browser detection and native capability selection remain separate adapters.

1. **Capabilities.** Report actual decoder profiles/levels, dimensions/frame rates, HDR display modes, current audio route and decoder/passthrough capabilities. Native requests never inherit the web `/Android/` mobile heuristic or unconditional Chrome profile. Treat client capabilities as bounded planning hints, not permission claims. Re-evaluate output changes.
2. **Selection.** Verify media version/edition and every part/track against authorized metadata. Prefer supported direct file, then remux, then compatible transcode. Same container/codec name is insufficient for HDR profile/level/bitrate/audio support. Selected subtitles can force burn-in. Advertise honestly as Watchtower.
3. **Descriptor and session.** Return explicit full-item duration, selected identity, absolute initial position, timeline mapping, delivery method, authenticated same-origin resource URLs, tracks/markers and session ownership. Prefer headers, not bearer query strings. Maintain original requested quality separately from known negotiated/delivered output.
4. **Nested resource security.** Auth applies to master and variant playlists, initialization/encryption resources, segments, direct Range, subtitles and artwork. Strip credentials before redirecting to any different origin; reject unexpected origins rather than forwarding them. Preserve 206, Content-Range/Length, 416, cancellation, deadlines and no-store semantics. Test playlist URI attributes as well as ordinary lines.
5. **Absolute timeline.** HTML seconds, Plex offset seconds and Media3 milliseconds are different boundaries. `copyts=1` is not proof of Media3's timeline. Measure a nonzero offset and post-transcode-seek timeline and derive mapping. Avoid adding an offset twice or reporting segment-relative time. Multipart solo playback needs cumulative part offsets and correct selected part on resume/seek; rooms reject unsupported multipart until both adapters share a proven mapping.
6. **Input and state.** `playWhenReady`, actual playing, buffering, seeking and ended are distinct. All D-pad/UI/voice/MediaSession actions pass through one mode-aware intent layer. While in a room, external MediaSession controls must not bypass host authority. Received room state must not emit a command echo.
7. **Tracks.** Use Media3 native selection where supported; map original Plex track intent to negotiated manifest track IDs. A Plex preference write alone does not select an embedded file track. Language/forced/SDH/audio-description choices must survive replacement. Embedded image/styled subtitle support or burn-in is tested, not assumed. Burned captions cannot be restyled locally.
8. **Replacement.** Quality/track/decoder recovery creates a new generation/session only as needed, restores latest absolute target, and stops the old session without corrupting new progress. Retry with a bounded fallback chain and terminate with a useful error. No endless direct↔transcode loop.
9. **Progress.** Report actual observed position using per-device player scope and sequence; background/stop writes cannot overtake a replacement. Do not mark a title watched merely because a seek lands at duration. Preserve existing Plex/Trakt behavior unless a tested change is needed; no host-progress fan-out in rooms.
10. **Lifecycle.** Pause background video, handle audio focus and becoming noisy/output change, clean up stream heartbeats/session, release player resources, and reconcile server truth on return/process recovery. Screen stays awake only while appropriate; paused idle TV can enter ambient mode. Do not treat recomposition as a new playback session.

## Remote, accessibility, and platform checklist

- Every primary journey works with Up/Down/Left/Right/Center/Back and ordinary play/pause keys; no touch/Menu-only action.
- Back closes menu/dialog first, then leaves player with cleanup, returns to preserved catalog focus, eventually exits. Avoid focus jumps to the first row on each refresh.
- Handle key repeat and key-up/down deliberately; accelerated scrubbing doesn't issue a server seek per pixel/key tick. Commit one final seek with preview feedback.
- Lazy rows/grids load bounded images. Restore focus by stable media identity, with deterministic fallback if a card disappears. Dialog dismissal restores its invoking control.
- TalkBack semantics identify titles/actions, selected tracks, error/retry and disabled controls. Avoid per-frame/per-second accessibility announcements. Check contrast, scaling, reduced motion and caption overlap.
- Deep links carry safe media identity, never credentials; validate destination and apply login/profile/PIN checks on cold and warm starts.
- Implement MediaSession and playback state correctly. Expose only allowed room commands; reconcile platform controllers as well as UI controls.
- Watch Next/home recommendations are profile-aware and removed/updated on completion, sign-out, revoke or profile switch. Avoid revealing restricted-profile titles/art on shared launcher surfaces without an explicit privacy policy. Provider insertion does not guarantee placement on every launcher.
- Voice input falls back to keyboard. Refresh-rate and HDR/output support are detected and tested; no black-screen loop from repeated display switches.

## Phased delivery and subagent ownership

The parent agent integrates all phases and keeps the matrix current. Up to three subagents plus parent can work concurrently, **after schema/file ownership is fixed**:

| Subagent | Owns | Avoids |
| --- | --- | --- |
| Backend/auth/contracts | Device pairing, effective-profile APIs, JSON facade, backend tests | Native screen edits and room coordinator |
| Native catalog/UI | Compose screens, remote focus, settings/search/lists/accessibility tests | Gradle/dependency races and media/session internals |
| Native playback | Media3 adapter, tracks/timeline/lifecycle/room client and player tests | Inventing room server or profile auth |

Parent owns Gradle/version catalog/dependencies, shared architecture, source control integration, CI/release, and coordination with WT. Assign one editor for common DTO/API-client files. Use read-only reviewers after integration for security and TV journey/release audits, reusing slots rather than creating unlimited agents.

### Phase A: verify and freeze foundations

Inspect status and current docs, install/reuse appropriate SDK tooling, pin toolchain, establish baseline backend checks. Finalize pairing/session/profile model and JSON fixtures, identify sample device/media/account availability. Create minimal app and a real Media3 playback spike; prove a same-origin authenticated file and HLS stream at a nonzero offset. Do not style all screens before resolving authentication and canonical time.

Gate: reproducible debug build, real/recorded basic playback evidence or explicit hardware block, authorized restricted-user contract tests. Update shared playback/auth files only under agreed ownership.

### Phase B: backend and catalog

Implement pairing/revoke/profile APIs and storage, catalog/home/search/details/list/preference JSON facade; extract shared backend services with web regression checks. Build complete remote catalog flow and profile isolation. Use sanitized fixtures for unavailable optional services, but mark live service gates pending.

Gate: pair → browse → details → play path, restricted profile cannot fetch arbitrary hidden metadata/art, focus restoration works, stale data cannot cross profiles.

### Phase C: full playback and product parity

Complete media selection/multipart, capabilities, native controls/tracks/quality, absolute progress, fallback, markers/episodes, preferences and request flows. Run unit/instrumentation tests plus actual audible/video format checks. Fill TV-01–22 and 24–28 before treating the client as a daily-use candidate.

Gate: complete remote-only journey and failure recovery; no silent codec fallback labels, lost progress, orphan transcoder, or profile leaks.

### Phase D: Watch Together and platform

Consume WT's reviewed shared schema/fixtures and coordinator. Add native room API/SSE client and generation-aware adapter; all MediaSession routes respect roles. Test browser↔TV and TV↔TV across tracks/quality/network/lifecycle changes. Finish deep links, Watch Next/voice/refresh-rate/output handling.

Gate: integrated backend/native suite, role enforcement and measured cross-device room synchronization. Mocks cannot close TV-23.

### Phase E: device qualification and distribution

Measure performance/memory/jank; run format and lifecycle soak matrix on named physical devices; exercise release minification/shrinking and fresh install/upgrade. Produce sideload artifact and Play-ready release package/procedure. Complete broader-parity gap ledger and operation/rollback docs.

Gate: all required rows have proof or explicitly named external blockers. Do not claim full completion with critical gates unrun.

## Required tests and evidence

Create `docs/handoffs/android-tv/ACCEPTANCE.md` with stable IDs, versions, exact commands, test media format, expected/observed result and artifact paths. Unit tests run deterministically; emulator/UI tests establish navigation/lifecycle; **physical TVs establish codec/HDR/audio/remote behavior**.

| ID | Axis | Required cases |
| --- | --- | --- |
| TVT-01 | Pairing | Unknown/expired/denied code, wrong polling secret, duplicate approval, lost response, concurrent claims, rate limits, CSRF, restart |
| TVT-02 | Identity | Owner/shared/restricted/managed profiles, wrong PIN, tampered IDs, revoke, upstream expiry, switch during fetch/play, server change |
| TVT-03 | API | Malformed JSON/unknown version, nullable fields, bounded pagination/no progress, cancellation, offline/401/403/429/5xx, no HTML login |
| TVT-04 | Resource auth | Every HLS URI type, file Range/416, image/subtitle, cross-origin redirect, expired credential during playback |
| TVT-05 | Media decisions | H.264 MP4, H.264/HEVC MKV, high-bitrate 4K, supported VP9/AV1, HDR10/HLG/DV profiles, incompatible fallback |
| TVT-06 | Audio | AAC stereo, AC3/EAC3 multichannel, FLAC, supported DTS/TrueHD, language/description, headphones↔HDMI/soundbar |
| TVT-07 | Subtitles | WebVTT/SRT, embedded text, ASS/SSA styling, PGS/VobSub, forced/SDH/off, timing/encoding and burned fallback |
| TVT-08 | Timeline | Nonzero resume, direct/HLS/remux/transcode, long/out-of-buffer seek, quality/track change, edition/multipart boundary, end seek |
| TVT-09 | Session ownership | Same account on two devices, new stream replaces old, stop ordering, progress retry and Trakt behavior |
| TVT-10 | Input/focus | All D-pad/Back/media keys/repeat, long rows, search IME/voice, detail/player/dialog return, deleted focus target |
| TVT-11 | Lifecycle | Home/sleep/input change/audio focus loss, process kill/recreate, cold/warm deep link, server restart/network switch |
| TVT-12 | Room | Full shared WT/WTT contract, non-host MediaSession seek, stale readiness, buffering, host transfer, next authorization |
| TVT-13 | Accessibility/privacy | TalkBack primary flow, captions/description, contrast, protected launcher entries, cache clearing, redacted diagnostics |
| TVT-14 | Performance | Named-device cold/warm startup, first frame/seek p50/p95, 30+ minute playback, low-memory process pressure, no leak growth |
| TVT-15 | Release | Fresh install/upgrade, minified build, APK signature verification, AAB contents, 32/64-bit/16KB audit, Play prelaunch checklist |

Device targets pending model selection: minimum-supported API emulator, current Google TV emulator, one low-memory physical TV/streaming device and one higher-capability physical TV box; add an integrated TV where available. Test stereo TV speakers and a relevant HDMI receiver/soundbar path. Record unavailable hardware as blocked; emulator HDR/passthrough claims are invalid.

Proposed performance budgets for a declared LAN/media/device fixture: home usable p95 ≤3 s warm / ≤5 s cold; direct-play first frame p95 ≤3 s; compatible transcode first frame p95 ≤8 s; settled seek p95 ≤3 s direct / ≤8 s transcode. These are engineering targets, not product facts or measured baselines. Record server/transcoder/network factors separately. Apply the shared room skew targets for TV-23. Do not “pass” by measuring only a spinner or prepared-but-not-rendered state.

Backend commands: `bun install --frozen-lockfile`, `just check`, `just build`, `git diff --check`. Native commands expected after creating a conventional single `app` module:

```sh
cd android-tv
./gradlew --no-daemon lint testDebugUnitTest assembleDebug
./gradlew --no-daemon connectedDebugAndroidTest
./gradlew --no-daemon lintRelease bundleRelease
```

These Gradle task names are proposals, not verified against a project that exists today. Confirm with `./gradlew tasks`, document exact tasks, run release unit tests appropriate to the created variants, and verify on a clean environment. Do not claim signing success when only an unsigned bundle was built.

## Sideload and Google Play delivery

Deliver both paths. Prepare release metadata/artifacts locally; publication/signing-key operations follow the user's authorization at execution time.

### Sideload

- Provide reproducible debug APK for development and signed release APK procedure/artifact when keys are available, SHA-256, app/version ID and minimum OS.
- Document `adb devices`, selecting the intended device, `adb install -r <apk>`, starting via launcher, redacted logcat capture and uninstall warnings. Do not run commands against an arbitrary attached personal device.
- Verify package ID/signing certificate continuity for upgrades. Debug and release signing differ; ordinary disposable debug signing generated by Gradle is allowed. Incompatible certificates require an explicit migration/uninstall with data-loss warning.
- Standard emulator reaches host via `10.0.2.2`; physical TV needs reachable host address/HTTPS. Don't ship a developer IP or hardcode localhost. Use distinct test server `DATA_PATH` and ports.

### Google Play

- Choose application ID and ownership with the user before first publication; keep debug suffix and production identity deliberate. Configure versionCode/versionName and reproducible signing with secrets outside the repository.
- Decide cross-channel signing before distribution: Play's upload key is not necessarily its app-signing key. For same-package seamless sideload↔Play upgrades, installed artifacts need compatible app-signing certificates/signing lineage; arrange a user-controlled common app-signing key through Play App Signing or distribute appropriate Play-signed APKs. Otherwise deliberately use separate package IDs and document data migration. Never assume an APK signed with the upload key upgrades a Play install. Test both upgrade directions and document key custody/recovery. [Android signing guidance](https://developer.android.com/studio/publish/app-signing).
- Build AAB, TV launcher/banner/screenshots, store listing, privacy/data-safety disclosures reflecting actual credentials/history/diagnostics, content rating and reviewer access instructions. No real user's credentials in docs; provide a controlled review environment through the appropriate store mechanism.
- Follow current TV quality and target API requirements, not a generic mobile checklist. Research on 2026-09-27 found TV target API floor 34, minimum SDK requirement ≤31, AAB distribution, and both 32/64-bit plus 16KB compatibility requirements effective August 2026. Re-open official pages at submission; choose a maintained supported target, not merely the minimum.
- Inspect all native `.so` dependencies and packaging for architecture/page-size compatibility; Kotlin-only application source does not prove dependency compliance. Test minified release, cold deep links, captions, low memory and network failures. Produce baseline profiles when pursuing the relevant optimized TV quality tier.
- Internal testing/prelaunch report first, then a reviewed rollout/rollback plan. Do not upload or publish merely because bundle generation succeeded.

Primary release sources: [TV app quality](https://developer.android.com/docs/quality-guidelines/tv-app-quality), [Play target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en), [16KB page sizes](https://developer.android.com/guide/practices/page-sizes), [TV app setup](https://developer.android.com/training/tv/get-started/create). Rules and dependency versions are time-sensitive.

## Operations, rollback, and final deliverables

Document device/session revocation, recovery from lost server encryption key, API compatibility policy, data backup/restore, credential expiry, app/server version mismatch, playback troubleshooting, single-process storage limits and room restart behavior. Logs show request/session correlation and safe diagnostics, not credentials or pairing codes.

Rollback must preserve backend device data compatibility or explicitly revoke affected sessions. Old TV clients receive an actionable upgrade/API message rather than malformed JSON. Stop advertising unavailable capabilities. Do not silently downgrade authorization, clear personal watch history, or delete app data to disguise a migration problem.

Required handoff artifacts after implementation: native source/README and toolchain lock, JSON schemas/fixtures, backend tests, UI/device test evidence, debug APK, release APK/AAB status, CI instructions, security review findings, completed parity and broader-gap ledgers, operations/release/rollback docs, and exact remaining blocked actions. A screenshot, mock stream, or successful compile alone is not parity.
