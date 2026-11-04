# Watchtower Web Consistency Audit — 2026-11-03

Completed in the existing WIP worktree. This supersedes the narrower completeness claims in the earlier layout verification. Changes are uncommitted and undeployed.

## Scope and Result

All **28 canonical web page families**, five shared layouts, and ten redirect aliases were inventoried. The reusable fixture inventory contains **192 page/component scenarios**: 104 route cases, 57 room/media/cinema cases and 31 forms/menu/integration cases. API-only routes and the separate Android TV application are outside this web presentation audit.

The main viewport matrix uses **320, 375, 768, 1024, 1440 and 1600 CSS pixels** at 900px height. Short-screen checks use **812×375 and 667×240**. Additional walkthroughs cover 639/640/767/768 navigation boundaries, modal focus/Escape, scroll restoration and loaded video controls.

The final geometry sets contain **1,520 records**: 666 page/deferred-state records, 528 component records, 176 landscape component records, 96 form submission/response records and 54 loaded/fatal player records. There are additional focused text-bound and interaction records. Shared navigation rows measure **64px** throughout; fullscreen playback removes the browse navigation and gutter. No unresolved unexpected horizontal overflow, unnamed visible buttons, nested interactive controls or tested overlay clipping remains in the verified matrix.

## Issues Fixed

| Area | Verified Cause | Result |
| --- | --- | --- |
| Page framing | Separate padding, container widths and section headers | Shared Header, Container, PageHeader and SectionNavigation; readable forms constrain an inner column |
| Navbar/overlays | Removing the scrollbar resized the frame; fullscreen controls covered browse navigation | Stable browse gutter, nested page freeze, preserved scroll/focus; playback omits covered navigation |
| Action controls | Bespoke classes, icon-only content, hidden Watchlist label and inconsistent size minima | Shared Button/buttonStyles; ordinary actions ≥44px, media hero actions ≥56px; labels and toggle state stay visible |
| Theme | CSS accent variables differed from component tokens; muted/error text failed contrast on elevated surfaces | Mango variables match tokens, muted metadata is #9ca3af, error text uses readable red; shared foreground contrast tests enforce ≥4.5:1 |
| Long content | Flex min-content widths, unbounded labels, native fieldset/legend sizing and voter names | Constrained and wrapping account/server/device/title/comment/legend fields; deliberate truncation retains accessible text |
| Pending navigation | Library grids disappeared before destination data arrived | Keep the grid/focused item mounted and announce pending state |
| Empty/failure states | Upstream errors appeared as empty data; filters claimed the library itself was empty | Distinguish unavailable, genuinely empty and filtered-empty states; preserve recovery actions |
| Watchlist state | State survived title navigation; repeated optimistic requests raced | Per-title detail state plus shared pending/rollback/error behavior for card/context actions |
| Playlist selector | Nested card/modal interactions navigated away; placeholder membership ID could be deleted | Independent native modal, correct membership roundtrip, disabled pending rows, visible errors and restored focus |
| Menus | Missing names/states/keyboard behavior and height bounds | Named disclosures, selection/expansion state, Escape/focus return, bounded scrolling and viewport-aware placement |
| Alphabet navigation | 20px drag targets and a tall strip exceeded short screens | Reuse native 44px A–Z selection and a 44px Return to Top action |
| Media dialogs | Narrow request actions overflowed; trailer Close extended above short viewports; backdrop wheel moved the page | Responsive and scrolling panels, trailer Close inside viewport, shared page freeze for request/trailer/playlist dialogs |
| Player | Hidden drawer controls remained focusable; loading/error covered active controls; short-screen chrome overflowed | Inactive controls inert, intro/next-up actions hide behind drawers, focus returns correctly, compact transport and bounded menu/next-up panels; countdown uses dark text on mango |
| Cinema | Carousel controls nested inside links, unreachable leading posters, clipped share/rename controls, stale search results | Independent controls, reachable carousels, responsive details, guarded query results and accessible modal tasks |
| Mutations | Failed cinema additions/votes/deletion or Trakt disconnect could look successful | Hold pending controls, retain tasks/drafts on failure and show recovery errors |
| Install/toasts | Unbounded messages and a dismissed install prompt left an inert action | Bounded/wrapping notification surfaces and correct banner dismissal |

