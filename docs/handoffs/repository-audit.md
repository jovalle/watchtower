# Repository audit for the Watch Together and Android TV handoffs

Inspected 2026-09-27. Baseline `8578769ae3273a5918910b769053d494c56c7ae6`. Source inspection, not runtime or hardware certification. No implementation changes made. No applicable `AGENTS.md` or existing `graphify-out/graph.json` found in this checkout. Paths below are repository-relative and refer to that commit; line references are entry points, not exhaustive ranges.

## Actual architecture and implications

- `package.json`: private Watchtower 1.8.0, Remix 2, React 18, TypeScript, Express 5, hls.js, LRU cache; no database, WebSocket, Android, or native mobile framework installed. Node >=22 required. `Dockerfile` builds using Bun and runs Node 24.
- `server.ts`: one Express application hosts static files and Remix on port 9001. It trusts the reverse proxy and logs paths rather than query strings. Single-process in-memory ownership is already an explicit limitation of playback.
- `app/lib/config/server-config.server.ts`: one configured Plex server, persisted under `DATA_PATH/config/server.json`, with server machine ID, owner token and admin identity. Setup is stored configuration, not PLEX_SERVER_URL environment fallback. Development defaults to `./data`, production `/data`.
- `app/lib/settings/storage.server.ts` and `types.ts`: settings are version-1 per-Plex-user JSON files, default-merged; not a relational database or independent Watchtower profile system. Existing preferences include intro skipping, next episode, feed visibility and discovery disabling.
- New persistent device-session or room storage must have explicit retention, atomic writes, concurrency semantics and recovery behavior. Do not silently assume SQL migrations, Redis, cross-process coherence, or durable live rooms exist.

## Authentication and authorization boundaries

- `app/lib/auth/session.server.ts:25`: Remix cookie session `__plex_session`, httpOnly, sameSite=lax, secure controlled by configuration, 30-day max age. Session contains plex.tv OAuth token, server-specific token, owner flag and machine ID. Cookie signing is not server-side secret storage; avoid claiming these Plex tokens are absent from the client cookie.
- `app/lib/auth/plex.server.ts`: Plex PIN/hosted OAuth login, plex.tv user lookup, resource discovery and configured-server access check. Stable installation client ID derives from session secret. Auth initiation/callback routes implement browser flow; not a documented native device authorization grant.
- `app/routes/app.tsx:36`: parent layout validates Plex identity and ensures configured-server access, refreshing stored server token when missing or machine ID changes. However, standalone `api.*` resource routes do not inherit this loader. `requireServerToken` only reads the cookie and redirects if absent. New APIs must perform their own principal + current-server checks and return JSON 401/403 rather than HTML redirects.
- `app/lib/auth/user.server.ts`: identity lookup caches Plex token→user for five minutes. A room member must use verified Plex identity, not name or supplied user ID.
- `PlexClient` constructed with the individual user's server token enforces library/item restrictions through upstream responses. Never use configured owner's token for member media authorization or playback. Invite acceptance conveys room membership only.
- Native device linking should yield revocable Watchtower credentials tied to Plex identity and configured server; do not expose owner token, pass token in invitation URL, share browser cookie signing secret, or invent Plex Home PIN semantics. Resolve managed users/profile switching as a separately verified identity requirement.
- Every new mutating cookie-authenticated room/device approval endpoint needs same-origin/CSRF protection; a sameSite=lax cookie alone is not an entire threat model. Limit room join/link-code attempts and payload sizes. Authenticate SSE before opening a stream and revalidate on membership revocation.

## Web playback flow: integration map

1. `app/routes/app.watch.$ratingKey.tsx:149` reads user server token, fetches authorized metadata with markers and settings, selects tracks/quality, computes resume and capability choices, obtains next episode, creates stream URL, and returns player props. Service extraction is useful here; duplicating this loader in a native API would create divergent playback behavior.
2. Browser capabilities originate in `app/lib/playback-caps.ts`, stored in `playback_caps` cookie. Lists cover selected browser containers/codecs; Dolby Vision profile 5 is rejected for browser direct play. This is not sufficient Android TV capability negotiation.
3. Loader's `isMobileDevice` matches `Android`; blindly calling it from Android TV causes browser/mobile transcode choices. Native route must receive validated device capabilities and bypass UA-based browser assumptions.
4. `app/lib/plex/client.server.ts:574` `getPlaybackInfo` generates a UUID session, registers ownership, builds HLS URL with Chrome profile, `copyts=1`, mediaIndex=0 and partIndex=0. Original quality is remux/direct-stream; it is not native direct-file playback. Native quality negotiation needs intentional profile/container/decoder decisions, not merely changing displayed method.
5. Loader separately returns direct-file proxy URL where browser capabilities permit; all Plex tokens are stripped from returned HLS query. Metadata exposes first media/part only. Multiple versions/parts are a genuine parity gap.
6. `app/routes/api.plex.hls.$ratingKey.$.ts:20` authenticates each resource, resolves session ownership, rejects traversal, overrides upstream Plex token/client ID, negotiates initial decision, rewrites playlists including URI attributes, handles Range and stream proxying. Child playlists, segments, subtitles and images must all receive native auth. Authenticating only initial manifest is insufficient.
7. `app/routes/api.plex.stream.$ratingKey.ts` direct-file proxy reads authorized metadata and forwards Range. Preserve partial-content and error behavior.
8. `app/components/player/VideoPlayer.tsx`: hls.js/native video, resume, retry/transcode fallback, quality changes and out-of-buffer seeks through route navigation; progress every 10 seconds, explicit transcode stop/ping, volume/captions/menus, keyboard/remote support, intro/credits and next episode. `key={streamUrl}` in parent remounts player on stream replacement.
9. `app/routes/api.plex.timeline.ts`: validates state/time/duration, ownership and optional sequence, serializes reports, suppresses stale generation/sequence, updates Plex and asynchronously Trakt, invalidates home cache on nonplaying state. Room state is not a replacement for per-user timeline reporting.
10. `app/routes/api.plex.streams.ts` persists the user's audio/subtitle stream choice per media part. Local track selection may trigger replacement playback. Preferences are user scoped; two devices on same account may compete.

