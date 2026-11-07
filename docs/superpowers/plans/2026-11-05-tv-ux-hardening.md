# Native TV UX hardening implementation plan

> Execute using the established parallel investigation workflow and TDD; root integrates and verifies each owned domain, then requests a fresh whole-change review.

**Goal:** Repair misleading actions, missing media identity/artwork, status feedback and unrecoverable native TV flows.
**Architecture:** Reuse current Compose screens, view models, native routes, scoped Plex lookup, Seerr client and shared controls. Add only the shared status presentation and additive availability fields needed for consistent decisions.
**Tech stack:** Kotlin/Compose/Media3, TypeScript/Remix, existing Vitest/Gradle/emulator tests.
**Spec:** `docs/superpowers/specs/2026-11-05-tv-ux-hardening.md`.

## Constraints and ownership

Existing worktree and uncommitted work only. No real mutations or secret inspection. Snapshot: `tmp/ux-audit-2026-11-04/pre-audit-source.tgz`. Root controls all builds/device/server processes. Workers patch only assigned functions/files; shared files use narrow apply_patch edits.

## Review focus

1. An availability lookup fails or changes between display and POST; no duplicate/available request is submitted.
2. Profile switches or a second click race with request/list/search/playback responses; stale identity data never appears and operations do not duplicate.
3. Local and external movie/show IDs collide or artwork origins differ; navigation and protected images remain correct.
4. Empty/partial/error pages and long chooser/draft content remain recoverable with a remote and enlarged text.
5. Initial media/stream failures and offset-paged removals recover without infinite loading or silently skipped items.

## Tasks

- [x] Requests backend: add route/helper regressions, observe RED, implement availability preflight, scoped local resolution, principal recheck and post-success refresh fallback. Add compatible `canRequest` and `ratingKey` to TS availability contract; retain existing fields.
- [x] Requests client/root: add VM/device regressions, observe RED, mirror safe eligibility with legacy defaulted DTO support; guard immediate duplicate mutations and identity changes; show actionable availability/Open Library, preserve failed issue drafts and scroll playlist chooser.
- [x] Lists: add image-origin/navigation/collision/pagination/focus regressions, observe RED, fix single image wrapping and Discover origin, artwork rows, external navigation, retry/empty/partial source states, source/focus restoration and removal pagination.
- [x] Full-flow recovery: add focused failing tests and repair profile/library/search/settings retry plus initial playback Retry and unavailable menus. Keep scope to verified audit findings.
- [x] Status presentation/root: add labeled badge/tone regressions, observe RED, use shared semantic status colors in request/issue rows/details and external availability; test focused contrast, unknown and enlarged text.
- [x] Integrate: full native/web/API verification, fresh independent review and fix pass, paired read-only remote/rendered matrix, real HLS verification, final evidence/handoff. Restore normal local settings and stopped Home; leave uncommitted.

### Lists implementation details

Owner: lists worker. Root owns the shared AppRoot external route callback and runs native RED/GREEN. Patch only list-specific blocks in CatalogScreens/CatalogState; keep DTOs and contracts unchanged. New state-only ListsContent and fixture tests isolate the presentation from real data/mutations.

1. Add a route regression using local, Discover, TMDB and local-without-artwork fixtures; observe the nested image source failure. Pass image origin through the existing unified-service callback, leave sources raw until the native response wraps once, and verify the current image resolver accepts them.
2. Add native delayed-pagination focus and offset-removal regressions against existing VM APIs. Root observes RED before native production changes. Page completion copies the latest focus; successful removal resets cursor state and reloads, preserving a valid focus target.
3. Reuse CatalogImage/MediaCard/shared TV controls in image-bearing playlist/watchlist shelves. Extract fixture-driven content only as needed. Add typed keys, local-first/external detail dispatch, source selection semantics, saveable source/focus, retry, partial-source warnings and empty states. Keep unverified identities visible and distinguish them without guessing IDs.
4. Root runs fixture UI tests, rendered normal/large-text layouts and integrated native checks; worker runs focused TS route/identity/image tests and records exact evidence in the shared audit directory.
