# Android TV acceptance

Status recorded 2026-09-28 from the Android TV branch and the combined Watch Together E2E branch. This document separates source and test evidence from runtime qualification. A test class proves only the behavior it exercises; it does not close a wider device, Plex, audio, accessibility, or Play gate.

## Acceptance matrix

| ID | Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| TV-01 | Install and launch | Partially verified | `d006ca1`; [`release-launch-smoke.txt`](evidence/release-launch-smoke.txt); [`artifacts-MANIFEST.tsv`](evidence/artifacts-MANIFEST.tsv) | The QA copy launched on all three named emulators with no app crashes. A Play-ready signed artifact was not produced. |
| TV-02 | Instance setup and browser-approved pairing | Partially verified | `f1692e1`; `PairingScreenTest`; `TVR-00`, `TVR-01` in room E2E evidence | Pairing UI states and seeded credential use are covered. The recorded E2E does not exercise browser approval, expiry, denial, or a real server. |
| TV-03 | Returning device, revoke, logout, and expiry | Partially verified | `2e29835`, `f07eb8e`; `SessionManagerIdentityTest`; `TVR-B12`, `TVR-B13` | Credential restore/discard and sign-out cleanup are tested. Room membership ends on sign-out; the complete device-list/revoke path was not run on a real server. |
| TV-04 | Accounts and Plex Home profiles | Blocked | `f1692e1`; `ProfileGateStateTest`; [`CONTRACT.md`](CONTRACT.md); `TVR-00` | The client has a profile gate and PIN UI, but Plex Home upstream endpoints are unverified and `features.profiles` is false in the recorded room server. No Plex Home account was available. |
| TV-05 | Profile isolation and parental controls | Implemented, not verified | `2e29835`, `f07eb8e`; native identity/session tests; [`CONTRACT.md`](CONTRACT.md) | Effective identity and cache/session cleanup are implemented. A restricted live profile and delayed cross-profile content/resource test were not available. |
| TV-06 | Home rows and discovery preferences | Partially verified | `f1692e1`, `9751b0d`; `CatalogStateTest`, `ContractFixturesTest` | Home state and native DTO fixtures cover rows and preference fields. No recorded Android journey proves personalized rows, discovery opt-out, and failure recovery together. |
| TV-07 | Library navigation, sort, filter, and pagination | Partially verified | `f1692e1`; `CatalogControlsTest`; API 31 `CatalogControlsTest` 2/2 | Catalog controls and focus restoration have emulator evidence. Large-library loading and full pagination behavior were not device-qualified. |
| TV-08 | Details, metadata, and play actions | Partially verified | `f1692e1`; `DetailsActionsTest`; `TVR-B0` | Details actions, start-over routing, and large-text wrapping are tested. The recorded room check proves the Watch Together action, not complete live metadata/playback. |
| TV-09 | Series, seasons, episodes, specials, and adjacent navigation | Implemented, not verified | `f1692e1`; `CatalogStateTest`, `ContractFixturesTest`; harness fixtures in `fake-pms.ts` | DTOs and synthetic season/special/episode fixtures exist. No recorded Android run proves season-boundary navigation against a real Plex server. |
| TV-10 | Search and available voice input | Implemented, not verified | `f1692e1`; `CatalogStateTest`; `VoiceSearch.kt` | Search state and the system recognizer adapter exist. Voice and remote search were not run as a runtime journey. |
| TV-11 | Watchlist, playlists, collections, and source identity | Implemented, not verified | `9751b0d`; `ContractFixturesTest`; `WatchtowerApi` catalog methods | Native API DTOs and screens are implemented. No recorded Android mutation run proves watchlist, playlist, collection, and permission failure behavior. |
| TV-12 | Ratings, watched state, and progress writes | Implemented, not verified | `9751b0d`, `2e29835`; `ProgressReporterTest`; native backend review disposition | Ordering and queued-write safeguards were reviewed/fixed. A live Plex mutation and failed-write UI check were not run. |
| TV-13 | Playback basics | Partially verified | `10e402a`, `a97e127`; `AuthenticatedPlaybackTest`, `PlaybackPoliciesTest`, `ProgressReporterTest` | A Media3 player rendered a fixture with authenticated Range requests and identity headers; controls and recovery are unit-tested. This is not proof of Plex playback or every remote/media-key path. |
| TV-14 | Direct play, remux, transcode, and fallback | Implemented, not verified | `10e402a`; `CapabilityMapperTest`, `PlaybackPoliciesTest`, `PlaybackRequestFactoryTest`; [`CONTRACT.md`](CONTRACT.md) | Capability and bounded fallback decisions are implemented. No real Plex decision or transcoder run was available. |
| TV-15 | Versions, editions, multipart playback, and absolute timeline | Partially verified | `10e402a`; `TimelineMapperTest`, `ContractFixturesTest`; fake-PMS multipart fixture | Multipart and timeline mapping have JVM coverage, including part boundaries. The synthetic multipart fixture was not an Android-to-Plex runtime qualification. |
| TV-16 | Audio tracks, channels, and output changes | Implemented, not verified | `10e402a`; `PlaybackRequestFactoryTest`, `TrackMapperTest`; `PlaybackController.kt` | Track selection and audio-device callbacks are implemented. There was no physical TV, HDMI receiver, soundbar, or audible-output test. |
| TV-17 | Subtitle modes, formats, forced, and SDH behavior | Partially verified | `10e402a`; `PlaybackRequestFactoryTest`, `TrackMapperTest`; fake-PMS MKV/SRT fixture | Selection and sidecar mapping have tests and synthetic SRT data. Embedded image/styled subtitle rendering and burned-caption behavior were not runtime verified. |
| TV-18 | Quality choices and delivered-output diagnostics | Implemented, not verified | `10e402a`, `9751b0d`; `CapabilityMapperTest`, `SettingsLayoutTest`; `PlaybackController.kt` | Quality choices and capability fields exist. No live measurement compared requested quality with delivered output. |
| TV-19 | Intro/credits markers, next countdown, and autoplay | Partially verified | `10e402a`; `PlaybackPoliciesTest`; fake-PMS marker fixture | Marker and countdown policy tests pass in the recorded JVM gate. No full episode playback and end-of-series runtime check was recorded. |
| TV-20 | Timestamp trickplay and thumbnail previews | Partially verified | `10e402a`; `PlaybackPoliciesTest`, `TimelineMapperTest` | D-pad timestamp scrubbing and absolute seek mapping are covered. Plex thumbnail preview assets/endpoint qualification is not present. |
| TV-21 | 4K, HDR, Dolby Vision, and surround capability matrix | Blocked | `10e402a`; `CapabilityMapperTest`, `DeviceCapabilityDetector.kt`; [`RESEARCH.md`](RESEARCH.md) | Capability reporting exists, but no physical display/audio chain or HDR/Dolby/4K media was available. Emulator output cannot close this gate. |
| TV-22 | Lifecycle, recovery, network loss, and cleanup | Partially verified | `10e402a`, `e247361`; `PlaybackPoliciesTest`, `ProgressReporterTest`, `release-launch-smoke.txt` | Interruption decisions, final-position capture, replacement suppression, and room/player cleanup are tested. Process death, network switching, and physical lifecycle/audio focus were not run. |
| TV-23 | Watch Together lobby, roles, sync, reconnect, and leave | Partially verified | `0438f96`, `e247361`, `91253ab`, `d006ca1`; room E2E JSON files | Google TV API 36 passed 27/27 checks. API 31 full run passed 12/14, with A6 and B0 failing; B-only rerun passed 16/16. The server branch and peers are scripted integration fixtures. |
| TV-24 | Per-profile settings and connection diagnostics | Partially verified | `9751b0d`, `f07eb8e`; `SettingsLayoutTest`; `PlaybackController.kt` | Preferences, quality layout, and diagnostics state exist. A complete remote settings and connection-failure journey was not recorded. |
| TV-25 | Seerr requests and issue reporting | Implemented, not verified | `9751b0d`; `WatchtowerApi` request methods; [`CONTRACT.md`](CONTRACT.md) | The client has request/issue surfaces and server capability checks. No live Seerr service was available. |
| TV-26 | Remote navigation, focus, Back, and overlays | Partially verified | `2b529d5`, `c87a664`, `f07eb8e`; `NavigationRailLayoutTest`, `RemoteDialogTest`, `PlayerOverlayFocusTest`; API 31 app-shell 12/12 | Navigation rail, D-pad focus, dialog Back, player overlay focus, and large-text wrapping have emulator evidence. Physical remote key-repeat behavior remains unverified. |
| TV-27 | TalkBack, semantics, captions, contrast, and reduced motion | Implemented, not verified | `f07eb8e`; Compose semantics in pairing/catalog/player tests | Semantics and visible labels are present in tested surfaces. TalkBack runtime behavior was not tested. |
| TV-28 | MediaSession and external media controls | Partially verified | `10e402a`, `a97e127`, `e247361`; `RoomGatedPlayerTest`; `TVR-A7`, `TVR-B7`, `TVR-B11` | MediaSession is wired through the room authority, and emulator E2E checks exercise guest and host media-key paths. Physical controllers and audio-route behavior remain unverified. |
| TV-29 | Deep links, Watch Next, and profile-safe cleanup | Partially verified | `f1692e1`, `2e29835`, `f07eb8e`; `DeepLinkResolverTest`, `WatchNextManagerTest`; `TVR-A2`, `TVR-B1` | Link validation, Watch Next profile cleanup, and fragment-only room invite behavior are tested. Launcher placement and appearance were not verified. |
| TV-30 | Voice, refresh-rate, HDR, and audio integration | Blocked | `f1692e1`, `4a267d7`; `VoiceSearch.kt`, `DeviceCapabilityDetector.kt` | The recognizer query and display/audio capability code exist. No physical device, Assistant, refresh-rate, HDR, CEC, or output-chain runtime was available. |
| TV-31 | Measured performance, bounded cache, and diagnostics | Not implemented | `f07eb8e`; `AppGraph.kt`, `PlaybackController.kt` | Image cache bounds and playback diagnostic fields exist, but the required startup/seek/memory/jank measurements and acceptance budgets have no recorded implementation or result. |
| TV-32 | Release artifacts, update, rollback, and Play readiness | Partially verified | `f07eb8e`, `9d3d8ad`, `d006ca1`; [`artifacts-SHA256SUMS`](evidence/artifacts-SHA256SUMS), [`signing-compat-api36.txt`](evidence/signing-compat-api36.txt), [`native-libs-16kb-audit.txt`](evidence/native-libs-16kb-audit.txt) | Debug, unsigned release APK/AAB, mapping, signing-compatibility, 16 KB audit, and launch smoke evidence exist. No owner-signed release, Play upload, or Play rollback was performed. |
| TVT-01 | Pairing security and failure cases | Partially verified | `7b00837`, `45ea0ee`, `2e29835`; backend `test/native/pairing.test.ts`, `pairing-claim.test.ts`, `link.test.ts`; `PairingScreenTest` | Backend tests cover unknown/incorrect polling secrets, slow_down, atomic claim with the 60 s identical-grant replay, expiry pruning, slot exhaustion, process-restart state loss, forwarded-address limits, CSRF tokens and cross-origin approval. The TV-side pairing journey against a live server (code display, approval on a phone, lost-response retry) was not run end to end; the E2E seeded a device credential instead. |
| TVT-02 | Identity, profile, PIN, revoke, and switch isolation | Partially verified | `2e29835`, `f07eb8e`; `SessionManagerIdentityTest`, `ProfileGateStateTest`; native backend review dispositions | Session expiry and identity cleanup are tested and review fixes landed. Plex Home, live PIN/profile switching, and delayed side-effect cases remain unverified. |
| TVT-03 | Native API shapes, errors, pagination, cancellation, and skew | Partially verified | `762cc03`, `7b00837`, `45ea0ee`; `ContractFixturesTest`, `WatchtowerApiTest`; [`CONTRACT.md`](CONTRACT.md) | Golden DTO round trips, headers, error envelopes, retry-after, redirects, and incompatible HTML 404 handling are covered. Full offline/401/403/429/5xx and server-version matrix was not run against a deployed server. |
| TVT-04 | Authenticated resource and redirect protection | Partially verified | `7b00837`, `10e402a`; `AuthenticatedPlaybackTest`, `WatchtowerApiTest`; [`CONTRACT.md`](CONTRACT.md) | Origin restriction, bearer/identity headers, Range behavior, and cross-origin refusal are tested. Every HLS URI type, subtitle/image expiry, and live redirect matrix remains unverified. |
| TVT-05 | Media decisions and codec/HDR fallback | Blocked | `10e402a`; `CapabilityMapperTest`, `PlaybackPoliciesTest`; fake-PMS decision fixture | Client decisions and fallback policy have unit evidence. No real Plex decision, 4K, HEVC, HDR, VP9/AV1, or decoder-failure device run exists. |
| TVT-06 | Audio formats, languages, description, and routes | Blocked | `10e402a`; `PlaybackRequestFactoryTest`, `TrackMapperTest` | Track intent mapping is tested. AAC fixture playback does not establish AC3/EAC3/DTS/TrueHD, multichannel, headphones, HDMI, or passthrough behavior. |
| TVT-07 | Subtitle formats, timing, style, forced, and SDH | Partially verified | `10e402a`; `PlaybackRequestFactoryTest`, `TrackMapperTest`; fake-PMS SRT fixture | Text selection and embedded-order mapping are tested. Embedded styled/image formats, encoding, burn-in, and runtime timing were not verified. |
| TVT-08 | Absolute timeline, seek, replacement, editions, and multipart | Partially verified | `10e402a`, `4058b9e`; `TimelineMapperTest`, `ProgressReporterTest`; `TVR-A5`, `TVR-A6`, `TVR-A8`, `TVR-A9` | Timeline and seek policies have JVM coverage and room seek checks. API 31 A6 failed with -636 ms skew; real transcode, edition, and long-seek coverage is absent. |
| TVT-09 | Session ownership, replacement, stop ordering, and progress | Partially verified | `10e402a`, `a97e127`, `2e29835`; `ProgressReporterTest`; `TVR-B4`, `TVR-B5` | Per-device room playback ownership and progress sequencing are covered. Same-account TV/browser replacement, Trakt behavior, and live retry ordering were not fully exercised. |
| TVT-10 | D-pad, Back, media keys, repeat, IME, and focus | Partially verified | `2b529d5`, `c87a664`, `f07eb8e`; `NavigationRailLayoutTest`, `RemoteDialogTest`, `PlayerOverlayFocusTest`, `CatalogControlsTest`; API 31 app-shell 12/12 | Emulator UI tests cover focus, Back, drawer scrolling, details focus, and key actions. Physical remote repeat, IME, and voice input remain unverified. |
| TVT-11 | Lifecycle, process recovery, network, and audio focus | Implemented, not verified | `10e402a`, `e247361`; `PlaybackPoliciesTest`, `release-launch-smoke.txt` | Lifecycle and interruption code is present and launch smoke is clean. Process kill/recreate, network switch, server restart, and audio-focus/output tests were not run. |
| TVT-12 | Full Watch Together protocol and role enforcement | Partially verified | `0438f96`, `3a7bde7`, `e247361`, `91253ab`, `adc1756`, `d006ca1`; all room E2E JSON files | API 36 is 27/27; API 31 full run is 12/14 and B-only rerun is 16/16. WAN sync, host transfer under all paths, and the open WT hand-off findings remain. |
| TVT-13 | Accessibility, privacy, and redacted diagnostics | Blocked | `f07eb8e`, `2e29835`; `WatchNextManagerTest`; [`CONTRACT.md`](CONTRACT.md) | Privacy cleanup and redaction-oriented code paths exist. TalkBack primary-flow, protected launcher, cache-clearing, and runtime diagnostics checks were not available. |
| TVT-14 | Startup, seek, memory, jank, and long-session performance | Not implemented | `f07eb8e`; no performance evidence file | No measured p50/p95 startup or seek data, 30-minute soak, low-memory run, or leak-growth result was produced. |
| TVT-15 | Release install/update, minification, AAB, ABI, and 16 KB gates | Partially verified | `9d3d8ad`, `d006ca1`; [`artifacts-SHA256SUMS`](evidence/artifacts-SHA256SUMS), [`artifacts-MANIFEST.tsv`](evidence/artifacts-MANIFEST.tsv), [`signing-compat-api36.txt`](evidence/signing-compat-api36.txt), [`native-libs-16kb-audit.txt`](evidence/native-libs-16kb-audit.txt) | Packaging, QA launch, signing compatibility, ABI listing, and 16 KB alignment are recorded. The release outputs are unsigned, and Play pre-launch/review was not run. |

