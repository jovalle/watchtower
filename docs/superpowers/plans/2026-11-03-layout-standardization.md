# Watchtower Layout Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This request authorizes an audit and plan; implementation is a separate step.

**Goal:** Keep navigation and page framing steady across routes, loading states, scrolling and screen sizes.

**Architecture:** Retain the existing Header, Container and route hierarchy. Centralize header geometry, reuse one page-header pattern and one section-navigation pattern, and remove conflicting route-level width and spacing choices. Keep specialized content inside a consistent outer frame.

**Tech Stack:** Remix, React, Tailwind CSS, existing Vitest/Testing Library setup; browser geometry checks through the existing browser tooling.

**Spec:** The user's November 3 request to identify layout shifts and plan uniformity; the Layout contract below defines the proposed implementation targets.

## Scope and evidence

Audit date: November 3, 2026. No application source was changed for this audit.

- Inspected shared layout/navigation and the presentation of all authenticated route families, public access/setup screens, voting/private-cinema layouts, media detail, and playback/room screens.
- Measured authenticated local pages at `http://127.0.0.1:9001`: Movies, New in library, Discover, Watchlist, Search, Settings and Notifications, at a 1600px viewport. Visually checked library navigation at 375px and 320px.
- The local app and WIP worktree have identical audited Header, Container, app layout, global CSS, Search, Settings, Notifications, Watchlist, My Stuff and WatchNavigation files. The WIP worktree additionally contains Watch Together and TV linking.
- Implement in `/Users/jay/.codex/worktrees/watchtower-wip-integration/watchtower`, retaining its six existing uncommitted Watch Together style changes. Do not overwrite unrelated changes in the main checkout or other worktrees. Recheck the diff before implementation because other work is active.
- Browser measurements describe the local build, not the deployed WIP hostname. Some library artwork remained placeholders. A transient unstyled browser capture was excluded from layout conclusions.

## Verified findings

| Priority | Issue and evidence | Effect and location |
| --- | --- | --- |
| P1 | **Mobile header exceeds available space.** At 320px the menu control is outside the visible right edge; at 375px the actions crowd the logo. Header retains Notifications, Search, streaming activity, avatar and hamburger with `gap-4`. | Primary navigation can become unreachable. `app/components/layout/Header.tsx:127–178`; streaming trigger is independently sized at `app/components/StreamingDashboard.tsx:615–622`. Global `overflow-x: hidden` conceals overflowing controls rather than making them fit. |
| P2 | **Scrollbars move the whole frame.** At 1600px, Movies/Watchlist/Settings have a 1592px document and header; short Discover/Search/Notifications pages have 1600px. The centered logo moves from x=60 to x=64. All measured app headers remain exactly 64px tall. | A real 4px horizontal navigation jump explains part of the apparent resizing. The CSS defines an 8px scrollbar but reserves no stable gutter: `app/tailwind.css:104–148`. Mobile menu also toggles body overflow: `app/components/layout/MobileMenu.tsx:35–39`. |
| P2 | **Inconsistent outer content widths, including a conflicting override.** Header and library use a 1536px frame; Search and Notifications use the default 1280px frame. Search content begins at x=192 while its logo begins at x=64. Settings specifies both the default `max-w-7xl` and `max-w-2xl`; measured outer width is 1280px, so the attempted narrow override is not reliable. | Content pivots relative to the shared header; Settings has ambiguous width ownership. `app/components/layout/Container.tsx:11–34`; `app/routes/app.search.tsx:115`; `app/routes/app.notifications.tsx:17`; `app/routes/app.settings.tsx:558`. TV linking adds another 768px outer frame in WIP. |
| P2 | **Loading and resolved Watchlist use different geometry.** Skeleton uses default Container + `py-6`; content uses wide Container + `py-8`; error state returns to default width. At 1600px with a scrollbar this changes inner left edge from x=188 to x=60 and top inset by 8px. | Visible horizontal and vertical movement as deferred data resolves; the grid/filter/header structure also changes. `app/routes/app.watchlist.tsx:312,716,873`. |
| P2 | **Heading/navigation structure is duplicated and spacing varies.** Watch and My Stuff separately assemble the same section header. Movies has a 20px second h1 at y=227; Watchlist has a 30px second h1 at y=235. Notifications centers its title against a taller action, putting its heading 4px lower than ordinary headings. Discover adds `space-y-10`, unlike Seerr's description spacing. | Pages acquire different title baselines, tab-to-content gaps and heading hierarchy. `app/components/library/WatchNavigation.tsx`; `app/routes/app.stuff.tsx`; `app/components/library/LibraryHeader.tsx:413–419`; `app/routes/app.watchlist.tsx:715–728`; `app/routes/app.notifications.tsx:18`; `app/routes/app.discover.tsx:65–69`. |
| P2 | **Separate shell geometry exists outside the core app.** Vote and Private Cinema use 56px headers and 1024px navigation frames, versus 64px/1536px in the app. Body safe-area side padding does not apply to the fixed app header. | Actual header-size changes between page families, and a code-level risk of header/content misalignment on notched landscape devices. `app/routes/vote.tsx:128–129`; `app/routes/private.tsx:135–136`; `app/tailwind.css:127–129`. Safe-area behavior was not tested on hardware. |

