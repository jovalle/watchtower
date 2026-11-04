> Superseded by the [full consistency audit](full-consistency-audit-2026-11-03.md), which records the expanded route/state matrix and final verification. Earlier results below are historical.

# Layout standardization verification — November 3, 2026

Implemented in the managed WIP worktree at `[local workspace]`. The old WIP checkout had been archived; this work starts at its saved snapshot `e774020` (parent `6645278`), retaining the six Watch Together style changes. Main and the other active worktrees were not edited by this implementation.

## Result

- A common 64px navigation row, shared safe-area-aware gutters, consistent page title rows and section navigation.
- Compact navigation below 768px keeps Search and Menu reachable. Notifications and the existing activity panel remain available through the menu. Activity is a native modal sheet on mobile and a nonmodal dropdown on desktop.
- All standard pages use the wide outer frame; readable Settings/TV-link forms constrain an inner column. Headers remain aligned to that outer frame.
- Watchlist's heading persists through pending, success and error states. Pending content uses the real disabled toolbar rather than guessed placeholder sizes. Empty lists retain the sort slot.
- A shared nested page freeze keeps the browse scrollbar track and restores prior inline styles and scroll position. Header, body and content widths remain identical through menu/activity transitions.
- Cinema navigation matches the 64px row. Full-screen player/room routes explicitly remove the browse gutter and fill the viewport.

## Automated checks

| Check | Result |
| --- | --- |
| Baseline suite | 474 tests, 72 files passed |
| Final full suite | 484 tests, 76 files passed |
| TypeScript | Passed |
| ESLint | Passed, no new warnings |
| Production build | Passed |
| `git diff --check` | Passed |

Logs remain in `/private/tmp/layout-final-tests.log`, `/private/tmp/layout-types.log`, `/private/tmp/layout-lint.log` and `/private/tmp/layout-build.log`. The build retains existing Browserslist/empty-route/dynamic-import warnings; React Router future-flag warnings remain in test output.

Regression tests cover mobile actions, menu dismissal, discovery restrictions, resize dismissal, persistent section/deferred headings, pending disabled controls, authorized error shells, nested page-lock lifetime and exact scroll/style restoration. The initial six layout regressions, resize regression, and page-freeze regressions were observed failing before their implementations.

## Browser evidence

Browser checks used the production WIP build behind a loopback-only proxy, with a synthetic account/upstream and an isolated data directory. External service requests were disabled. No real settings, requests, lists, credentials or playback history were changed. Fixture artwork is not representative of a real library.

Eight core pages were measured at each of six widths: Movies, Series, New in Library, Discover, Watchlist, Search, Settings and Notifications.

| CSS viewport | Header height | Shared logo/content left edge | Primary title top | Root overflow failures |
| --- | --- | --- | --- | --- |
| 320px | 64px | 16px | 96px | 0 |
| 375px | 64px | 16px | 96px | 0 |
| 768px | 64px | 24px | 96px | 0 |
| 1024px | 64px | 32px | 96px | 0 |
| 1440px | 64px | 32px | 96px | 0 |
| 1600px | 64px | 60px | 96px | 0 |

All 48 final core records meet those assertions. Additional final records cover Vote, Private Cinema and room joining at 375px and 1600px: 64px headers with no root overflow. Earlier route walkthroughs also covered Home, Requests, Issues/detail, movie/episode/show/season detail, actor and list detail, TV linking, child-route errors, public invitation and access-denied pages at narrow and wide widths.

State checks:

- A delayed Watchlist response at 375px produced exactly the same pending/resolved title rectangle (x16/y235, 335×44) and toolbar rectangle (x16/y295, 335×156): zero pixel delta.
- At 375px, header/body/content stay 367px wide before, during and after mobile navigation/activity overlays. Backdrop wheel input does not scroll the frozen page. Escape returns focus to Menu. The 8px browse scrollbar track remains reserved.
- At 639/640/767/768px, visible header controls fit within their frame, and Search/Menu targets are 44px square. Switching header modes closes overlays.
- Filtered library → detail → settled browser Back preserves `?genre=Drama&sort=addedAt&dir=desc` and restores focus to the selected title card.
- Full-screen Watch Together at 375×812 occupies x0/y0, 375×812, with root overflow hidden and no browse gutter or header gap.

Raw final records and screenshots are stored in the local artifact directory:

`[local workspace]`