## Environment

- Host: macOS 27.0 on Apple M1 Max, 32 GB.
- `watchtower-agent-36`: `system-images;android-36;google-tv;arm64-v8a`, product `sdk_google_atv64_amati_arm64`, 1080p, 4 KB pages.
- `watchtower-tv-31`: `android-31;android-tv;arm64-v8a`, product `sdk_google_atv64_arm64`, TV 1080p, 4 KB pages.
- `watchtower-tv-36-16k`: `android-36;google-tv-ps16k;arm64-v8a`, product `sdk_google_atv64_amati_arm64_16k`, 16 KB pages.
- There was no physical Android TV or Google TV device, HDMI/AVR/soundbar output chain, real Plex Media Server, Plex Home account, live Seerr service, Play Console access, or WAN room test.
- Media was synthetic ffmpeg testsrc2 H.264/AAC MP4 (60 seconds), two-part MP4, MKV with SRT, and HLS from `scripts/tv-e2e/generate-media.ts`, served by `scripts/tv-e2e/fake-pms.ts` on `127.0.0.1:32499`. `plex.tv` was stubbed by `scripts/tv-e2e/plextv-shim.mjs`.
- Output was the emulator virtual display and audio only.
- TV work was on `codex/android-tv` at `d006ca1`. The combined Watch Together run was on `codex/tv-wt-integration` at `19daa48` (`codex/android-tv` `9d3d8ad` plus `codex/watch-together` `956ceee` plus `8c368d2` bearer room wiring with `test/integration/native-rooms.test.ts`). Nothing was merged to `main`, pushed, deployed, or published.

