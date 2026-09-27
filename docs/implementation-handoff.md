# Watchtower implementation continuation

Updated 2026-09-26. Read [the delivery plan and ledger](netflix-replacement-plan.md) first. The six-priority delivery is **not complete**: implementation and automated checks are substantial, but authenticated browser, real service, and receiver acceptance remain open.

## Preserve the checkout

Work is in `/Users/jay/Projects/watchtower`, based on `8544e95`, with extensive mixed tracked/untracked changes already present before this session. Do not reset, clean, stage everything, or infer ownership from Git status. No commits or deployments were made. The session's starting tracked diff is in `/tmp/watchtower-initial-tracked.patch`; this is a comparison aid, not a complete backup of initially untracked files.

Ponytail full remains active. Reuse native browser controls, existing clients/components/storage, and installed dependencies. Do not automatically start another chat or spawn agents.

## Evaluation and missing inputs

`just dev 9021` was left running at `http://127.0.0.1:9021` (terminal session 53046, log `/tmp/watchtower-dev.log`). Verify the listener before restarting it; keep the origin stable for Plex login. The in-app browser tab at this URL is signed out and was marked for handoff. No cookies were copied or authentication bypassed.

The user specified **casting and desktop/mobile web browsers**. They have not yet named a receiver/browser combination or designated safe test media. An asynchronous question is outstanding. Owner/shared-user sessions mean the server owner's account and a different account with a restricted library, used to verify permissions independently. Test media means titles on which playback progress and request state may safely change. Do not ask for passwords or tokens.

Next live steps:

1. Have the user sign in to the existing evaluation browser and identify safe media and a receiver. Obtain shared-user access through normal sign-in when available.
2. Verify the deployed Seerr version/schema through normal configured service interfaces without printing configuration or keys. Upstream `develop` source informed implementation; deployment compatibility is not established.
3. Run the plan's owner/shared-user journeys, old URL/Back/reload checks, desktop/narrow layouts, keyboard/remote focus and dialogs, partial-series/4K states, request transitions, and imported-list preservation.
4. Measure the required startup/seek samples, audible tracks/subtitles, second-device resume, interrupted connection, long pause, and 30-minute playback. Record actual OS/browser/device versions and measurements.
5. Test real casting pause/seek/disconnect/resume. Native receiver detection is implemented; whether receivers can consume the authenticated stream is unproven. Never make the proxy public or put a Plex token into a receiver URL to force a pass.

## Implemented areas and remaining review

- Playback: explicit zero and strict resume parsing; bounded HLS failure/recovery; redirected playlist resolution, Range/416 and cancellation; per-user/title/session ownership and client identity; serialized timeline writes with sequence and replacement-session ordering; teardown preserves the last observed position; watched failures retry visibly; autoplay preference and cancellation; requested quality versus browser-reported video dimensions.
- Identity: existing media route accepts `tmdb-ID`, matches exact GUID plus type under the user's token, chooses the most recently viewed edition, and redirects to library detail. Discovery/search/watchlist/related/request notifications use it. Watchlist matching no longer grants Play from title/year alone. IMDb-only records now use the same detail route: exact accessible IMDb match, then TMDB mapping, then an internal unavailable-metadata fallback with no speculative Play action. Audit every actor/list/related entry and absent-GUID case with real data.
- Navigation/Home: Watch/Discover/My Stuff, library recent content, legacy query redirects, URL-backed watchlist filters; personal continue/next/related rows, deduplication, feed errors and cache refresh. Full browser Back/focus restoration and authenticated responsive presentation still need review. Plex watchlists and library indexes now paginate with offset/no-progress guards. Watch pages combine all matching sections and sort globally; cloud watchlists use the account token. Cache version 4 refreshes previously truncated snapshots. Route focus restoration and native keyboard-accessible card rating controls are covered by regressions.
- Requests: availability reads use mapped Seerr identity; the existing request modal exposes regular/4K and season state and supports missing-season requests for partial series. Seerr enforces seasons/quotas/permissions. HTTP 202 without a created request is an error. A created request with a failed subsequent status refresh remains successful and directs the user to Requests. Title details and request dialogs also show the mapped viewer’s own request decisions, including denial/failure and 4K, separately from media availability. Deployed response shape still needs verification.
- Notifications: durable atomic per-user/per-Seerr-URL files, read state, baseline on first poll, consecutive-state deduplication (including failed → processing → failed as a new notice), outage retention, confirmed missing-request checks. README documents foreground one-minute polling, 200-request/notification ceilings, and single-process assumptions. This is not a background notification service.
- Couch: native scrolling, visible focus, directional geometry navigation, child-action key guards, mobile native dialog, larger player/card controls, native receiver picker. The whole-app 44px target audit, route focus restoration, and actual remote/device walkthrough are not yet accepted. No Chromecast receiver implementation was added.

Session ownership is in memory (six-hour sliding TTL, 5,000 entries); reload playback after process restart. Notification storage locks are in-process. Do not run multiple app writers without replacing these with shared storage. New settings are additive; no watch history or configuration reset was performed.

## Verification

Baseline: `just check` passed 135 tests in 21 files; `just build` passed. Final implementation: `just check` passed lint, TypeScript, **198 tests in 32 files**; `just build` and `git diff --check` passed. Logs are in `/tmp/watchtower-resume-full.log` and `/tmp/watchtower-resume-build.log`. Existing reference-checkout/Router/build warnings remain. Re-run after any further changes.

Focused tests include `playback-inputs`, `playback-proxy`, `playback-timeline`, `VideoPlayer`, `title-identity`, `watchlist-identity`, `navigation-redirects`, `personal-home`, `request-notifications`, `seerr-permissions`, `request-availability`, and `couch-navigation`. They use application code and fixture transports; native playback/casting behavior is simulated only at the component boundary. The older `app.watchlist.test.tsx` contains copied logic tests and should not be mistaken for real UI acceptance.

The signed-out page was inspected in the browser. No authenticated layout, audible output, receiver playback, deployed request transition, or performance acceptance is claimed. Keep the plan ledger open until the actual criteria pass.

### Latest local evaluation

Plex setup is now complete through the normal Waterfox UI at `http://localhost:9021`. The reachable local connection was selected. Home displays personal continue/next rows; Watch renders all 1,160 movies. No playback, watchlist, rating, or request state was changed. Seerr detection found no service on common addresses; the integration remains unconfigured.

Live inspection exposed an incorrect API assumption: `/library/all?guid=tmdb://584` returned no items although the library contained that exact secondary GUID. `PlexClient.findByGuid` now reads paginated provider GUID metadata and shares that scan across concurrent lookups on the same client. Both TMDB and IMDb lookups resolved to the same real item in a combined ~736 ms read-only check. This is one lookup timing, not a playback benchmark. The Home trending cache key was advanced to avoid retaining false unavailable labels.

Waterfox verified `/app/media/movie/tmdb-584` redirects to `/app/media/movie/29`, renders title actions, and browser Back returns to Movies. Full keyboard/remote, narrow-screen, shared-user, and playback acceptance remain open. A question is pending for permission to use “2 Fast 2 Furious” as progress-changing test media and for the casting receiver. Seerr credentials must be entered in Settings, not pasted into chat.

Latest checks: `just check` passed lint, types and 198 tests/32 files; `just build` passed; logs `/tmp/watchtower-live-check.log` and `/tmp/watchtower-live-build.log`. The identity regression failed before the fix (`/tmp/watchtower-guid-red.log`).