### Critical Watch Together integration details

- Route all local playback intents through one room-aware boundary: buttons, remote/keyboard, native media events, timeline dragging, intro/credits actions, autoplay, episode picker, quality/fallback navigation. A visible pause button alone is not enough.
- Suppress feedback when remote state causes `video.play/pause/currentTime` events; distinguish intent from observation. Observe actual playing/stalled state for readiness and buffering.
- Keep room controller/connection above `VideoPlayer` remounts or persist room identity across replacement URLs. Quality/audio/subtitle changes must remain local and retain room membership; subsequent readiness resynchronizes to room time.
- Use media timeline milliseconds in protocol. Current player UI uses seconds, API timelines milliseconds, Plex offsets seconds. `copyts=1` helps existing HLS absolute timestamps but must be validated in Media3; explicitly map manifest/media time to canonical position, especially after transcode replacement. Never assume an HLS player position starts at the canonical media offset.
- Disable independent participant intro/autoplay decisions while in a room and replace with authoritative room transitions. Host skip/next must generate one serialized command; next media requires each participant authorization before ready.
- A room session ID is distinct from Plex playback UUID, SSE connection ID, native credential and member/device ID.
- `app/lib/plex/playback-session.server.ts`: session ownership hashed from server URL and token; latest/active generation keyed owner+ratingKey. Two players on the same account/title can supersede progress generations. Decide and test either a one-active-device-per-user room policy or add explicit per-device playback scopes with regression tests. Do not accidentally remove protection against a stale stream's stop update.
- Active playback registries are LRU, 5,000 sessions, six-hour sliding TTL; restart loses them. Room restart behavior must be explicit and fail closed; persistent room metadata does not make transcoder or event state durable.

## Existing SSE is only a transport example

`app/routes/api.vote.events.$showingId.ts`: unauthenticated showing reads, polling JSON storage every 1.5 seconds, data frames containing updatedAt, keepalive every 30 seconds. No IDs, history/replay, auth, membership, sequence, or command arbitration. Reuse basic Remix ReadableStream framing only. New rooms require immediate published authoritative snapshots/events, heartbeat/liveness, sequence/epoch checking, reconnect snapshot/resume semantics, bounded queue/backpressure and cleanup. Configure proxy buffering/timeouts deliberately. Single-process POST+SSE is a credible starting transport, not proof of cross-process support.

## Native API inventory: reuse vs required work

| Area | Existing source | Required adaptation |
|---|---|---|
| Home/continue/recent | `app/routes/app._index.tsx`, `app/lib/home.server.ts`, Plex client continue/recent methods | Extract authorized data service; stable JSON cards, pagination/error contract; no scraping Remix HTML |
| Libraries/sort/filter | `api.plex.libraries*.ts`, Plex client `getLibraryItems*` | JSON native auth; bounded pagination; preserve per-user library visibility |
| Metadata/episodes | `api.plex.metadata.$ratingKey.ts`, `api.plex.children.$ratingKey.ts`, `app.media.$type.$ratingKey.tsx`, `app/lib/title.server.ts` | Normalized movie/show/season/episode identity; explicit external vs local IDs; actions reflect availability |
| Search/discovery | `app.search.tsx`, `app/lib/search.ts`, TMDB services | JSON endpoint and search cancellation/debounce, honor discoveryDisabled |
| Watchlist/playlists | `app/lib/watchlist/service.server.ts`, `api.plex.list.ts`, `api.plex.playlist.ts` | Preserve dedupe/source identity, permissioned updates and user cache isolation |
| Playback creation | `app.watch.$ratingKey.tsx`, `PlexClient.getPlaybackInfo` | Shared service and versioned session response, explicit caps/stream units/tracks/expiry/error semantics |
| Progress/track changes | `api.plex.timeline.ts`, `api.plex.streams.ts`, `api.plex.scrobble.ts` | Bearer/device auth adapter, per-device IDs, sequence and lifecycle correctness |
| Media resources | HLS/direct/subtitle/image routes | Authenticate every nested fetch, refresh credentials safely, no cross-host Authorization leaks |
| Settings | `api.settings.ts`, per-user files | JSON native access, versioned compatibility, no arbitrary Plex Home profile claim |
| Requests/integrations | `api.seerr.ts`, `app/lib/integrations/seerr.server.ts`, `seerr-pages.server.ts` | Preserve permission checks and optional-service fallback; do not use admin Seerr capability as user authority |
| Watch Together | absent | Shared v1 room protocol, native client implementation after server contract is available |
| Device link/refresh/revoke | absent | Secure lifecycle, bounded pending code storage, browser approval, expiry, rotation/replay policy, device management |