## Commands run and results

These are the recorded commands and results from 2026-09-27/28. They were not re-run while writing this document because this documentation task explicitly excludes builds, tests, emulators, and servers.

- TV branch `just check`: 47 files/255 tests pass; `just build`: pass.
- Integration `just check`: 64 files/459 tests pass; `just build`: pass.
- Android (f07eb8e, from `android-tv/`):

  ```text
  ./gradlew :app:testDebugUnitTest :app:lintDebug :app:lintRelease :app:assembleDebug :app:connectedDebugAndroidTest
  ```

  Result: 104 JVM tests pass with 1 skip (the Watch Together fixture drift check skips on the TV branch; it runs and passes on the integration branch), lint clean, 21/21 instrumentation tests on the Google TV API 36 emulator; on the API 31 emulator `CatalogControlsTest` 2/2, `PlayerOverlayFocusTest` 3/3, and the app-shell round's classes 12/12 passed.
- `scripts/tv-e2e/package-artifacts.sh` produced a debug APK, unsigned release APK and AAB, R8 mapping, and a debug-key QA copy; see the artifact section below.
- `scripts/tv-e2e/release-smoke.sh` launched the QA copy on all three emulators without app crashes; see [`release-launch-smoke.txt`](evidence/release-launch-smoke.txt).
- `native-libs-16kb-audit.txt` found only `androidx.graphics.path` native libraries for `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64`; all `LOAD` segments were 16 KB aligned and `zipalign -P 16` was successful.
- `signing-compat-api36.txt` recorded same-key upgrade success, downgrade rejection, different-key update rejection, and unsigned-install failure.
- CI workflow validation with actionlint passed; the workflow was never run on GitHub.

