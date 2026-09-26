# Streaming and playback evaluation

Evaluated September 25, 2026, against the local production build on port 9013,
Waterfox, and the configured Plex server. Existing uncommitted work was preserved.

## Outcome and root causes

The supplied episode URL resumed at 351 seconds. HLS playlists loaded, but the
first video segment returned HTTP 404 repeatedly. The video remained at
`readyState=0`, and the player kept retrying after its loading timeout.

Playback now renders visible video. A seek outside the buffer from approximately
6 minutes to 10:03 created a replacement stream and continued past 10:36 with
successful segment responses. This check used forced transcoding with the 720p
profile. The original URL was restored afterward.

Three related problems emerged during controlled checks:

1. **Missing session identity.** Alternating startup requests twice produced
   segment 404 without an explicit session and segment 200 with a fresh session.
2. **Missing negotiation and shared client identity.** New client identities
   initially returned 400 until the Plex media-decision endpoint was called before
   starting HLS. Two starts sharing one client identity invalidated the older
   session. Negotiated, distinct identities allowed stopping the old session while
   the replacement continued returning video data.
3. **Player replacement lifecycle.** Reusing the video element across stream
   changes still failed during the browser seek check. Remounting the player for
   each stream URL resolved the reproduced replacement failure.

These findings explain the tested failure; they do not establish that every Plex
404 has the same cause.

## Repairs implemented

- Generate a fresh session and per-session client identity for each HLS start.
  Negotiate the requested profile before retrieving the master playlist; reject
  failed decisions. Carry the matching identity through progress reporting.
- Classify original-quality HLS as HLS/direct stream, allowing unbuffered seeks to
  start a new stream. Only actual file playback uses native direct-play behavior.
- Give each stream its own player instance. Remove the old seek-time stopped
  beacon and explicitly stop the old session during cleanup.
- Ping active sessions every 30 seconds and stop them on replacement, page exit,
  or terminal error. Keepalive cancellation and duplicate exit cleanup are tested.
- End fatal network failures after HLS.js exhausts retries. Bound media recovery to
  one attempt, then offer fallback/error handling. Destroy HLS on loading timeout.
- Use the episode's metadata duration for controls, seek bounds, progress, and
  watched thresholds. Plex's negotiated playlist exposed a padded two-hour duration
  for this 26:34 episode. Enable seeking when playback actually starts.
- Remove unused Plex credentials from watch-page data and the startup URL. The HLS
  proxy always authenticates upstream using the signed-in user's token, ignoring
  a query-supplied token. Mark authenticated caches private and playlists no-store;
  propagate cancellation for HLS requests.
- Reject null timeline bodies, malformed session IDs, and nonfinite timing values.

Primary implementation files: `app/lib/plex/client.server.ts`,
`app/routes/app.watch.$ratingKey.tsx`, `app/components/player/VideoPlayer.tsx`,
`app/routes/api.plex.hls.$ratingKey.$.ts`, and `app/routes/api.plex.timeline.ts`.

## Operations exercised

| Operation | Evidence and limits |
| --- | --- |
| Startup and resume | Reported 5:51 position started and advanced after session repair. Final negotiated playback displayed actual moving picture. |
| Pause/resume | Controls changed to Play while paused and Pause after resuming; playback advanced again. |
| Buffered seek | Skip-forward moved a paused position from 6:25 to 6:35 and playback resumed. |
| Unbuffered seek | Final player remount started at 10:03 and advanced past 10:36 with visible picture and segment HTTP 200 responses. |
| Forced transcode | 720p request played through startup and replacement. Before negotiation repair, the same request delivered 1080p; final delivered resolution was not independently remeasured. |
| Direct-file ranges | `Range: bytes=0-1023` returned 206, matching Content-Range, and exactly 1,024 bytes. Native decoding of this MKV was not established. |
| Progress | Timeline POSTs returned 200; the activity UI showed advancing position. |
| Session lifecycle | Live diagnostic ping/stop returned 200. Stopping one negotiated identity left the other stream readable. This is transport isolation evidence, not a full multi-user browser test. |
| Duration | Controls now show the episode's 26:34 instead of the padded HLS duration. |