Existing API names do not imply a stable public API. Standardize a versioned JSON contract and re-use backend services; define JSON error shape, auth, time units, stable IDs, nullable fields, pagination, capability negotiation, request IDs and API-version compatibility before native screens depend on it.

## Contract ownership and merge sequencing

Recommended one-writer ownership:

- Android TV worktree owns generic native/device authentication, versioned catalog/settings API and generic playback service extraction/capability expansion. Existing web behavior stays the regression baseline. It must export a principal-based service boundary usable by room routes without coupling rooms to Android screens.
- Watch Together worktree owns authoritative room engine/types/routes, web player room adapter/UI, invitation/membership rules, SSE stream and room contract fixtures.
- Native worktree consumes the frozen room contract and writes Kotlin room client; it does not independently implement server rooms.
- Reserve `app/lib/auth/session.server.ts`, `app/lib/plex/client.server.ts`, `app/lib/plex/playback-session.server.ts`, `app/routes/app.watch.$ratingKey.tsx`, all proxy routes, `VideoPlayer.tsx`, settings types, package/lockfile and CI as overlap hotspots. Record owner before editing, communicate interface needs instead of making both branches alter the same helper.
- Freeze contract fixtures early, then land/cherry-pick a small shared-foundation commit into the dependent branch. Do not concurrently create different v1 DTOs and resolve by guessing in final merge. After merging/rebasing, rerun the integration tests against the merged server/native versions.
- Avoid two apps sharing the same development `DATA_PATH` while mutable auth/config/settings tests run. Use isolated temp data and ports. Never commit server.json, session secret, Plex tokens or production snapshots.
- Room server can initially authenticate browser sessions; native bearer support must use the shared principal boundary when it lands. Mark native end-to-end room verification blocked until both are merged, not 'complete' against mocks.

## Required validation evidence

Repository already uses Vitest/Testing Library. Extend that stack, not a new test harness. Commands in `.github/workflows/ci.yml`: `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build`. `package.json` also allows npm run scripts after suitable dependency installation; preserve bun.lock as authoritative install artifact. CI also verifies Docker on main pushes.

Useful existing regression tests:

- `test/lib/playback-session.test.ts`: ownership/generation behavior.
- `test/routes/playback-timeline.test.ts`: sequencing/progress protections.
- `test/routes/playback-proxy.test.ts`: HLS rewriting/auth/range behavior.
- `test/routes/playback-inputs.test.ts`, `test/routes/plex-streams.test.ts`: boundary validation/track selection.
- `test/lib/playback-caps.test.ts`, `tracks.test.ts`, `markers.test.ts`.
- `test/components/VideoPlayer.test.tsx`, `VideoPlayer.tracks.test.tsx`, `playback-navigation.test.tsx`, `couch-navigation.test.tsx`.
- `test/routes/watch-libraries.test.ts`, `personal-home.test.ts`, `title-identity.test.ts`, `seerr-permissions.test.ts`.

Additional meaningful tests: room state-machine with fake clock and duplicate/out-of-order commands; authorization and revocation across every endpoint/SSE; independent streams/timeline credentials; restart/epoch mismatch; playlist resources with native authorization; source replacement and seek timeline normalization; buffering, reconnect, host departure and next-episode races. End-to-end browser+browser and browser+real-TV runs with two different authorized Plex accounts and a restricted account are mandatory evidence for shared watching; mocks cannot certify synchronization, codecs, HDMI capabilities or Plex entitlements.

Native toolchain/tests are absent and must be added by its branch, including reproducible Gradle wrapper, pinned compatible SDK/Kotlin/AGP/Media3/Compose versions verified at implementation time, unit tests for DTO/state logic, instrumentation tests for focus/lifecycle, signed-release procedure and real device codec/remote matrix. No tests were run in this documentation audit; this does not report repository checks as passing.