## E2E check list

`room-e2e.ts` records these checks. `PASS` and `FAIL` below are copied from the evidence JSON files. `not recorded` means the full API 31 run stopped after its failed `TVR-B0` check; the B-only rerun records those checks separately.

| Check | Google TV API 36 | Android TV API 31 full | Android TV API 31 B-only rerun |
| --- | --- | --- | --- |
| TVR-00 combined server advertises rooms | PASS | PASS | PASS |
| TVR-01 harness credential stored on the emulator | PASS | PASS | PASS |
| TVR-A0 web host creates a room | PASS | PASS | not recorded |
| TVR-A1 web host registers a room-scoped playback session | PASS | PASS | not recorded |
| TVR-A2 TV joins through a `watchtower://join` invite link | PASS | PASS | not recorded |
| TVR-A3 TV player claims readiness at the room target | PASS | PASS | not recorded |
| TVR-A4 web host play accepted | PASS | PASS | not recorded |
| TVR-A5 TV follows host play | PASS | PASS | not recorded |
| TVR-A6 TV stays within 500 ms while playing (loopback) | PASS | FAIL, skew -636 ms | not recorded |
| TVR-A7 guest TV media key cannot pause the room | PASS | PASS | not recorded |
| TVR-A8 TV follows host seek | PASS | PASS | not recorded |
| TVR-A9 TV follows host pause | PASS | PASS | not recorded |
| TVR-A10 host End reaches the TV | PASS | PASS | not recorded |
| TVR-B0 details offers Watch together for a rooms-enabled profile | PASS | FAIL, D-pad selection timed out | PASS |
| TVR-B1 TV host lobby shows a fragment-only invite link | PASS | not recorded | PASS |
| TVR-B2 web guest joins the TV-hosted room | PASS | not recorded | PASS |
| TVR-B3 a second TV identity (bearer) joins the same room | PASS | not recorded | PASS |
| TVR-B4 presence cannot claim another device's playback session | PASS | not recorded | PASS |
| TVR-B5 native presence with its own playback session is accepted | PASS | not recorded | PASS |
| TVR-B6 TV host player claims readiness | PASS | not recorded | PASS |
| TVR-B7 TV host media key play becomes a room command | PASS | not recorded | PASS |
| TVR-B8 bearer participant receives the host's play over SSE | PASS | not recorded | PASS |
| TVR-B9 TV host plays at the room target (loopback) | PASS | not recorded | PASS |
| TVR-B10 guest transport command is rejected (`not_host`) | PASS | not recorded | PASS |
| TVR-B11 TV host media key pause becomes a room command | PASS | not recorded | PASS |
| TVR-B12 signing the TV out ends membership and transfers host | PASS | not recorded | PASS |
| TVR-B13 signed-out TV stops room playback | PASS | not recorded | PASS |

