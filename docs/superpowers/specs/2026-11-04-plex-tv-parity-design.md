# Plex Android TV Experience with Watchtower Branding

Status: reconstruction requested; user selected the current left-sidebar app and completed normal device linking. The earlier approved native TV redesign remains the implementation foundation; this pass replaces its approximated presentation with measured reference behavior.

## Intent

Recreate the actual Plex Android TV presentation and remote interaction in Watchtower, using direct observations and measurements. Replace Plex product identity with the existing Watchtower full wordmark where it fits and the existing gold W mark in compact spaces. Preserve the working native pairing, playback, Requests and Issues features.

## Reference and Evidence

The acquired TV-specific reference is `com.plexapp.android`, version 2026.19.1, version code 971050476. This is a reproducible reference build, not a claim that it is the latest release. The user explicitly selected the current left-sidebar generation.

- Bundle SHA-256: `c63535bcc344bf2669ad52f9e27278d6962d9faf26b567ba4b8de85fdda562b6`.
- Base APK SHA-256: `c905bd695e05e08bfc10fbfa08099c1c897c7b00d9a62a34d2e68bb52fd65d8f`.
- APK signature verified by Android SDK apksigner. Certificate SHA-256 `822cd1246884be960e0f2667eb8afc5f7df08920363c2f16742933bfeb5717c6` matches the official Plex-hosted 10.27.1 signing reference. The mirror supplies the current bundle; the certificate comparison supplies its signing-identity check.
- REA archive inventory: `ev_f5d530f786f45d20e946506255237b709ae519a84f8d3d176da2b262b9cc71f8`; summary `ev_3e9e8019244d7f3e27d2672d27b884d06b4a68a43822d2fc3945c1d1e1a61b67`.
- REA launch capture: `ev_d551c739137477d0ddb8f649dcbb7442d183c779eca79550f69b9c2c1c3b8ac3`.
- Live guest captures and accessibility trees: ignored `tmp/plex-reference/{launch,onboarding-2,onboarding-3,onboarding-4,home,sidebar,category,movie-details}.png` and corresponding XML. These are observations of the installed app on the existing 1920×1080, 320dpi emulator.
- The package contains Inter Display font assets and a Hermes JavaScript bundle. Their presence is static evidence only. No Plex executable code, proprietary fonts, icons or promotional artwork will be incorporated into Watchtower.

Signed-in reference captures now include `linked` (Home), `signed-sidebar`, `episode-details`, `movie-library` (Recommended), `movie-browse`, `sort-menu`, `collection-movie` and `movie-more`, under the same ignored directory. Home artwork and episode metadata follow focused content. Episodes live in a show/season screen with a top season strip, horizontal 256×144dp still cards, and secondary actions below. Sort and overflow use an inset right panel, about 320dp wide, with a black surface and white focused pills. The first guest and signed-in playback attempts stalled. After selecting720p quality, the reference played and immediate captures `player-immediate.png` and `player-settings-open.png` established the actual overlay and Settings panel: top metadata/clock, bottom play/time/seek, right subtitles/settings, and inset track/quality panels. Accessibility dumps can outlast auto-hide, so immediate PNGs are the authority for that overlay.

## Approaches

1. **Rebuild the measured experience in the existing Kotlin/Compose client — recommended.** Retain Media3, native API authentication, lifecycle and HLS repairs. Rework the presentation and focus graph to match the captured reference. This supports side-by-side verification without replacing the functioning client.
2. **Port or patch the Plex application.** Rejected: it couples Watchtower to Plex binaries, account services and undocumented implementation, and does not preserve Watchtower's existing client or service features.
3. **Continue approximating from documentation.** Rejected: the user explicitly requested a 1:1 reference-based reconstruction, and the existing approximation visibly differs.

Implementation stays in the existing `codex/android-tv` worktree. Main, the layout audit and the separate Watch Together worktree remain untouched. Existing uncommitted work must be preserved.

## Observed Visual Rules

These values come from the guest reference at 320dpi (2 physical pixels per dp). Signed-in differences take precedence once captured.

