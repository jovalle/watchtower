# Netflix-led Watchtower TV Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans, following this plan task by task.

**Goal:** Make Watchtower's native TV presentation predominantly Netflix-like while preserving Plex depth, Watchtower identity and all working native behavior.

**Architecture:** Rework existing Compose presentation and shared controls. Reuse current view models, callbacks, API and player controller; do not create another client or design framework.

**Tech stack:** Existing Kotlin/Compose TV, Media3, Coil, Android SDK/Gradle.

**Spec:** `docs/superpowers/specs/2026-11-04-netflix-led-tv-design.md`.

## Global constraints

Existing `codex/android-tv` worktree only; preserve uncommitted work and other worktrees. No commits/push or new dependencies. Root owns Gradle/emulator. Keep 720p/4Mbps local calibration and existing HLS/timer/profile/Seerr behavior. No real library or service mutations. Canonical decisions remain `tmp/tv-redesign/decisions.tsv`.

## Review focus

1. Fast focus changes must never launch the previous hero item.
2. New focusable hero actions must not trap Up/Down or lose the saved shelf position on Back.
3. Long/missing title art and larger text must leave controls and shelf items reachable.
4. Compact navigation must retain the selected custom library and handle many/missing libraries.
5. Shared shape/size changes must not expose controls behind player overlays or clip real service/settings actions.

## Task 1: Catalog presentation and hero entry points

**Owner/files:** Catalog worker: `catalog/CatalogScreens.kt`, catalog resources, `catalog/CatalogControlsTest.kt` and relevant existing detail tests. Split a focused Home presentation file only if that keeps the existing file manageable; preserve public signatures with an optional nullable `onExternalDetails: ((MediaSummary)->Unit)? = null` callback appended to HomeScreen/HomeContent, wired by root to the real ExternalDetailsRoute.

**Interfaces:** Keep `HomeScreen/HomeContent(..., onDetails:(String)->Unit, onPlay:(PlayerRoute)->Unit)` and all existing details callbacks. Reuse shared `TvAction` with its preserved signature. Shared catalog faces become40dp plus20dp caption allowance; player iconOnly stays32dp. Coordinate any new optional external-details callback with root before touching its caller.

- [x] Add compiling regressions for focused-hero Play/Details callbacks, non-playable local/external dispatch, and remote Up/Down/Back behavior; notify root before implementation so RED is observed.
- [x] Build the cinematic dark wash, compact hero with real Play/Resume and details access, dense112×168 discovery posters and measured first shelf. Preserve disabled/unavailable states and source identity guards.
- [x] Rework detail hierarchy/action placement with flat controls, keeping season/episode selection, versions, editions, cast, lists, request/report permissions, errors and pagination.
- [x] Update meaningful existing geometry tests for the new contract; root runs GREEN and rendered verification.

## Task 2: Brand, rail and shared controls

**Owner/files:** Root: `ui/AppRoot.kt`, `ui/TvAction.kt`, corresponding UI/rail tests/resources.

**Interfaces:** Preserve `TvAction`, `TvSymbol`, `NavigationRail` call signatures and current navigation destinations. Flat expanded overlay must retain the64dp content origin and saved navigation stack semantics.

- [x] Add direct compact-source/My Lists and expanded/many-library focus regressions before the rail behavior changes; observe RED with root's device runner.
- [x] Replace the floating capsule with a56dp quiet edge rail/232dp full-height overlay, consistent4dp corners,40dp catalog action faces, mango primary and white focus. Keep actual full wordmark/W assets and all services reachable.
- [x] Confirm existing pointer, accessibility, disabled and modal return behavior under the new styling.

## Task 3: Player and supporting native surfaces

**Owner/files:** Auxiliary worker: `playback/PlayerScreen.kt`, `settings/SettingsScreen.kt`, `pairing/PairingScreens.kt`, `services/SeerrInboxScreens.kt`, related resources/tests. Root/shared `TvAction` changes are consumed, not duplicated.

**Interfaces:** Keep all controller/state/callback interfaces unchanged. Do not edit `PlaybackController`, policies, scheduler, media sources, DTOs or API. Retain seven-pane statistics and nested menus.

- [x] Simplify visible player transport/metadata composition toward Netflix while retaining meaningful playback/overlay regression tests.
- [x] Make local flat panel/row changes in supporting screens where necessary to match shared40dp catalog/32dp compact control roles, preserving error/permission/focus states.
- [x] Notify root when source is stable for integrated GREEN verification; root alone operates Gradle/emulator.

## Task 4: Integration and delivery

**Owner/files:** Root and fresh read-only reviewer; handoff/README, ignored screenshots/test evidence.

- [x] Run full native unit/lint/debug+test APK builds, install without clearing data and run all device tests. No web/API checks are needed unless that code actually changes.
- [x] Inspect normal/1.3× rendered discovery/detail/navigation/services and player screenshots against the pinned Netflix reference, retaining honest source-supported differences.
- [x] Verify changed Hero/Detail playback entry points, repeated stop/resume and the calibrated real-time play-through; restore defaults and Home.
- [x] Resolve material review findings, update the handoff with exact checks/limitations, preserve audit/Watch Together, leave work uncommitted.
