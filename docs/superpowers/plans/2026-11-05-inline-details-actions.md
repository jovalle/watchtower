# Inline Details Actions Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. The user explicitly requested these changes; preserve the current worktree and unrelated work.

**Goal:** Keep rating, state feedback and all fitting details actions in their originating row.

**Architecture:** Reuse the five-star control in a fixed-height inline button. Measured action widths determine surplus entries in More; no action appears in both places. Remove the generic details success message at its state source and UI. Preserve errors and pending feedback.

**Tech Stack:** Kotlin, Compose for TV, existing native fixtures and emulator.

**Spec:** User's three requirements in this chat: inline expanding five-star rating, always expanded for an existing rating; no Saved line; More only for surplus actions.

## Global Constraints

- Preserve Plex's 0–10 storage and half-star mapping, optimistic rollback, disabled/busy guards, accessibility, mouse and remote behavior.
- Keep 40dp controls and a stable 60dp action-row height. Expansion changes width, not surrounding vertical geometry. Watchtower colors/icons remain.
- Existing ratings display five stars even without focus. Select begins editing; Left/Right adjusts; Select confirms. Back/focus loss discards a preview. Mouse click opens editing before any write.
- No credentials, backend changes, live rating/list writes, playback starts, commits or release-app installation.

## Review Focus

- Existing rated item must display 3½ stars immediately, without editing or a dialog.
- Inline expansion and async failure must retain focus and not shift vertical content.
- Surplus menus must not duplicate visible actions; resizing or expanding must retain the active rating target.
- Readonly star buttons must allow Left/Right navigation; edit mode must consume those keys and cancel safely.
- Clear's disappearing action must return focus to a persistent target. Large text and pending feedback must retain geometry.

## Task 1: Inline rating and responsive actions

- [x] Add failing emulator tests for no-dialog expansion, persistent rated display, navigation/edit/cancel, surplus-only More, fitting actions, Clear and pending geometry.
- [x] Replace DetailsActionRow with a focused file; use measured action placement and surplus-only menu content. Reuse existing action styles and dialog only for overflow/playlist/issue.
- [x] Refine RatingControl to the same fixed-height inline shell; retain half-star input and add explicit readonly/edit mode.
- [x] Adapt prior dialog-specific tests to the inline contract, run focused instrumentation and fix verified issues.

## Task 2: Feedback and acceptance

- [x] Remove DetailState's generic Saved message and its rendering; preserve resulting item state and error feedback.
- [x] Run JVM, full emulator suite, debug/release build and lint; inspect live normal/large-text previews and discard without writing.
- [x] Update handoff and decision trail. Request independent source/evidence review, address findings, and leave the tested debug app installed.
