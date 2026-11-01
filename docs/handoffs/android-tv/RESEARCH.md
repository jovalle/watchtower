# Android TV implementation handoff research

Research date: 2026-09-27. Repository inspected at `8578769ae3273a5918910b769053d494c56c7ae6`, `/Users/jay/Projects/watchtower`. Recheck the assigned worktree and uncommitted changes before implementation. This document specifies intended work; it does not claim implementation, SDK builds, actual TV compatibility, or Plex/Netflix feature certification.

These are supporting research notes. [Implementation](IMPLEMENTATION.md) and [shared contract](../shared-contract.md) govern the selected design, including opaque expiring device sessions, identity-version checks, cross-channel signing, and both sideload/Google Play distribution. Alternatives discussed here are not additional simultaneous requirements.

## Outcome and scope

Build a native Kotlin Android TV/Google TV client under `android-tv/`, backed by Watchtower's existing server and authorized Plex personal libraries. Use Compose for TV and Media3 ExoPlayer. Deliver the whole parity roadmap below; phase names are sequencing, not permission to silently stop after an MVP. Plex and Netflix are experience benchmarks, not licenses, APIs, or catalogs bundled with Watchtower.

Commercial Netflix playback/catalogs, Plex ad-supported catalogs, rentals, proprietary recommendation systems, and vendor-certified Netflix/Dolby functionality are separate service agreements/integrations. Do not promise them as consequences of implementing a native player. Personal-library equivalents remain required. Music, photos, Live TV/DVR, downloads and multi-server browsing are explicit scope decisions in the matrix, not unmentioned omissions. The current backend has one configured server; full multi-server Plex parity requires a separate server-selection architecture and migration.

Labels: **verified** means inspected repository or opened primary documentation; **proposed** means intended implementation choice; **device gate** means must be demonstrated on actual hardware before claiming support.

## Verified repository baseline and reuse map

| Concern | Existing source | Implication for TV |
| --- | --- | --- |
| Stack | `package.json`: Remix/React, Node >=22, TypeScript, Vitest, existing HLS.js | Add native project; keep backend service logic in TypeScript. Do not wrap the browser player in WebView. |
| Login | `app/lib/auth/plex.server.ts`: Plex hosted PIN login and token-to-user/server access verification | Browser login can approve TV pairing; reuse actual Plex identity/access verification. |
| Session | `app/lib/auth/session.server.ts`: Remix signed cookie containing Plex tokens, browser redirects | No native device-token contract exists. Signed cookies are not encrypted token vaults. Never copy this cookie into QR codes or call its contents opaque native credentials. |
| Authenticated Plex | `app/lib/plex/client.server.ts` | Reuse server-side calls and current per-user server token. Never send admin credentials to TV. |
| Home/content | `app/lib/home.server.ts`, `app/routes/app._index.tsx`, Plex library/search/metadata/children APIs | Some UI loaders aggregate data; provide stable JSON facade instead of parsing Remix HTML or private loader serialization. |
| Playback preparation | `app/routes/app.watch.$ratingKey.tsx` | Its `/Android/` user-agent branch treats TV as mobile. Native negotiation must use explicit capabilities, not this heuristic. |
| Stream construction | `PlexClient.getPlaybackInfo` | Audit browser-profile assumptions and fixed media/part indices. Native selected edition/version/part needs explicit validated inputs. |
| Direct-file proxy | `app/routes/api.plex.stream.$ratingKey.ts` | Selects `Media[0].Part[0]`; supports authenticated Range responses but is not yet a full multipart/version-aware native playback API. |
| HLS proxy | `app/routes/api.plex.hls.$ratingKey.$.ts` | Preserve decision-before-start, isolated client/session identity, relative playlist rewriting, token handling, deadlines, cancellation, keepalive/stop. |
| Progress | `app/routes/api.plex.timeline.ts`, `app/lib/plex/playback-session.server.ts` | Existing ordering and ownership safeguards matter. Active generation scope is owner+ratingKey; explicitly resolve same-account simultaneous TV/browser semantics before sharing it with room members. |
| Tracks/markers | `app/lib/plex/tracks.ts`, `markers.ts`, `api.plex.streams.ts`, subtitle route | Reuse server metadata and marker extraction, but native text/embedded track support differs from browser sidecars. Track persistence is per Plex media part and can affect another player using the same account. |
| Preferences/integrations | `app/lib/settings/*`, `watchlist/*`, `trakt/*`, `integrations/*` | Keep discovery opt-out, autoplay/skip preferences and existing personal watchlists; integrations are conditional on configuration and permissions. |
| Existing playback evidence | `docs/playback-evaluation.md`, `test/routes/playback-*`, `test/lib/playback-*` | Read as historical evidence. Some noted problems are already fixed in source; never blindly reintroduce them or present old findings as current. |

