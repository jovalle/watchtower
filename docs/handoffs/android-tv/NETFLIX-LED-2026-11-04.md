# Netflix-led Watchtower TV

This pass continues the existing `work/android-tv` worktree. All work remains uncommitted. Main's layout audit and the separate Watch Together worktree are untouched.

## Direction and implementation

The user's [Netflix screenshot reference](https://netflix-inc-netflix.en.uptodown.com/android) supersedes the earlier Plex-only visual direction. Its images span older Netflix generations; the inner TV screens inform the layout, rather than their outer promotional frames. Watchtower keeps its own charcoal, mango, off-white, full wordmark, compact W, Inter and existing licensed icons. No Netflix assets or invented Original/match/popularity claims were added.

Home now has full-bleed artwork with dark directional fades, a title-led hero, real Play/Resume and Details actions, and dense 112×168dp shelves. Hero actions follow the focused item and validate the current session. Local movies/episodes can play; shows/seasons open episodes; external titles use the existing external-details route. Missing destinations stay disabled. D-pad Up reaches the hero, Down restores the saved poster, and Back restores its shelf position.

The flat 56dp compact rail offers Search, Home, main libraries, My Lists, Requests and Issues directly. More opens a 232dp overlay with the full Watchtower wordmark and every library. A selected custom library remains visible in the compact rail. Content keeps its 64dp origin. Shared catalog actions have consistent 40dp faces plus a 20dp focus-caption allowance; player symbols remain 32dp. Panels and rows share restrained 4dp corners. The expanded settings rail clears the existing settings panel.

Plex's useful depth remains: Recommended/Browse, alphabet, genres, collections/playlists, show/season/episode navigation, versions/editions, cast, lists, services and nested settings/player menus. Player presentation is quieter, with a simple bottom timeline and compact transport. API, authorization, controller, HLS lifecycle, timers and preference semantics are unchanged from the preceding verified checkpoint. This pass changes ten presentation files and three device-test files.

## Verification

Native verification passes **119 JVM tests, 89 emulator tests, Android lint and both debug APK builds**. New tests were observed failing before implementation, then passing. The enlarged-text test reproduced a clipped shelf heading; deriving its poster anchor from the scaled 20sp heading plus 12dp gap fixed it while retaining normal spacing. Tests cover movie/episode hero dispatch, non-playable/external destinations, item changes, two-row D-pad movement, detail/Back restoration, long titles at 1.3× text, compact custom libraries and shared control geometry/disabled behavior.

An independent read-only source review found no critical or important issues. Its minor coverage observation remains explicit: the rapid-focus Compose test uses synchronized actions, so it does not simulate several events arriving before recomposition.

The paired app passes 37 read-only core/settings checks, including 1.3× text, plus six Search/Categories discovery checks. Captures are inspected for Home, compact/expanded rails, movie/show/episode, libraries, services, Search/Categories, settings and the real player. No real request, issue, rating or watched-state writes were made. Native-only presentation changes do not require repeating the preceding 409 passing web/API tests; those results remain in the Plex handoff.

Three real HLS sessions pass on the final APK: two Home hero Resume cycles with advancing pause/resume positions and return to Home, then Hero Details → Start Over with a fresh 30-second play-through. All three distinct sessions have matching stop204 acknowledgements, with no new Watchtower crash entries. The continuous check advanced 6→36 seconds, delivering 1280×720 with 876 rendered / 896 queued frames and **zero dropped frames**. Statistics is switched back off, playback is stopped, and Home is visible. The existing local 720p/4Mbps, Normal speed, Letterbox, Sleep Off and font scale1.0 are retained.

Final debug APK SHA256: `9bdb56f42bb1e24d38b5ae6261d145364be4e8b0e8c438f567855b902bdffef2`. Final Home capture: `tmp/netflix-reference/watchtower-calibrated-final-home.png`; expanded branding: `watchtower-final-sidebar.png`; player: `hero-0-paused.png`; delivered media statistics: `watchtower-calibrated-statistics.png` in the same directory.

Final playback/discovery results and installed APK identity are recorded in ignored `tmp/netflix-reference/acceptance-results.json`. This directory also contains native logs, screenshots, the pre-pass source/APK checkpoint and real playback evidence. The append-only decision trail remains `tmp/tv-redesign/decisions.tsv`.

## Limits and local session

The emulator uses the existing isolated paired real-library sidecar at `http://127.0.0.1:9002` with ADB reverse; main's server at 9001 is untouched. The device-local 720p/4Mbps calibration is retained. Do not copy or inspect private pairing stores; use normal UI or existing process configuration.

Physical TVs, overscan, remote firmware, HDR/passthrough and release signing remain unverified. The result combines the requested references with Watchtower's existing capabilities; screenshot inspection and emulator tests do not establish universal pixel or feature identity.