Files: `layout-final-core.json`, `layout-final-variants.json`, `layout-watchlist-states.json`, `layout-overlay-check.json`, `layout-player-check.json`, `layout-back-focus.json`, `layout-standardization-desktop.png`, `layout-standardization-mobile.png`.

## Review and decisions

GPT-6 Astra performed a read-only review. Its two important findings were addressed: modal scroll-lock compatibility and pending-toolbar geometry. Minor popup semantics and title casing for newly authored copy were also corrected. Subsequent fixes were verified with regression tests and rendered measurements; the reviewer did not perform a second review of those fixes.

Implementation decisions:

1. Recover the saved WIP snapshot in a new managed checkout because the old checkout no longer existed. Snapshot parent and prior style changes were verified; using the wrong base would have lost integration work.
2. Reuse installed dependencies through an ignored local directory of links; no package or lockfile edits. Version mismatch risk is bounded by the successful full checks.
3. Keep a scrollbar track on short browse pages because `scrollbar-gutter: stable` alone did not reserve it in this browser. The tradeoff is an empty track on short pages. Playback removes it intentionally.
4. Reuse one activity/polling instance with a controlled native dialog rather than a second mobile activity implementation. Native focus, Escape, scroll blocking and resize behavior were checked; real-device behavior remains a separate limit.
5. Correct MediaRow negative margins below 640px because the previous 20px margins exceeded the 16px gutters. No media behavior changed.
6. Freeze the body while overlays are open rather than toggling root overflow, because removing the root scrollbar resized the frame. Nested lifetime and exact style/scroll restoration are covered by a regression; browser width and wheel checks passed.
7. Follow the main repository's newly available title-case guidance for newly authored labels, without a broad copy rewrite.
8. Leave all layout changes uncommitted and undeployed for review. Preserve this worktree rather than archiving it before review.

## Limits

This establishes local rendered layout and synthetic behavioral evidence, not production or live Plex compatibility. Physical touch devices, notched-device safe areas, actual desktop 200% zoom, guest cinema rendering and additional browser engines were not verified. Public setup/landing presentation was reviewed by source; the configured fixture redirects setup. Existing fullscreen/hero content remains intentionally distinct from ordinary page framing.

## Follow-up: media action consistency

The first pass did not establish control-level consistency. The reported TV-detail Add button exposed a real omission: its label disappeared above the mobile breakpoint, its icon-only content produced a shorter control, and adjacent external links used bespoke sizes and colors. The earlier layout evidence must not be read as an exhaustive interface audit.

The follow-up uses the existing shared Button styles throughout active media-detail action rows, external-title actions, and request-modal actions. Large actions have a 56px minimum height; compact actions retain a 44px minimum. Movie/show Watchlist actions always show their label and expose their pressed state. Requests & Availability joins the main action group. TV/season external links remain reachable on mobile and use the same secondary style; movie/episode sidebar links use the compact size appropriate to that column.

Review also found that Watchlist state survived navigation between titles, including responses from an earlier pending request. Keying the library detail component by media type and rating key isolates that state. Two navigation regressions failed before the fix and passed afterward. Tests cover movie/show add, pending, saved and removal/navigation behavior, plus season/episode eligibility. GPT-6 Astra reviewed the narrow state fix and found no remaining issue; it did not rerun tests.

Latest verification:

- Full suite: **490 tests in 77 files passed**; TypeScript, ESLint, production build and `git diff --check` passed. Logs: `/private/tmp/media-actions-{tests,types,lint,build}.log`.
- Rendered checks: seven variants (show, saved show, movie, season, episode, external title, shared text/icon button sizes) at 320, 375, 640, 768, 1280 and 1600 CSS pixels: **42 records**. Every measured hero action was 56px tall, used 18px type and a 6px radius, retained visible labels, and produced no root overflow.
- This follow-up rendered real route/components with synthetic loader fixtures and production CSS in static browser previews. Unit tests exercise interactions separately; these previews do not establish live backend or artwork behavior.
- Evidence in the artifact directory above: `media-actions-measurements.json`, `media-actions-fixed.png`, `media-actions-mobile.png`. The ignored renderer is `tmp/media-actions-preview/render.tsx`.

Compact circular card/player controls serve different contexts and were not changed into hero actions. The unused legacy MediaControls export has no active caller and was left untouched. This verifies the listed media actions, not every control or state in the application. All changes remain local, uncommitted and undeployed in the WIP worktree.