| Surface | Observed reference | Reconstruction requirement |
|---|---|---|
| Content origin | x≈128px / 64dp from screen left | Align headers, cards, details and actions to a common absolute content origin; do not add today's reserved rail width plus another gutter. |
| Compact navigation | Floating vertically centered dark capsule, narrow icons | Reproduce floating placement and expansion behavior; use the W mark wherever the product mark appears in a compact space. |
| Expanded navigation | Inset panel at x32px/y32px; ≈386px wide; rounded border; darkened page behind | Overlay the existing page without moving its content; match focus pill and section hierarchy. |
| Drawer targets | x66..386px, height64px / 32dp for regular rows | Match visual geometry and remote traversal; preserve accessible names and pointer behavior. |
| Poster grid | Six columns; posters240×360px / 120×180dp; horizontal gap48px / 24dp | Card and grid dimensions must agree. Titles sit below artwork. Focus treatment follows the capture rather than today's gold rectangular border everywhere. |
| Details | Edge-to-edge artwork, directional color wash, title art or readable fallback, metadata/ratings, three-line synopsis, director | Reconstruct hierarchy, sizing and viewport behavior using actual library metadata. Missing artwork or ratings must use truthful fallbacks. |
| Detail actions | Primary play pill64px / 32dp high; circular secondary symbols64px / 32dp;32px / 16dp gaps | Replace the current square controls/caption-cell layout. Primary action may retain a label because the latest request is reference parity. Secondary actions remain symbols with accessible names and focus descriptions. |
| Cast |240px / 120dp circles; centered name and character below | Match geometry; actor selection must lead somewhere useful if exposed as an action. |
| Typography | Package contains Inter Display; screenshots use compact text hierarchy | Keep licensed bundled Inter and measure role sizes/line heights. Use the real Watchtower wordmark, not typed text, for product branding. |

The Watchtower launcher already uses the correct W mark in all five density buckets. Preserve it unless verification exposes a defect. Inspect the existing TV banner separately. Do not shrink the full wordmark into the collapsed rail, as the current implementation does.

## Scope and Feature Mapping

The proposed reconstruction covers the personal-media experience and Watchtower's existing service features: pairing/profile selection; compact/expanded navigation; Home; libraries and their source pages; filters/sort; search; movie/show/season/episode details; cast/related media where supported; watchlist and playlists; playback, seeking, streams and menus; next episode; settings; Requests and Issues.

The native API already supports much of this content. Extend its existing authenticated mappings and DTOs only where required to supply observed personal-media presentation or navigation, including clear-logo artwork, profile images, source hubs or person navigation if the signed-in reference exposes them. Any extension must update the TypeScript contract, Kotlin models, fixtures and route tests together. All media/image access remains user/profile scoped and protected.

Plex's ad-supported catalog, live TV/DVR, social activity/reviews/discussions, subscriptions and third-party “Where to Watch” services are not implemented by Watchtower today. The proposed adaptation does not show fake working destinations for those services. It retains Requests and Issues as Watchtower destinations within the same measured navigation system. Whether the user wants those additional Plex service categories built is an open scope decision, not completed parity.

Watchtower-specific server pairing and Seerr permission/error states keep their existing meaning while adopting the reference layout. Requests and Issues mutations are exercised only against fixtures. No real library changes, requests, reports, comments or status changes are needed to inspect or verify the UI.

## Interaction Requirements

Capture and reproduce initial focus, directional transitions, drawer entry/exit, source switching, per-source scroll retention, detail return focus, menu nesting, hardware Back, player visibility timeout and return from playback. Verify both pointer and remote input. Existing fixes for hidden-player taps, disabled controls behind overlays and menu-return timeout must remain covered.

Keep the HLS client-identity repair and lifecycle/reporting behavior. A visual rebuild must not regress repeated starts, pauses, resumes, stop cleanup or profile isolation. Do not reproduce a reference-app malfunction merely to achieve nominal parity.

## Verification and Honest Completion

Maintain a capture matrix with each screen/state marked observed, implemented and verified separately. Match the same resolution, density, font scale, media and focus state for side-by-side comparisons. Record intentional brand/service substitutions separately from unexplained differences. A test suite passing alone is not evidence of visual parity.

At minimum capture and compare: Home, both drawer states, movie/show libraries, filters, search, movie details, show details, seasons, episode details, cast/related content, profile/settings, playback visible/hidden controls, seek, audio/subtitles/quality/overflow and next episode. Verify Requests and Issues as Watchtower adaptations; they have no Plex counterpart for a side-by-side comparison. Include long titles, missing art, empty/error results, disabled actions and 1.3× text.

Run the relevant native unit/instrumentation/lint/build checks and API/web checks for any contract changes. Repeat the real-library start/resume/pause/stop acceptance on the isolated sidecar. Finish with a screenshot comparison report and an explicit list of any unobserved or unfinished states. Do not claim a universal 1:1 recreation while the capture matrix has required gaps.

Physical TV hardware, HDR/HDMI calibration and release-device execution remain separate checks and must be reported honestly.

## Execution Calls

The user requested the reconstruction and selected the current generation after the earlier full native redesign approval. Continue implementation in the existing app and worktree. Reuse independent read-only/reference and implementation workers where their file ownership does not overlap. Do not commit, push, deploy, replace app data, or modify the active main/layout-audit checkout. Unsupported Plex services remain explicitly tracked gaps rather than fake destinations or claims of full functional parity.
