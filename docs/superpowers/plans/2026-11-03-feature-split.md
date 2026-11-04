# Watch Together Separation Implementation Plan

**Goal:** Preserve the full combined implementation on codex/watch-together and remove Watch Together implementation/UI from codex/android-tv, preserving standalone TV functionality and the shared layout audit.

**Authorization:** User explicitly chose "Also remove Watch Together from the Android branch" after being told it shares TV/native playback dependencies.

**Approach:** Branch the verified cf2ee33 combined tree into a managed Watch Together worktree. Rename the existing branch codex/android-tv. Remove room-only code at the Android HEAD rather than rewriting preserved history. Keep native v1 feature schema compatibility as rooms:false and retain generic device-scoped playback/session hardening.

## Scope

- Parent: app web room UI/hooks/coordinator/API/join routes, native capability adapters, web player/route integration, room-only root tests/contracts/docs/preview fixtures.
- Android agent: android-tv/, scripts/tv-e2e/, docs/handoffs/android-tv/, and its CI workflow; preserve solo player authority/lifecycle, catalog, pairing, security, focus and responsive work.
- Main checkout and its uncommitted changes stay untouched. Watch Together worktree retains the full implementation.

## Steps

- [x] Create a managed Watch Together worktree at cf2ee33 and name codex/watch-together.
- [x] Rename existing WIP branch codex/android-tv.
- [ ] Observe native rooms:false boundary tests fail before removal.
- [ ] Remove room web/server modules and restore solo playback with the layout audit preserved.
- [ ] Remove Android room client/screens/navigation and room-only harnesses/tests/resources.
- [ ] Retain standalone native/device/playback contract tests; preserve rooms:false in API v1 responses.
- [ ] Run full web suite, typecheck, lint, fixture lint, build and reference checks; attempt native checks with the available toolchain.
- [ ] Independent review, fix important findings, commit the Android separation and branch-location docs.

## Preservation Checks

- Watch Together HEAD must retain the room modules, endpoints, web player integration and Android room client from cf2ee33.
- Android HEAD must have no room coordinator/client, invite/join routes, room UI, or TV room packages; stale room-prefixed web URLs must not become solo playback silently.
- Native pairing, profile auth, playback ownership, direct/HLS proxying and generic v1 DTO compatibility stay intact.
- Shared web audit regressions stay passing; removal must not reset later catalog, player accessibility or lifecycle hardening.