Waterfox blocked audible autoplay and the existing muted-autoplay fallback ran.
Audible output was not independently verified.

## Remaining findings

1. **Track selection now has an implementation.** The parallel flixor-parity work
   added Plex stream selection, sidecar text subtitles, and burned image subtitles
   in commit `8544e95`. This supersedes the earlier cosmetic-controls finding.
   A live negotiation with `subtitles=none` returned decision code 1001 and an HLS
   playlist (both HTTP 200); the diagnostic session was explicitly stopped.
   Subtitle rendering was visible in Waterfox, but audio switching, sidecar versus
   burned rendering, and non-UTF-8 SRT remain unverified end to end.
2. **Watched reporting can silently fail.** `markWatched` does not check the HTTP
   response status; an HTTP failure leaves its local completion guard set. Check
   success and permit retry. The new per-stream remount resets the guard between
   streams, addressing the previous cross-episode state reuse. Source:
   `VideoPlayer.tsx`; code review, no deliberate watched-state mutations.
3. **Explicit zero resume is ignored.** The watch loader requires the query offset
   to be greater than zero, so `t=0` falls back to saved progress. Distinguish absent
   input from an explicit zero. Source: watch loader; code review.
4. **Malformed inputs have remaining gaps.** Invalid percent encoding in the
   capability cookie can throw from `decodeURIComponent`; the scrobble action
   destructures JSON without rejecting `null`. Source: `playback-caps.ts` and
   `api.plex.scrobble.ts`; code review.
5. **Less common proxy cases remain unsupported.** HLS byte-range requests do not
   forward Range/Content-Range, and relative playlist URLs do not account for an
   upstream redirect's final URL. Explicit upstream startup deadlines and direct
   file cancellation also need attention. The tested stream uses ordinary TS
   segments, so these did not cause the reported failure. Code review only.
6. **Quality labels describe the request.** The UI does not verify delivered
   dimensions before displaying the chosen profile. Negotiation is now explicit,
   but output/profile agreement needs a separate measurement across media types.

## Validation and limits

Production build, TypeScript checking, and scoped ESLint passed. The full test
suite passed: 16 files, 97 tests. Playback regressions live in
`test/lib/playback-session.test.ts`, `test/components/VideoPlayer.test.tsx`,
`test/routes/playback-proxy.test.ts`, and `test/routes/playback-timeline.test.ts`.
They cover distinct identities, HLS classification, bounded failures, cleanup,
keepalive, seek behavior, metadata duration, negotiation/authentication, and
progress validation. Several checks were observed failing with the old behavior
before applying their repair. Existing test dependencies were reused.

The evaluation covered the loader, URL builder, player, capability/preference
helpers, HLS/direct-file proxies, timeline/scrobble routes, and relevant Plex
models. It is not a whole-repository security audit. Safari/native HLS, mobile
fullscreen, audible output, long paused sessions, completed-episode auto-advance,
external subtitles, redirected/byte-range manifests, and independent simultaneous
users remain unverified.

## Follow-up: loading and navigation

The translucent loading overlay allowed the browser's own video buffering UI to
show through beneath Watchtower's spinner. Loading now uses an opaque background
and one named loading status. Its centered decoration no longer intercepts clicks
on Back. Waterfox showed a single spinner on reload, and scrubbing forward resumed
visible playback.

Back now targets the most recent non-player page visited within the app layout,
including its filters, and defaults to `/app` for a directly opened/reloaded player.
It never traverses timestamp history. All three player Back controls share this
behavior. Verified in Waterfox after a forward seek: Back reached Home. Router
regressions cover a search page followed by playback and timestamp changes, plus a
direct player entry. Build, typecheck, scoped lint, and 125 tests in 20 files pass.

Handoff review: the optional `/setup?step=services` path and its redirect survived
in the working tree. No history was rewritten or pushed. The proposed repair of
commit `6efaf6c` remains pending explicit history-rewrite confirmation and clean
ownership of the mixed working tree. Shared-user promoted collections require a
shared-user session for live verification; no owner result is presented as proof
of shared-user access. SRT decoding currently assumes UTF-8.