Home's established light More Info action, compact card/player controls, public fullscreen surfaces and Private Cinema typography are intentional contexts. They retain the shared palette, focus language and control target conventions. They are not ordinary page-frame outliers.

## Verification

- Full suite: **530 tests in 89 files passed**. Focused regressions were observed failing before their fixes, including pending navigation, playlist interaction, stale search, title state, modal focus/scroll, token contrast and failed mutations.
- TypeScript, ESLint, explicit fixture-runner lint, production build and `git diff --check`: passed. Existing build/test framework warnings remain; no dependency or lockfile changes.
- All page-family screenshots were captured at 320px and 1440px: **70 captures**, with viewport dimensions checked before saving. Contact sheets were visually reviewed. Retained full-page captures use one active tab, native render settlement and preserved fixture query parameters; earlier cropped/mixed-tab captures were replaced.
- Loaded player checks use a generated, silent 60-second WebM. Quality/audio/subtitle panels, episode drawer, native keyboard seeking, intro and credits/next-up layouts were exercised at all six widths and both landscape sizes. This is presentation evidence, not Plex stream/transcoder compatibility.
- Navigation overlays preserve the header/body width before/during/after opening at 639, 640 and 767px; Escape restores Menu focus. Crossing 768px closes overlays.
- Media dialog backdrop scrolling and exact position restoration were verified on a scrollable media page, in addition to shared nested-lock regressions. Request/trailer keyboard dismissal returns focus to the trigger; request, trailer and playlist dialogs share that cleanup pattern.
- An expanded **624-record** text-bound pass includes spans, labels, legends and fieldsets. Empty decorative intro-animation spans and a fullscreen dismissal surface covering the reserved gutter are intentional exceptions, not text/control overflow.

Logs: `/private/tmp/consistency-tests.log`, `consistency-types.log`, `consistency-lint.log`, `consistency-build.log`, `consistency-runner-lint.log`; focused logs use the `consistency-` prefix.

## Reproduce

See [UI Consistency Preview](../scripts/ui-consistency/README.md) and [Interface Conventions](../DESIGN.md).

```sh
npm run build
node --import tsx scripts/ui-consistency/server.mjs
```

The loopback-only runner renders the actual production Remix modules with synthetic loaders/actions/APIs and separate real-component galleries. It forces a disposable data directory/session secret before importing the build, blocks server-side fetch, and only permits inspected pure redirect aliases to run original loaders. Unsupported auth handlers do not initiate OAuth. Browser CSP blocks external images/media/frames; no real settings, history, playlists, requests or credentials were changed.

The screenshot gallery and raw records are local artifacts:

[local workspace]

- `consistency-pages-final.json`, `consistency-components-final.json`, `consistency-landscape-final.json`, `consistency-actions-final.json`, `consistency-player-final.json`
- `consistency-interactions-final.json`, `consistency-text-final.json`
- `consistency-screens/index.html` (portable review gallery), `consistency-screens/manifest.json` (per-capture viewport checks), `consistency-overview.jpg`

## Canonical Page/State Coverage

Every route below was rendered at the six main widths. Deferred Home/Watchlist cases also include their initial shell; cases with action responses were submitted to reveal pending/error/authorization states. Shared galleries cover the additional local component states listed afterward.