The API 31 full-run `TVR-A6` failure was skew `-636 ms` while rate-correcting after a hard seek forced by Watch Together finding 1. Its `TVR-B0` failure was a D-pad timeout selecting `Watch together` after scenario A. The scenario B-only rerun passed 16/16. The earlier API 31 full run at `233ad6e` was 26/27 with A6 at `-673 ms`.

## Independent review summary and dispositions

| Review area | Disposition |
| --- | --- |
| Credential/profile isolation | PIN limits before Plex, stale-verification compare-and-set, queued playback-write rechecks, and forged `X-Forwarded-For` pairing limits were fixed in `2e29835` with `TRUST_PROXY`. Watch Next identity-discard cleanup and in-memory PIN removal were fixed in `f07eb8e`. The 24-hour clock-skew grace on stored expiry remains by design. Native room membership binding to `identityVersion` remains Watch Together-owned. |
| Room and MediaSession | Fail-open room routes, navigation abandoning rooms, presence acknowledgement before stream replacement, audio-focus/noisy/suppression/lifecycle interruptions, non-terminal command errors, guest countdown actions, terminal player release, and presence `429` retry were fixed in `e247361`. |
| Focus, lifecycle, and release | Drawer scrolling and accessible labels, action-row wrapping at 1.3 font scale, deterministic initial focus, process-restored deep links, version-code strategy, `lintRelease`, explicitly unsigned AAB naming, and backup/data-extraction rules were fixed in `f07eb8e`. |
| Open review findings | Pairing screen coroutines still use `AppGraph.appScope` (Medium), 5% overscan-safe insets remain open (Medium), and CI produces unsigned release outputs by design because production signing secrets were not allowed. |

