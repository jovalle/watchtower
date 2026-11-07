# NVIDIA Shield Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Privately install Watchtower on the NVIDIA Shield at `192.168.1.23`, paired with `https://watchtower.techn.is`, and qualify browsing and playback with its physical remote.

**Architecture:** Make the production Watchtower native API available first, then sideload an owner-signed release APK using a stable signing identity. Preserve existing server data, installed app data, the Android WIP, the separate Watch Together work, and the active layout audit.

**Tech Stack:** Kotlin/Compose for TV, Media3, Gradle, Android SDK/ADB, Watchtower native API v1, existing server deployment tooling, Infisical.

**Spec:** User request: create a deployment plan; target NVIDIA Shield `192.168.1.23`; server `watchtower.techn.is`. Implementation references: [release procedure](../../handoffs/android-tv/RELEASE.md), [native contract](../../handoffs/android-tv/CONTRACT.md), [latest UI/media handoff](../../handoffs/android-tv/HERO-MEDIA-DETAILS-2026-11-05.md).

## Global Constraints

- Execution was authorized on November6,2026. See the dated Shield deployment handoff for actual changes, receipts and explicitly unverified hardware cases; the November5 observations below are historical.
- Private sideload only. No Google Play publication or wholesale merge of the Android WIP into main.
- Release package: `io.github.jovalle.watchtower.tv`; debug package: `io.github.jovalle.watchtower.tv.debug`.
- Current minimum OS: Android 9 / API 28. Discover the Shield's actual OS and CPU ABI before building the install candidate.
- Use `https://watchtower.techn.is` as the app origin, with valid system-trusted TLS. Keep release cleartext disabled.
- Use Infisical through the applicable project's existing configuration for required secrets; inject directly into consuming processes. Never log or persist plaintext credentials.
- No uninstall, app-data clearing, production volume deletion, key rotation, firmware changes or weakened access controls as troubleshooting shortcuts.
- After connecting, target every device operation with the verified Shield serial. Keep the emulator and ongoing audit undisturbed.

## Review Focus

1. Public reverse proxy serves HTML or interactive login instead of native JSON: diagnose upstream versus public routing before pairing (Task 1).
2. Existing app has a different certificate or newer version: preserve it and stop the update rather than uninstalling (Tasks 2–3).
3. Shield architecture, HDMI capabilities or remote behavior differ from the emulator: verify actual hardware, unsupported-format fallback and focus (Tasks 2 and 5).
4. Production sessions depend on persistent keys and single-writer storage: preserve the whole data path and avoid overlapping writers (Task 1).
5. Upgrade, suspend or network loss breaks pairing/resume: test recovery and retain a data-preserving rollback path (Tasks 4–6).

---

## Observations on November 5, 2026

- Read-only public probe: `GET https://watchtower.techn.is/api/v1/instance` returned **404 HTML**. The native client cannot pair with that response. A stale backend and incorrect proxy routing remain possible causes; neither is established yet.
- ADB inventory showed only `emulator-5554`; no physical Shield was connected or authorized.
- Local release outputs are unsigned, with a separate debug-key QA artifact documented for emulator use. No owner-signed deployment artifact is established.
- Shield model/OS/ABI, installed Watchtower package/certificate, owner signing-key availability, and actual production hosting topology remain to be discovered.

### Files and systems involved

| Existing location | Purpose in execution |
| --- | --- |
| `app/routes/api.v1.*`, `app/routes/link.tsx`, `app/routes/app.link.tsx` | Native API and browser-approved pairing |
| `app/lib/native/`, shared Plex/metadata/watchlist helpers, `contracts/native/v1/` | Matching backend behavior and contract fixtures |
| `server.ts`, `Dockerfile`, `docker-compose.yml` | Server runtime and reference packaging; actual production topology must be verified |
| `.github/workflows/release.yml` | Main-branch release automation; avoid accidental publication |
| `android-tv/app/build.gradle.kts`, `android-tv/app/src/main/AndroidManifest.xml` | Version, signing, OS/ABI compatibility and launcher |
| `scripts/tv-e2e/`, `test/native/`, Android unit/instrumentation tests | Existing qualification tools |
| `docs/handoffs/android-tv/` | Deployment receipts and hardware acceptance record |

