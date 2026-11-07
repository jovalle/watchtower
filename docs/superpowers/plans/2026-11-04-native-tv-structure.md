# Native TV Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the approved symbol controls, Plex-style TV depth, and Requests/Issues areas with Watchtower styling.

**Architecture:** Preserve the existing Compose TV/Media3 app and native API. Use one reusable TV action control with bundled Lucide vectors, an expanding icon rail, existing paginated catalog data, and typed user-scoped Seerr read endpoints. Backend contracts can be implemented independently of icon/catalog UI.

**Tech Stack:** Existing Kotlin/Compose TV, Media3, kotlinx.serialization, Remix/TypeScript, Seerr client; no new app runtime dependency.

**Spec:** docs/superpowers/specs/2026-11-04-native-tv-structure-design.md (approved by user: Implement the full TV redesign).

## Global Constraints

- Keep Watchtower dark surfaces and mango focus treatment; title-case authored headings/actions and retain content titles.
- Maintain native pairing, authorization, protected playback, solo-player lifecycle, focus restoration, and existing layout protections.
- Symbols replace actions and compact rail initials; media titles and selectable values remain readable. Every symbol has an accessible name and focused label, with a minimum 48dp target.
- Requests/issues reads reuse upstream per-user permissions. All write acceptance tests use fixtures.
- Work only in codex/android-tv; preserve earlier uncommitted emulator fixes. No push, deployment, or changes to main/Watch Together.

## Review Focus

- Focus labels and icons must remain visible at larger text; test the shared action component's bounds.
- A source Back transition must restore focus and selected library identity; test separate library IDs.
- Empty, unconfigured, unlinked, and failed Seerr states must stay navigable and retryable; test state rendering and identity reset.
- Pagination, invalid filters/IDs, revocation during upstream calls, and cross-user visibility require native route tests.
- Player icon changes must preserve media-key input, overlay focus containment/restoration, and actual decoded playback; rerun instrumentation and emulator acceptance.

## Task 1: User-Scoped Request and Issue Reads

**Files:** app/lib/native/contract.ts, app/lib/native/requests.server.ts, app/routes/api.v1.requests.ts, app/routes/api.v1.issues.ts, new app/routes/api.v1.issues.$id.ts, test/native/seerr-inbox.test.ts.

**Interfaces:** GET /api/v1/requests?page=1&filter=all and GET /api/v1/issues?page=1&filter=all return `{items,page,pages,totalResults}`. Request/issue entries expose safe title, media identity, artwork/status/timestamps and optional ratingKey; issue detail includes readable report content. Backend implementer finalizes exact fields before Kotlin clients are added.

- [x] Write failing tests for authenticated reads, filter/page parsing, scoped upstream identity, detail ID validation and principal recheck.
- [x] Run targeted Vitest and observe RED.
- [x] Implement loaders using existing Seerr list/title services, native error envelopes, protected image URLs, and existing profile authorization. Preserve POST actions.
- [x] Run targeted tests and typecheck; publish exact DTO shapes to the UI implementer.

## Task 2: Shared Symbol Controls and Player

**Files:** new android-tv/.../ui/TvAction.kt and drawable vectors; PlayerScreen.kt; PairingScreens.kt action controls; shared Compose instrumentation tests.

**Interfaces:** `TvAction(label:String, icon:TvSymbol, onClick:()->Unit, modifier:Modifier, enabled:Boolean=true, primary:Boolean=false, selected:Boolean=false)` preserves focus modifiers, accessible action names, and shows a stable focused label. `TvSymbol` maps to bundled vector resources.

- [x] Add failing Compose tests for accessible names, callback, focused-label visibility, disabled state, and bounds at larger text.
- [x] Source consistent Lucide SVGs through Better Icons, convert to Android vectors and retain license attribution.
- [x] Implement compact branded TV controls; convert player transport/menu actions and move diagnostics into More.
- [x] Preserve overlay/menu/countdown focus behavior; run shared/player instrumentation tests and compile APKs.

## Task 3: Navigation and Catalog Depth

**Files:** AppRoot.kt; CatalogScreens.kt; CatalogState.kt; new focused catalog screen files where warranted; catalog/navigation tests.

**Interfaces:** Existing typed catalog routes remain authoritative. Library selection uses typed sectionId. New RequestsRoute, IssuesRoute, IssueDetailRoute connect task4. Existing onOpen/onPlay callbacks preserve navigation ownership.

- [x] Add failing checks for correct selected library, icon rail names and Back/focus restoration.
- [x] Replace rail initials with symbols, add Requests/Issues destinations, retain expanded labels and a branded heading.
- [x] Reshape Home hero/rails and Library/Collections navigation, compact sort/filter actions, and poster grids.
- [x] Reshape details into a readable backdrop/header/action group, source/cast/versions/related sections supported by current DTOs, and a clear show→season→episode path. Keep uncommon actions in More.
- [x] Convert remaining action toolbars to TvAction while keeping selection values/readable content; run catalog/focus tests.

## Task 4: Requests and Issues Screens

**Files:** Dto.kt, WatchtowerApi.kt, new services/SeerrInboxState.kt and SeerrInboxScreens.kt; AppRoot.kt route wiring; JVM/instrumentation tests.

**Interfaces:** Kotlin ServicePage<T>, RequestSummary, IssueSummary and IssueDetail match task1. WatchtowerApi.requestInbox/issues/issueDetail consume the active SessionSnapshot. New screen state is cleared on identity change.

- [x] Add failing DTO/state tests and Compose tests for lists, filtering/pagination, missing integration, failure/retry, and issue detail navigation.
- [x] Add typed API methods/models and lifecycle-aware state; reuse existing external/local detail routes for title actions.
- [x] Implement request history and issue list/detail screens with compact icon actions, title artwork/status, useful filters and clear unavailable/unlinked states.
- [x] Keep report/request submission in the existing protected title flow; test mutations only with fixtures.

## Task 5: Rendered Acceptance and Review

**Files:** Android TV design/acceptance documentation and local ignored evidence.

- [x] Build/test native API and Android app, run JVM/instrumentation/web tests, lint and typecheck.
- [x] Install and inspect real emulator screens: rail expanded/compact, Home, movies, shows/seasons/episodes, Requests, Issues, details and player.
- [x] Exercise D-pad, focus labels, Back, larger text and empty/error fixtures. Restore temporary settings.
- [x] Restart only the isolated9002server with this branch build. Recheck real Seerr reads, catalog and short playback; stop playback cleanly.
- [x] Obtain one fresh source/evidence review, fix blockers, and deliver APK, screenshots, active URLs and material limits.

## Execution Ruling

User approved implementation in this ongoing session. Continue without another workflow confirmation. Use one independent backend subtask while the primary agent implements the native UI; their contracts and file ownership are separate. Preserve earlier uncommitted changes and leave the resulting diff reviewable; do not create mixed commits automatically.

## Final Verification

UI implementation and acceptance checks completed;77 JVM,30 instrumentation and377 web tests passed, with native lint and web typecheck/lint/build passing. See `docs/handoffs/android-tv/REDESIGN-2026-11-04.md`. Real HLS decoded and playback menus/Back passed, but intermittent upstream HTTP 400 on fresh starts remains unresolved. Checked acceptance steps record work performed, not a claim of reliable repeated playback.
