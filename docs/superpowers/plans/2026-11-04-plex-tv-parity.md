# Plex TV Experience Reconstruction Implementation Plan

> **For agentic workers:** Use the existing worktree. Execute the tasks below, with independent workers only on disjoint files. Keep a progress record in `tmp/plex-reference/progress.md`; no commits or external publication in this pass.

**Goal:** Rebuild Watchtower's personal-media TV experience from the installed current-generation Plex TV reference, with full Watchtower/W branding and preserved playback.

**Architecture:** Keep Compose for TV, Navigation, Media3 and the native API. Replace presentation and focus structure using measured captures. Add nullable presentation metadata and source-specific reads through existing authenticated API patterns.

**Tech Stack:** Kotlin/Compose for TV, Media3, Coil3, TypeScript native API, Vitest, Android instrumentation/JVM tests.

**Spec:** `docs/superpowers/specs/2026-11-04-plex-tv-parity-design.md`.

## Global Constraints

- Preserve all existing uncommitted work, HLS identity fix, profile authorization, pointer activation and restoration tests.
- Main/layout audit and Watch Together remain untouched. Real server configuration and credentials stay private; no real Seerr writes.
- Reference: signed Plex Android TV2026.19.1 on1920×1080/320dpi. Screens and XML live in `tmp/plex-reference`.
- Existing gold W launcher is correct. Reuse Watchtower assets; no Plex code/fonts/icons bundled.
- No new dependency for presentation utilities. No invented library ratings, providers or unsupported destinations.
- Device installation and tests are coordinated by the primary agent; workers never operate emulator or run concurrent Gradle builds.

## Review Focus

- Navigating Home/library/detail/player and back must restore the actual card, not jump to the first item or drawer.
- Identity change invalidates in-flight metadata, children and library source loads.
- Many libraries/long labels/1.3× text must remain reachable without changing normal reference geometry.
- Artwork/logo failure keeps text titles readable; missing palette/summary/avatar has safe fallbacks.
- Player overlay focus, pointer input and Back preserve the repaired lifecycle and controls timeout.

## Task 1: Reference capture and additive presentation data

**Files:** `app/lib/native/{catalog.server,contract}.ts`, applicable existing native routes and Plex types/client; Android `api/{Dto,WatchtowerApi}.kt`; native contract fixtures/tests.

**Interfaces:** `MediaSummary` gains optional/defaulted nullable `summary` and `clearLogoUrl`; episode posters use show posters and still thumbnails stay separate. Enrich existing `MediaDetail` using real upstream fields. Add a typed authenticated per-library recommendation read only if upstream hubs can be mapped truthfully; preserve original list/children API. Any other required metadata follows established image-proxy and identity rules.

- [x] Inspect actual upstream field definitions and existing callers; write failing mapper/route tests for episode poster separation, presentation metadata and access scope.
- [x] Observe failure, implement the smallest compatible mapping/API/DTO additions, update fixtures and rerun affected tests/typecheck.
- [x] Record any unverified upstream fields or unsupported reference features; do not silently fake them.

## Task 2: Measured shell, brand and shared controls

**Files:** `ui/{AppRoot,TvAction}.kt`, resources, `ui/NavigationRailLayoutTest.kt`, `ui/TvActionTest.kt`.

**Interfaces:** Preserve existing `TvAction`, `TvSymbol`, `pointerClick`, `NavigationRail` call signatures unless necessary; communicate any addition to catalog/player workers. Content origin64dp absolute. Compact floating rail with W; expanded inset overlay≈194dp wide. Detail symbol faces32dp/circular; primary play pill with readable label. Focused controls white/black; gold reserved for brand/progress/selection accents. Retain accessible names and disabled behavior.

- [x] Extend meaningful layout/focus/pointer tests before behavior changes; verify old geometry fails where applicable.
- [x] Rebuild overlay navigation without moving page content. Order profile/brand, My Lists, Search, Home, Libraries, Watchtower services/settings. Preserve source state and hide rail during playback.
- [x] Apply measured typography/background/control shapes consistently; check compactW and existing launcher/banner assets.

## Task 3: Focus-driven catalog, source pages and show/season experience

**Files:** `catalog/{CatalogScreens,CatalogPanels,CatalogState}.kt`, their tests/resources. Coordinate additive DTO interfaces with Task1.

**Interfaces:** Preserve existing routes/actions/data source APIs where possible. New recommended-source data consumes Task1's typed read. Shared controls consume Task2's preserved signatures. Never edit AppRoot/TvAction or DTO files owned by other tasks.