The scroll-dependent header gradient/background changes appearance, but the measured app header does not grow or shrink. Do not treat that color transition as a height defect.

## Layout contract

These are proposed standards, not claims that the current UI already meets them.

1. **Header geometry:** a 64px usable header row on every navigated Watchtower surface. Define `--app-header-height: 4rem` and `--app-header-offset: calc(var(--app-header-height) + env(safe-area-inset-top, 0px))`. The fixed header, its inner row, main content offset and mobile-menu heading derive from these values. Scrolling changes color only, never padding, dimensions or logo size.
2. **Stable viewport:** reserve the root scrollbar gutter on short and long pages. Header and document content must retain their x coordinates when page length changes or a modal locks scrolling. Verify fixed-position elements too; do not assume a root gutter declaration alone solves every overlay case.
3. **One outer frame:** navigated content and navigation use the existing wide Container: max-width 1536px, gutters 16px below 640px, 24px from 640px and 32px from 1024px. Apply horizontal safe-area insets once at this shared boundary, rather than differently on body and fixed header. Full-bleed backgrounds may extend outside it.
4. **Narrow content is an inner constraint:** Settings and TV-link forms use an inner `max-w-2xl` column aligned to the outer content edge. Detail reading columns may remain narrow too. Search input may remain `max-w-2xl`, while results use the wide frame. Do not override a Container's max-width with another max-width class.
5. **Page headings:** ordinary pages start 32px below the app header. Use a shared 44px minimum title/action row, with title and actions vertically centered; primary headings are 30px/36px, bold. Description margin is 8px; gap before following ordinary content is 32px. Actions may wrap below the title on small screens without pushing the outer frame sideways.
6. **Section pages:** Watch and My Stuff use the same heading and navigation structure. Section nav starts 24px after the title row; links have a 44px minimum target and the existing underline active state. Keep link navigation semantics. Tab-to-child-content gap is 24px. The parent owns the single h1; visible child titles are 20px/28px semibold h2 headings. Page navigation wraps/scrolls inside its own strip if necessary, never the whole document.
7. **Responsive header:** below 640px retain logo, Search and Menu in the header, each action at least 44px square. Move Notifications and streaming activity access into the mobile menu; identity already appears there. At 640–767px retain those same three header elements for a predictable compact layout. From 768px use desktop navigation and actions. Preserve access to every feature and the discovery-disabled preference. Give the logo a fixed 28px height and nonshrinking slot; reserve badge/avatar geometry during loading.
8. **States:** keep page heading, navigation and outer frame mounted while data loads, fails, empties or refreshes. Skeletons reserve the resolved header/filter/media footprint. Test viewport geometry with real fonts and long labels; do not size the shell from the current dataset.
9. **Intentional variants:** Home/media heroes keep their full-bleed imagery and overlaps, with text aligned to the shared outer frame. The player and Watch Together overlays remain full-screen without an additional 64px gap. Vote/Private Cinema retain their content and guest navigation, but share header height, logo geometry and outer navigation gutters. Public landing, setup and sign-in may remain focused standalone screens; do not add an authenticated nav to them.

## Global constraints

- Preserve current Watchtower branding, routes, query parameters, active states, authorization, Plex behavior and room behavior.
- No dependency additions or new general layout framework. Reuse Header, Container, Typography and native links/dialogs.
- No production deployment, commits or unrelated source cleanup in this planning task.
- Do not change `Container`'s default globally and hope every caller adapts. Migrate the relevant routes explicitly.
- Keep existing fullscreen, focus restoration, scroll restoration and mobile-menu keyboard behavior.

## Review focus

- Long versus empty pages, deferred content and modal scroll locks: logo, nav and page frame must remain in place.
- Narrow widths and 200% zoom: Menu and Search remain reachable, with no logo collision or clipped controls.
- Missing/slow avatar and fonts, unread badges and discovery disabled: header slots retain their dimensions.
- Back/Forward to a scrolled library and filter navigation: preserve position/focus without landing under the header.
- Landscape safe areas and full-screen player/rooms: no doubled inset, blank top strip or covered exit action.

## Task 1: Stabilize shell dimensions and scrollbar behavior

