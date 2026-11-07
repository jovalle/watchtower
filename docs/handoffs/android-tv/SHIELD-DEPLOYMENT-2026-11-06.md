# NVIDIA Shield Deployment — November 6, 2026

Status: deployed and paired. Final bounded-stream transport, hardware playback, browsing and lifecycle checks passed within the limits below. Watchtower is left on Home with playback stopped.

## Installed Target

- Device: NVIDIA SHIELD Android TV (`mdarcy`), `192.168.1.23:5555`, Android 11 / API 30, ARM64 with ARM32 support.
- Launcher: Projectivy (`com.spocky.projengmenu/.ui.home.MainActivity`). Default launcher/settings were preserved; Watchtower appeared in TV Apps and launched through D-pad selection.
- App: owner-signed `io.github.jovalle.watchtower.tv`, version **0.2.1**, versionCode **3**. No debug package was installed on the Shield.
- Origin: **https://watchtower.techn.is**. The release retains HTTPS-only transport and system certificate validation.
- Pairing: approved by the user through the normal Watchtower/Plex flow. Real-library browsing survived the signed update and backend replacements without re-pairing.

## Backend and Data Preservation

The old deployed 1.8.1 image lacked `/api/v1`; the upstream container and public origin both returned HTML 404. A private candidate now supplies the matching native API, browser `/link` approval flow, protected images and playback. Public instance compatibility, protected JSON 401 responses and normal sign-in redirects were checked.

The deployment snapshot starts from committed main `e766b544f6dbff36738bdf4652782440fb1dee54` and overlays the Android branch's native API/shared backend dependencies. The new `/app/link` page uses main's existing Button and a page heading. Other frontend audit changes were not shipped as part of this deployment. No merge, push, registry publication or release automation was triggered.

Final image: **`watchtower:shield-20261106-a8a4663de005`**, immutable ID **`sha256:d60da273de44005cf549bca413f51188b0da6a4f35e25dda4bcf25986720fd25`**. The image and source checksums are in `tmp/shield-deploy-2026-11-06/backend-candidate.json` and `backend-runtime-sha256.json`. The Technis service definition at `/Users/jay/Projects/technis/docker/services/watchtower/compose.yaml` pins that image with `pull_policy: never` and retains the existing `/mnt/data/watchtower:/data` mount and security/resource limits.

Each replacement stopped the sole writer before taking an **age-encrypted whole-volume backup**, verified recovery in memory, and checked every pre-existing file's content hash after startup. No decrypted backup was written to disk. Backups reside on nexus under `/mnt/data/backups/watchtower-tv/20261106/`; receipt files identify the matching backup and previous image. No volume was deleted, saved Plex configuration replaced, session/device key rotated, or app data cleared.

Recovery uses captured container IDs rather than names and handles a partially created candidate that fails to start. A fake-engine regression reproduces that case. An initial acceptance failure also exercised real recovery and verified the previous container as the sole running data writer. Verified old containers are removed without their volumes after cutover; tagged images and encrypted data backups are retained. This avoids duplicate Compose service identities.

Playback tests use the already-watched movie Obsession and naturally update its Plex progress/history. No real requests, issues, ratings, lists or watched-state mutations were submitted solely for testing.

The active main layout-audit snapshot contained 57 modified/untracked files; all matched their starting hashes at the recorded check. Android WIP and the separate Watch Together work remain in place.

## Fixes Required for Deployment

- Pairing storage now fails closed on malformed, unreadable or incompatible session files instead of initializing an empty store and overwriting existing sessions.
- Concurrent first key initialization shares one promise, preserving the ability to decrypt credentials after restart.
- Chunked native JSON bodies stop reading and cancel once they exceed 16 KiB.
- Countdown controls consume hardware Back once in their focused subtree on older TV Android versions. The overlay closes and restores its opener without also exiting the player.
- The installed Remix 2.17.2 response writer ignored downstream backpressure and did not cancel its source. Kernel logs confirmed two pre-acceptance 1 GiB memory kills during direct streaming. Node’s standard stream pipeline now bounds buffering and cancels upstream on disconnect; the existing Remix request adapter and peer/proxy context are retained. Cookie/status, slow-client and disconnect regressions cover this change.
- Direct-file requests obtain a per-part Plex decision and use matching client/session identities. Plex's documented part-level direct-play decision is recognized even when a legacy general decision code is absent. This removes the observed denied ad-hoc session/503 startup path without changing Plex permissions or using download mode. See the [Plex media-part and decision API](https://developer.plex.tv/pms/).