## Watch Together hand-off findings

Watch Together owns these findings. They were not changed in this Android TV documentation task:

1. Coordinator `case "play"` sets `room.phase = "playing"` before computing `targetPositionMs`. Starting from lobby or paused therefore advances the anchor by the wait time. The trace showed lobby `positionMs 0` at 1666 ms and `play` at about 6413 ms producing `positionMs 4746`. Compute the position before changing the phase.
2. `sync.ts` pre-start reconciliation schedules play without pre-seeking when a paused player is far from `anchor.positionMs`.
3. Joining as a TV guest needs a Watch Together-designed short code as part of the shared contract. The TV currently accepts the full invite link or secret typed/pasted and `watchtower://join#i=<secret>` links.
4. Native room memberships are not bound to `identityVersion`.

## Artifacts

The packaged artifacts live in the ignored directory `tmp/tv/artifacts/`; they are not committed. Hashes below are from [`artifacts-SHA256SUMS`](evidence/artifacts-SHA256SUMS).

| Path | SHA-256 | State |
| --- | --- | --- |
| `tmp/tv/artifacts/watchtower-tv-0.1.0-1-debug.apk` | `b1a3b09c19d9149d924bf0424302d3152edb02749bf67f0f7bec5e2795b110af` | Debug APK |
| `tmp/tv/artifacts/watchtower-tv-0.1.0-1-release-QA-DEBUG-KEY-SIGNED.apk` | `7c56764badbca29dc0d01e92f161548f332571808d4acab2a0855f6e865c9b31` | QA copy signed with the Android debug key; do not distribute |
| `tmp/tv/artifacts/watchtower-tv-0.1.0-1-release-unsigned.apk` | `600c85d16bba65cc4057bafde7ae6a8648f43275cbafd9e817273e48b140c6e4` | Unsigned release APK |
| `tmp/tv/artifacts/watchtower-tv-0.1.0-1-release-unsigned.aab` | `1b4324f905e116b4890e7b64c694e1daf4615a9d3da60551138c3fca43176512` | Unsigned release AAB |
| `tmp/tv/artifacts/mapping-0.1.0-1.txt` | `4d16b3e98e346ca49d826cd1b31fb408111405f82e8b0b91319601ac1c8ee453` | R8 mapping |

