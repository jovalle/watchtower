# Native TV Structure with Watchtower Styling

## Intent

Make Watchtower feel complete as a native Android TV app: replace the current text-pill action bars with recognizable symbol controls, expose Requests and Issues, and use Plex's depth of navigation and media presentation while keeping Watchtower's identity. The target remains the Google TV/Android TV app and remote interaction.

This is a proposed design for approval. The existing Kotlin/Compose for TV client, Media3 playback, native API, and Seerr integration remain the implementation foundation. Existing emulator fixes and all layout/focus safeguards must be preserved.

## Approach

Use Plex's native TV information architecture as the reference, then implement it with Watchtower's styling and services. A controls-only pass cannot provide the requested navigational depth; a separate client or navigation framework adds work without improving the experience. The existing app already has the required catalog, playback, and request/report foundations.

Primary reference: Plex's August 17, 2026 TV navigation update: https://forums.plex.tv/t/navigation-updates-coming-to-preview-users/941751 . It describes collapsible left navigation, favorite libraries as top-level sources, and navigation within a source without returning through the whole menu. This proposal adopts those structural ideas; Plex-only services and branding are outside scope.

## Symbol Controls

- Use one consistent outlined icon family, matching the existing Watchtower web icon vocabulary. Ship local Android vector assets; do not use letters, emoji, or Unicode approximations as icons.
- Player actions become symbols: start over, previous/next, rewind/forward ten seconds, play/pause, audio, subtitles, quality, and more/diagnostics. Keep the timeline, timestamps, and media titles readable. Put infrequent tools in a focused overflow panel.
- Detail and catalog action toolbars use symbols for play/resume, watchlist, watched, playlist, request, issue reporting, sort, and filters. Selections and media titles remain legible content.
- Every symbol retains an accessible action name. Show a short action label on focus so a remote user can identify unfamiliar controls. Do not reduce the focus target to the glyph size.
- Use Watchtower's mango highlight, dark foreground for the focused primary action, restrained dark secondary actions, and clear selected/disabled/pending states. Replace the current oversized generic pills with consistent compact TV controls.

## Navigation and Browsing

- A compact icon rail expands to icon-and-title navigation when focused. Destinations include Home, Search, configured movie/show libraries, My Lists, Requests, Issues, and Settings. Playback owns the full viewport.
- Preserve library identity, current selection, scroll position, and focused item through details and Back. Do not mark every library selected because they share a route type.
- Library sources expose Library and Collections sections using the current API. Home supplies recommendations; do not add a source-level Recommended tab without source-specific data. Keep sorting and filtering in a compact toolbar. Poster grids should make effective use of a 1080p TV screen rather than showing only a few oversized cards.
- Home leads with a readable featured title, concise metadata, and symbol actions, followed by organized Continue Watching, next-episode, recent, and recommendation rails. Initial focus should reveal the hero; returning from details restores the previous card.

## Media Depth

- Movie details: backdrop-led header, title and useful metadata, concise overview, icon actions, versions/editions when available, cast and related content where the existing API supplies them.
- TV hierarchy: show to season to episode, with a visible season selection and episode context. Episode details and playback retain show title, season/episode information, and appropriate previous/next actions.
- Keep common actions close to the title. Put uncommon actions behind More rather than stretching a long row across the screen.
- Do not add dead-end tabs or rows without data. Existing API capabilities determine which sections are offered.

## Requests and Issues

Current state: Android supports requesting an external title and reporting an issue from details. It has no request inbox or issue list route. Its real-data test sidecar also lacks the saved Seerr integration, so those detail actions were disabled.

- Add first-class Requests and Issues destinations, with accessible icons and useful counts/status where supplied by the service.
- Requests: show the user's request history and state, allow useful pending/available filtering, and link to a title's details. Preserve the existing request action for missing titles.
- Issues: show accessible open/resolved reports and their details, and retain Report Issue on applicable titles. Submission uses the existing report flow.
- Extend the native API with authenticated read endpoints and typed Android models as needed, reusing the web app's Seerr services and visibility rules. Maintain per-profile permissions; do not substitute the Plex server owner token for a user's identity.
- When Seerr is absent or the account is not linked, explain the state and recovery instead of silently hiding the entire area.
- Restore the saved Seerr configuration to the isolated real-data sidecar without changing main's server or configuration. Real request creation, report submission, or status changes are not acceptance-test operations; exercise those mutations only against fixtures.

## Scope and Verification

Keep the existing Watchtower dark palette, mango accent, branding, title casing, native pairing, protected media delivery, solo-player lifecycle, and menu/countdown focus restoration. Watch Together remains on its separate branch.

Verify on the running Google TV API 36 emulator with actual rendered screens: compact/expanded rail, Home, movie library, show/season/episode path, movie and episode details, Requests, Issues, player controls and overflow. Test remote traversal, focus labels, Back restoration, long titles, empty/error/disabled states, and controls hiding. Run relevant native JVM/instrumentation checks plus native API/web tests, lint, typecheck, and builds. Repeat real-library browsing and a short playback check on the isolated sidecar; use fixtures for Seerr writes.

Physical TV hardware, HDMI passthrough, HDR hardware behavior, downloads, new Plex-only features, and a mobile-app redesign are outside this pass.

## Builder Calls

The builder review found no remaining user decisions. Implementation should reuse Seerr's existing user-scoped list/detail methods and pagination. Request cancellation, issue comments, and issue-status management remain outside this pass. Content titles and selectable option values retain text; action controls and compact navigation use symbols with focused action labels.

The isolated sidecar's Seerr configuration has been restored and read-only request/issue service access verified. No real requests, reports, comments, or status changes were submitted.