## Signing and Runtime Secrets

The user approved creating a dedicated RSA3072 signing identity. Its encrypted PKCS12 and passwords were stored and read-back verified in **Technis → Watchtower**, project `1c2b6cea-09af-462b-8355-91222596c699`, **Production (`prod`), `/android-tv`**:

- `WATCHTOWER_TV_KEYSTORE_BASE64` — encrypted PKCS12 encoded for storage.
- `WATCHTOWER_TV_KEYSTORE_PASSWORD`
- `WATCHTOWER_TV_KEY_ALIAS`
- `WATCHTOWER_TV_KEY_PASSWORD`

Certificate SHA-256: `23fbc60de55dd8acfe8423a2c163282ef80f7fcd51ebd02a11c52fac75082c4d`.

Keep this signing identity for updates. Fetch only these required values into the build process, materialize only the encrypted keystore in protected temporary storage, and pass passwords through environment variables. Choose a versionCode greater than **3** for the next distributed build. Do not uninstall to solve signing/version failures. Play distribution remains a separate signing/channel decision.

Provider keys remain sourced from the existing Watchtower **Development (`dev`), `/`** secrets `TMDB_API_KEY` and `OMDB_API_KEY`. On nexus, `/var/lib/watchtower-tv/provider-credentials.cred` is encrypted with systemd's host-bound credential mechanism. `watchtower-provider-credentials.service` provisions a UID1001-only RAM directory at `/run/watchtower-tv-credentials`; the container mounts it read-only. A fixed preload copies only the two provider values into the application process environment. They are absent from saved Docker `Config.Env`.

The service uses a locked, non-login `watchtower-tv` identity with the app's existing UID/GID1001; numeric data ownership was preserved. The encrypted-credentials service is enabled before Docker at boot. Container restart and non-root runtime access were tested; a whole-host reboot was not performed. On a replacement host, provision encrypted credentials again from Infisical rather than copying plaintext or assuming the old host-bound ciphertext will decrypt.

## Validation

The 30-minute HLS soak and original five-per-path cycles used the prior transport image. The final Node-pipeline image is qualified separately below, so those receipts are not represented as a second 30-minute run.

- Deployed snapshot: **528 backend tests** across 71 files, TypeScript, lint and production build passed.
- Final transport image: sustained direct playback advanced for 3 minutes with file 206 and no HLS fallback, then pause/resume/stop passed. Six samples stayed 165.8–171 MiB under the unchanged 1 GiB cap, with **zero restarts**. Two additional HLS start→quality conversion→play→pause/resume→stop cycles passed on this final image, also with zero restarts.
- Android: **165 JVM tests**, debug/release lint (zero errors), signed/minified build, signature/ABI verification and final 16 KiB zip/ELF alignment checks passed.
- Dedicated API31 emulator: **216/216 instrumentation tests passed** after the countdown fix. Its disposable overlays preserve the saved AVD; the audit emulator was not used.
- Exact final backend image: isolated network-none synthetic pairing, protected catalog, file/HLS transport, multipart resume, subtitles and mutation smoke passed.
- Physical Shield: normal pairing, Projectivy launch, real Home/Movie shelves, detail artwork, numeric provider badges and per-version media facts observed. Direct requests returned **206** and decoded video advanced after the protocol fix. The user confirmed both picture and sound work on the TV/receiver.
- Original repeated physical direct starts/stops/resumes: **5/5 passed**, each with file HTTP206, advancing play/pause/resume positions, no HLS fallback and a clean return to details. The sub-minute fresh-start bookmark caveat is recorded below.
- Original repeated physical HLS starts/stops/resumes: **5/5 passed**, forced 720p HLS HTTP200. Quality conversion preserved absolute position. Fresh runs played 75 seconds; following resume baselines matched each saved position plus 4 seconds of new playback. Every pause/resume advanced and every stop returned to details. One original start also used automatic HLS fallback before the manual quality change; a late segment for that replaced session returned404 five milliseconds after its successful stop204. The new session continued normally with no visible error; this is a canceled-session request rather than a failed active stream.
- Long playback on the preceding transport image: **30 minutes passed** on forced HLS, 31 minute samples in playing state and five screen checkpoints matching real elapsed time. Position advanced from 2:08 to 32:09 (1801 seconds);628 HLS responses succeeded with **zero active-stream HTTP errors**. One canceled startup-session segment returned404 after that session stopped, before the continuous run. The final recorder assertion initially counted that canceled-session request; ordered logs distinguish it from the accepted active stream. No wait for the full movie is required. Real Series→show→Season 1/Season 2→episode browsing passed. My Lists displayed playlist collages and watchlist posters. Requests loaded 56 existing records with covers and green Available/blue Processing statuses; Issues loaded 2 existing Resolved records. No real service records were mutated. Live cast biography/known works/library availability opened correctly; Back restored the cast opener. Projectivy Home/background return and short Shield sleep/wake passed with pairing retained. The physical handset was not independently exercised.

