# Plex TV reference reconstruction with Watchtower branding

Worktree: `/Users/jay/.codex/worktrees/android-tv-2405/watchtower`, branch `codex/android-tv`. Changes remain uncommitted alongside the preserved Android work. Main's layout audit and the separate Watch Together worktree remain untouched.

## Reference and resulting experience

The user selected the current left-sidebar generation and linked the reference normally. Measurements use Plex TV 2026.19.1, version 971050476, on the same 1920×1080/320dpi emulator. Its APK signing certificate matched a separately downloaded official Plex release. No Plex credentials, proprietary executable code, fonts, icons or promotional artwork were copied into Watchtower. Watchtower uses its existing full wordmark and compact W, licensed Inter and Lucide assets.

The reconstruction covers the floating compact/expanded rails, focus-driven Home artwork/metadata, source Recommended/Browse/Categories/Collections/Playlists, six-column Browse and real alphabet navigation, sort/filter panels, movie/cast details, show/season/episode strips and return focus. Requests and Issues remain real Watchtower sidebar destinations with their existing permissions, pending/error and empty states.

Search follows the measured 6×6 TV keyboard and two-column horizontal result cards. Physical typing, voice/system keyboard hooks, real Movies/TV filters and the source/settings panel are retained. The last ten opened-result queries persist per server/effective profile, with deduplication and Clear History. Categories use real genres, four-column cards, genre-scoped item/alphabet requests, Clear and Back focus restoration. Available cached genre artwork or tinted fallbacks are used.

Settings has Account, Experience, Player Experience, Video & Audio, Subtitles, Advanced and About. Nested choices stay in the same panel. Existing profile/server/device actions and local/server preferences remain connected. Forward entry attaches the first row before focus; Back preserves the parent's scroll and originating row, including long device/track lists.

Player Settings has Quality/Subtitles/Audio/Playback Options. Speed, Letterbox/Stretch/Zoom, elapsed-time sleep choices, after-item stop and statistics work. Watchtower transport/diagnostics remain below the reference Options rows. Stream rows use 44dp faces/8dp gaps; simple rows use 32dp faces/zero gap. Subtitles has a distinct None choice while Sleep retains Off. Commentary descriptions now survive the optional/defaulted TS/Kotlin AudioTrack.description mapping. Quality rows show real bitrate and approximate data/hour without changing profile IDs or choices. Source-resolution badges and long-form duration match the observed player metadata.

The statistics overlay follows the measured seven-pane, three-column structure: Session/Memory, Engine/Audio, Video/Bandwidth/Display. It reads actual player state, buffer, decoders, formats/counters, weighted measured transfer rates, JVM/native memory and display mode. Menus render above it. Audio skipped counters are labelled skipped, and unavailable values remain explicit.

The API also supplies optional protected summaries, clear-logo URLs, validated artwork colors, source recommendation hubs and genre/filter-bound alphabet cursors. Pairing, profile authorization, native Media3/HLS lifecycle and Watchtower service behavior remain intact.

## Verification

The final APK passes **119 JVM tests, 80 emulator tests, Android lint with zero errors, and both debug APK builds**. The web/API run passes **409 tests in 85 files**, TypeScript, changed-file ESLint after the final metadata addition, and the production build. The earlier full uncached ESLint pass is retained. Final source review found no material issues after the focus and telemetry corrections.

Rendered/read-only acceptance includes 37 core/settings checks (normal and1.3× text), 17 Search/Categories checks, and 40 final player checks. The latter verified live commentary, quality/subtitle panels, actual MediaSession 1.25× speed, all display modes, sleep selections/cancellation, all seven statistics panes and restored controls. No real Seerr request/issue/rating/watched mutations were made.

Eight exact-APK HLS cycles across two movies passed: four fresh starts, four saved resumes, eight pause/resumes and eight matching distinct-session stop204 acknowledgements. No new Watchtower crash entries appeared. Peak sampled Dalvik allocation was **69,499KiB (about 68MiB)**. Including the player-panel and calibration sessions, all ten real sessions have matching stop204s.