- [x] Add regression tests for focused item selecting Home hero, episode/season route context and return focus; run RED before new logic.
- [x] Replace contained Home hero with full-screen artwork/color wash and compact title/meta region above horizontally scrolling120×180dp posters; focused card determines hero. Maintain scroll/card restoration.
- [x] Source header uses Recommended/Browse/Collections/Playlists tabs with functional destinations, six-column Browse grid, compact readable filter/sort values and right-side option panels. Avoid dead tabs.
- [x] Movie/details use clear-logo fallback, compact metadata/ratings, three-line summary, director, play pill/circular actions, circular120dp cast. Show/season/episode use season strip and horizontal256×144dp episode stills with selected episode metadata. Preserve versions, editions, all actions, pagination/errors and request/report permissions.
- [x] Preserve overview/accessibility/empty/error flows and larger-text reachability. Record feature gaps that require unavailable Plex services.

## Task 4: Player, settings, auth and Watchtower-service adaptation

**Files:** `playback/PlayerScreen.kt` (controller only if observed interaction requires it), `settings/SettingsScreen.kt`, `pairing/PairingScreens.kt`, `services/SeerrInboxScreens.kt`, applicable tests/resources.

**Interfaces:** Preserve `PlaybackController`, lifecycle/HLS/timeline and existing action callbacks; use Task2's shared controls. Reference screenshots are supplied as captured; do not claim unobserved player parity.

- [x] Capture reference player menus/settings before making reference-specific claims; tests pin focus, disabled overlays, hardware Back and pointer input.
- [x] Rebuild reference player presentation while keeping functional scrub/seek, audio/subtitles/quality, diagnostics, skip intro and next episode. If reference playback is blocked, record that and retain tested behavior; no fabricated match claims.
- [x] Match inset panels, compact rows/type/white focus across settings/auth and Requests/Issues. Full wordmark where readable; W for compact brand. Preserve server/PIN/profile/session semantics and Seerr permission/error states.

## Task 5: Integration, rendered comparisons and acceptance

**Files:** final handoff and ignored capture/test evidence; fixes only where integration finds issues.

- [x] Run native JVM/lint/APK and instrumentation build, then relevant device tests. Run web suite/typecheck/lint/build for changed API.
- [x] Install completed APK without clearing data; restore sidecar/reverse and compare captured Home/rails/libraries/details/show/player/settings/services. Verify selected normal and1.3× text paths. Record unmatched states and exact-parity gaps in `tmp/plex-reference/capture-matrix.md`.
- [x] Repeat real-library start/resume/pause/stop; use fixtures for service mutations. Inspect cleanup and navigation return focus.
- [x] Obtain fresh code/evidence review, resolve material findings, and deliver exact passing check counts plus observed parity gaps. Leave emulator on usable Watchtower Home with playback stopped.

## Core checkpoint and continuing reference measurements

The earlier core checkpoint passed99 JVM/52 device/407 web/17 read-only UI checks/8 HLS cycles. The following expansion supersedes its pending client-side Search, Categories, Settings hierarchy and Playback Options gaps. It does not add Plex-hosted services or claim universal pixel/feature identity.

## Expanded personal-media parity pass

- [x] Capture linked Search/filters/results, Categories, Playback Options/Speed/Sleep/Display.
- [x] Rebuild Search keyboard/results/source filters and profile/server-scoped recent queries.
- [x] Add real Categories, genre filter/Clear, genre-scoped letters/items and saved category focus.
- [x] Add working speed/display choices, cancellable elapsed-time sleep timer, after-item policy, parent-menu Back and real statistics.
- [x] Replace flat Settings with seven supported categories and nested choices, retaining all real callbacks and permission/error states.
- [x] Calibrate compact rail, global letter spacing, compact toggles and nearest-edge player menu focus scrolling.
- [x] Resolve long-list initial-focus review findings with RED/GREEN regressions.
- [x] Complete final native/device gates, real options/settings journeys and repeated HLS starts after ContentFrame changes.
- [x] Refresh final acceptance evidence, hash, handoff and explicit limits.

### Final observed player details

- [x] Capture valid individual Audio/Subtitles/Quality panels and full seven-pane Stats overlay; reject earlier invalid batched references.
- [x] Confirm speed selection returns to Playback Options; restore reference Normal/Letterbox/statsOff and stop reference playback normally.
- [x] Preserve distinct commentary descriptions through optional/defaulted TS/Kotlin contract field and fixtures; mapper RED/GREEN and backward decoding covered.
- [x] Match stream/simple row gaps, subtitle None, real bitrate/hour details, source-resolution and long-form duration metadata.
- [x] Render actual session/engine/audio/video/bandwidth/memory/display measurements in the measured three-column layout, keeping menus above it.
- [x] Verify weighted bandwidth and invalid measurements; run final119JVM/80device/409web tests, lint/typecheck/build gates.
- [x] Final exact-APK HLS loop and live commentary/quality/subtitle/stats walkthrough; restore defaults and Home.

Final result:119 JVM/80 device/409 web tests;8 exact-APK HLS cycles;40 live player checks. Emulator-only720p/4Mbps calibration advanced30seconds with zero dropped frames. See the handoff for source-supported differences and hardware limits.
