# Five-star rating prompt

The native TV prompt renders five stars with half-star selection in Watchtower colors. Existing Plex ratings retain their stored 0–10 values: 1 displays ½ star, 7 displays 3½ stars, and 10 displays 5 stars. Null remains Not rated. Provider scores such as IMDb and TMDB retain their existing scales.

Left/Right previews half-star steps; Select confirms. Mouse hover previews without writing, either half can be clicked to save, and dragging away cancels. Whole-star centers select the whole star. Accessibility exposes a 0–5 range and maps confirmed values back to Plex. Clear, Done, pending/error feedback and dialog/opener restoration remain available. Clearing explicitly focuses the persistent star row before its own action disappears.

The existing outlined star path supplies the filled/half-clipped artwork. No dependency, backend, API or credential changes were needed. Ten focused regressions cover stored-value mapping, half-fill pixels, remote preview/commit, mouse halves/centers, hover restoration, disabled input, accessible progress, drag cancellation, Clear focus and rapid remote input before redraw. Surrounding layout/dialog tests cover the five-star presentation, including 1.3× text.

## Verification

Evidence is in `tmp/tv-five-star-2026-11-05/`:

- Final native build, JVM tests and debug lint passed: 154 unit tests, zero failures; lint has zero errors and 51 warnings.
- Full emulator instrumentation passed: **175 tests**, including all ten new regressions.
- Unsigned release APK, AAB, R8 and release lint passed; release lint has zero errors and 50 warnings. The release app was not installed; only the paired debug app remains.
- Live normal and 1.3× text checks previewed 3½ stars, closed the prompt, and reopened it to verify Not rated remained. No account rating was submitted or playback started. Original font scale was restored; the emulator is left showing an unsaved 3½-star preview.
- `acceptance-results.json` records source and artifact hashes, counts and limits. `source-sha256.json` records the source manifest. Screenshot pairs are `normal-half-preview.png` and `large-half-preview.png`.

Initial six feature tests failed before implementation; 39 focused surrounding tests passed afterward. A star-center regression reproduced a lower-half boundary error, fixed in pointer mapping. Source review then found a stale preview captured by key/confirm callbacks. The first paused-clock test allowed redraw between events; a stronger test dispatched Right/Right/Select in one UI turn and reproduced the lost update. Handlers now read the current mutable selection; the final full run passed. The obsolete full run was deliberately stopped for that reproduction and is not passing final evidence.

Physical TV behavior and production signing/distribution were not checked. Saving, clearing and errors were tested with isolated fixtures, without live-account writes. Backend/web suites were not rerun for this native-only change. Independent evidence review is limited to task artifacts; a complete transcript export is unavailable.

Independent artifact review by gpt-6-astra confirmed all 209 source hashes, four artifact hashes, test/lint counts and both preview screenshots without discrepancies. See `tmp/tv-five-star-2026-11-05/evidence-review.md`.