The original emulator OOM was reproduced before bounding Media3's buffer target to one sixth of the app heap, clamped 16–64MiB (32MiB on this 192MiB emulator). Quality, retry/time thresholds and timeline mapping were otherwise preserved. Regression tests cover the budget and sleep timing/cancellation. Very short fresh starts can retain an older PMS resume point; resume checks require an actual Resume action. A watched title offering only Play was rejected as an invalid resume fixture.

The 4K software decoder dropped frames during the original-quality stress/player checks. This emulator's **device-local** profile default is now **720p · 4Mbps**. A separate 30-second play-through advanced exactly 30seconds and rendered 877 of 897 queued frames with **zero dropped frames**, delivering1280×720. This changes this emulator's local preference, not the web server or another device's default. Normal speed, Letterbox, Sleep Off, statistics Off and system font scale 1.0 are restored. Playback is stopped and Watchtower Home is visible.

Evidence is ignored under `tmp/plex-reference/`: `acceptance-results.json`, `parity-final-native-build.log`, `parity-final-device.log`, `jvm-final-119/`, `web-tests-final.log`, `typecheck-final.log`, `lint-final.log`, `lint-track-description.log`, `web-build-final.log`, `repeat-playback-final.log`, `playback-final-summary.json`, `memory-expanded.json`, `player-options-ui-acceptance.json`, `calibration-summary.json`, `final-stop-cleanup.json`, and `capture-matrix.md`. The append-only decision trail is `tmp/tv-redesign/decisions.tsv`.

Reference images include `linked`, `signed-sidebar`, `movie-browse`, `episode-details`, `settings`, signed Search/Categories/Options captures, valid `plex-final-{audio,subtitles,quality}-valid.png`, `plex-final-speed-selected-valid.png` and `plex-final-stats-uncovered-valid.png`. Earlier invalid batched player captures remain explicitly rejected in `progress.md`.

Final screenshots: `watchtower-finished-home.png`, `watchtower-finished-sidebar.png`, `watchtower-final-audio-panel.png`, `watchtower-statistics-overlay.png`, and `watchtower-calibrated-statistics.png`. The final APK SHA256 is `0a5b45c56f19e607fa7a13d4c401f59213f95f20b1d9cb1a2fa8f6034ef5fc39`.

## Running this local session

The emulator uses the isolated real-library sidecar at `http://127.0.0.1:9002`, with `adb reverse tcp:9002 tcp:9002`. The main layout-audit server on 9001 remains untouched. Existing paired configuration is consumed normally without exporting credentials. Leave the sidecar/emulator running. From this worktree, the sidecar command is:

```sh
NODE_ENV=production DATA_PATH=./tmp/tv-real/data PORT=9002 SECURE_COOKIES=false node --import tsx server.ts
```

Click the emulator display, then use arrows/Enter or its TV Remote panel; Escape/Back returns through menus. A cold poster tap can focus before activation; the final cold-start checks confirmed the target focus and used D-pad Center when needed.

## Explicit differences and limits

This reconstructs the observed personal-media experience. Plex-hosted social, advertising, live TV/DVR, music/person biographies, provider-specific rating/stream badges and subtitle-provider search are unavailable. Playlists use Watchtower's existing server-wide list. Quality profiles and diagnostic values reflect Watchtower's actual server/player data; unsupported dialog boost/loudness processing is disabled with an explanation. Brand and Watchtower-service substitutions are intentional.

A real end-of-title automatic transition was not forced, to avoid marking a real title watched; policies, fixtures and virtual-time sleep tests cover those paths. Physical TV performance, remote firmware differences, HDR/HDMI/audio passthrough, slow-network calibration and a signed release build still need hardware/release verification. Passing emulator tests and measured screenshots do not establish universal pixel or feature identity.
