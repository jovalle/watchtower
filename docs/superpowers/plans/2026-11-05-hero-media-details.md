# Rich Home Hero and Technical Media Details

> **For agentic workers:** Use superpowers:executing-plans for the Android work. Backend contract changes are a separate parallel task under superpowers:dispatching-parallel-agents, with explicit file ownership. No commits or extra worktrees.

**Goal:** Enrich the Home hero and close its wasted vertical gap, expose contextual controls, and display real media-version technical facts in Info.

**Architecture:** Add optional listing genres/ratings without fan-out provider requests. The active hero alone also uses the existing cached ratings endpoint to agree with Info; its independent read survives membership confirmation. Extend HomeViewModel with profile-bound selected-item action state and confirmed mutations. Home content follows its measured hero height with 32dp shelf separation, retaining focus restoration and a visible first shelf. Existing MediaVersion supplies technical details; extend only missing aspect/Dolby Vision facts. Select a version in Info to inspect it and play that version through existing routes.

**Tech stack:** Kotlin Compose for TV; Remix native API; Plex; existing test fixtures/emulator. No dependencies or secrets required.

**Spec:** User approved richer hero (progress, ratings, genres, longer synopsis, Watchlist and closer shelf), additionally requested Play From Start, Mark Watched, Remove From Continue Watching and grouped picture/audio/file metadata based on supplied image. Preserve Watchtower styling and symbols.

## Constraints

- Preserve all unrelated Android/player/layout-audit work and Watch Together separation.
- Retain Resume/Info as first two hero actions. Contextual symbols: Start Over only when resuming; Watchlist for movie/show; Watched for movie/episode; Dismiss only for a Continue Watching item. Unknown membership is not false.
- Busy/error guards and profile/selection stale-response protection. No generic Saved line. Only remove/update UI after confirmed library mutations. Watchtower sends no media-delete/scrobble/timeline/progress-reset writes for dismissal and preserves its local offset. Dedicated Plex action server-side progress/watched effects remain unverified live.
- Hero shelf follows measured content with32dp separation. Test normal/1.3 text, logo/fallback/long episode titles, empty/missing metadata and remote scrolling/restore. At larger text sizes use a compact title and two synopsis lines so the title and focused first poster fit.
- Picture/Sound/File facts come from selected media version only. Omit empty/unknown data, reject nonfinite values and never infer Atmos from codec. No filesystem paths exposed. Version selection inspects rather than starts playback; existing Play/Start Over use chosen mediaId.
- Live checks are read-only previews; mutations/playback/error cases use fixtures. Keep only paired debug app installed, unsigned release build only.

## Task 1 — Backend contract (parallel ownership)

- [x] Verify Plex dismissal endpoint against a primary source, add guarded DELETE `/api/v1/media/:ratingKey/continue-watching` route and Plex client method; ownership and recheck before write.
- [x] Add optional summary genres/ratings; populate from existing Plex listing data. Extend MediaVersion with optional nullable aspectRatio/dolbyVisionProfile and preserve stream bit depth/frame-rate if reported. No home provider fan-out.
- [x] Meaningful route/client/serializer tests (RED→GREEN), update fixture examples, run scoped backend tests/typecheck/lint and record evidence.

## Task 2 — Home hero and mutations (root Android ownership)

- [x] Add failing native state/UI regressions for contextual routes, identity/stale/error guards, confirmed dismissal and progress formatting.
- [x] Add HomeViewModel selected-item watchlist/action state, native dismissal API/data source and optional DTO additions.
- [x] Build richer measured hero and fixed-height symbol action row, progress/time-left line and summary metadata; preserve focused shelf key and Home navigation. Verify no overlaps or inaccessible controls at1.3text.

## Task 3 — Info technical details (root Android ownership)

- [x] Tests for missing fields, real version formats, audio channels/labels, correct per-version isolation, version selection without playback and selected-version playback routes.
- [x] Group Video, Audio and File facts in compact Watchtower fields below hero actions. Render applicable version selector, replace previous play-immediately version row with inspection selection. Preserve all cast/person and rating actions.

## Review focus

- Changing selection/profile during reads or writes must not leak results or apply mutations to the wrong item.
- Dismiss last Continue Watching item must leave valid focus and preserve other shelves/Watch Next data.
- Rich content must not bury the first shelf or displace its content on focus-only changes.
- Missing/malformed/upstream technical values and multi-version/multi-part files must not produce fabricated badges or mixed data.
- Returning from details/player or a failed mutation must preserve existing focus and list state.

## Acceptance

- [x] Relevant backend tests/typecheck/lint, native JVM/lint/builds, full emulator suite; fix failures before claiming completion.
- [x] Live Home/Info at normal/large text, no real writes or playback. Check installed APK hash, duplicate release absence and restored font scale.
- [x] Independent source and task-scoped evidence review, final hashes/handoff and append-only decision trail.