Regression receipts retain the observed failing cases before each fix. The first emulator run failed two countdown Back tests; the complete final run passed. The direct-play fixture reproduces missing decision authorization and the newer response shape before the protocol/parser fixes.

## Artifacts and Updates

Local evidence is under `tmp/shield-deploy-2026-11-06/`: signed APKs, matching R8 mappings, checksums, image/source manifests, deployment receipts, encrypted backups, test logs, screenshots and per-cycle playback results. Protected durable archive on nexus: **`/mnt/data/backups/watchtower-tv/20261106/`**.

- **`delivery-source-artifacts-final.tar.gz`** — signed APKs/mappings, exact Android/backend source, backend qualification tests/contracts, manifests, signature/alignment checks and deployment/validation receipts. SHA256: `9baa130d27572adfc053e45185539ff87328121834cf8c535e8377a477b78814`.
- **`backend-images-final.tar`** — accepted final transport image and original pre-TV web image. SHA256: `ad4d0f2193bb49ece0412f6392672a2ab4ba3185729d55d2c51e69883c5cec65`.
- Earlier immutable bundles/images remain for history. The earlier native transport has the confirmed memory bug; use the **final** archive for TV recovery. Final hardware/decision records are archived separately as `acceptance-report.tar.gz`.

No signing passwords or runtime plaintext credentials are included. All archive files are root-only under a 0700 directory. Installed APK SHA256 remains `d778202858361da0f6fb203d106f4f3b2e2f2173f56ca1941746a6f6464dbeb7`; pulled installed bytes matched the owner-signed artifact.

For a sideload update, verify this certificate and an increasing versionCode, then target the verified Shield serial with `adb -s 192.168.1.23:5555 install -r <signed.apk>`. Preserve paired credentials and settings. Do not run the emulator-oriented `release-smoke.sh` on the Shield; it uninstalls the package.

The retained pre-streaming image `f0286904541d` has the confirmed direct-stream memory bug and is not an accepted TV rollback. Use the final image/archive for TV recovery.

For backend recovery, first verify the recorded archive hash on nexus, then load `backend-images-final.tar` with `docker image load -i /mnt/data/backups/watchtower-tv/20261106/backend-images-final.tar`. Restore a retained compatible image through the scoped Watchtower service definition using the same data/keys and runtime credential mounts. Reconcile only the Watchtower service, with `STACK_DATA_ROOT=/mnt/data`, project `nexus`, and no dependent/unrelated services or volume removal. The current pinned image is also the accepted TV recovery image. Validate public native instance/protected authentication and existing pairing after replacement. The initial pre-TV image can restore the old web service but lacks native API support, so it is not an accepted working TV rollback. Assess writes since a backup before restoring data; never use `docker compose down -v`.

For app recovery, build compatible known-good code with this certificate and a higher versionCode. Retain signed artifacts and mappings in protected durable storage; do not use a downgrade/uninstall as the normal rollback path.

## Limits and Deferred Findings

