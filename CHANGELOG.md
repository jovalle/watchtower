# Changelog

All notable changes to Watchtower are documented here. Versions follow [Semantic Versioning](https://semver.org) and notes are generated from [Conventional Commits](https://www.conventionalcommits.org).

## [1.9.0](https://github.com/jovalle/watchtower/compare/v1.8.1...v1.9.0) (2026-11-07)

### 🚀 Features

- **android-tv:** Join and host Watch Together rooms ([`0438f96`](https://github.com/jovalle/watchtower/commit/0438f9674cb8767b2c6c743002354b7240c2676f))

  Kotlin client for the Watch Together room API (no local coordinator): protocol models checked against the WT fixtures, clock sampling and reconciliation ported from sync.ts, retried mutations, SSE with staleness recovery, and a RoomManager that ends on leave, terminal events or any identity change. In a room every transport intent, including MediaSession and remote keys, becomes a host-only room command; automatic skip/next are denied and the host requests auto-advance at credits like the web player. Presence reports the native playback id, claims readiness only at the room target and replaces streams as replacingSource. Adds details/drawer entry points, a lobby with invite QR (fragment link), invite entry and watchtower://join links.

- **android-tv:** Validate room snapshots like WT's parseSnapshot ([`3a7bde7`](https://github.com/jovalle/watchtower/commit/3a7bde7e57c43b9a1958e5edf5c4ff871f5143da))
- **android-tv:** Collections, playlists, ratings, requests and preferences ([`9751b0d`](https://github.com/jovalle/watchtower/commit/9751b0d146c4cc0eb85007508aad21646ed97539))

  Adds library collections and playlists (paged; add from details, remove with confirmation), a D-pad rating control with rollback, Seerr request availability/requests and issue reports behind features.requests, paging for seasons and episodes beyond 100, server and device-local playback preferences, localized room errors, and focus restoration. Identity changes drop stale results and reload for the new profile.

- **android-tv:** Expand browsing and playback experience ([`9f1b34a`](https://github.com/jovalle/watchtower/commit/9f1b34aa0c243a107c5e56d51ecf19eb07813820))
- **integration:** Accept Android TV device sessions on Watch Together routes ([`8c368d2`](https://github.com/jovalle/watchtower/commit/8c368d293312c6cbec11f2c176fa9f7086b09747))

  Bearer room requests resolve through the native principal (identity version required, no cookie fallback, CSRF proof only for cookie requests); rooms advertise the WATCH_TOGETHER rollout switch; revoking, signing out or switching the profile of a TV ends its memberships. Adds native bearer room integration tests.

- **integrations:** Prefer Seerr environment configuration ([`7345470`](https://github.com/jovalle/watchtower/commit/734547060be92290a56f4ca6bf32b71458fad806))
- **native:** Add device pairing, bearer principals and the v1 JSON facade ([`7b00837`](https://github.com/jovalle/watchtower/commit/7b00837e691e1cf4817843ed479f7193c886b79f))

  Browser-approved pairing with lost-response replay, sealed server-side Plex credentials, identity-versioned bearer principals, catalog/playback routes, device-scoped playback sessions and a shared HLS proxy core. Includes a fake Plex harness for isolated TV end-to-end runs.

- **native:** Notify listeners when a device identity ends ([`2e5f3e8`](https://github.com/jovalle/watchtower/commit/2e5f3e8358d28399a286c3046638c2e989c2a695))

  Revocation and profile replacement emit (userId, deviceSessionId) so dependent state such as Watch Together memberships can be released without coupling the device store to rooms.

- **native:** Expand Android TV catalog and playback services ([`d2ee94f`](https://github.com/jovalle/watchtower/commit/d2ee94fd9be2e299961f80b563e90992bef89fa1))
- **rooms:** Freeze room protocol v1 and per-device playback scope ([`0d0033e`](https://github.com/jovalle/watchtower/commit/0d0033e83c0bfdb8c5fecca99a57bf3a1bc6eafb))
- **rooms:** Add authenticated room coordinator, API and SSE ([`c2e7fbb`](https://github.com/jovalle/watchtower/commit/c2e7fbb09e0088bf22d8707266591a3057e58c1b))
- **rooms:** Add web room UI and synchronized player adapter ([`501570b`](https://github.com/jovalle/watchtower/commit/501570b335558abc74b5e2b56e45436405d59954))
- **tv:** Freeze the native API v1 contract and scaffold the Android TV app ([`762cc03`](https://github.com/jovalle/watchtower/commit/762cc03bb118f4c0b7b77bedf2bc2564185e6d0a))

  Pin AGP 9.4.1, Gradle 9.8.0 (verified wrapper), Kotlin 2.4.20, Compose for TV and Media3 1.11.1. Adds golden JSON fixtures shared by the server and Kotlin tests, the Kotlin DTOs and API client, Keystore-encrypted credential storage, and the pairing and identity session manager.

- **tv:** Add per-profile local playback preferences ([`292f5cc`](https://github.com/jovalle/watchtower/commit/292f5cce42a33708f1a1c979ab882f4ea791ccec))
- **tv:** Add pairing, profiles, catalog, search, settings and Watch Next UI ([`f1692e1`](https://github.com/jovalle/watchtower/commit/f1692e17054ae0a9e3253c18a7face4c4eda09b9))
- **tv:** Add the Media3 player with absolute timeline, tracks, progress and MediaSession ([`10e402a`](https://github.com/jovalle/watchtower/commit/10e402ac80e93c71f2de1c7c08499eaa84c29e6c))

  One ExoPlayer per player destination on a SurfaceView, authenticated same-origin data sources, multipart and HLS timeline mapping, sequenced progress with stop cleanup, local/replacement track and quality changes, markers and next-episode countdown, bounded decoder fallback, and a gated MediaSession.

### 🐛 Bug Fixes

- **android-tv:** Run the room observation tick ([`adc1756`](https://github.com/jovalle/watchtower/commit/adc175675b6c8310030dd9178d7e42b938e02480))

  The first tick compared elapsedRealtime against Long.MIN_VALUE, which overflows, so drift correction, readiness re-evaluation, presence observation and host auto-advance never ran while playing. Found by the room E2E (TV stayed 4.7 s behind the room anchor). Adds opt-in tracing to the E2E driver.

- **android-tv:** Keep the navigation rail from covering the screen ([`2b529d5`](https://github.com/jovalle/watchtower/commit/2b529d5cb71e30bd35a0a7679d8124561251f368))

  fillMaxSize() before width() fixed the rail to the full width, squeezing every screen (home, details, lobby, player) into a 48 px column and out of the accessibility tree. Found by the room E2E; adds a layout regression test (fails at 960 dp before the fix).

- **android-tv:** Compensate seek latency on room hard seeks ([`4058b9e`](https://github.com/jovalle/watchtower/commit/4058b9e91fbb379358a9eb3b6142c12e8a370cd9))

  A TV rebuffers after seeking, so a hard seek to the room target resumed ~600 ms behind and rate correction took ~40 s to close it. Hard seeks during room playback now land ahead by the measured seek-to-ready time (capped at 2 s). The E2E driver selects TV controls with D-pad focus instead of touch.

- **android-tv:** Focus Play when details open ([`c87a664`](https://github.com/jovalle/watchtower/commit/c87a664b9cd3785108d6eb97cafd063e99572ac7))

  On Android TV 12 (API 31) the details screen started with no focused control, so the first D-pad press did nothing visible. The E2E driver now also presses to establish focus and can trace focus moves.

- **android-tv:** Keep room playback fail-closed and room-authoritative ([`e247361`](https://github.com/jovalle/watchtower/commit/e2473619412859fd1550ab77f4ef6c7daa1da409))

  Room routes without an active session recover once and otherwise show an exit-only terminal view (never solo playback). Leaving the lobby, replacing a room or starting solo playback leaves the membership. User stream replacements wait for a replacingSource presence acknowledgement. Audio focus loss, becoming-noisy, suppression and activity stop mark the TV unready and stop reconciliation (decoders are released while stopped). Only membership/identity-ending errors end the session; presence 429 retries the latest observation. Guests no longer see countdown actions; terminal events release the player. Player overlays take and trap focus and restore the opener.

- **android-tv:** Scrollable drawer, focus, wrapping actions and release metadata ([`f07eb8e`](https://github.com/jovalle/watchtower/commit/f07eb8e6c0922dc128ba7045aebbced795cd6a41))

  The drawer scrolls with focus and exposes full labels; details and settings actions wrap at large font scales; Home, Search, Settings, server entry and profiles take deterministic initial focus and Home restores its card; process-restored deep links are kept (saved state stores only a digest); discarding a stored or active identity emits one IdentityChange so identity-scoped cleanup runs; submitted PINs are cleared; backup and device-transfer are excluded on all API levels; versionCode/versionName come from Gradle properties or environment with validation; CI adds lintRelease and names the unsigned AAB explicitly.

- **auth:** Offer retry after incomplete Plex sign-in ([`a5b06b4`](https://github.com/jovalle/watchtower/commit/a5b06b460f65b3aa1409f343db1059e1dd713b1d))
- **cache:** Restrict public files to cached logos ([`fcc9305`](https://github.com/jovalle/watchtower/commit/fcc9305f597b66c3ac38f25efee02a4dc3e96ec3))
- **docker:** Include server client IP resolver ([`923d2fa`](https://github.com/jovalle/watchtower/commit/923d2fa43f97c53feb687a2fd6709686a341b7b0))
- **landing:** Clarify access and expose FAQ state ([`6246aa5`](https://github.com/jovalle/watchtower/commit/6246aa55c761265ce3ab2f24bf003c27247b93ab))
- **library:** Clear all filters in one navigation ([`036d210`](https://github.com/jovalle/watchtower/commit/036d2102713c53b2006a6ee8f30347c354302de4))
- **library:** Prevent duplicate alphabet clicks ([`54b3ed5`](https://github.com/jovalle/watchtower/commit/54b3ed528193959b16341db15e2588da56fe2759))
- **library:** Allow remote focus through alphabet ([`1f2e6d1`](https://github.com/jovalle/watchtower/commit/1f2e6d10493ea8b831ce91f0ad4c2d71cd1cf845))
- **native:** Harden re-verification, pairing bounds, HLS rewriting and playback decisions ([`45ea0ee`](https://github.com/jovalle/watchtower/commit/45ea0eefcf1fdd6708617dcc058ca0df22cc180d))

  Distinguish plex.tv denial from outages, bound pairing memory, recover failed claims, normalize Plex codec names, fix subtitle delivery by transport, stop replaced transcoders, populate adjacent items and autoplay, return JSON 405/404 for native routes, and extend the fake Plex harness with shows, multipart and MKV media.

- **native:** Enforce PIN limits, stale verification and queued-write rechecks ([`2e29835`](https://github.com/jovalle/watchtower/commit/2e298353692962712b5d8ee8f35f77e40daadac4))

  Protected-profile PIN attempts are serialized and blocked before reaching Plex after five failures; plex.tv verification writes are compare-and-swap on the verified token, identity version and profile so a concurrent profile switch can never receive the previous profile's server token; queued timeline/stop writes recheck the principal right before the Plex call; pairing limits key on the socket peer unless TRUST_PROXY names trusted proxies (forged X-Forwarded-For no longer bypasses them). Tests wait for queued device-store writes before removing their data directory.

- **player:** Integrate room controls with audited playback UI ([`017aa2e`](https://github.com/jovalle/watchtower/commit/017aa2e3f080f595582ecf91e0a2ef4017ea1502))
- **rooms:** Keep media attached across room snapshots and bound SSE heartbeats ([`7c9e252`](https://github.com/jovalle/watchtower/commit/7c9e25266c90d1f6e596a56678487cf91ba7d800))
- **rooms:** Stop transcode reload chase and report paused buffering recovery ([`96a8269`](https://github.com/jovalle/watchtower/commit/96a8269d34bf33919e5282481b668ba2280a7349))

  A fresh room source is already opened at the room position, so reconcile no longer reloads it for load-time drift; it reloads only once the source is aligned or when the room seeked during the load. A paused room never fires playing, so canplay now clears buffering and re-reports readiness.

- **rooms:** Keep the room client connected after non-terminal command rejections ([`b676c30`](https://github.com/jovalle/watchtower/commit/b676c30e3269543383c833a88a8f32b86fe2ff54))

  not_host, no next episode, rate limits and upstream errors now drop only that intent; not_found re-reads the room to tell a missing room from a missing next item. A connection that fails terminally shows its reason instead of a stale notice.

- **rooms:** Keep the room panel clear of player menus ([`fcc5ef0`](https://github.com/jovalle/watchtower/commit/fcc5ef0e139318511ca6c962a7c07bba64dd5a1f))

  Dock the panel top-left, collapse it while playing, and keep the live status, next-episode countdown and ready gesture visible when collapsed. Hide it behind terminal overlays.

- **rooms:** Coalesce host seek bursts and keep outgoing media inert ([`f3648a5`](https://github.com/jovalle/watchtower/commit/f3648a521a87cfc0d69ef9a108d8cb4d7d55b0e1))

  Relative host seeks within 250 ms become one room seek, so key repeat no longer floods commands and members. Once the room moves to another title, the outgoing player pauses and stops aligning, claiming readiness and auto-advancing, instead of racing the route with a reload of the old title.

- **rooms:** Resend throttled presence instead of reconnecting ([`9b60433`](https://github.com/jovalle/watchtower/commit/9b604332c4d45aa0677113c6d230d189082bbf5f))

  Presence is latest-state, so a 429 schedules one resend of the newest report instead of tearing down the event stream.

- **rooms:** Keep playback armed when room play() is interrupted ([`dd0758a`](https://github.com/jovalle/watchtower/commit/dd0758a48f744733502fe39660fb1008aecfe206))

  Only NotAllowedError means autoplay was refused; an AbortError from a pause, seek or reload no longer disarms the member for the next title. Ended media stays at the end while the room runs out the title instead of play() restarting it from 0.

- **rooms:** Close authorization, media identity and retry gaps from review ([`b04b429`](https://github.com/jovalle/watchtower/commit/b04b429e5009d7f93bcb49c6f3d4aa308fc6eb25))

  Next-item access is re-checked when members join during authorization; departed members no longer affect the advance. Room members stream only the room's exact media and part, and revalidation removes members whose Plex media changed. Identical command retries get their cached result before phase and rate checks, and membership history is bounded.

- **rooms:** Validate nested snapshot media and participant fields ([`5063680`](https://github.com/jovalle/watchtower/commit/5063680bb2bcd9ddc20e9e37145130045c14807a))
- **rooms:** Recover from a failed first contact and a refused source replacement ([`8211386`](https://github.com/jovalle/watchtower/commit/8211386be91493962a90b00d3046c28d2cd21a54))

  A failed first clock or room read enters the reconnect loop instead of staying connecting. When a source replacement is not acknowledged the player restores its prior presence and re-claims readiness, and a pending coalesced seek is dropped when the room media generation changes.

- **rooms:** Make takeover and terminal overlays modal ([`63bdfef`](https://github.com/jovalle/watchtower/commit/63bdfef32361a5e7f78a92684c82699abee72e5f))

  Both alertdialogs set aria-modal and keep Tab inside the overlay so covered player controls are unreachable.

- **rooms:** Keep solo playback sessions in their original scope ([`f0fd030`](https://github.com/jovalle/watchtower/commit/f0fd030da7a9ed5e988486773c8e657833cac64c))

  Only room playback sessions are scoped to the device cookie; solo sessions keep the pre-feature shared per-account scope, so solo replacement ordering is unchanged.

- **rooms:** Start and resume from the held position ([`3848e23`](https://github.com/jovalle/watchtower/commit/3848e233d573a4779441f71105e2f133a7c6094d))

  play switched the phase to playing before reading the held position, so the lobby or pause wait was added to the new anchor and everyone jumped forward. Reported by the Android TV room E2E.

- **search:** Report provider failures ([`b8398e9`](https://github.com/jovalle/watchtower/commit/b8398e986333dadada932302730cfc09a33fb5bb))
- **trailer:** Use an accessible modal dialog ([`3ff8f00`](https://github.com/jovalle/watchtower/commit/3ff8f00e898e035c9a791271051f0e29e258296b))
- **tv:** Declare speech recognizer package visibility for voice search ([`4a267d7`](https://github.com/jovalle/watchtower/commit/4a267d7d71fcabbbf45b34d12ab499bef6c13dd0))
- **tv:** Gate automatic skip/next and every MediaSession path, and capture the final position before release ([`a97e127`](https://github.com/jovalle/watchtower/commit/a97e12779bd663cdf0df4e67dbc515b1c1b56558))

  Auto-skip and autoplay-next now pass the transport authority, MediaSession setPlayWhenReady/next/previous/default-position calls route through the intent gate, media-swapping and speed commands are withheld, the final stop no longer reads a released player off its thread, and sidecars attach only to their part.

- **ui:** Preserve completed layout consistency audit ([`566ee65`](https://github.com/jovalle/watchtower/commit/566ee65ebe3b541786859b749f2676251d008265))

### ⚡ Performance

- **home:** Stream optional rows and logos ([`06f3a94`](https://github.com/jovalle/watchtower/commit/06f3a949dcbf0da2a837b3326eaf6a8f04b1caa9))
- **library:** Paginate results and reuse bounded indexes ([`bf31df6`](https://github.com/jovalle/watchtower/commit/bf31df69a4c7a0bbe2cad53aa53e883a6890af78))
- **library:** Page and merge Plex results upstream ([`301a62b`](https://github.com/jovalle/watchtower/commit/301a62b3a5059b3d252f65800f82be75474d1bb7))

### ♻️ Refactoring

- **android-tv:** Finalize standalone feature workspace ([`423ad49`](https://github.com/jovalle/watchtower/commit/423ad490f7717082fd0394cffeb22dfd39db59ae))
- **playback:** Share the device-scoped session API with Watch Together ([`fa4fec7`](https://github.com/jovalle/watchtower/commit/fa4fec7bb2f9cf7285793436e743e88e3c8c13f6))

  Adopt the scope parameter and field from codex/watch-together (0d0033e) for web sessions and scope native sessions to their device session, so both tracks order replacements per device through one generation key.

### 📚 Documentation

- **android-tv:** Record E2E, release, 16 KB and signing evidence ([`d006ca1`](https://github.com/jovalle/watchtower/commit/d006ca1bcfdf8e1184d281ccdeab018dd1fcfda8))

  Sanitized results from the combined room E2E (Google TV API 36 and Android TV API 31 emulators), artifact checksums and badging, native-library 16 KB audit, release launch smoke on API 31/36/16 KB emulators, and the upgrade/signing compatibility check, plus the audit and smoke scripts that produce them.

- **android-tv:** Developer guide, acceptance matrix and release procedure ([`edc4be3`](https://github.com/jovalle/watchtower/commit/edc4be3797d36da6a5c71cf020246c7c5cc43431))

  README covers build, test, local harness, versioning, signing variables and sideload upgrades. ACCEPTANCE maps TV-01..TV-32 and TVT-01..TVT-15 to commits, tests and evidence with conservative statuses, environment, commands, review dispositions, Watch Together hand-offs and blocked gates. RELEASE covers signing without secrets, cross-channel signing with Play App Signing, the Play TV requirement review, privacy inventory, reviewer access, checklist, rollback and API compatibility.

- **android-tv:** Record final combined runs against Watch Together 8299dc1 ([`fe6ec24`](https://github.com/jovalle/watchtower/commit/fe6ec243fe7db9e5dc83d114c78ba738c793137c))

  Watch Together fixed the play-anchor jump (3848e23); with it merged the API 31 sync check passes. Final results: Google TV API 36 27/27, Android TV API 31 13/14 with the details-focus failure after scenario A left open.

- **handoffs:** Add the Watch Together and Android TV handoff pack ([`b27504e`](https://github.com/jovalle/watchtower/commit/b27504e9fbd959b65467e55f566fc0eda3b06e7e))
- **handoffs:** Add web and Android TV handoff pack ([`d59c1c3`](https://github.com/jovalle/watchtower/commit/d59c1c317b7591471842c1329d172c76409b17cf))
- **rooms:** Add local Watch Together acceptance harness ([`2eab39c`](https://github.com/jovalle/watchtower/commit/2eab39c04258d27295a951697d20ceaa48ddad22))
- **rooms:** Capture presence, commands and screens in the browser harness ([`956ceee`](https://github.com/jovalle/watchtower/commit/956ceee56872f637b1a7d5ba43c39ede7ed13a4f))

  Failed steps record each viewer's panel and terminal text; runs keep presence reports, command results and player console lines. WT-16 reports the startup owner-token check separately, and WT-08 rewinds before the late join so it happens mid-title.

- **rooms:** Isolate harness ports and refuse to share them ([`e0fac75`](https://github.com/jovalle/watchtower/commit/e0fac75dfc5cb50d9383715e5621784fdfa56afb))

  Another local harness also listened on 32499, so a failed synthetic Plex start let Watchtower talk to it. Ports are now overridable, the synthetic Plex default moves to 32519, and run.mjs aborts when a port is taken or server.json points elsewhere.

- **rooms:** Add the Watch Together user guide and README entry ([`9c5b339`](https://github.com/jovalle/watchtower/commit/9c5b3392a233328ee1550aff18216614f45e78a2))

  Covers starting and joining rooms, host and personal controls, buffering and reconnect behavior, leaving, unsupported cases and troubleshooting; the README adds the feature, links and the WATCH_TOGETHER variable.

- **rooms:** Record acceptance evidence, operations and shared-contract dependencies ([`aac2016`](https://github.com/jovalle/watchtower/commit/aac20165214e62b616f687991ca9c9c9687bb3f0))

  ACCEPTANCE.md maps every WT and WTT ID to observed results, commands, environment and artifacts, with remaining live gates. OPERATIONS.md covers single-process limits, proxy requirements, diagnostics and rollback. DEPENDENCIES.md records the frozen v1 contract, Android boundaries, client lessons and merge order.

- **rooms:** Assert start and resume position continuity in the browser harness ([`eff04db`](https://github.com/jovalle/watchtower/commit/eff04dbe80973a8a1bc7b7e9f8d925b88a4f9c05))
- **rooms:** Update acceptance evidence to the final code commit ([`8299dc1`](https://github.com/jovalle/watchtower/commit/8299dc10576745a94c72af0bace9183070b43060))

  Records the final protocol and browser runs on 3848e23, the start/resume anchor defect, and the commits the Android integration branch still needs.

- Record security response and performance validation ([`d3986d4`](https://github.com/jovalle/watchtower/commit/d3986d4b4beed0919a091acb4a9d1f64bd84365d))
- Clarify integration playback verification ([`cf2ee33`](https://github.com/jovalle/watchtower/commit/cf2ee33dc7a87a95d0cb1508a58b7f92e012e5de))

<details>
<summary><strong>🔧 Maintenance</strong> (13)</summary>

- Limit Vitest discovery to project files ([`45379e6`](https://github.com/jovalle/watchtower/commit/45379e602e0fe86ded2f262cf120699eaba8db22))
- **rooms:** Add adversarial security, race and failure coverage ([`75a18dd`](https://github.com/jovalle/watchtower/commit/75a18dd57cf13532abcb514b3a6899d9478b5c2b))
- **android-tv:** Expose Watch Together room fixtures to unit tests ([`72bb504`](https://github.com/jovalle/watchtower/commit/72bb5046b41db56fd8d0fe874786f9b88b3d5e20))
- **android-tv:** Add OkHttp SSE for room event streams ([`b585d96`](https://github.com/jovalle/watchtower/commit/b585d96bc8aacce117a1dd7d8f9852f8903a7f99))
- **tv-e2e:** Drive TV room journeys against a combined server ([`91253ab`](https://github.com/jovalle/watchtower/commit/91253abd38e40fc46fb66f78818641910746d97f))
- **android-tv:** Keep the room fixture byte-identical to Watch Together's ([`10bb944`](https://github.com/jovalle/watchtower/commit/10bb94404f3117033c1d6da0bbe61c43066e8d26))
- **tv-e2e:** Fall back to key events where media_session dispatch is unavailable ([`f9c33d2`](https://github.com/jovalle/watchtower/commit/f9c33d2098c04bbe5b9e4dce556acc7417fe6c45))
- **android-tv:** Keep the E2E credential hook out of connected suites ([`7be5d6f`](https://github.com/jovalle/watchtower/commit/7be5d6fb8fe2c8b4388b185108e42a0305c91726))
- **android-tv:** Test, lint and build the TV app ([`d00c588`](https://github.com/jovalle/watchtower/commit/d00c5888766af50ad24590c895b170e85f9f6534))
- **tv-e2e:** Package artifacts and check upgrade/signing compatibility ([`9d3d8ad`](https://github.com/jovalle/watchtower/commit/9d3d8adee5d8379d752ecf83d374b7b483b5c442))
- **tv-e2e:** Wait for room conditions instead of fixed delays ([`db27cf1`](https://github.com/jovalle/watchtower/commit/db27cf10678613cffebbb76b821a6f59be52f26d))
- **android-tv:** Publish signed APK with releases ([`30e7a78`](https://github.com/jovalle/watchtower/commit/30e7a781a5453095cb64b1652bfb7e4d5c0934ab))
- **android-tv:** Use isolated signing project ([`dd9012e`](https://github.com/jovalle/watchtower/commit/dd9012e642f691ea0f59c244ae09d0ee08086d2d))

</details>

### merge

- Integrate main fixes into audited WIP ([`7c5c031`](https://github.com/jovalle/watchtower/commit/7c5c031057dca1f0dd707f4065a47fe375fadccb))

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.9.0
```

**Full Changelog**: [`v1.8.1...v1.9.0`](https://github.com/jovalle/watchtower/compare/v1.8.1...v1.9.0)

<sub>83 commits · 41 days since v1.8.1</sub>

## [1.8.1](https://github.com/jovalle/watchtower/compare/v1.8.0...v1.8.1) (2026-09-27)

### 🐛 Bug Fixes

- **release:** Build Docker images from the release tag ([`2970654`](https://github.com/jovalle/watchtower/commit/297065454577d39f69bff53179b28f06f432cf45))

  The docker-publish job checked out the workflow_run head SHA, which predates semantic-release's version bump, so images tagged 1.8.0 shipped package.json 1.7.0 and npm's start banner reported watchtower@1.7.0. Check out the new release tag instead.

<details>
<summary><strong>🔧 Maintenance</strong> (2)</summary>

- **hooks:** Run the Vitest suite in pre-commit ([`7ff246a`](https://github.com/jovalle/watchtower/commit/7ff246a931f1114a21076261d863713c653c4099))
- **release:** Format .releaserc.json ([`8578769`](https://github.com/jovalle/watchtower/commit/8578769ae3273a5918910b769053d494c56c7ae6))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.8.1
```

**Full Changelog**: [`v1.8.0...v1.8.1`](https://github.com/jovalle/watchtower/compare/v1.8.0...v1.8.1)

<sub>3 commits</sub>

## [1.8.0](https://github.com/jovalle/watchtower/compare/v1.7.0...v1.8.0) (2026-09-27)

### 🚀 Features

- **a11y:** Move between cards with a remote or arrow keys and restore route focus ([`67f5774`](https://github.com/jovalle/watchtower/commit/67f577497888a766dc64a775e6f69961ee1be6c1))
- **details:** Play TMDB trailers in a modal ([`a0acb1d`](https://github.com/jovalle/watchtower/commit/a0acb1dfb065f76689f970435ec97b71163af9da))
- **home:** Use Plex continue watching hub and collapse duplicate versions ([`679fbb3`](https://github.com/jovalle/watchtower/commit/679fbb36aa9f7af43e7d032e5f8928401d969438))
- **home:** Add trending and promoted collection rows with per-user toggles ([`d208b3a`](https://github.com/jovalle/watchtower/commit/d208b3a80da918fed22f49856be96d700443c1fb))

  Home rows can be turned off individually. A library-only preference hides TMDB trending, search results, and recommendations.

- **nav:** Organize browsing into Watch, Discover and My Stuff with a personal Home ([`83e9ec6`](https://github.com/jovalle/watchtower/commit/83e9ec6dc0ed66d8b9fb535ad60778547337eb36))

  Movies, TV, New and Lists routes redirect to their new locations.

- **notifications:** Notify users when their Seerr requests change ([`6824d8f`](https://github.com/jovalle/watchtower/commit/6824d8f479bc85c518712abf4a640e60873881ad))
- **player:** Skip intro, next-episode countdown, and picture-in-picture ([`6efaf6c`](https://github.com/jovalle/watchtower/commit/6efaf6ca9f0acc855818dc809226f91822ed6f1b))

  Read Plex intro/credits markers and show a Skip Intro button, with an optional per-user auto-skip preference in settings. Offer the next episode (crossing seasons) with a 10s countdown during credits or at the end. Cache the plex.tv user lookup so loaders can read preferences cheaply.

- **player:** Direct-play files the browser can decode ([`a886665`](https://github.com/jovalle/watchtower/commit/a886665447da15cc3a5b0f6fd8067fcfa401cbd4))

  The browser reports its supported containers and codecs in a cookie. When the original file matches (and isn't Dolby Vision profile 5), the player streams it through the range-request proxy instead of Plex HLS, with the existing transcode fallback on errors. Mobile devices no longer always transcode when their browser can play the file.

- **player:** Switch audio and subtitle tracks ([`8544e95`](https://github.com/jovalle/watchtower/commit/8544e9544139ce090ec341c31b9c9ec00dc0b836))

  Track picks are saved per user on the Plex server, as Plex apps do, and the stream restarts at the current position. External SRT/VTT subtitles load in place as a WebVTT sidecar; embedded, styled, and image subtitles are burned in by Plex over HLS. Direct file playback falls back to HLS when the saved audio track isn't the file's default or a subtitle must be burned in.

- **plex:** Paginate library and watchlist reads and match titles by provider GUID ([`cf0b1d2`](https://github.com/jovalle/watchtower/commit/cf0b1d2ee1eca0765c814f5ed05f338c5db2bd45))

  /library/all?guid= does not match secondary GUIDs, so findByGuid scans paginated GUID metadata and shares the scan across concurrent lookups. Watchlist cache version 4 refreshes previously truncated snapshots.

- **search:** Add library and TMDB search with Cmd+K shortcut ([`b921956`](https://github.com/jovalle/watchtower/commit/b921956a4a46d6f703e2695882f4e8382c39c160))
- **seerr:** Request missing titles through Seerr ([`66697e1`](https://github.com/jovalle/watchtower/commit/66697e130de8c41f394c9b8d43942320c01c1db3))

  The server owner connects Seerr from Settings > Integrations (detect, test, save); the API key stays on the server. Titles not in the library open a request dialog, and requests are filed as the user's own Seerr account so Seerr permissions and quotas apply.

- **seerr:** Show 4K and season request state and add Requests and Issues pages ([`fc08eb7`](https://github.com/jovalle/watchtower/commit/fc08eb7c2b4e2b458231fb8da9e41f7428d8092f))
- **setup:** Configure the Plex server at /setup instead of environment variables ([`e95e05c`](https://github.com/jovalle/watchtower/commit/e95e05c429902694ee843f608c1785381890ccc0))

  The server URL, token and machine ID are saved under DATA_PATH/config by the Plex owner using the setup code from the startup log. Settings already imported server-config.server.ts, so the previous commit did not typecheck.

- **titles:** Open TMDB and IMDb titles on library detail pages by exact GUID ([`f156ebc`](https://github.com/jovalle/watchtower/commit/f156ebc8ee8545a5670053464e657a82c7d973ed))

  Watchlist entries no longer offer Play from a title and year match alone.

- **trakt:** Connect Trakt accounts and scrobble playback ([`09f181a`](https://github.com/jovalle/watchtower/commit/09f181aaa595e687e0a0ab3cbc761c4c12e4100f))

  The server owner adds Trakt app credentials under Integrations. Each user links their account with Trakt's device-code flow; tokens are kept server-side per user and refreshed automatically. Playback state changes reported to Plex are mirrored to Trakt scrobble start/pause/stop.

- **ui:** Add the Watchtower logo and toast confirmations in settings ([`bef205f`](https://github.com/jovalle/watchtower/commit/bef205f16189cd126d7a4539c44a7901b3f7a419))

### 🛡️ Security

- **security:** Keep Plex tokens out of the browser ([`b1db40a`](https://github.com/jovalle/watchtower/commit/b1db40a411b3c232c28c6180a830a37c68741c91))

  Details, lists, and watchlist loaders no longer return the Plex token or server URL. Watchlist and New & Popular images from Plex Discover load through /api/plex/discover-image, which attaches the user's plex.tv token server-side; caches holding the old token-bearing URLs are invalidated. The watchlist debug endpoint is limited to the server owner in development and no longer returns a token prefix.

### 🐛 Bug Fixes

- **images:** Restrict image proxy to image paths and allowed hosts ([`d309277`](https://github.com/jovalle/watchtower/commit/d309277a906f551f7e4d97cbe3e5593fd976de60))

  Unauthenticated requests used the admin PLEX_TOKEN for any path and appended it to arbitrary absolute URLs. Limit Plex paths to image prefixes, never forward tokens to external hosts, and only pass through image responses.

- **integrations:** Align Seerr statuses and Trakt auth with current APIs ([`f8fe1e8`](https://github.com/jovalle/watchtower/commit/f8fe1e838fdf31e60c4299345339680a28917384))

  Blocklisted Seerr titles no longer offer a request; deleted titles can be requested again. Trakt OAuth calls use auth.trakt.tv, send a versioned User-Agent, and share one refresh per user because refresh tokens are single-use. Movie scrobbles include title and year, and episodes without a TVDB ID fall back to show IDs with season and episode numbers.

- **player:** Scope playback to owned sessions and harden the stream proxies ([`15c5c67`](https://github.com/jovalle/watchtower/commit/15c5c677cffeaffaf9f6f8a824a7052c24b3c97c))

  Timeline writes are serialized per session and ordered across replacement sessions; HLS and stream proxies follow redirected playlists and honor Range and cancellation. Also adds the autoplay preference and the native receiver picker.

- **trakt:** Read the watchlist client ID from Integrations ([`47cfe27`](https://github.com/jovalle/watchtower/commit/47cfe2778d2bedb12305bb32ac3a6491d5f147f6))

  The Trakt watchlist import now uses the client ID saved in Settings > Integrations, falling back to TRAKT_CLIENT_ID.

### ♻️ Refactoring

- **trakt:** Remove the TRAKT_CLIENT_ID environment fallback ([`8a12e55`](https://github.com/jovalle/watchtower/commit/8a12e5568163ba4dd8429d7bebc9484697a01e61))

### 📚 Documentation

- Add the delivery plan, playback evaluation and implementation handoff ([`3868ec9`](https://github.com/jovalle/watchtower/commit/3868ec919091798d0ecf3e97f44ca61925c5c119))

<details>
<summary><strong>🔧 Maintenance</strong> (4)</summary>

- **deps:** Update actions/checkout action to v6 ([`a224600`](https://github.com/jovalle/watchtower/commit/a2246001602dbe0ba4140f28a3a47b044db6d92c)) by @renovate[bot]
- **deps:** Update actions/setup-node action to v6 ([`d480d4c`](https://github.com/jovalle/watchtower/commit/d480d4c79472afc13dfae2237716cfb962cc8fd1)) by @renovate[bot]
- **deps:** Update dependency node to v24 ([`025a8d1`](https://github.com/jovalle/watchtower/commit/025a8d19f45142f6f6337c0e6ee1b5e15ac5d546)) by @renovate[bot]
- **deps:** Remove unused @tanstack/react-virtual ([`aae18cf`](https://github.com/jovalle/watchtower/commit/aae18cf9107b7a4a3e87bba56fb4a470e1631659))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.8.0
```

**Full Changelog**: [`v1.7.0...v1.8.0`](https://github.com/jovalle/watchtower/compare/v1.7.0...v1.8.0)

<sub>28 commits · 167 days since v1.7.0</sub>

## [1.7.0](https://github.com/jovalle/watchtower/compare/v1.6.0...v1.7.0) (2026-04-13)

### 🚀 Features

- **auth:** Enhance session management with redirect sanitization and meta tags ([`bab3876`](https://github.com/jovalle/watchtower/commit/bab3876f191e4440d404f734c2f26ea493d92bee))

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.7.0
```

**Full Changelog**: [`v1.6.0...v1.7.0`](https://github.com/jovalle/watchtower/compare/v1.6.0...v1.7.0)

<sub>1 commit · 18 days since v1.6.0</sub>

## [1.6.0](https://github.com/jovalle/watchtower/compare/v1.5.0...v1.6.0) (2026-03-26)

### 🚀 Features

- **vote:** Implement private cinema (movie night ranked choice voting) dashboard ([`36676f0`](https://github.com/jovalle/watchtower/commit/36676f00df93758b0db2700bcc82daad735de182))

  feat(vote): create vote layout for authenticated and guest users

  fix(server): silently reject Chrome DevTools well-known probes

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.6.0
```

**Full Changelog**: [`v1.5.0...v1.6.0`](https://github.com/jovalle/watchtower/compare/v1.5.0...v1.6.0)

<sub>1 commit · 78 days since v1.5.0</sub>

## [1.5.0](https://github.com/jovalle/watchtower/compare/v1.4.0...v1.5.0) (2026-01-07)

### 🚀 Features

- **images:** Add server-side resizing for poster and backdrop images ([`49ad481`](https://github.com/jovalle/watchtower/commit/49ad481ba08a6bb76d25019a62392eea387a64db))

### ⚡ Performance

- **watchlist:** Implement deferred loading ([`aa93937`](https://github.com/jovalle/watchtower/commit/aa939379671c912a43572b7367fff7c7c06fdc40))

<details>
<summary><strong>🔧 Maintenance</strong> (1)</summary>

- Add .serena to gitignore and update default client ID ([`ef4b645`](https://github.com/jovalle/watchtower/commit/ef4b645c1a0a75578dfae007f7ab7464e8856ed0))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.5.0
```

**Full Changelog**: [`v1.4.0...v1.5.0`](https://github.com/jovalle/watchtower/compare/v1.4.0...v1.5.0)

<sub>3 commits · 1 day since v1.4.0</sub>

## [1.4.0](https://github.com/jovalle/watchtower/compare/v1.3.0...v1.4.0) (2026-01-06)

### 🚀 Features

- **images:** Add server-side image caching ([`63c0139`](https://github.com/jovalle/watchtower/commit/63c013992dee26cb44e72b813472cb2928def95a))
- **player:** Improve HLS/transcode stream handling ([`c05d1a8`](https://github.com/jovalle/watchtower/commit/c05d1a847d0408aa7ac557be84286f2e524a3cc6))
- **server:** Add custom Express server with structured logging ([`ab8fa12`](https://github.com/jovalle/watchtower/commit/ab8fa1296312fee4298f1de2dde1ff37bda5ff77))
- **streaming:** Add HLS proxy for transcoded video streams ([`bc83d4f`](https://github.com/jovalle/watchtower/commit/bc83d4f3277d8a2fd1b3f337a4c6527194ad30cb))

### 🐛 Bug Fixes

- **server:** Resolve ESLint warning for dynamic import ([`51700e1`](https://github.com/jovalle/watchtower/commit/51700e175d3879f70844bf9b79d51b59142bb82b))

### ♻️ Refactoring

- **ui:** Improve MediaRow scroll for touch devices ([`31237c5`](https://github.com/jovalle/watchtower/commit/31237c5397f160e40c613589d4ea57470307468b))

### 📚 Documentation

- Convert roadmap to checkbox format ([`ffe2b68`](https://github.com/jovalle/watchtower/commit/ffe2b68ffca0e7411e82ffa7678df074deecdb6e))

<details>
<summary><strong>🔧 Maintenance</strong> (2)</summary>

- **build:** Add lockfile sync target ([`e6566ba`](https://github.com/jovalle/watchtower/commit/e6566ba58c66fafd4482501ecad9a0a78de2c9c5))
- **deps:** Add express, lru-cache, react-virtual and sync lockfiles ([`945cd24`](https://github.com/jovalle/watchtower/commit/945cd24bc06bae2ef01d6b2bab47a62b89638946))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.4.0
```

**Full Changelog**: [`v1.3.0...v1.4.0`](https://github.com/jovalle/watchtower/compare/v1.3.0...v1.4.0)

<sub>9 commits · 1 day since v1.3.0</sub>

## [1.3.0](https://github.com/jovalle/watchtower/compare/v1.2.1...v1.3.0) (2026-01-05)

### 🚀 Features

- **auth:** Add server access verification for shared users ([`f634ce7`](https://github.com/jovalle/watchtower/commit/f634ce7a66b3452b6a4cc749467d35d4e75b9793))
- **cache:** Add cache clearing endpoint for server owners ([`ea7dbc7`](https://github.com/jovalle/watchtower/commit/ea7dbc707e632977006771a5454612ba115238c3))
- **ratings:** Add OMDb integration for external ratings display ([`f8c3f5a`](https://github.com/jovalle/watchtower/commit/f8c3f5a3d72b9b46f6c60a27ba624018ac2bad92))
- **settings:** Add per-user watchlist configuration ([`963a8e8`](https://github.com/jovalle/watchtower/commit/963a8e84bc74c38db4d2fdd0226e773170b3b384))
- **watchlist:** Integrate per-user settings for trakt/imdb sources ([`0c478d0`](https://github.com/jovalle/watchtower/commit/0c478d0be020166b98f5eb120fa5dae482eef748))

### 🐛 Bug Fixes

- **mobile:** Prevent white bar artifacts with proper backgrounds and safe-area insets ([`08cf0c0`](https://github.com/jovalle/watchtower/commit/08cf0c08fda3d2354309ab46474787cf2f1c7869))
- **ui:** Update components for new auth context ([`73bac53`](https://github.com/jovalle/watchtower/commit/73bac53aac51b45ece3c3dc0a10748833834d5aa))
- Isolate user-specific cache data to prevent cross-user data leakage ([`d6d738a`](https://github.com/jovalle/watchtower/commit/d6d738a1f8748710f5e47c91268f6ee287132c4f))

### ♻️ Refactoring

- **api:** Migrate plex routes to use server-specific tokens ([`5fe1c53`](https://github.com/jovalle/watchtower/commit/5fe1c53dfa2d5973e191df45d13bb5de0deeab36))
- **config:** Simplify env vars and add per-user settings migration ([`52b4e77`](https://github.com/jovalle/watchtower/commit/52b4e7723d67396766dc42d109897cbc192506e9))
- **plex:** Clean up client and add type definitions ([`3bddced`](https://github.com/jovalle/watchtower/commit/3bddced929db6f9912a2ab09da551384b198d063))
- **routes:** Update app routes for new auth system ([`b8ecda4`](https://github.com/jovalle/watchtower/commit/b8ecda48e5e4eb4519c77b4ed14dc38b027b2ce4))

<details>
<summary><strong>🔧 Maintenance</strong> (1)</summary>

- Add linting configs and update gitignore ([`52f4b4e`](https://github.com/jovalle/watchtower/commit/52f4b4e843a791de171267755e5110b2a4bc8304))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.3.0
```

**Full Changelog**: [`v1.2.1...v1.3.0`](https://github.com/jovalle/watchtower/compare/v1.2.1...v1.3.0)

<sub>13 commits · 3 days since v1.2.1</sub>

## [1.2.1](https://github.com/jovalle/watchtower/compare/v1.2.0...v1.2.1) (2026-01-02)

### 🐛 Bug Fixes

- Proxy absolute image URLs to prevent mixed content errors ([`9f43d3a`](https://github.com/jovalle/watchtower/commit/9f43d3a05d328d9c6f53ab9f04df02de2f2afa3c))

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.2.1
```

**Full Changelog**: [`v1.2.0...v1.2.1`](https://github.com/jovalle/watchtower/compare/v1.2.0...v1.2.1)

<sub>1 commit</sub>

## [1.2.0](https://github.com/jovalle/watchtower/compare/v1.1.0...v1.2.0) (2026-01-02)

### 🚀 Features

- **dashboard:** Add real-time streaming sessions dashboard ([`ad5e618`](https://github.com/jovalle/watchtower/commit/ad5e61812a56237964aca558e89734fac47bb839))
- **library:** Add macOS dock-style magnification to alphabet sidebar ([`f37723f`](https://github.com/jovalle/watchtower/commit/f37723f5753641546d004a44febc6780765d1f96))
- **plex:** Add streaming session types and API client methods ([`f7c0910`](https://github.com/jovalle/watchtower/commit/f7c0910bcc50f5b0f07d09104338bb6f26358bd8))
- **pwa:** Add progressive web app support with install prompt ([`0550301`](https://github.com/jovalle/watchtower/commit/0550301ef8b882e071bea2bdb9e2643ababdd663))
- **ui:** Add FilterDropdown multi-select component ([`1db9f18`](https://github.com/jovalle/watchtower/commit/1db9f18f2bf9a1986384ebe853b5462f56c7d645))

### 🐛 Bug Fixes

- **player:** Use named imports from hls.js to resolve lint warnings ([`d7a8d4d`](https://github.com/jovalle/watchtower/commit/d7a8d4dcefe5da6ceec8237cc32847df7cc09a78))
- **ui:** Minor tweaks to header, library, and media components ([`c59ac06`](https://github.com/jovalle/watchtower/commit/c59ac0671efe60379d16c28c62023d079f9e9283))
- **ui:** Improve ProxiedImage empty src handling and cache detection ([`3a9d329`](https://github.com/jovalle/watchtower/commit/3a9d32966bcac84ce1b92b7ff5f0028e2cf4a5a2))

### ♻️ Refactoring

- **media:** Reorganize media detail and watchlist pages ([`5f17298`](https://github.com/jovalle/watchtower/commit/5f17298512b669f705a4e9c49fbff18bd1d5be05))

<details>
<summary><strong>🔧 Maintenance</strong> (2)</summary>

- **docker:** Harden container security and update env config ([`8f9715a`](https://github.com/jovalle/watchtower/commit/8f9715ab0a0a11232bf15491903d54992dc5526f))
- Add frozen lockfile check and ci target ([`7ee7959`](https://github.com/jovalle/watchtower/commit/7ee7959c0281edf36f4f9853b732c3ba7054bbd4))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.2.0
```

**Full Changelog**: [`v1.1.0...v1.2.0`](https://github.com/jovalle/watchtower/compare/v1.1.0...v1.2.0)

<sub>11 commits · 1 day since v1.1.0</sub>

## [1.1.0](https://github.com/jovalle/watchtower/compare/v1.0.2...v1.1.0) (2026-01-01)

### 🚀 Features

- **docker:** Default PLEX_SERVER_URL to http://plex:32400 ([`e811c60`](https://github.com/jovalle/watchtower/commit/e811c60da07b624d5ca96ce1d07aebe2fb52028d))
- Add Plex image proxy API and ProxiedImage component ([`bbc6b5c`](https://github.com/jovalle/watchtower/commit/bbc6b5c3bf601748207bd7ba7f9f2464aa754a6c))
- Add startup health checks and Plex connectivity logging ([`04abb94`](https://github.com/jovalle/watchtower/commit/04abb9488b0a69236f0361e1784248eb5c85467d))

### ♻️ Refactoring

- **auth:** Remove login page, redirect directly to Plex OAuth ([`eec1ea4`](https://github.com/jovalle/watchtower/commit/eec1ea4b2a692c07b4197006b22e4829df61714b))
- **media:** Replace img tags with ProxiedImage component ([`e2a10a2`](https://github.com/jovalle/watchtower/commit/e2a10a2ffa0c976cc5b045b0fa5c0ac09970a62c))
- **routes:** Use shared image proxy helpers across all routes ([`0bc9ffa`](https://github.com/jovalle/watchtower/commit/0bc9ffaa7ee5d69b3ad457c85d9a25352413ded6))

### 📚 Documentation

- Generating favicons ([`91cfef0`](https://github.com/jovalle/watchtower/commit/91cfef09e913ea5e312c8685d163862ae2ffec31))

<details>
<summary><strong>🔧 Maintenance</strong> (8)</summary>

- Update favicon assets ([`091d943`](https://github.com/jovalle/watchtower/commit/091d9438970fa5d92f741739e337ad9b41de67c9))
- **release:** Switch from exec to npm plugin for version bumping ([`c7a92d2`](https://github.com/jovalle/watchtower/commit/c7a92d2f28c7aaa12a83ee41f8622c0eb1072654))
- Add Makefile with dev, build, test, and docker targets ([`7d1a670`](https://github.com/jovalle/watchtower/commit/7d1a670534eb2be7e1dc300362587cdd8f582cb1))
- Make lint ([`7641053`](https://github.com/jovalle/watchtower/commit/7641053c926a85d32348c55b5d0bc1a7b0c6b41a))
- Ensure lint-free to commit ([`82b0c90`](https://github.com/jovalle/watchtower/commit/82b0c90a816a4c33a1114e6fec24fbf1b5750c67))
- Trigger release on successful builds ([`a2661b5`](https://github.com/jovalle/watchtower/commit/a2661b5a3e09b5eeedeba16859dad2288c4dc18d))
- **docker:** Skip lifecycle scripts in prod install to avoid missing husky ([`799092e`](https://github.com/jovalle/watchtower/commit/799092e9226fb3c20133bbac6f0f731e6dde84f8))
- **release:** Create .release-version file for docker publish trigger ([`ea2c7ab`](https://github.com/jovalle/watchtower/commit/ea2c7ab9bc663f881e19f047db1314b25144a26f))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.1.0
```

**Full Changelog**: [`v1.0.2...v1.1.0`](https://github.com/jovalle/watchtower/compare/v1.0.2...v1.1.0)

<sub>15 commits · 1 day since v1.0.2</sub>

## [1.0.2](https://github.com/jovalle/watchtower/compare/v1.0.1...v1.0.2) (2025-12-31)

### 🐛 Bug Fixes

- Set lighter mango for hover (used dittotones to generate palette) ([`88137e1`](https://github.com/jovalle/watchtower/commit/88137e14005f96cf79522788fb94003b838db13b))
- Docker compose build/up ([`6c06295`](https://github.com/jovalle/watchtower/commit/6c062951fb919cd38cec9c0fbfdaa74c11c2534c))

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.0.2
```

**Full Changelog**: [`v1.0.1...v1.0.2`](https://github.com/jovalle/watchtower/compare/v1.0.1...v1.0.2)

<sub>2 commits · 2 days since v1.0.1</sub>

## [1.0.1](https://github.com/jovalle/watchtower/compare/v1.0.0...v1.0.1) (2025-12-29)

### 🐛 Bug Fixes

- Enable git credentials for semantic-release ([`6014f61`](https://github.com/jovalle/watchtower/commit/6014f6196e0ccdcf65cb1118296a520547a7649b))

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.0.1
```

**Full Changelog**: [`v1.0.0...v1.0.1`](https://github.com/jovalle/watchtower/compare/v1.0.0...v1.0.1)

<sub>1 commit</sub>

## [1.0.0](https://github.com/jovalle/watchtower/releases/tag/v1.0.0) (2025-12-29)

### ♻️ Refactoring

- First release ([`8e706a5`](https://github.com/jovalle/watchtower/commit/8e706a58eead5a163b4281f3d2c1d23ae31990ae))

<details>
<summary><strong>🔧 Maintenance</strong> (1)</summary>

- Add README ([`ba2e5b4`](https://github.com/jovalle/watchtower/commit/ba2e5b4b182130c39fd92e5f2de9059dcb297b70))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.0.0
```

<sub>2 commits</sub>