No application source change is assumed. If a blocker requires code, reproduce it, add the smallest meaningful regression check and fix it in the appropriate isolated candidate before resuming deployment.

### Task 1: Establish a compatible production backend

**Consumes:** Existing hosting configuration and native v1 contract. **Produces:** Compatible public HTTPS API, tested candidate and recoverable previous deployment.

- [x] Discover the actual host, proxy, current source/image digest, persistent `DATA_PATH`, service manager and existing Infisical configuration without dumping environment values.
- [x] Compare `/api/v1/instance` on the upstream service and public origin. Upstream JSON with public HTML isolates a proxy problem; HTML at both requires inspecting deployed backend version/routes.
- [x] Prepare a focused backend candidate containing all client-required native routes, `/link` approval flow, authenticated images/playback and their shared dependencies. Include recent rating, cast, list, request and media-detail changes. Preserve separate Watch Together work; the Android contract advertises `rooms: false`.
- [x] Keep the active Android checkout and layout audit intact. Use an isolated managed checkout if backend integration requires one; do not merge the entire dirty WIP into main. Review release automation before any push to main because successful CI can publish releases/images.
- [x] Run `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` on the exact candidate and verify its production package starts with native routes. Record failures and existing warning baselines; fix release blockers before rollout.
- [x] Record the previous immutable deployment reference. Make a protected, consistent backup of the entire production data path using the host's backup workflow, including `config/device-key`, browser-session secret/configuration and `devices/sessions.json`. Do not copy local test data into production or print backup contents. Confirm restoration procedure and permissions.
- [x] Confirm session storage remains a single-process writer; do not point staging and production at the same writable data volume. Use separate controlled staging data to verify pairing, protected images, library/detail responses and playback before public cutover.
- [x] In an authorized execution, deploy using the existing host workflow. Preserve volumes, secrets, proxy trust, cookie security and public HTTPS behavior. Native endpoints must use their normal API authentication without an added browser challenge or HTML login redirect.
- [x] Verify the public instance endpoint returns HTTP 200 JSON with `apiVersion: 1`, `product: "Watchtower"`, `configured: true`, `features.pairing: true`, and client-compatible minimum version. Confirm `/link` reaches the normal sign-in/approval flow and unauthenticated protected API calls return contract errors rather than HTML.

**Gate:** Public compatibility works; browser layout/login still work; previous image and protected data backup are recoverable. Do not proceed on the current HTML 404.

### Task 2: Identify and authorize the physical Shield

**Consumes:** Shield access on the same trusted LAN. **Produces:** Verified device serial, compatibility and existing-install inventory.

- [x] On the Shield, record model and Android version. Enable Developer options and its available Network debugging setting. Read its displayed address/port; `192.168.1.23:5555` is only a common example, not a verified port.
- [x] Connect using the shown endpoint and approve this workstation on the TV. If the device offers modern Wireless debugging, use its separate pairing and connection endpoints. Android's documented modern TV pairing workflow requires Android 13+; use the Shield's actual supported workflow.
- [x] Confirm the connected serial and model against the physical TV before assigning `SHIELD_SERIAL`. Example commands below are planned, not executed:

```sh
adb devices -l
adb -s "$SHIELD_SERIAL" shell getprop ro.product.model
adb -s "$SHIELD_SERIAL" shell getprop ro.build.version.release
adb -s "$SHIELD_SERIAL" shell getprop ro.build.version.sdk
adb -s "$SHIELD_SERIAL" shell getprop ro.product.cpu.abilist
adb -s "$SHIELD_SERIAL" shell pm list packages io.github.jovalle.watchtower.tv
```

- [x] Verify API >= 28, available storage and supported ABI. Inspect any installed release/debug package for versionCode and signing certificate, using package metadata and a pulled installed APK if needed. Record certificate fingerprints, never credentials.
- [x] Preserve existing installations. A debug-only install can coexist with release but has separate credentials/preferences; do not promise automatic migration or delete it. A certificate mismatch requires an explicit migration decision before replacement.

**Gate:** Exact Shield serial and compatible OS/ABI are recorded; existing app state and update constraints are known.

### Task 3: Build and qualify the signed release APK

**Consumes:** Exact source snapshot, installed-package inventory and owner signing identity. **Produces:** Verified signed APK, checksum, certificate fingerprint and matching R8 mapping.

