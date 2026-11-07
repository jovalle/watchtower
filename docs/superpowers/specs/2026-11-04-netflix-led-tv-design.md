# Netflix-led Watchtower TV

## Direction and authorization

The user's latest direction supersedes the previous Plex reproduction: Watchtower should combine Plex and **mostly Netflix**, using the screenshots at https://netflix-inc-netflix.en.uptodown.com/android, with Watchtower colors and branding. This continues the already authorized full TV redesign in `work/android-tv`; it does not require another approval loop. Implementation choices below are the agent's calls within that direction.

The five linked images were inspected at their actual `data-src-large` URLs using the browser. Three are promotional images containing TV screens; the TV interfaces supply the reference. They show cinematic artwork fading into a dark text area, compact edge navigation, tightly spaced portrait shelves, a prominent Play action, understated metadata, title-focused details and a simple bottom player timeline. The reference spans several Netflix generations, so it sets the visual hierarchy rather than promising one current-app pixel specification.

## Approach

Use a Netflix-led presentation over the existing native client. Home, details, navigation, cards and visible playback controls carry Netflix's composition and restraint. Plex contributes library organization, filters, editions/versions, season/episode depth and advanced playback settings. Watchtower supplies identity, service destinations and actual content.

A screen-by-screen visual split would create an inconsistent app; a new streaming client/backend would duplicate working pairing and playback. Neither is needed. Keep Kotlin/Compose, Media3, Coil, the native API and current dependencies.

## Visual contract

- Retain Watchtower charcoal `#101113`, elevated neutral `#242527`, mango `#FDBE02`, readable off-white and white/black focused controls. Mango identifies the brand, primary viewing action, selection accents and progress. Preserve original media artwork colors.
- Use the actual full wordmark in the expanded drawer, pairing and spacious brand headers. Use the actual W for compact navigation/app icon. Keep licensed Inter and existing symbols.
- Replace the floating Plex navigation capsule/inset bordered drawer with a quiet full-height edge rail and dark expanded overlay. Keep a common 64dp content origin and no content movement when navigation opens. Collapsed rail width is56dp, expanded overlay width232dp. Expose Search, Home, the main library destinations and My Lists directly; keep Requests/Issues and every configured library reachable. Retain correct selected state, Back and focus restoration for missing/many libraries.
- Use small 3–4dp control/card corners and a consistent grid instead of round primary pills and circular action trays. Ordinary catalog viewing/action faces are 40dp with stable dimensions and an additional20dp focus-caption allowance; they do not grow when focus changes. Player symbol faces remain a purposeful compact 32dp. Choice/menu rows retain their existing readable 32/44dp roles. Secondary actions remain symbols with focus captions/accessibility names; primary Play/Resume retains its label.
- Home uses a dark left fade and bottom fade over full-bleed art, a compact logo/title/metadata/summary block, Play/Resume plus details access, and tighter portrait shelves. Standard discovery posters are 112×168dp with roughly 8dp horizontal gaps; Browse retains a useful dense grid and its existing query/pagination behavior. The first Home shelf begins around 304dp, with posters near 336dp, leaving the hero and first shelf readable together at 960×540dp.
- Home hero follows focused content. Play/Resume and details must act on that exact item, including after rapid focus changes. Direct playback is enabled only for local movie/episode keys. Show/season heroes open their local details/episodes; external titles open their real ExternalDetailsRoute through an optional coordinated callback. Never send a show/season/external key to PlayerRoute. No automatic preview streams or invented popularity/match/original-content labels.
- Movie/show detail pages emphasize title art, a bounded readable synopsis and clear primary viewing action against right-side artwork. Keep the compact secondary symbols, useful Plex depth, real cast/editions/versions/related items and the existing show/season/episode flows. Use flat action geometry and a simpler visual hierarchy throughout, without replacing real actions with decorative rows.
- Player presentation follows the reference's quiet metadata and bottom timeline. Use flat compact transport controls and Watchtower progress color. Advanced track, quality, speed, sleep, display and statistics menus remain real and reachable. Preserve visible errors, loading, accessible announcements, overlay focus containment and Back return.
- Apply compatible flat row/panel geometry to Search, settings, pairing/profile and Requests/Issues. Preserve their distinct pending/error/permission states and data.

## Functional boundaries

No changes to authentication/profile authorization, native API contracts, HLS buffer/retry/timeline/lifecycle logic, timer scheduling, stream selection semantics or Seerr writes are planned. No new dependencies. No commits, push, deploy, new worktree or changes to main's active layout audit or Watch Together. Preserve all existing uncommitted work; the pre-change native source and APK checkpoint is under ignored `tmp/netflix-reference/`.

Preserve this emulator's local 720p/4Mbps calibration, Normal speed, Letterbox and Sleep Off. Real QA can exercise playback progress, but must not mark titles watched or send real request/issue/rating mutations. Existing API gaps are not filled with fake Netflix destinations or content claims.

## Verification

Add focused behavioral regressions for hero Play/Details choosing the focused title, remote access to hero/shelves and compact direct navigation. Update existing geometry assertions to this visual contract; retain functional/race/error tests. Root alone builds and controls the emulator. Verify native unit/lint/APKs plus the complete instrumentation suite, then inspect rendered Home, both rails, libraries, movie/show/episode, Search, services/settings and the player at normal and selected 1.3× text paths. Verify real playback through the changed entry points and leave the emulator stopped on usable Home. Record actual differences and unverified hardware limits without claiming universal pixel parity.