- Hardware navigation used ADB D-pad key events. The physical handset/HDMI-CEC chain, production search/settings journeys and real episode auto-transition were not exhaustively qualified. Controlled instrumentation covers the corresponding UI/player paths.

- Plex accepted timeline updates but retained an older saved bookmark after fresh playback lasting only 38 seconds. Following 75 seconds of fresh playback, the next resume matched the new saved position within 4 seconds. Treat sub-minute restarts as an upstream bookmark limitation until its policy is verified; no client-side shadow progress store was introduced.

- The pairing quota currently uses the socket peer because a trusted ingress proxy has not been explicitly configured for the native limiter. Clients behind the same ingress share its ten-creation/ten-minute quota. Configure only a verified ingress peer if this becomes a practical limit; do not trust arbitrary forwarded headers.
- An intentionally incomplete media deep link was correctly rejected, but its notice persisted until app relaunch. Normal server-bound `action=details` and `action=play` links are used by acceptance. Clearing stale rejection notices on successful navigation is a deferred UI refinement.
- Simulated offline recovery: an unreachable loopback HTTP proxy produced Retry controls. Original proxy settings were restored automatically and verified. Navigation Retry restored the library menu, while Home retained its separate error; relaunch restored Home, pairing and 32-minute progress. This does not qualify an ordinary physical network outage or a single global Retry action.
- Whole-host boot, deliberate physical network outage, every codec/HDR format, premium audio passthrough and the entire HDMI/CEC chain are not covered by this first-device deployment. Profile/PIN flows are conditional; production currently advertises profiles disabled.
- Layout audit source and Watch Together were preserved. Deployment changes remain in the Android WIP and the narrowly scoped Technis service definition; no main-branch integration is implied.

## Decisions and their costs

- Reuse existing work/android-tv worktree; do not create a second checkout unless backend integration needs it — preserves current Android WIP and main/layout audit. Cost if wrong: deployment candidate could include unrelated backend changes; review snapshot before shipping.

- Build a deployment staging snapshot from committed main e766b54 plus native routes/shared backend dependencies, not a new Git worktree or branch merge — production web UI remains on main while active layout audit remains untouched. Adapt only new /app/link UI to main's existing Button and h1 after typecheck exposed missing PageHeader/buttonStyles exports. Cost if wrong: shared backend regressions; gate on full snapshot tests/build/staging.

- Retain encrypted whole-volume backup and tagged previous image as durable recovery, removing the stopped original container after verified cutover — avoids duplicate Compose identities and retaining old plaintext Docker provider metadata. Cost if wrong: emergency browser rollback must recreate from retained image rather than starting old container.

- Use systemd encrypted credentials at rest and a UID1001-only tmpfs runtime directory, read by a container preload into app process.env only — satisfies Infisical sourcing without persisting plaintext secrets in Docker config. Service account UID1001 is locked/no-login and preserves existing numeric data ownership. Cost if wrong: credentials service failure prevents Watchtower startup; verify restart and boot ordering without rebooting unrelated host services.

- Anonymous browser pairing acceptance checks same-origin redirect hops instead of following through external Plex OAuth — exact staging routes proved normal redirects. Cost if wrong: complete login still needs actual browser/Shield evidence; user subsequently paired Shield and Home showed real library.

- Use the exact minified owner-signed Shield app as release smoke in addition to full instrumentation on a disposable emulator — exercises the actual device and preserves the audit emulator; controlled synthetic behavior is covered by isolated exact-image smoke. Cost if wrong: an emulator-only minification or network variant is not separately qualified.

- Keep production mutations on controlled synthetic fixtures rather than changing real requests, ratings, watched state or lists — browsing checks use real read-only state and designated already-watched movie playback. Cost if wrong: upstream production mutation integration is not exhaustively verified.

## Final device state

Watchtower is idle on Home with playback stopped. Projectivy remains the default launcher. This workstation’s Shield ADB connection is disconnected; the device’s existing Network debugging setting and authorizations were left as configured. The disposable emulator and owned network-none staging container were stopped/removed without volumes. The final acceptance archive has a protected `acceptance-report.sha256` sidecar in the durable archive directory.
