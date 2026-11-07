# Feature Workspaces

| Branch | Focus |
| --- | --- |
| `main` | Existing main checkout; its local work is preserved separately. |
| `codex/android-tv` | Standalone Android TV/Google TV client, native API, and audited web UI. No room server, web room controls, TV room client, or invitation routes. |
| `codex/watch-together` | Full Watch Together room server, web controls, and TV integration, isolated in its own worktree. |

Watch Together is maintained as a feature commit on top of the Android-only split baseline. Later standalone Android fixes can be merged into Watch Together while retaining its room additions. Merge Watch Together into Android only when deliberately bringing rooms back.

Native API v1 keeps the reserved `rooms` capability field for compatibility: false on the Android branch and enabled by the room implementation on the Watch Together branch.

## Android TV

See [Android TV](../android-tv/README.md) for building and pairing. The standalone debug application ID is `io.github.jovalle.watchtower.tv.debug`. Debug APK output is `android-tv/app/build/outputs/apk/debug/app-debug.apk`; it is a separate Android application, not a web page.

The split was checked with JDK21, the installed SDK, and offline Gradle dependencies. Unit tests, debug lint, the debug APK, and the instrumentation test APK compile. Device instrumentation and real Plex playback are separate acceptance work.

## Preservation

The combined source before separation was `cf2ee33`. The host archived the former layout-audit worktree during verification; snapshot `15581b0` retained the complete Android-only split and was restored into a new managed worktree. Both current feature worktrees are now managed by this chat. The shared layout audit, current main fixes, generic native/playback authorization and lifecycle hardening are retained.

The old combined audit/integration reports describe historical results before this split. Current source organization is described here; current local paths, logs, APK checksums and verification results are recorded in the private cleanup recovery directory.
