# Full Interface Consistency Audit and Fix Plan

> **For agentic workers:** Use superpowers:executing-plans for coordination and superpowers:dispatching-parallel-agents for independent page families. Track completion below.

**Goal:** Audit every web page family and rendered state, fix verified inconsistencies in the existing WIP, and leave reproducible responsive evidence.

**Architecture:** Preserve Watchtower's existing dark surfaces, mango primary actions, outlined secondary actions, shared page framing and cinematic/player contexts. Fix shared causes first; keep every route and state in an explicit coverage matrix. Use the production Remix components with isolated loader/action/API fixtures, so pending, empty, failure, long-content and permission states are testable without real account mutations.

**Tech Stack:** Remix, React, TypeScript, Tailwind, Vitest, browser verification through CUA.

**Spec:** User request in this chat; existing implementation and `docs/layout-verification-2026-11-03.md` establish the incumbent design.

## Global Constraints

- Work only in the existing WIP and preserve prior uncommitted work; no commit, merge, deployment, package or lockfile changes.
- Reuse existing Button/buttonStyles, layout components, semantic tokens and focus utilities. Preserve media/user content; title case authored headings and action labels.
- Distinguish ordinary actions, hero actions, card/player overlays, selection controls and inline links by role; equal roles share dimensions and styles.
- No live account, settings, request, playlist or playback-history mutations. Harness data is synthetic and outside production data storage.
- Record unsupported physical-device/browser/service behavior explicitly. A source inspection is not a rendered pass.

## Review Focus

- Pending route transitions preserve the current page, focus and scrollbar geometry.
- Long titles, URLs, usernames, messages and large result counts fit at 320px and in short landscape viewports.
- Menus/dialogs expose named controls, contain focus appropriately, dismiss with Escape and restore focus.
- Empty and upstream failure states remain distinguishable; failed mutations do not show success.
- Toggled/disabled actions retain correct state across navigation and request completion.

## Tasks

- [x] Inventory all UI routes, redirects, page/component branches and current control roles; record findings before fixing.
- [x] Fix shared framing, theme, focus and install/error surfaces; verify semantic contrast and meaningful behavior regressions.
- [x] Audit and fix browse/library/search/media/player states, with focused tests and fixture cases.
- [x] Audit and fix settings/requests/issues/notifications and shared form/menu states, with focused tests and fixture cases.
- [x] Audit and fix public/setup/auth/cinema/room states, with focused tests and fixture cases.
- [x] Render every fixture at 320, 375, 768, 1024, 1440 and 1600px; inspect representative screenshots and measure frame, overflow, control geometry, names, active state and clipping. Exercise menus/dialogs/pending controls at boundary widths and 812×375 landscape.
- [x] Fix failures from rendered checks, rerun affected cases, complete the full suite/type/lint/build/diff checks, and obtain a focused independent review.
- [x] Save coverage matrix, remaining limitations and screenshots; leave the worktree available for review.

## Execution Decisions

- Explicit user authorization covers audit and implementation; continue without an additional plan approval gate.
- Independent domain workers own disjoint component/route families. The coordinating agent owns shared layout/theme/PWA/root and browser verification.
- The Impeccable engine is unavailable in the sandbox; inspect source and rendered geometry directly, with no detector score represented as a measured result.

## Completion Evidence

See docs/full-consistency-audit-2026-11-03.md: 192 fixture scenarios; 1,520 geometry records across six widths and two short landscape sizes; 624 additional text records; 70 full-page screenshots. Final suite: 530 tests in 89 files; typecheck, lint, production build and diff check passed. No commit or deployment.
