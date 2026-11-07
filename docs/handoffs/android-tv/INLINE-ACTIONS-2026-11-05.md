# Inline details actions

The rating action now expands within the details action row. An existing rating always displays five stars with the appropriate half-star fill; Plex's stored 0–10 scale is unchanged. An unrated item starts with a compact star action. Select/click expands or activates editing; Left/Right adjusts by half a star, and Select or a mouse half-star click confirms. Back or focus loss discards the preview. Outside editing, Left/Right moves to neighboring actions. Clear is a separate inline action when a rating exists.

All applicable actions appear inline when they fit: Play/Resume, Start Over, Watchlist, Rating, Clear Rating, Watched, Playlist and Report Issue. Actual rendered button measurements determine surplus entries in More. An action appears once, and More disappears when nothing overflows. An expanded rating retains its place while lower-priority actions move into surplus. Narrow rows reduce the star cells proportionally to preserve room for More; normal TV rows keep the 200dp star surface. Controls retain the shared 40dp height and reserve a stable 60dp action band.

The generic persistent Saved line and its obsolete state are removed from details and Settings. Watchlist, watched, rating and setting values remain visible on their own controls. Pending rating feedback occupies its existing caption area; errors remain visible on the page. Metadata errors and mutation errors are rendered once at their relevant location. Request/issue-specific completion behavior is preserved.

## Scope and evidence

Implementation reuses the existing native UI and five-star mapping, with no dependencies, backend, credentials or API changes. The action row is now in `DetailsActions.kt`; `RatingControl.kt` supplies the inline editor. The existing main/layout-audit and Watch Together worktrees were not touched. Only the paired debug package is installed; release artifacts are built without installing the duplicate app.

Evidence: `tmp/tv-inline-actions-2026-11-05/`. The first six feature tests failed against the old UI. Follow-up tests exposed duplicate semantics from measurement slots, rapid Select→Right edit entry, hidden-opener restoration and a readonly accessibility write bypass. Measurement controls are now disabled, semantics-cleared and nonfocusable; actual visible controls use stable slots. Edit state is read live, focus restoration has a separate fallback, and accessibility follows activation. A 240dp regression reproduced More extending beyond its bounds; star measurement/rendering now use the same constrained width.

A focused 45-test pass preceded the narrow-width regression. A complete 184-test run then passed, but an additional failed-Clear regression exposed loss of focus during optimistic rollback. Compact and expanded ratings now share one persistent Surface focus target; a subsequent 37-test focused run passed. A separate case checks that rollback leaves focus alone after the user deliberately moves away. The final complete run supersedes the earlier 184-test result. Final acceptance counts, hashes and live preview results are recorded in `acceptance-results.json` when verification completes. Independent source review closed all reported findings, including the shared compact/expanded focus target. The initial live helper assumed the featured movie was unrated; read-only inspection instead found its existing 2 / 5 rating. The helper was corrected to preserve and restore the actual stored value. This was a harness assumption, not a product failure or an account write.

Physical TVs and production signing/distribution are outside this check. Saving, clearing and failures use isolated fixtures; live checks only preview and discard, without account writes or playback starts. Backend/web suites are not rerun for this native change. Evidence review is artifact-only; no complete transcript export is available.

## Final native verification

Final JVM tests: **154 passed**. Complete emulator instrumentation: **186 passed**, including all 23 action-row and ten star-control cases. Debug build/lint and unsigned release APK/AAB/R8/lint passed with zero lint errors. Live preview checks and hashes are recorded in the final acceptance receipt.

Live normal and 1.3× text previews passed: existing 2 / 5 rating was visible before activation; a temporary 3½-star preview was discarded back to 2 / 5. Cast bounds did not change, all applicable actions fit inline, and there was no rating modal, redundant More or Saved line. The emulator is left on readonly details with the stored rating and original 1.0 font scale. Android exports focus on a SeekBar ancestor containing the description node; the live helper was corrected to check that ancestor after direct XML/screenshot inspection confirmed focus. Both helper assumption failures are retained separately.

Final receipt hashes 210 source/contract files and four build artifacts. The installed debug APK hash matches the tested APK, and the duplicate release package remains absent. Lint reported 51 debug and 50 release warnings, with zero errors.

Independent artifact review by gpt-6-astra confirmed all 210 source hashes, four build hashes, final counts, preview/restoration screenshots and focused SeekBar ancestor without discrepancies. See `tmp/tv-inline-actions-2026-11-05/evidence-review.md`.
