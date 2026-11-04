# WIP Integration Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this authorized integration inline.

**Goal:** Preserve the completed layout audit, integrate the five newer main fixes and preserved Watch Together player/HLS edits into codex/watchtower-wip, and verify the combined result.

**Architecture:** Checkpoint the existing audited tree before merging main. Port only the behavioral player/HLS changes from recovery snapshot 5282cf4 onto the audited components, preserving their shared Button styles, responsive bounds, focus handling, error states, and title case.

**Tech Stack:** Existing Remix/React/TypeScript/Vite/Vitest application; existing Kotlin/Compose Android TV client and native/room APIs.

**Spec:** User authorization in this chat: integrate the preserved player/HLS edits and five newer main fixes while preserving layout audit work, resolving conflicts, and running relevant checks.

## Global Constraints

- Retain main and one WIP worktree; do not modify the main working tree or deploy/push.
- Preserve all audited source and fixtures, including keyboard access, short-screen bounds, pending/error states, and shared control styles.
- Use title case for app-authored headings and actions; keep body text in sentence case.
- Reuse existing code and dependencies. Preserve host-only room transport authorization.

## Review Focus

- Native alphabet selection must retain the audit's 44px control and handle keyboard focus and one selection once.
- Clear Filters must reset all route filters in one navigation and retain audit page framing.
- Room controls must remain reachable while loading, awaiting readiness, counting down, or reconnecting.
- Inactive player/room overlays must stay outside keyboard navigation and avoid covering drawers/settings on narrow or short screens.
- Recover room controls in fullscreen and keep room commands and solo playback behavior unchanged.

## Task 1: Preserve the Audited Layout

- [ ] Confirm current layout content matches the verified recovery snapshot.
- [ ] Run baseline tests; investigate failures before integration.
- [ ] Commit the existing audited tree and this plan as a checkpoint.

## Task 2: Merge Main

Files: the 18 paths changed by HEAD...main, chiefly AlphabetSidebar, LibraryHeader, movie/series routes, Plex/library indexing, integration storage and their tests.

- [ ] Merge main into WIP, retaining both feature histories.
- [ ] Resolve conflicts by retaining the native alphabet selector and audited framing while applying pagination, single-navigation filters, remote focus, duplicate-click prevention and Seerr environment precedence.
- [ ] Adapt the imported alphabet tests to exercise the existing native selector, then run library and integrations regressions.

## Task 3: Port the Preserved Player/HLS Work

Files: VideoPlayer.tsx, RoomPanel.tsx, app.watch.$ratingKey.tsx, vite.config.ts, Watch Together guide/harness selectors, relevant player/room tests and UI preview fixtures.

- [ ] Add failing behavior tests for the room panel inside the player's fullscreen container, loading/readiness/reconnect/countdown visibility, and hidden-overlay focus restrictions.
- [ ] Port roomPanel placement, visibility and route wiring; keep audited control styles/bounds and modal protections.
- [ ] Add the preserved hls.js optimizeDeps inclusion; update guide/harness references to the top-right room controls.
- [ ] Run focused player, room and native integration suites.

## Task 4: Verify and Record

- [ ] Run full Vitest suite, TypeScript, ESLint (including UI preview scripts), production build and git diff --check.
- [ ] Exercise affected room/player and library UI cases at mobile/desktop/short-landscape sizes using the existing synthetic preview.
- [ ] Check Android TV contracts/native room tests; run Android build checks if the installed JDK/SDK permit them and report any environment limit.
- [ ] Review the integration diff, commit the verified integration and record source locations and verification results.
