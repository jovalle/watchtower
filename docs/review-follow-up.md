# Deployment security and performance follow-up

## Before exposing this release

The previous `/api/cache/*` route could read arbitrary files under `DATA_PATH` without a session. Block the route at the public proxy until the fixed release is deployed and verified. Investigate access logs and any intermediary caches without recording secret values. Assume any credentials stored in that directory may have been exposed; rotate the Plex server token and configured integration secrets as appropriate. If the session secret was stored there, rotate it after containment; doing so signs users out. Purge cached responses containing private data. Check backups and other deployments too.

Verify anonymously that cached logos still load and that config, settings, integration data, traversal paths and symlink targets return 404. Keep the data volume backed up and private.

## Performance and device acceptance

Use a representative library and record library size, device, network and cold/warm cache for every result. Measure home and library time to first content and data transfer; use browser Performance and Network tools to identify the slowest upstream requests. Measure LCP, INP and CLS on landing, home, library and search. Target the 75th percentile at LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1, while recognizing that local lab results are not field percentiles. For playback record time to first frame, failed starts and rebuffering separately.

Test keyboard and screen-reader use, sign-in cancellation, search during Plex and TMDB failures, resume and cross-device progress, audio and subtitle selection, autoplay cancellation, seeking, and failure recovery. Exercise desktop and mobile browsers plus the TV browsers and receivers actually supported by the household. Record browser/device versions and media formats; a visible casting control alone does not prove receiver playback.

Library pages return 48 items at a time and reuse a user-specific Plex index for up to 30 seconds. A cold or expired index still fetches every Plex page to preserve cross-library sorting, genre filtering, episode-count ordering, and alphabet navigation; upstream pagination remains to be implemented. Measure cold and warm library loads separately. Home enrichment loads after the core feed. Do not claim device support or performance targets have been met until the checks above are complete.