- [x] Record the exact intended source snapshot, including relevant uncommitted/untracked work, without accidentally adding secret files. Choose a versionCode higher than every installed/distributed version of this package; record the versionName.
- [x] Locate the owner's existing signing key through the agreed secure workflow. If none exists, arrange owner-approved key provisioning/custody before release signing. Never substitute the Android debug key. Resolve any future Play signing expectations before committing to an incompatible identity; Play publication is outside this plan.
- [x] Use JDK 21, SDK platform 37, build-tools `36.0.0` and the repository Gradle wrapper. Run the existing Android unit and lint checks; run relevant pairing/catalog/player instrumentation on an explicitly selected emulator, including the current UI/media regressions.
- [x] Inject only required signing inputs into Gradle from Infisical/the approved keystore workflow: `WATCHTOWER_TV_KEYSTORE`, `WATCHTOWER_TV_KEYSTORE_PASSWORD`, `WATCHTOWER_TV_KEY_ALIAS`, `WATCHTOWER_TV_KEY_PASSWORD`. Keep passwords off command lines and disk. Build `:app:assembleRelease` with the chosen `watchtower.tv.versionCode` and `watchtower.tv.versionName`; an AAB is unnecessary for sideloading.
- [x] Verify the final APK with build-tools `apksigner verify --print-certs`, inspect package/version/minSDK/ABIs with SDK tooling, and compare its certificate with any installed release. Run `scripts/tv-e2e/audit-16kb.sh <signed.apk>` and calculate its SHA-256.
- [x] Smoke-test the minified candidate on the physical Shield (execution ruling), with full instrumentation on a disposable emulator; the exact backend image passed isolated synthetic smoke. Original emulator-only step: Smoke-test the minified candidate on the explicitly selected emulator for HTTPS connection, pairing, browsing and playback using controlled test data. Do not use `release-smoke.sh` on the Shield: the existing helper is emulator-oriented and uninstalls the package. Avoid disturbing the paired audit emulator; use a suitable dedicated emulator when required.

**Gate:** All required checks pass on the exact candidate; certificate/version/ABI permit installation; the artifact is owner-signed, not unsigned or QA-debug-key-signed.

### Task 4: Install and pair without losing state

**Consumes:** Signed APK, verified Shield serial and compatible public server. **Produces:** Running, paired release app on the Shield.

- [x] Recheck device serial and installed package/version immediately before installation. For a compatible existing release use `adb -s "$SHIELD_SERIAL" install -r "$SIGNED_APK"`; for a first install use `adb -s "$SHIELD_SERIAL" install "$SIGNED_APK"`. Require `Success`. On signing/version failure, stop and diagnose; do not uninstall, clear data or force a downgrade.
- [x] Open Watchtower through the Shield launcher. Confirm branding, icon/banner, package/version and physical remote focus. Enter `https://watchtower.techn.is` if unpaired.
- [x] Use the TV-displayed verification URL/QR and approve the named Shield through normal Watchtower/Plex browser login. Never use fixture pairing or owner credentials embedded in the app. An existing compatible install should retain pairing; investigate unexpected loss before proceeding.
- [x] Verify intended identity/profile and library access, then relaunch the app and confirm pairing/preferences survive. If both debug and release existed, record the duplicate and resolve removal only with explicit data-loss authorization.

**Gate:** Intended release opens from the launcher and stays paired to the production origin.

### Task 5: Qualify the physical TV experience

**Consumes:** Paired Shield, its normal remote and designated test media. **Produces:** Hardware pass/fail matrix with reproducible blocker reports.