| Route Module | Fixture Cases |
| --- | --- |
| `_index` | `landing` |
| `access-denied` | `access-denied` |
| `app._index` | `home-full`, `home-fallback`, `home-error` |
| `app.actor.$id` | `actor-full`, `actor-empty`, `actor-error` |
| `app.discover` | `discover-full`, `discover-empty`, `discover-partial`, `discover-error` |
| `app.issues` | `issues-empty`, `issues-error`, `issues-search-empty`, `issues-search-long`, `issues-selected`, `issues-untracked`, `issues-list` |
| `app.issues_.$id` | `issue-owner-open`, `issue-owner-resolved`, `issue-member`, `issue-error` |
| `app.link` | `link-empty`, `link-devices-long`, `link-error`, `link-authorization`, `link-pending` |
| `app.lists_.$type.$ratingKey` | `listdetail-playlist`, `listdetail-playlist-empty`, `listdetail-collection`, `listdetail-collection-empty` |
| `app.media.$type.$ratingKey` | `media-movie`, `media-show`, `media-season`, `media-episode`, `external-long`, `external-1`, `external-2`, `external-3`, `external-4`, `external-5`, `external-6`, `external-7`, `external-null`, `app-error`, `app-fatal` |
| `app.notifications` | `notifications-empty`, `notifications-long`, `notifications-error` |
| `app.requests` | `requests-empty`, `requests-error`, `requests-statuses` |
| `app.rooms.join` | `room-join-missing` |
| `app.search` | `search-idle`, `search-results`, `search-empty`, `search-partial`, `search-error` |
| `app.settings` | `settings-member`, `settings-owner-long`, `settings-invalid-sources` |
| `app.stuff.lists` | `lists-full`, `lists-empty`, `lists-error` |
| `app.stuff.watchlist` | `watchlist-full`, `watchlist-empty`, `watchlist-stale`, `watchlist-error` |
| `app.watch.$ratingKey` | `player-loading`, `player-ready`, `player-tracks`, `room-create` |
| `app.watch.movies` | `library-movies-populated`, `library-movies-empty`, `library-movies-filtered-empty`, `library-movies-paged-rating` |
| `app.watch.recent` | `recent-full`, `recent-empty`, `recent-error` |
| `app.watch.series` | `library-series-populated`, `library-series-empty`, `library-series-filtered-empty`, `library-series-paged-rating` |
| `auth.callback` | `auth-cancelled` |
| `intro` | `intro` |
| `join` | `join-missing` |
| `private.$showingId` | `cinema-detail-host`, `cinema-detail-guest`, `cinema-detail-empty` |
| `private._index` | `cinema-private-guest`, `cinema-private-empty`, `cinema-private-full` |
| `setup` | `setup-code`, `setup-code-error`, `setup-empty`, `setup-server-error`, `setup-connections`, `setup-disabled`, `setup-services` |
| `vote._index` | `cinema-vote-guest`, `cinema-vote-empty`, `cinema-vote-full` |

Shared layouts: root, app, My Stuff, Private Cinema and Vote. Legacy aliases: Movies, TV, New, Watch index, My Stuff index, Discover Movies/Series, TV Link, Watchlist and Lists. Redirect behavior is also covered by route regressions; they do not introduce separate page layouts.

## Shared Component States

- Room panel: host/guest, lobby/paused/playing, collapsed/expanded, countdown, reconnecting, member readiness/buffering/errors, invitation pending and diagnostic disclosure.
- Room tasks: create/resume/pending/disabled/error, takeover/pending and terminal/long reason.
- Cinema: movie catalog/loading/empty/search failure/added/limit/add pending/error, ranked new/existing/pending/empty/long, guest empty/prefilled/pending/error.
- Request modal: checking, failure, unknown, available, blocked, partial series, many seasons, submission pending and failed submission.
- Playlist modal: loading, failure, empty, populated/membership, mutation pending and failed mutation. Trailer frame, Close and Escape are checked; third-party playback is blocked in fixtures.
- User/filter/context menus: avatar absent/present/long account, empty/selected/many options, long/disabled/destructive items, bounded scrolling and keyboard/focus behavior.
- Streaming: active and history populated/empty/error/loading, expanded details and load-more pending.
- Integrations/Trakt: configured/unconfigured, test/detect pending/error, connected/disconnected/pairing and failed disconnect/scrobble update.
- Installation and toast: banner, native-prompt dismissal, regular and long message.

## Review and Limits

Independent read-only review found stale delayed search results, unbounded library menus, undersized targets, external-title wrapping and an unsafe fixture fallback. These were corrected; the reviewer confirmed the narrow fixes. Later visual/interaction findings were corrected and rechecked with focused tests and rendered evidence.

The Impeccable engine was unavailable, so this uses source inspection, regression tests, native browser interaction, computed geometry and visual review; no automated design-detector score or WCAG certification is claimed. Physical touch devices, virtual keyboards/notched safe areas, additional browser engines, actual desktop browser zoom, external trailer playback, casting/PiP hardware and live Plex/Seerr/Trakt compatibility were not exercised. Artwork is synthetic. The unused MediaControls export has no active caller and is excluded.

All known consistency findings in the listed scope have been addressed. This is a documented set of covered routes, states and sizes, not a claim about every possible service/data permutation.
