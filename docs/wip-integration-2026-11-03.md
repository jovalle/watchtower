# WIP Integration — 2026-11-03

> Historical combined-worktree report. The features are now separated; see [Feature Workspaces](feature-workspaces.md).

The combined `codex/watchtower-wip` checkout now includes the completed layout audit, all five newer `main` fixes, and the preserved Watch Together player/HLS behavior. The separate Android TV and Watch Together feature histories are ancestors of WIP. No main working files, deployment, or remote branch was changed.

## Preserved and Integrated

- `566ee65`: checkpointed the completed web layout audit, its fixtures, tests, design conventions, and reports before merging.
- `7c5c031`: merged main commits `301a62b`, `036d210`, `54b3ed5`, `1f2e6d1`, and `7345470`.
- Retained the audit's native 44px alphabet selector, remote key handling, page framing, pending/error behavior, watchlist handling, and critic score mapping when resolving the loader conflicts.
- Moved room controls inside the player's fullscreen container at the top right. Loading, readiness, countdown, and reconnect states keep them available. Faded room controls are inert; player settings/drawers hide the room panel without resetting its state. Audited Button styles and short-screen scrolling remain in use.
- Restored `hls.js` dependency prebundling and updated the guide/harness selector for the room toolbar.
- Independent review found missing Play/Shuffle for all-unrated libraries after the pagination merge. The shared global first-key lookup now includes the unrated fallback, and Shuffle depends on the result count. Three ascending-rating regressions cover later-page results.

## Feature Locations

- Native TV app: [`android-tv/`](../android-tv/README.md), a separate Kotlin/Compose app for Android TV and Google TV. It uses the server's `/api/v1` API. Room support is in `android-tv/app/src/main/java/io/github/jovalle/watchtower/tv/rooms/`.
- Web Watch Together: [`app/components/rooms/`](../app/components/rooms/), [`app/lib/rooms/`](../app/lib/rooms/), and the watch route. On a movie or episode detail page, choose **Watch Together**, create a room, and share its invitation. It is enabled unless `WATCH_TOGETHER=disabled`.
- These features are consolidated in WIP; this integration did not promote or deploy them to main/production.

## Verification

- **566 tests across 94 files passed**, including player race/authorization, native room integration, pagination, Seerr configuration, and the layout audit regressions.
- TypeScript, ESLint, explicit preview-fixture lint, production build, and `git diff --check` passed.
- The manual Vite optimizer produced `hls.js` and React prebundles. Its deprecated standalone command retained plugin watchers after producing metadata, so that process was stopped after checking the generated metadata.
- Four room states and two library views were checked across **320×900, 1440×900, and 667×240** (18 presentation/interaction checks). The synthetic videos loaded but remained paused, so these browser checks do not establish active playback compatibility. No horizontal page overflow or unnamed room buttons was found; the short-screen room container scrolled to End Room, settings hid the room panel, and the 44×44 native alphabet selector navigated to T.
- Browser screenshots and measurements: `/Users/jay/.codex/visualizations/2026/11/03/01a1a1e5-7f61-7083-b1f2-060307231dcf/wip-integration/`.
- Main working-file hashes match the pre-cleanup inventory. The two branches/worktrees remain main and the combined WIP.

## Limits and Review

An initial baseline native-room test hit an existing asynchronous temporary-directory cleanup race (`ENOTEMPTY`); the isolated rerun, repeated full baseline, and final merged suites passed. No application change was made for that one-off baseline failure.

Offline Android unit/lint/APK checks could not start because this machine has no Java runtime; the TV build requires JDK 21. No Kotlin source was changed. Physical TV/emulator, live Plex/transcoding, and multi-browser acceptance were not repeated. The in-app preview browser does not expose `requestFullscreen`; the room slot's fullscreen-container containment is regression-tested, while native fullscreen entry still needs a capable browser/device.

Read-only review by gpt-6-astra found the all-unrated action regression above; it was corrected with RED→GREEN tests and a green full suite. No additional actionable player/room or merge findings were reported. Review notes and command logs are retained under the private cleanup recovery directory's `integration/` subdirectory.