- [ ] Navigate using only the remote: sidebar, hero actions, shelves, search, libraries, show/season/episode pages, lists, cast profiles, Requests/Issues, settings and Back. Confirm visible focus, no traps, readable metadata and no action-label displacement at actual display scaling.
- [ ] Check artwork, available provider ratings, missing-value omission, media-version/audio/video details and current watchlist/rating state. Verify available titles cannot be requested again; integration-disabled states should explain how to proceed.
- [x] Use designated disposable/test items for mutations: watchlist toggle, half-star rating, watched state and Continue Watching removal. Restore original state where possible; do not file real requests/issues solely to test production. Validate those mutations with controlled integration data.
- [x] For representative direct-play and forced-HLS/transcode titles, run five start → play at least 30 seconds → stop → resume cycles per delivery path. Verify video/audio advance, resume tolerance, seek, selected audio/subtitles and clean stop. Record actual delivery mode and any Plex transcode constraints.
- [ ] Test episode transition, long playback (at least 30 minutes), brief network interruption/recovery, Home/background return and Shield sleep/wake. Confirm retry/error paths keep navigation usable and progress coherent. Test a device reboot when authorized and ensure pairing survives.
- [ ] Check actual supported 1080p/4K, SDR/HDR and audio output through this TV/AVR chain. Record unsupported cases and fallback; emulator success does not qualify hardware decoding, passthrough, refresh switching or HDMI/CEC.
- [x] If profiles are enabled, verify profile switching, protected-profile/PIN boundaries and absence of prior-profile content in app/Watch Next. Check launcher/Watch Next behavior where the Shield launcher supports it.
- [x] Capture only bounded, redacted diagnostics for failures. Exclude bearer tokens, pairing secrets, signed playback URLs and query credentials. Fix reproducible blockers with regression checks, rebuild with an increased versionCode if already distributed, and rerun affected hardware journeys.

**Gate:** Pairing, browsing, repeated playback/resume and recovery pass on hardware. Unsupported optional formats are documented; no critical navigation, authorization or data-loss defect remains.

### Task 6: Record delivery, update and recovery procedures

**Consumes:** Passing candidate and deployment evidence. **Produces:** Durable release record and recovery path.

- [x] Archive the signed APK, SHA-256, certificate fingerprint, version, exact source reference, R8 mapping, backend digest/contract version and hardware results in protected durable storage. Keep all secret material separate. Add a concise dated Shield handoff under `docs/handoffs/android-tv/` with remaining limitations.
- [x] For future updates, use the same package/certificate and a higher versionCode; qualify update-over-existing-install retention on a controlled device before delivery. Preserve data and avoid uninstall-based “upgrade” tests.
- [x] Backend recovery: restore the known-good immutable deployment using its existing compatible data/keys; assess changes made since the backup before any data restore. A backend without native v1 will break TV access and is not an accepted working rollback for the TV.
- [x] App recovery: build last-known-good compatible code with the same certificate and a higher versionCode, checking local/server schema compatibility. Do not blindly use `install -d` or uninstall. Keep the old app installed if recovery requires an unresolved key/data migration.
- [x] After acceptance, disconnect ADB and agree whether to disable Network debugging/revoke this workstation's authorization. Do not interrupt unrelated tooling. Record the one intended launcher app and any explicitly retained development install.

**Done:** The Shield runs the intended owner-signed Watchtower release against the public production origin; physical pairing, browsing and repeated playback pass; update/recovery instructions and outstanding hardware limitations are recorded.

## Primary platform references

- [Android Debug Bridge](https://developer.android.com/tools/adb): targeted device commands, installation and modern wireless debugging/version requirements.
- [Android app signing](https://developer.android.com/studio/publish/app-signing): stable update identity and Play upload-key/app-signing-key distinction.
- [Run apps on a hardware device](https://developer.android.com/studio/run/device.html): developer setup and device authorization.

## Plan self-review

Reviewed against the supplied target and existing release/native contract: server-first compatibility, persistent-key preservation, exact-device targeting, signing/version conflicts, physical playback/recovery and rollback are covered. Production host access, Shield OS/ABI and signing-key custody are execution discoveries, not completed checks. No deployment commands in this document have been executed as part of planning.

## Execution receipt

Execution in this session is recorded in [Shield deployment — November6,2026](../../handoffs/android-tv/SHIELD-DEPLOYMENT-2026-11-06.md). Tasks1–4 are complete; the minified app was qualified on the actual Shield while full instrumentation used a disposable API31 emulator. Core physical browsing, repeated playback, the long HLS soak, and final bounded-transport direct/HLS regression are complete. Deferred qualification cases remain listed in the handoff. Production mutations use controlled synthetic data; production currently disables profiles. Deliberate physical network outage, whole-host/Shield reboot and exhaustive HDMI/codec coverage remain unverified and are not implied by checked conditional steps.
