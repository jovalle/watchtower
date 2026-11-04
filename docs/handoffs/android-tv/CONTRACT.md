# Native client API v1 contract (Android TV track)

Status: **frozen for implementation on `codex/android-tv`, 2026-09-27**, base `8578769`. Types: [`app/lib/native/contract.ts`](../../../app/lib/native/contract.ts). Golden fixtures: [`contracts/native/v1/`](../../../contracts/native/v1/). The [shared contract](../shared-contract.md) governs identity and media/time; this file specifies the native facade the TV track owns. Changing a field requires updating the TypeScript types, fixtures, Kotlin DTOs and both test suites in one change.

## Conventions

- Base path `/api/v1`. JSON request bodies require `Content-Type: application/json` and are limited to 16 KiB (`payload_too_large`, 413). Unknown JSON fields are ignored by clients and rejected by nothing; missing required fields are `invalid_request`.
- Integer milliseconds with `Ms` suffix for every time, position and duration. Plex offsets (seconds) are converted at exactly one upstream boundary. IDs (`ratingKey`, `mediaId`, `partId`, `streamId`, `sectionId`, `playlistId`) are server-scoped strings.
- Every response: `Cache-Control: private, no-store`, `X-Request-Id`. Success bodies are plain JSON objects; `204` has no body.
- Error envelope, always JSON, never an HTML redirect: `{"error":{"code","message","retryable","requestId"}}`. `Retry-After` (seconds) accompanies `429` and retryable `503`. Codes are listed in `ErrorCode`.
- Status mapping: 400 invalid input/cursor, 401 authentication (`unauthenticated`, `session_expired`, `session_revoked`, `server_changed`, `upstream_auth_failed`), 403 authorization (`forbidden`, `pin_required`, `invalid_pin`, `requests_not_linked`), 404 missing or inaccessible, 405, 409 `identity_version_mismatch`/`conflict`/`playback_session_expired`, 413, 415, 422 `unsupported_media`, 429 `rate_limited`/`slow_down`, 501 `feature_unavailable`, 502/503 `upstream_unavailable`/`not_configured`.
- Pagination: `?limit=` (1–100, default 50) and opaque `?cursor=`. A cursor is valid only for the same path and query; otherwise `invalid_cursor`. Responses are `Page<T>`; `nextCursor: null` ends the list. A Plex page that fails to advance is an error, not an empty page.
- Clients send `X-Watchtower-Client: android-tv/<versionName> (<versionCode>)`. Servers never branch security on it.

## Authentication and identity

- Credential: opaque device session token `wtd_<43 base64url chars>` (256 bits) in `Authorization: Bearer`. Never in URLs, query strings, QR codes, logs or JSON other than the pairing grant.
- Every authenticated request except `GET /me`, `DELETE /session` and `DELETE /devices/:id` must send `X-Watchtower-Identity-Version: <n>`. Missing or stale values return `409 identity_version_mismatch` before any content access or side effect. Mutations recheck the session and version immediately before the upstream write.
- A request carrying both a bearer token and a Watchtower web session cookie is rejected (`400 ambiguous_credentials`). Bearer routes never fall back to cookies.
- Server-side session record: token SHA-256 (lookup), device name/platform/model/app version, account identity, effective profile identity, `identityVersion`, configured server machine ID, created/expires/last-seen/revoked timestamps and last upstream verification time. Absolute expiry 30 days; no refresh token. Expired, revoked or server-mismatched sessions return 401 and are never reinterpreted.
- Upstream Plex tokens are sealed with AES-256-GCM under a key derived as `HMAC-SHA256(deviceKey, token)`; `deviceKey` is 32 random bytes in `DATA_PATH/config/device-key` (0600) and is neither the token hash nor delivered to clients. A stolen `DATA_PATH` without device tokens cannot unseal credentials; losing `device-key` invalidates every device (re-pair). Session storage is `DATA_PATH/devices/sessions.json` (0600, atomic replace, single-process writer).
- Upstream access is re-verified with the profile's plex.tv token when older than 15 minutes and immediately after a Plex 401. Lost access revokes the session (`upstream_auth_failed`). If plex.tv is unreachable the prior verification remains valid for at most 24 hours, then requests fail with retryable `503 upstream_unavailable`.
- Never use the configured owner token (`env.PLEX_TOKEN`) for a native request. Plex authorization is the effective profile's server token.

## Pairing (browser-approved device linking)

Inspired by RFC 8628; Plex does not provide this grant.

