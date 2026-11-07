# Home hero and technical media details

Home now uses content-driven vertical flow instead of a fixed 304dp shelf start. A 32dp gap follows the hero's last content. The hero includes spaced runtime/episode facts, up to three listing genres, provider badges, synopsis, contextual symbols and a mango progress bar with elapsed/total and remaining time. Normal text has up to three synopsis lines; larger text uses a compact title and two lines to keep the title and focused first poster visible. Home retains Resume/Info as the first two actions, restores the selected poster from Info, and scrolls back to the hero on Up.

Contextual actions are Start Over for a resumed movie/episode, Watchlist for movies/shows, Watched/Unwatched for movies/episodes, and Remove from Continue Watching only for an item in that shelf. Unknown Watchlist membership triggers a check instead of an add. Pending controls disable duplicate writes and announce progress without adding a body line. Confirmed changes update their own item/shelf; failures preserve state. An otherwise empty Home focuses Refresh Home, separate from a rail/library Retry.

The active movie/show alone fetches the same cached ratings endpoint as Info; listing scores remain fallback. Membership and provider reads have independent jobs and generation guards. Selection/profile changes discard stale results. A successful membership write invalidates stale membership reads without cancelling independent ratings. Home refresh generations prevent an old feed read from reintroducing a confirmed dismissal. Invalid enrichment is filtered before fallback on both Home and Info.

Info adds focusable Picture, Sound and File reading groups. Reported facts include resolution, codec/profile, bit depth, HDR/Dolby Vision profile, frame rate, aspect ratio, audio codec/channels/language/descriptions, container, bitrate, complete multipart file size and subtitles. Missing/unknown/malformed facts are omitted; Atmos is not inferred from codec, and server file paths are not exposed. Audio has separate reading stops when multiple tracks exist. Reading bounds include the entire visible frame, including its padding. Values use spaces instead of bullet dividers.

For multiple versions, selection inspects that version's isolated facts without playing it. Play/Resume and Start Over then use its mediaId; invalid/removed selections fall back to the current first version. Existing ratings, cast/person navigation, Playlist/Issue and other Info controls are preserved.

## Dismissal semantics and security

Native `DELETE /api/v1/media/:ratingKey/continue-watching` validates its selector and current profile's metadata access, rechecks identity before and after the write, and uses Plex's dedicated PUT action. Watchtower does not issue scrobble, timeline, media-delete or progress-reset calls for dismissal, and preserves its local offset and unrelated shelves. Server-side effects on resume/watched state were not live-tested or guaranteed by the primary documentation. [Official Plex action reference](https://developer.plex.tv/pms/) and [primary PlexAPI implementation](https://python-plexapi.readthedocs.io/en/latest/_modules/plexapi/video.html#Movie.removeFromContinueWatching) establish the dedicated action, method and selector.

The isolated port 9002 test sidecar was rebuilt/refreshed using its existing Infisical configuration, fetching only TMDB_API_KEY and OMDB_API_KEY into memory for the consuming process. Credentials were loaded successfully before replacing the owned listener; cwd/port guards excluded port 9001. Pairing data stayed in `tmp/tv-real/data`. The main/layout-audit server and Watch Together worktree were not touched.

## Verification and evidence

Evidence is in `tmp/tv-hero-media-2026-11-05/`; the approved scope/plan is `docs/superpowers/plans/2026-11-05-hero-media-details.md`.

Backend: 96 files / 592 tests passed after fixture compatibility additions. Type checking and scoped ESLint passed; backend source/test hashes did not change after their verification. Web/server production build passed. Independent backend source review found no actionable issue. See `backend.md` for exact commands, hashes, sources and retained RED logs.

Native: final counts/build hashes and live normal/large-text results are recorded in `acceptance-results.json` after final verification. Earlier focused runs passed 64 and 68 tests. RED regressions covered missing hero content/actions/gap, stale Home/membership reads, missing version routing, empty-Home focus, partial technical-frame scrolling, large-title clipping, missing provider enrichment, cancellation of an independent provider read, and invalid-enrichment fallback. The earlier complete 215-test run failed one rail recovery case because two distinct recovery actions were both named Retry; the current Home action is explicitly Refresh Home. That earlier run is retained as `pre-fallback-full215-device.log`, not a final pass.

Live checks only read/browse the paired library, navigate Info, and temporarily change/restore emulator font scale. No real rating/list/watched/dismissal writes or playback starts are authorized for these checks. Write/failure behavior uses isolated fixtures. Physical TVs, production signing/distribution and live Plex mutation semantics are outside verification. Independent evidence review is task-artifact-only; no full transcript export is available.

## Final acceptance

- **165 JVM tests** and **216 complete emulator tests** passed; the three last recovery/fallback cases also passed separately.
- Debug build, unsigned release APK/AAB/R8 and both lint variants passed. Lint has zero errors, with 56 debug / 55 release warnings. The installed debug APK matches the tested build hash; the duplicate release app remains absent.
- Live 1.0 / 1.3 text checks passed: full hero logo, applicable controls, matching IMDb 8.8 / RT 97 / TMDB 8.5 scores on Home and Info, Picture/Sound/File focus and reading bounds, no bullet dividers, and return to the saved poster. Original font scale 1.0 was restored and normal Home was left visible. The isolated sidecar log contains zero incoming library-mutation/playback-start requests.
- `acceptance-results.json` and `source-sha256.json` record 224 source/contract hashes and five artifact hashes (four native artifacts plus the production server bundle). `installed-build.json`, `live-results.json`, final logs and normal/large screenshots provide the corresponding evidence.

Independent artifact review by gpt-6-astra verified all 224 source hashes, five build artifacts, final counts, screenshots and retained iteration history without discrepancies. Review limits and Plex server-side dismissal uncertainty remain explicit in `tmp/tv-hero-media-2026-11-05/evidence-review.md`.