## Unrun and blocked gates

- Physical TV qualification: D-pad remotes, CEC, Bluetooth/HDMI audio, AVR/soundbar output, refresh-rate switching, HDR/Dolby Vision/Atmos passthrough, and 4K decode.
- Real Plex qualification: transcoder decisions, Plex Home profile switching, upstream expiry, and real media/resource authorization.
- TalkBack runtime behavior.
- Google Assistant and voice-search runtime behavior.
- Watch Next launcher appearance and placement.
- Play pre-launch report, TV quality review, store listing, and publication.
- Owner-signed release APK/AAB and upload-key/app-signing-key continuity.
- Reachable reviewer demo Watchtower server and test account.
- Live network/WAN room synchronization and TV-to-TV physical qualification.
- R8-minified networking journey. The minified QA copy was launched, but its pairing/catalog/playback journey was not run; release transport is HTTPS-only.
- Measured startup, seek, memory, jank, long-session, low-memory, and leak-growth gates.

The brief names reviewer access as `TV-G5`, but `IMPLEMENTATION.md` defines only `TV-01` through `TV-32` and `TVT-01` through `TVT-15`. `TV-G5` is therefore not mapped to the acceptance matrix; the reviewer-access gap is recorded above and in [`RELEASE.md`](RELEASE.md).