# Native TV UX audit and hardening

Continue the authorized Netflix-led Watchtower app in `codex/android-tv`. The user explicitly requests thorough analysis, fixes and autonomous iteration. Preserve the existing design and all unique work; do not reopen design approval or make commits/pushes. Main's audit and Watch Together remain untouched.

## User outcomes

- Request actions reflect actual standard-quality availability and active requests. Backend preflight enforces the same rule, including stale-client/direct calls. Exact accessible Plex matches offer Open Library. Partial TV libraries can request missing seasons; separate4K state does not falsely block a standard request. Failed availability checks cannot enable an unsafe action; a successful upstream write cannot be reported as a failed write solely because its refresh failed.
- Request and issue statuses are readable, consistently color coded and explicitly labeled. Available/resolved are green; approval/pending are amber; processing is blue; failed/declined/blocked/open issues use appropriate red/attention treatment; unknown is neutral. Color supplements text and remains legible on white focus. State changes/errors are announced.
- My Lists and playlist contents show supplied covers/thumbnails, with a useful fallback. Local/external items open correctly, stable typed IDs cannot collide, source selection and focus survive detail/Back, and partial-source failures, empty states and retry are visible. Removal cannot skip offset-paged items or revert focus due to a late response.
- Every primary flow has reachable recovery: pairing/profiles, libraries, search, settings, detail actions and playback. Errors preserve user input. Long chooser lists remain scrollable with D-pad and Back returns correctly. Fix source-proven gaps found by the full-flow audit; keep unrelated behavior intact.

## My Lists behavior

Plex library and Plex Discover artwork retain their upstream origin until the native route wraps the source once. A local match without a local thumbnail keeps its Discover thumbnail. Public metadata artwork goes through the existing protected image endpoint; the allowlist and token handling stay intact. Playlist summaries and entries render the supplied images with readable title fallbacks.

Watchlist identity includes media type. Accessible local items open local details and do not carry an external-only badge; verified external IDs open the existing external details flow. Items without a verified detail identity remain visible without inventing a provider match. Source tabs expose selection, saved selection and focus return after details/Back. Full errors offer retry, partial errors remain visible alongside available titles, and empty shelves explain their state.

Playlist page responses keep the latest focus. Successful removals invalidate offset cursors and reload the list before more pages can load; removal failures retain the existing items and a retryable error. Read-only smart playlist behavior and identity guards remain enforced.

## Verification and safety

Use fixtures for mutations and failure/race cases; do not submit real requests/issues/ratings/watched changes. Preserve identity/principal checks and image allowlists, with Infisical only if secrets are actually necessary. No new dependencies. Root exclusively owns Gradle/emulator/sidecar operations. Focused TypeScript unit tests may run independently.

Observe focused regressions fail before implementation. Finish with full relevant native and web/API checks, an independent review, rendered normal/large-text paired QA, real HLS starts/resume/stops and calibrated playback. Keep local720p4Mbps, Normal, Letterbox, SleepOff, StatsOff and font1.0, stopped on Home. Record verified outcomes and hardware/release limitations; do not promise mistake-free software or untested production guarantees.