**Files:** `app/tailwind.css`, `app/components/layout/Header.tsx`, `Container.tsx`, `MobileMenu.tsx`, `app/routes/app.tsx`.

**Interfaces:** Existing component props stay compatible; CSS exposes `--app-header-height` and `--app-header-offset` as defined above.

- [ ] Record before measurements at 1600px for Movies → empty Search → Notifications → Settings, and with the mobile menu open/closed. Capture header, logo, first nav item and content-frame rectangles.
- [ ] Reserve a stable root scrollbar gutter; derive header/main/menu offsets from the shared header variables. Put horizontal safe-area handling at Container and remove duplicate body side padding. Keep the header's inner usable row at 64px.
- [ ] Repeat the same browser measurements. Assert same header height and logo/nav/frame x positions within 1 CSS px across long/short states and menu open/closed; at zero safe-area inset, ordinary content starts below y=64. Test scroll position 0 and >10px.
- [ ] Check existing fullscreen playback/room routes by source and an isolated browser fixture, without starting a real media session. Ensure the new offset is not applied inside the fixed full-screen surface.

## Task 2: Make the mobile header fit without losing actions

**Files:** `app/components/layout/Header.tsx`, `MobileMenu.tsx`, `app/components/StreamingDashboard.tsx`; add `test/components/header-navigation.test.tsx`.

**Interfaces:** Keep Header props unchanged. Header owns `activityOpen: boolean`; pass `isOpen: boolean`, `onOpenChange(open: boolean): void` and `triggerClassName: string` to the single existing StreamingDashboard. MobileMenu gains `onOpenActivity(): void`; Header closes the menu before showing activity, with focus returning to Menu on mobile. Keep the desktop activity trigger hidden below 768px without hiding the mobile sheet. Reuse the existing dashboard and polling instance.

- [ ] Add failing semantic tests: mobile menu exposes Notifications and streaming activity; opening activity from the menu closes/transitions the modal correctly; Menu closes on navigation and Escape; discovery-disabled hides Discover in both navigation presentations.
- [ ] Run `npm test -- test/components/header-navigation.test.tsx` and confirm the new behavior is missing before implementation.
- [ ] Implement the compact/desktop layouts from the contract. Use nonshrinking logo/action slots and 44px targets; keep the streaming panel reachable above overlays and preserve its existing polling behavior.
- [ ] Run the tests; inspect 320, 375, 639, 640, 767, 768 and 1024px widths, with missing avatar, unread badge and discovery disabled. Assert controls do not intersect and every visible control remains within the header's inner bounds. Check keyboard focus after closing each overlay.

## Task 3: Standardize headings, section navigation and content frames

**Files:** add `app/components/layout/PageHeader.tsx` and `app/components/layout/SectionNavigation.tsx`; update `app/components/layout/index.ts`, `app/components/library/WatchNavigation.tsx`, `app/components/library/LibraryHeader.tsx`, `app/components/seerr/SeerrPage.tsx`, `app/components/media/Billboard.tsx`. Route files: `app/routes/app.watch.movies.tsx`, `app.watch.series.tsx`, `app.watch.recent.tsx`, `app.stuff.tsx`, `app.watchlist.tsx`, `app.lists.tsx`, `app.discover.tsx`, `app.search.tsx`, `app.settings.tsx`, `app.notifications.tsx`, `app.link.tsx`; review SeerrPage callers `app.requests.tsx`, `app.issues.tsx`, `app.issues_.$id.tsx`. My Stuff child routes re-export Watchlist/Lists; retain those exports.

**Interfaces:** `PageHeader({ title, description?, actions?, navigation? })`, with string title and ReactNode optional slots, owns title-row/description/navigation spacing. `SectionNavigation({ label, items })`, with `items: { label: string; to: string }[]`, renders labeled native navigation links. Existing WatchNavigation remains a small wrapper to avoid changing its callers unnecessarily.

- [ ] Add failing semantic tests in `test/components/page-layout.test.tsx`: Watch and My Stuff each expose one primary heading and a labeled section nav; selected links are correct after navigation; child headings are h2; heading/actions/description remain present for empty/error states. Include Search's currently missing primary heading.
- [ ] Run the new tests and verify failures, then implement the two small shared patterns using the contract's spacing and type values.
- [ ] Migrate Watch Movies/Series/Recent; My Stuff Watchlist/Lists; Discover; Search; Settings; Notifications; Requests/Issues and issue detail via SeerrPage; WIP TV linking. Use wide outer Containers; put form/reading widths inside them. Keep the search field's useful width and preserve all filters/actions.
- [ ] Verify actor/list detail and media hero text against the shared gutters; retain already-correct wrappers and their intentional hero geometry. In Billboard replace its copied max-width/gutter markup with Container so future changes cannot drift. Review `app/routes/app.actor.$id.tsx`, `app/routes/app.lists_.$type.$ratingKey.tsx` and `app/routes/app.media.$type.$ratingKey.tsx` for inset regressions.
- [ ] Run the new tests, `test/routes/navigation-redirects.test.ts`, `test/components/playback-navigation.test.tsx` and the existing watchlist/filter suites. Browser-check title baselines, nav underline positions and content left edges across the migrated route families, including 200% zoom and long action labels.