No native Android project or Plex Home managed-profile implementation was found in the inspected baseline. Profile/PIN parity is new backend and client work, not a cosmetic profile switcher.

## Product parity and acceptance matrix

The rows are Watchtower requirements inspired by the named products, not assertions that every Plex/Netflix version supports every item identically. First-party benchmarks: [Plex Android TV settings](https://support.plex.tv/articles/settings-android-tv/), [Netflix getting started](https://help.netflix.com/en/node/102377), [Netflix parental controls](https://help.netflix.com/en/node/264), [Netflix on Shield](https://help.netflix.com/en/node/25889).

| Capability | Required Watchtower behavior | Delivery/acceptance boundary |
| --- | --- | --- |
| Pairing/sign in | Server address entry, QR/short-code approval on an authenticated phone/browser, expiry/retry, returning-device login, sign out/revoke | No TV password typing required; keyboard alternative when QR unavailable. Unauthorized browser cannot approve. |
| People/profiles | Separate Plex accounts plus Plex Home/managed users where Plex permits; PIN entry, switching, last-profile preference, lock on resume where configured | Effective identity drives library access, progress, settings, search, image requests and room membership. Parent/admin content never leaks through cache or deep links. |
| Home | Continue Watching, Recently Added, promoted collections, recommendations, stable row order, empty/offline/error states | Per-profile data and discovery opt-out respected; no misleading autoplay trailers without available media. |
| Navigation | Remote sidebar, predictable Back, movies/series/library filters, sort, pagination, restore row/card focus | Every task completed with five-way remote and Back; long rows never strand focus. |
| Details | Art, synopsis, rating/year/runtime/genres, cast, playable editions, season/episode picker, watched badges, resume/start over | Local playable content is distinguished from external discovery/request-only titles. |
| Search | In-app keyboard and voice input, local libraries, configured discovery integration, filters | No results from forbidden libraries; no microphone-required UI when voice is unavailable. |
| Lists | Watchlist add/remove, custom playlists/collections as available, existing Trakt/IMDb sources | Confirm mutation success, expose retries; do not duplicate existing import logic on TV. |
| Playback | Play/pause, accurate absolute seek, accelerated scrub with position preview, resume/start over, next/previous episode, replay | Thumbnail trickplay only when actual assets/API exist; otherwise show accurate timestamp and poster, explicitly record thumbnail gap. |
| Binge behavior | Skip intro/credits when markers exist, next episode countdown/cancel, autoplay preference, optional inactivity confirmation | Missing markers never produce guessed skip boundaries. Room host/coordinator owns shared skips and episode changes. |
| A/V controls | Audio language/track, subtitles/off/style, forced/SDH/audio-description distinction, quality/bitrate, playback diagnostics | Match selected IDs to delivered tracks; validate audible audio and readable subtitles, not just HTTP 200. |
| Premium media | 4K/HDR10/HLG/Dolby Vision and surround/passthrough where device+media+output permit; refresh-rate matching | Device gate per format/profile/container/audio route. Unsupported combinations choose proven fallback or honest error. |
| History/preferences | Per-profile watched/unwatched, resume, ratings where API allows, language/quality/autoplay settings | Concurrent device updates have deliberate ordering; failed writes do not silently appear saved. |
| Watch Together | Create/join/lobby/readiness, host controls, synchronized seek/next, status/rejoin/leave | Consume shared protocol owned by Watch Together worktree; web↔TV and TV↔TV tests required. |
| Accessibility | TalkBack, visible focus, captions/style, audio description, large readable text/contrast, reduced-motion behavior | All primary tasks accessible; no color-only state or unlabeled controls. |
| Platform | MediaSession, correct media keys, background pause, audio-focus handling, deep links, Watch Next/home integration | Launcher/provider availability varies; profile switching clears/replaces exposed content. |
| Operations | Connection diagnostics, actionable playback error, app/server version, device revoke, anonymized opt-in diagnostics | Tokens never in logs, analytics, crash reports or image URLs. |
| Requests/issues | Existing Seerr requests and issue reporting where permitted | Match configured web capability; admin-only operations stay restricted. |
| Multi-server | Current one-server configuration remains explicit; full Plex-like server switching requires account/server-scoped keys and configuration changes | Record as separate required decision before claiming full Plex parity. Do not hardcode ratingKey as globally unique. |
| Plex music/photos/Live TV/DVR | Beyond current movie/series backend; requires separate domain/APIs/UX and capability validation | Inventory explicitly in final gap report; do not call personal video parity “all Plex parity.” |
| Downloads/offline | Explicit optional extension, with authorization expiry/storage/media-license behavior designed separately | Never advertise offline playback until implemented and exercised; mobile Netflix downloading is not automatically a TV requirement. |
| Commercial catalogs/games/ads/rentals | No default integration | Outside personal-library equivalence; do not claim implementation or bypass service licensing/DRM. |

Plex documents household users and PIN behavior, including the warning that PINs are a convenience and not an account-security replacement. Watchtower should preserve upstream restrictions and add server-enforced authorization, not use a local PIN overlay as access control. [Plex Home creation](https://support.plex.tv/articles/204234323-creating-a-plex-home/)

## Architecture and work ownership (proposed)

Android worktree owns native source, `/api/v1` JSON facade, device pairing/session authentication, profile APIs, explicit native media capability and version selection. Watch Together worktree owns authoritative rooms, shared room wire types/fixtures and browser integration. Only one writer owns a shared file at a time. Agree on contract fixtures before concurrent implementation; transport may differ but event semantics must not.

Start with one Gradle application module, packages by concern (`auth`, `catalog`, `playback`, `rooms`, `settings`), a small API client, Kotlin serialization DTOs, coroutines/StateFlow and ViewModels. Use a compatible stable Kotlin/AGP/Gradle/JDK/Compose/Media3 set resolved from primary release documentation at implementation time; pin it in a version catalog and commit the wrapper/checksum. Compose for TV is officially recommended for TV-focused UI. Its TV components provide focus-oriented behavior and differ from mobile Material components; avoid mixed themes. [Compose TV](https://developer.android.com/training/tv/playback/compose)

A small HTTP library is justified for authenticated streaming/SSE and cancellation in a new Kotlin app; document why chosen and reuse it for API requests and Media3 data sources. Do not introduce separate DI/code-generation frameworks without a concrete need. Existing TypeScript types cannot simply be imported by Kotlin: use versioned JSON schema/fixtures and contract tests; add generated clients only if they reduce actual maintenance.

## Native API and authentication contract (proposed)

1. TV validates an HTTPS Watchtower base URL, fetches unauthenticated minimal instance metadata/capabilities and starts pairing. Production does not globally disable TLS validation or permit cleartext. If developer LAN HTTP is needed, scope it to an explicit debug-only network configuration. Do not fetch arbitrary user-supplied backend URLs server-side.
2. `POST /api/v1/device-authorizations` returns a high-entropy polling secret, separate short human code, verification URL, expiry and minimum poll interval. QR contains only verification location/code, never credential material.
3. User opens verification URL, uses existing Plex login, sees target device/instance and explicitly approves the request. Protect approval with normal browser authentication and CSRF/origin checks. Reject expired, reused and mismatched requests. Bind polling completion to the original device secret; knowledge of human code alone cannot redeem.
4. `POST /api/v1/device-authorizations/poll` yields pending/approved/denied/expired/rate_limited; use backoff and server retry hints. Do not mint or reveal account tokens in pending replies. High-entropy opaque access credentials authorize only this Watchtower instance; keep upstream Plex tokens server-side. Persist token hashes, expiry, device identity and revocation state; store necessary upstream credentials with proper protected storage. Never use an in-memory-only authorization database for persistent remembered TV sessions.
5. Define rotating short-lived access and refresh credentials with replay detection, or a simpler explicitly expiring/revocable opaque device session; choose one documented security model. Keystore-protected app-private credential storage, exclude credentials from backups, wipe on logout. Redact Authorization, cookies, QR secrets and upstream tokens.
6. `/api/v1/me`, device list/revoke, profiles list/switch, PIN challenge and logout use explicit JSON 401/403/409/429 results. No HTML login redirects in native APIs. Switching cancels requests/playback/room participation, clears profile caches and selects an effective identity on the server. Rate-limit PIN attempts; never infer owner permissions from a submitted profile ID.
7. Research and verify the Plex Home switch API using actual authorized responses before coding against it; official user documentation does not constitute a stable developer contract. Unsupported entitlement/Plex Home response is a visible blocked capability, not a fallback to owner token. Preserve a truthful gap record if upstream proof cannot be obtained.

Proposed JSON surface: instance/capabilities; me/devices/profiles; home; libraries and filter options; paginated media/search/children; metadata/editions; watchlist/playlists; preferences; playback prepare/reconfigure/heartbeat/stop/timeline; authenticated image/subtitle/stream URLs; rooms through the agreed room contract. Reuse existing server functions behind these routes. Document schemas, nullable fields, milliseconds, pagination, status codes and compatibility version; bound request sizes and validate every ID against the effective user's Plex-accessible metadata.

Media IDs must include server identity and ratingKey plus chosen media/part identity where relevant. No untrusted absolute upstream URL, arbitrary stream/part ID or arbitrary Plex client profile accepted unchecked. Use short-lived playback resource handles or same-origin Authorization headers for all nested HLS manifests, segments, keys, subtitles and artwork. Disallow credential forwarding across redirects/origins. Authorization cannot stop at only the first playlist.

## Playback requirements and sequence

**Verified:** Media3 separates container extraction from sample decoding; Android codec support depends on devices. Plex direct play requires compatible container, codecs, bitrate and resolution, while incompatible subtitles can force video transcoding. Do not map `mkv` or `hevc` alone to unconditional direct play. [Media3 formats](https://developer.android.com/media/media3/exoplayer/supported-formats), [Plex direct play/direct stream](https://support.plex.tv/articles/200250387-streaming-media-direct-play-and-direct-stream/)

1. Query explicit decoder/profile/level/resolution capabilities plus current HDR display and audio route. Capabilities are hints for planning, not security claims. Refresh when HDMI/soundbar/headphone route changes. Do not impersonate Chrome or the Plex Android app; use honest Watchtower client identification.
2. User chooses a version/edition/part, resume position, audio/subtitle tracks and quality. Backend verifies all against metadata obtained with effective user token. Prefer direct file if supported, then remux/direct-stream, then transcode. A bounded fallback chain can try a safe format after decoder failure; stop with actionable error rather than retry forever.
3. Prepare returns playback ID, isolated upstream session/client ID, resource handle/URL, MIME/protocol, media identity, media duration, initial absolute offset, stream-to-media offset mapping, selected tracks and actual negotiated method. Keep raw Plex token out. Start HLS only after accepted Plex decision. Distinguish requested quality from actual negotiated/delivered media.
4. Media3 owns decoding/adaptive buffering. Choose SurfaceView-backed rendering for HDR/device compatibility, with Compose TV controls around it. A browser HLS playlist may represent a shifted window; never report player-relative milliseconds as absolute media time. Establish mapping with fixtures and real transcoded seek tests.
5. Buffering is not a user pause. Report observed readiness separately from user intent; disable duplicate commands while replacement is pending. Seeking outside a current transcode window prepares a fresh isolated session, resumes at the correct absolute point, then stops the old session. Stopping old must not terminate new.
6. Persist stable user language/subtitle preferences but map ephemeral track IDs on each media item. Prefer in-player native track selection when possible; use server stream change/restart when needed. Do not assume selecting a Plex part track changes an already-running direct file in Media3. Forced subtitles, multiple same-language tracks, accessibility labels and off must remain distinguishable.
7. Report timeline with playback identity and monotonic per-session sequence, on periodic cadence and state changes; acknowledge failures and retry within bounds. Keepalive/stop follow server lifecycle. A session stop must not regress newer progress or mark a merely-seeked-to-end item watched.
8. Pause on background/home/input loss, release player/session as required by lifecycle, end keepalive appropriately, and reconcile on return rather than replaying stale queued writes. Process death recovery fetches server truth and asks resume where appropriate. Keep screen awake only during active user-initiated playback.
9. Use MediaSession for external media commands. In a room, every remote/voice/MediaSession play/pause/seek command must pass through room permissions/coordinator; MediaSession must not expose an unguarded path directly to ExoPlayer. Room-supplied state application must not echo commands back. [MediaSession](https://developer.android.com/media/media3/session/control-playback)

HDR requires both decoder and display compatibility; prefer SurfaceView, because TextureView can reduce HDR output fidelity. Screenshot appearance alone does not prove HDR delivery. Validate display mode and actual observed output. [Android HDR](https://developer.android.com/media/grow/hdr-playback), [Media3 surfaces](https://developer.android.com/media/media3/ui/surface)

Use Media3 track-selection parameters for language, bitrate/resolution and explicit overrides, updating overrides after stream replacement. Retain original-selection intent where the negotiated stream's IDs differ. [Media3 track selection](https://developer.android.com/media/media3/exoplayer/track-selection)

## Remote, lifecycle and platform behavior

Required implementation cases (proposed): focus survives scrolling, refresh, pagination, details→Back, player→Back and dialogs; returning to a removed card selects a deterministic neighbor. Center opens/operates controls predictably and toggles playback when controls are inactive; left/right scrub in playback context and move focus in menus. Avoid double action from key down+up/repeats. Back closes overlay/dialog first, leaves playback with cleanup next, and eventually exits to launcher. No touch-only gesture, Menu-button dependency, or keyboard trap.

Provide meaningful accessibility semantics, collection/item position, selected/disabled state and announcement for errors. Avoid announcing playback time on every tick. System caption preferences should influence captions where compatible; burned subtitles cannot be restyled locally. Use images as decorative when accompanying equivalent title labels. Test TalkBack with the remote. [TV accessibility](https://developer.android.com/training/tv/accessibility)

Deep links identify media, not tokens; restore login/profile/PIN checks before resolving. Track untrusted URI inputs through the same authorization layer. Add/remove Watch Next entries on progress/completion and account changes; preserve dismissed content behavior. Do not publish protected-profile metadata outside the app without an explicit policy. Android documents Watch Next APIs and content rules; modern Google TV discoverability may also involve Engage SDK, eligibility and launcher behavior. Do not promise universal placement from provider insertion alone. [Watch Next API](https://developer.android.com/training/tv/discovery/watch-next-add-programs), [guidelines](https://developer.android.com/training/tv/discovery/guidelines-app-developers)

## Build, release and operating instructions

Native deliverables: reproducible debug APK, release AAB build configuration, README with compatible JDK/SDK/Gradle versions and commands, emulator setup, local backend address instructions (`10.0.2.2` only for standard emulator host access, not physical TV), configurable instance entry, sample redacted API fixtures, CI workflow and artifact retention policy. Do not ship a developer's Plex URL/token or signing key. Signing and publishing are separate explicit release actions; implementation can prepare all artifacts without store upload.

Use launcher icon/banner, Leanback launcher intent and non-required touchscreen declaration, landscape layout and proper permissions. Verify generated merged manifest and clean installation; run debug and minified release variants. [Create TV app](https://developer.android.com/training/tv/get-started/create)

Current official release gates (verified 2026-09-27; reread before shipping): TV quality specifies minSdk at most 31, AAB distribution, 32- and 64-bit support and 16KB compatibility from August 1, 2026. Validate bundled native dependencies, not just Kotlin source. Video must pause when leaving the app; do not invent background video playback as parity. Quality checklist also covers D-pad, Back, banners and ambient behavior. [TV quality](https://developer.android.com/docs/quality-guidelines/tv-app-quality)

Current Play API policy distinguishes TV from mobile: new/updated TV submissions require at least API 34 in the opened source; do not blindly apply mobile API 36 requirement. Choose a current supported compile/target combination and test resulting behavior changes rather than treating this minimum as the desired permanent target. [Play target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)

CI proposed commands from `android-tv/`: `./gradlew --no-daemon lint testDebugUnitTest assembleDebug`; emulator job runs `connectedDebugAndroidTest`; release job runs the actual chosen release lint/tests and `bundleRelease`. Backend must pass existing test/typecheck/build and scoped lint. List exact runnable commands after scaffold exists; these task names are expected Android plugin conventions, not verified against a nonexistent project.

Provide startup/network diagnostics, redacted correlation IDs, source/negotiated/delivered playback method, decoder, selected tracks, bitrate/dimensions, stall count and room drift. Capture P50/P95 startup/seek times on named device/network fixtures. Set acceptance budgets from measured baseline and record them; do not fabricate device performance numbers.

## Implementation phases and gates

1. **Contract/security spike:** confirm repository status; API fixture inventory; device session design; effective-profile access model; room command agreement; sample Plex Home responses with authorized test accounts; real Media3 playback spike on one TV and one constrained emulator. Gate: no token exposure and no owner fallback, basic stream audible/visible.
2. **Backend/native foundation:** pairing/revoke/profiles, JSON catalog facade, Gradle/CI, login/home/search/details remote navigation. Gate: unauthorized/restricted-profile matrix passes; stale responses cannot populate another profile.
3. **Full playback:** version/part selection, direct/remux/transcode, session mapping, controls/tracks/quality, progress/resume/scrobble, lifecycle/recovery, markers and episode flows. Gate: decoder/network fault tests plus actual media/TV matrix; existing web regressions pass.
4. **Product parity:** complete every required matrix row, integrated preferences/lists/requests and profile restrictions. Gate: remote-only scripted journey, TalkBack, process death and network recovery.
5. **Watch Together integration:** consume coordinator contract and golden fixtures, connect native playback adapter, route all local/system commands through coordinator, test web↔TV/TV↔TV roles and drift. Gate: room suite plus simultaneous same-profile policy validation.
6. **Platform/release hardening:** Watch Next/deep links/voice, refresh-rate/audio route, memory/startup optimization, minified release, 32/64+16KB audit, signed-release readiness and documented residual gaps. Gate: requirements matrix maps each row to evidence or explicit blocked reason; no “parity complete” while target rows are unverified.

## Test matrix and evidence required

| Axis | Cases | Evidence |
| --- | --- | --- |
| Device | Chosen minimum-supported API emulator, current TV emulator, constrained physical Google TV device, higher-capability TV box, integrated Android TV | Model/OS/build/audio route recorded. Emulator tests cannot certify HDR/passthrough. |
| Video | H.264 MP4 baseline, H.264/HEVC MKV, 4K high bitrate, HEVC 10-bit HDR10, HLG, relevant Dolby Vision profiles, supported VP9/AV1 samples | Actual decoder/dimensions/HDR output; unsupported path honest and recoverable. No universal Dolby Vision claim. |
| Audio | AAC stereo, AC3/EAC3 5.1, FLAC, DTS/TrueHD only where appropriate, multiple languages, audio description, headphone↔HDMI | Audible output, A/V sync, negotiated channels and passthrough verified per chain. |
| Subtitles | SRT/WebVTT, embedded text, ASS/SSA styles, PGS/VobSub, forced/default/off, SDH, UTF-8 and non-UTF-8 samples | Native render vs burn-in declared; accents/timing/style tested. |
| Transport | Direct Range 206/416, HLS master/variant/relative redirects/keys/segments, resume, seek beyond buffer, quality/track changes, multipart boundary | Absolute position mapping and session isolation; credentials only to approved origin. |
| Failures | Offline start, midstream disconnect, DNS/TLS failure, server restart, PMS unavailable, 401/403, expired auth/session, malformed JSON, decoder error, rate limit | Bounded retry, accessible error, no stuck spinner, no progress corruption. |
| Identity | Owner/shared/restricted/managed profile, incorrect PIN, revoked device/token, library removed, account switch during loading/playback | No data leakage in search/images/history/rooms; server denies tampered IDs. |
| Lifecycle/input | Home/Back/sleep/input switch, process kill/restore, audio focus loss, remote key repeats, Bluetooth/HDMI changes, deep-link cold start | Pause/cleanup, stable focus, no duplicate MediaSession/player or leaked transcode. |
| Rooms | Host/guest command restrictions, late join, reconnect, background participant, host departure, episode change, simultaneous same-account devices, local track changes | Same agreed room state as browser, no double drift correction or command echo. |
| Release | Clean install/update, minified APK/AAB, signing config without secrets, architecture/16KB checks, memory/long-session soak | Reproducible commands/log paths, actual artifacts; manually unexecuted checks explicitly marked. |

Unit tests cover parsing/validation, auth expiry and transitions, capability decisions, position mapping, stale sequence handling and command routing. API tests cover pairing redemption/CSRF/revoke/profile authorization and stream resource authorization. Instrumentation/Compose tests cover focus, dialogs, remote navigation and lifecycle. Reuse existing backend Vitest rather than building a second server test harness. Include at least one real end-to-end scripted flow that pairs → selects restricted profile → browses → plays/seeks/switches subtitles → joins room → returns/revokes. Owner-only evidence cannot prove shared-user safety.

## Suggested subagent division for the implementation agent

Use concurrent subagents with disjoint ownership: (A) API/pairing/profile security and contract tests; (B) native catalog/navigation/accessibility; (C) Media3 session/format/lifecycle and playback tests. Parent agent owns contract choices, integration and final audit. After implementation, assign an independent reviewer to credential boundaries, profile leaks, stale progress and room command bypasses, and another to remote focus/release gaps when slots permit. Agents must read applicable skills/AGENTS and current callers before changes; no new Codex chats are needed for these subagents. Shared backend playback files are serialized with the Watch Together agent, never edited blindly in parallel.

Every milestone produces changed-file map, runnable test commands/results, real-device evidence or explicit unexecuted gates, and remaining parity rows. Finish with a truthful checklist, not a blanket “all features work.”