1. `POST /device-authorizations` `{deviceName, platform:"android-tv", model, appVersion}` → `201 DeviceAuthorizationResponse`. `userCode` is 8 characters from `BCDFGHJKLMNPQRSTVWXZ23456789` shown as `XXXX-XXXX`; `pollingSecret` is `wtp_` + 256 random bits; 10-minute expiry, 5-second minimum interval. Only hashes of the polling secret are stored. At most 200 pending authorizations and 10 creations per client address per 10 minutes. Pairing limits use the socket peer unless `TRUST_PROXY` explicitly lists trusted proxies using Express trust-proxy syntax. Pending state is in memory: a restart expires it and polls return `404 authorization_not_found`.
2. The QR code encodes `verificationUriComplete` (`<origin>/link?code=XXXXXXXX`), never the polling secret. `/link` redirects to `/app/link`, where the normal Plex login and configured-server access check apply. Code lookup, approval and denial are POST-only, require a same-origin `Origin` (or `Sec-Fetch-Site: same-origin`) plus an HMAC CSRF token bound to the browser session, and return one non-enumerating message for unknown, expired or used codes. Lookups: 10 per user and 30 per client address per 10 minutes. The confirmation shows device name, platform, model, app version, request age and instance origin. Approval re-runs `verifyServerAccess` with the browser's Plex token.
3. `POST /device-authorizations/poll` `{pollingSecret}` → `pending` (with `intervalMs`, `expiresInMs`), `denied`, `expired` or `approved` with a `DeviceSessionGrant` and `MeResponse`. Polling faster than the interval returns `429 slow_down` with `Retry-After`. The first approved poll atomically creates exactly one device session. Identical retries within 60 seconds return the same grant (lost-response recovery); after that the secret returns `404 authorization_not_found`. The human code never retrieves the grant.
4. Linked devices are listed and revocable both from the TV (`GET /devices`, `DELETE /devices/:id`, `DELETE /session`) and from the browser `/app/link` page, so a lost TV can be revoked without it.

## Profiles (Plex Home)

`GET /profiles` and `POST /profiles/switch` `{profileId, pin, expectedIdentityVersion}` → `MeResponse`. The upstream Plex Home list/switch endpoints are **unverified**: disabled unless the operator sets `WATCHTOWER_PLEX_HOME_PROFILES=1` after recording sanitized authorized responses (`scripts/spike-plex-home.ts`). Disabled returns `501 feature_unavailable` and `features.profiles=false`. Switching validates the profile against the account's upstream Home list, submits the PIN upstream (never checked locally), re-verifies server access with the new profile token, then atomically replaces the effective profile and increments `identityVersion`. Wrong PIN: `403 invalid_pin`; 5 failures per device and profile per 15 minutes: `429`. No owner-token fallback on any failure.

## Endpoints

All require bearer auth unless marked public.

| Method and path | Result |
| --- | --- |
| `GET /instance` (public) | `InstanceResponse`; no libraries, users, tokens or internal URLs |
| `POST /device-authorizations` (public) | `DeviceAuthorizationResponse` |
| `POST /device-authorizations/poll` (public) | `PollDeviceAuthorizationResponse` |
| `GET /me` | `MeResponse` |
| `GET /devices` / `DELETE /devices/:deviceSessionId` / `DELETE /session` | `{items: DeviceSummary[]}` / 204 / 204; only the same account's devices |
| `GET /profiles` / `POST /profiles/switch` | `ProfilesResponse` / `MeResponse` |
| `GET /home` | `HomeResponse`; honors `showContinueWatching`, `showRecentlyAdded`, `showCollections`, `showTrending` and `discoveryDisabled` |
| `GET /libraries` | `{items: LibrarySection[]}` (movie and show sections the profile can read) |
| `GET /libraries/:sectionId/items?sort&filter&genre&limit&cursor` | `Page<MediaSummary>`; `sort` ∈ `LibrarySort` (default `titleSort:asc`), `filter` ∈ `LibraryFilter` |
| `GET /libraries/:sectionId/filters` | `LibraryFiltersResponse` |
| `GET /libraries/:sectionId/collections` | `{items: CollectionSummary[]}` |
| `GET /collections/:collectionId/items?limit&cursor` | `Page<MediaSummary>` |
| `GET /media/:ratingKey` | `MediaDetail` (versions, tracks, markers, editions) |
| `GET /media/:ratingKey/children?limit&cursor` | `Page<MediaSummary>` seasons or episodes in Plex order (`seasonNumber` 0 = specials) |
| `GET /media/:ratingKey/adjacent` | `AdjacentResponse` across season boundaries |
| `PUT` / `DELETE /media/:ratingKey/watched` | 204 after Plex confirms |
| `PUT /media/:ratingKey/rating` `{rating: 0..10 \| null}` | 204 after Plex confirms |
| `GET /search?q&limit` | `SearchResponse`; `external` empty when discovery is disabled or unconfigured |
| `GET /watchlist?source=all\|plex\|trakt\|imdb` | `WatchlistResponse` (existing unified service and dedupe) |
| `PUT` / `DELETE /watchlist` `WatchlistMutationRequest` | 204; Plex watchlist only |
| `GET /playlists` / `GET /playlists/:id/items` | `{items: PlaylistSummary[]}` / `Page<PlaylistItem>` |
| `POST /playlists/:id/items` `{ratingKey}` / `DELETE /playlists/:id/items/:playlistItemId` | 204; smart playlists `409 conflict` |
| `GET` / `PATCH /preferences` | `Preferences` (existing per-user settings; booleans only) |
| `GET /requests/availability?type&tmdbId` / `POST /requests` / `POST /issues` | `RequestAvailability` / `201 RequestAvailability` / 201; Seerr permissions of the matching Seerr user |
| `POST /playback` `PlaybackRequest` | `201 PlaybackDescriptor` |
| `POST /playback/:id/timeline` `TimelineRequest` | `TimelineResponse` |
| `POST /playback/:id/heartbeat` | 204; pings the Plex transcoder for HLS |
| `POST /playback/:id/stop` `StopPlaybackRequest` | 204; idempotent |
| `GET /playback/:id/file/:partId` | Range proxy of that session's part (206/416 preserved) |
| `GET /playback/:id/hls/*` | HLS master, variant, init, key and segment proxy; playlist URIs rewritten root-relative |
| `GET /playback/:id/subtitles/:streamId` | WebVTT for that session's external text subtitle |
| `GET /images?src&w&h` | Image proxy; Plex paths with the profile token, cached per user; allowlisted public HTTPS hosts without credentials |