## Task 4: Keep deferred states and secondary shells steady

**Files:** `app/routes/app.watchlist.tsx`, `app/routes/vote.tsx`, `app/routes/private.tsx`; review route error-boundary handling in `app/routes/app.tsx`/`app/root.tsx`; tests in `test/components/page-layout.test.tsx` and existing watchlist tests.

**Interfaces:** Deferred data/loaders and route exports stay unchanged. Render shared page framing outside Watchlist's Await boundary; pending/error/resolved bodies occupy the same outer frame.

- [ ] Add a failing deferred-state test that holds then resolves/rejects Watchlist data and verifies the parent heading/navigation remain mounted and keyboard focus is not discarded. Include empty results. Use the existing route loader test stubs; do not contact real services.
- [ ] Implement the stable Watchlist frame and matching header/filter skeleton footprint. Ensure retry/error rendering uses the same frame. Avoid reserving an arbitrary full page of blank space.
- [ ] Apply shared header height/logo/gutters to Vote and Private Cinema while preserving their guest menus and titles. Keep their narrower content columns inside the common frame.
- [ ] Verify ordinary child-route errors retain the authenticated shell where parent loader data remains available. If the root boundary is replacing it, add an app-level boundary that reuses available parent data; never synthesize an authenticated user after an auth failure.
- [ ] Run affected tests; capture Watchlist pending → success/error at 1600px and 375px. Assert heading/nav/frame rectangles remain within 1 CSS px and no control focus is lost. Check both guest and signed-in cinema headers.

## Task 5: Whole-app acceptance and handoff

- [ ] Check every navigated route family: Home; Watch Movies/Series/Recent; Discover; My Stuff Watchlist/Lists; Search; Settings; Notifications; Requests; Issues/detail; movie/episode/show/season detail; actor; list detail; TV linking; room invite/join; Vote; Private Cinema. Check public landing/setup/access-denied and full-screen player/room surfaces as intentional variants. Use synthetic fixtures for unavailable/private states; do not mutate account settings, requests, lists or watch history just to inspect layout.
- [ ] At 320, 375, 768, 1024, 1440 and 1600px, record dimensions/screenshots for representative standard, section, hero, form and full-screen pages. At each size use the same user, font state and scroll position. Check top/scrolled, menu open/closed, loading/empty/error, Back/Forward and browser zoom. On a real notched device check landscape separately; emulated viewport evidence does not establish hardware safe-area behavior.
- [ ] Browser acceptance: shared header usable height = 64px; shared frame/nav/logo coordinates change by no more than 1 CSS px between comparable states; ordinary page titles/section tabs align; all controls remain visible; no unintended document-wide horizontal scroll; keyboard focus is visible and correctly restored. Fullscreen media has no inherited header gap.
- [ ] Run `npm test -- test/components test/routes/app.watchlist.test.tsx test/routes/navigation-redirects.test.ts`, `npm run typecheck`, `npm run lint`, `npm run build` and `git diff --check` in the selected WIP worktree. Distinguish pre-existing warnings/failures from new regressions.
- [ ] Review the final diff for leftover `max-w-*` overrides, duplicated header offsets and state-specific Containers. Save before/after measurements and screenshots, and report any untested hardware/state explicitly. Do not deploy as part of this plan.

## Delivery order and completion

Fix the stable shell and inaccessible mobile header first, then migrate shared framing, then deferred states and secondary shells. All tasks are sequential because they share the same geometry contract. Completion requires both behavioral tests and rendered geometry checks; passing jsdom tests alone does not verify CSS layout.

This plan intentionally excludes a full color/accessibility/performance audit, card redesign, new navigation destinations and playback/network changes. The remaining validation risk is actual deployed-host and physical-device behavior, which the local browser audit cannot establish.


## Execution record

Implemented November 3 in the recovered managed WIP worktree. See [the verification report](../../layout-verification-2026-11-03.md) for completed tasks, evidence, review fixes and validation limits. Tasks 1–4 are implemented; Task 5's local browser and automated checks are complete. Physical-device, true desktop zoom and extra-engine checks remain unverified. No merge, commit or deployment was performed.