## Playback rules

- The server fetches metadata with the effective token and validates `mediaId`, every part and every track against it. Unknown IDs: `404 not_found`. Multipart items return all parts with cumulative `startMs`; file delivery gives every part a URL (client plays them in order), HLS gives only the active part a URL and requires a `part_change` request to continue. Resume inside part *k* starts that part at `startPositionMs - parts[k].startMs`.
- Decision order: direct file when container, codecs, profile/bit depth/HDR type, dimensions, frame rate and bitrate fit the declared capabilities and the selected subtitle is renderable client-side; else HLS remux (`direct_stream`, video copy) when the video fits; else HLS transcode. Image or styled subtitles the client cannot render force burn-in. Direct files leave track switching to the client and never write Plex stream selections. HLS delivery persists the requested audio/subtitle selection on the Plex part first (account-wide side effect, as in the web player).
- Plex requests use `X-Plex-Product=Watchtower`, `X-Plex-Platform=Android`, device name from the pairing request, a per-session client identifier and an `X-Plex-Client-Profile-Extra` built from the capabilities. Never the Chrome profile or the web `/Android/` mobile heuristic. The Plex decision endpoint runs during `POST /playback`; its video/audio/subtitle decisions populate `delivery.plexDecision` and `method`. Unverified against a live server until TVT-05 runs.
- `copyts=1` is kept, but Media3 timelines are not assumed: HLS descriptors report `timeline.mapping: "unknown"` with `requestedOffsetMs` until a live measurement proves otherwise. The client resolves the mapping from the prepared window duration (see `TimelineMapper`) and reports absolute positions only.
- Playback sessions are owned by effective user + server + device session + identity version. Another device, even on the same Plex account, cannot use, heartbeat, report or stop them. Replacement generations are scoped per device and rating key, so a second device's stream never supersedes or stops the first. A replacement request stops the prior session of the same device after the new one is registered; stale timeline reports from it are ignored.
- Timeline states are `playing`, `paused`, `stopped` with a per-session increasing `sequence`; stale or equal sequences return `accepted:false`. Existing Plex and Trakt behavior is reused. Seeking to the end never scrobbles by itself.

## Reserved Capability

`features.rooms` remains in `/instance` and `/me` as a reserved compatibility field set to `false`. This branch has no room routes, room client, invitation deep links, or room navigation. The historical combined implementation is retained on `codex/watch-together`.

## Compatibility and rollback

Additive fields are allowed within v1; clients ignore unknown fields. Removing or retyping a field, or changing error semantics, requires `/api/v2`. `/instance.compatibility.minClientVersionCode` lets a server require a TV upgrade; old clients show the provided message. Rolling the server back below this feature leaves `/api/v1/*` absent (404 HTML): the TV app reports that the server does not support it and keeps its credential until the user signs out. `DATA_PATH/devices` and `config/device-key` are only read by this feature; deleting them revokes every TV.
