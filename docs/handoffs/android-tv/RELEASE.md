# Android TV release procedure

This procedure applies to the Watchtower Android TV app in `codex/android-tv`. No artifact from the current work has been published, uploaded to Google Play, or signed with an owner-controlled production key. The recorded release outputs are unsigned except for a QA copy signed with the Android debug key.

## Build unsigned outputs

Use JDK 21, Android SDK platform 37, and build-tools `36.0.0`. From `android-tv/`, choose the version before building:

```sh
./gradlew :app:assembleRelease :app:bundleRelease \
  -Pwatchtower.tv.versionCode=2 \
  -Pwatchtower.tv.versionName=0.2.0
```

The unsigned outputs are normally:

- `app/build/outputs/apk/release/app-release-unsigned.apk`
- `app/build/outputs/bundle/release/app-release.aab`
- `app/build/outputs/mapping/release/mapping.txt`

The version code must increase across every distribution channel. Do not reuse a version code already installed or published. The current defaults are version code `1` and version name `0.1.0`; the provisional production application ID is `io.github.jovalle.watchtower.tv`.

[`scripts/tv-e2e/package-artifacts.sh`](../../../scripts/tv-e2e/package-artifacts.sh) runs the release APK/AAB packaging command, copies the outputs to the ignored `tmp/tv/artifacts/` directory, calculates SHA-256 checksums, and creates `watchtower-tv-...-release-QA-DEBUG-KEY-SIGNED.apk`. That last file is signed with `$HOME/.android/debug.keystore` and must not be distributed.

## Sign and verify

Keep the owner's upload key and passwords outside the repository and CI logs. The Gradle release configuration reads:

```text
WATCHTOWER_TV_KEYSTORE
WATCHTOWER_TV_KEYSTORE_PASSWORD
WATCHTOWER_TV_KEY_ALIAS
WATCHTOWER_TV_KEY_PASSWORD
```

When `WATCHTOWER_TV_KEYSTORE` is set, the other three variables are required and Gradle assigns the resulting configuration to the release build. Rebuild the release APK and AAB with those variables set so the artifacts are signed by the configured key. When the keystore variable is absent, `app/build.gradle.kts` does not create a release signing configuration and the release outputs remain unsigned.

For a standalone APK that has already been built unsigned, the owner can sign it with `apksigner` and the upload keystore. Use a password-handling method supported by the installed Android build-tools; the example uses environment-backed passwords so no password is placed on the command line:

```sh
"$ANDROID_HOME/build-tools/36.0.0/apksigner" sign \
  --ks "$WATCHTOWER_TV_KEYSTORE" \
  --ks-key-alias "$WATCHTOWER_TV_KEY_ALIAS" \
  --ks-pass env:WATCHTOWER_TV_KEYSTORE_PASSWORD \
  --key-pass env:WATCHTOWER_TV_KEY_PASSWORD \
  app/build/outputs/apk/release/app-release-unsigned.apk
```

Verify every APK intended for installation or sideloading:

```sh
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs <signed.apk>
```

Record the certificate identity and SHA-256 of the final file. `apksigner` verifies APK signatures; sign the AAB through the Gradle release configuration or the authorized Play upload process, then inspect the Play-generated APKs before sideloading them. Never distribute the debug-key QA copy or an unsigned release APK.

Run the native-library audit against the final APK that will be sideloaded:

```sh
scripts/tv-e2e/audit-16kb.sh <signed.apk>
```

The audit checks both APK zip alignment and ELF `LOAD` segment alignment. The recorded audit for the unsigned release APK found `androidx.graphics.path` for `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64`, with 16 KB alignment and successful `zipalign -P 16`. This is evidence for that APK, not a substitute for checking the final signed file.

## Cross-channel signing plan

Google Play App Signing separates the upload key used to submit an AAB from the app-signing key Google Play uses for delivered APKs. A sideloaded APK signed with only the upload key cannot update a Play-installed APK signed with the Play app-signing key, and a Play-installed APK cannot update a sideloaded APK signed with a different certificate. The recorded same-emulator check demonstrated the certificate rule with test keys: a different key returned `INSTALL_FAILED_UPDATE_INCOMPATIBLE`; a lower version code returned `INSTALL_FAILED_VERSION_DOWNGRADE`.

Choose the channel strategy before the first public install:

| Option | Result | Trade-off |
| --- | --- | --- |
| A. Sideload Play-generated signed universal APKs | Build and upload the AAB to Play, then obtain a universal APK signed by the Play app-signing key from the bundle explorer for controlled sideloading. | One certificate and one application ID can update across channels, but sideload distribution depends on Play-generated artifacts and a Play Console workflow. |
| B. Enroll with the owner's app-signing key | Use Play App Signing with an app-signing key controlled by the owner so Play-delivered APKs and owner-signed sideload APKs use the same certificate. | Best for one application ID and bidirectional upgrades, but key custody, recovery, and the irreversible impact of losing or changing the key require a deliberate owner decision. |
| C. Separate application IDs | Give Play and sideload builds different application IDs and treat them as separate products. | Avoids certificate conflicts and permits independent release cadence, but users cannot update between channels and local data does not automatically move between packages. |

Recommendation: use option B if the product requires one package with seamless sideload and Play updates and the owner is ready to place the app-signing key under the agreed Play App Signing custody model. Use option A for a controlled near-term sideload path when that key decision is not ready. Use option C only when channel separation is an intentional product decision. In every option, keep `versionCode` strictly increasing across both channels for the same application ID.

## Current Play TV review

The rules below come from [`RESEARCH.md`](RESEARCH.md), whose research date is 2026-09-27. Recheck the linked official sources in that document immediately before submission because Play policy and TV quality rules are time-sensitive.

| Review rule | Current implementation and evidence | State |
| --- | --- | --- |
| TV target API floor | `targetSdk = 36`; the research records a TV target floor of API 34. | Meets the recorded floor; still recheck the current policy. |
| TV minimum SDK | `minSdk = 28`; the research records a TV quality requirement of at most API 31. | Meets the recorded ceiling. |
| Android App Bundle | `bundleRelease` and an unsigned `.aab` were produced. | Packaging exists; signed upload and Play review are outstanding. |
| 32-bit and 64-bit support | The 16 KB audit lists `armeabi-v7a`, `arm64-v8a`, `x86`, and `x86_64` native-library entries. | Recorded artifact audit passes; Play compatibility has not been reviewed. |
| 16 KB page-size compatibility | `zipalign -P 16` passed and every listed ELF `LOAD` segment had `p_align=[16384]`. | Passes the recorded audit for the audited APK. |
| Leanback launcher and banner | The manifest requires `android.software.leanback`, declares the `LEANBACK_LAUNCHER` category, and supplies `android:banner`. | Implemented in source; Play pre-launch and launcher behavior are unverified. |
| D-pad and no-touch operation | Touchscreen is declared not required; Compose TV tests cover focus, Back, dialogs, drawer navigation, and player overlays. | Partially verified on emulators; no physical remote qualification. |
| Watch Next | The app writes profile-aware Watch Next rows and removes them on completion or identity changes; `WatchNextManagerTest` covers these rules. | Provider behavior is tested; launcher appearance and placement are unverified. |
| Physical TV quality | No physical TV, HDMI/CEC chain, HDR output, audio passthrough, or Assistant runtime was available. | Blocked. |

The app is native Kotlin with Compose for TV and Media3. It does not declare a required touchscreen, and its launcher/banner resources are present. These source facts do not by themselves pass Play's pre-launch or TV-quality review.

## Privacy and data safety inventory

This inventory is derived from `android-tv/app/build.gradle.kts`, the manifest/resources, `CredentialStore`, `AppGraph`, `WatchtowerApi`, and the platform integration classes. It is a release-review inventory, not a completed Play Data safety form.

| Data or capability | Stored or sent | Boundary and retention behavior |
| --- | --- | --- |
| Watchtower device session | Stored locally as an encrypted `StoredCredential` in `noBackupFilesDir/device-credential.v1`. The AES-GCM key is held by Android Keystore. | The token is sent as a bearer credential only to the paired Watchtower origin. It is cleared on sign-out, revocation/expiry handling, server change, decryption failure, or key failure. |
| Server address, identity, and profile state | The base URL is kept in app preferences; the encrypted credential includes device session ID, identity version, expiry, and the last `me` response. | These values are excluded from backup and device transfer by the manifest and both extraction-rule files. |
| Playback preferences and local UI state | Stored by the app's local preference implementation. | These are local settings; verify the final Data safety declaration against the exact release variant. |
| Catalog, search, image, playback, and room traffic | Sent to the configured Watchtower server over the app's HTTP client. Authenticated image paths are resolved through the Watchtower image proxy; the client refuses other origins and does not follow redirects. | The Android client does not send the user's Plex token directly to Plex. The Watchtower server performs the Plex-side access and media work. |
| Pairing metadata | The TV sends device name, platform, model, and app version when creating a device authorization. | The polling secret is used for the pairing exchange and is not put in the QR value. Do not log pairing secrets. |
| Voice search | A search intent is handed to the system speech recognizer when one is available. | The app does not embed an analytics or speech SDK. The selected system recognizer's own data handling is outside the app's control and must be described separately if required by Play. |
| Watch Next | The app writes title, poster URI, server-bound deep-link URI, duration, and playback position to the Android TV Watch Next provider. | Restricted or protected profiles remove published rows; identity changes remove the app's rows. Launcher placement is controlled by the device. |
| Analytics and advertising | No analytics or advertising SDK is present in the checked Gradle dependency list. | The dependency list contains AndroidX, Media3, OkHttp, coroutines, serialization, Coil, ZXing, and test libraries, but no analytics or ads SDK. Recheck transitive dependencies during the final release review. |
| Backups and extraction | `android:allowBackup="false"` is set, and both `backup_rules.xml` and `data_extraction_rules.xml` exclude app data domains. | Device credential data is not intended to move through Android backup or device transfer. |

Transport policy differs by variant on purpose: the debug source set overrides `network_security_config.xml` (`android-tv/app/src/debug/res/xml/`) to allow cleartext to development servers, which the emulator E2E exercises over `http://10.0.2.2:9031`; the release build uses `android-tv/app/src/main/res/xml/network_security_config.xml`, which permits HTTPS only and trusts system certificate authorities only. A release build therefore needs a Watchtower server with a publicly trusted certificate.

## Reviewer access (TV-G5)

Nothing is prepared for Play reviewer access. A reviewer would need a reachable demo Watchtower server, a controlled test account, a configured Plex test library or equivalent review fixture, and pairing instructions that do not expose a real user's credentials. No demo server, test account, or Play Console review setup exists in this handoff. `TV-G5` is a brief label, not an ID defined in `IMPLEMENTATION.md`; track it as an open release gate rather than claiming it is accepted.

## API compatibility and version skew

The native contract is [`CONTRACT.md`](CONTRACT.md), with implementation types in [`app/lib/native/contract.ts`](../../../app/lib/native/contract.ts) and the public instance route in [`app/routes/api.v1.instance.ts`](../../../app/routes/api.v1.instance.ts).

- The native base path is `/api/v1`. `GET /api/v1/instance` returns `apiVersion`, server version, setup state, feature flags, and `compatibility.minClientVersionCode` plus an optional `upgradeMessage`.
- The current instance route returns `apiVersion: 1` and `minClientVersionCode: null`. Profiles are advertised only when `WATCHTOWER_PLEX_HOME_PROFILES=1`; rooms are advertised by the combined Watch Together server, not by this branch alone.
- Before pairing, the app rejects an API version other than 1, rejects a server whose minimum client version code is greater than the installed version, and shows the server-provided upgrade message when present.
- Authenticated requests use the opaque bearer session and, except for the explicitly exempted session-management calls, `X-Watchtower-Identity-Version`. A stale identity version is a `409 identity_version_mismatch`; the server rechecks identity before upstream side effects.
- Additive fields are allowed within v1 and the client ignores unknown JSON fields. Removing or retyping a field or changing error semantics requires a new API version. Required times and positions are integer milliseconds with `Ms` suffixes.
- The native client does not fall back to a browser cookie or HTML loader. A server that responds to `/api/v1/instance` with an HTML 404 is reported as incompatible. The client keeps the credential until the user signs out rather than silently discarding it.
- If a server is rolled back to a version without `/api/v1`, the TV app must be upgraded or the server restored; do not “fix” the mismatch by using the server owner token or by accepting an HTML login redirect.

## Release checklist

- [ ] Confirm the application ID, owner, channel strategy, and app-signing-key custody before the first Play upload.
- [ ] Select a version name and a version code higher than every released or sideloaded build for this application ID.
- [ ] Build the unsigned release APK and AAB from the intended source commit with the recorded JDK, SDK, Gradle, AGP, and Kotlin versions.
- [ ] Confirm the release build is minified and resource-shrunk and retain the matching R8 mapping file.
- [ ] Sign with the owner's upload/app-signing key, never the Android debug key.
- [ ] Run `apksigner verify --print-certs` on each signed APK and record the certificate and SHA-256.
- [ ] Audit the final sideload APK for 32/64-bit coverage and 16 KB zip/ELF alignment.
- [ ] Install fresh on the selected minimum/current TV targets and verify the intended certificate, package ID, version code, launcher banner, D-pad-only operation, and HTTPS connection.
- [ ] Test an upgrade with the same certificate in both directions required by the channel plan. Do not use uninstall as an upgrade test because it removes app data.
- [ ] Run the minified pairing, catalog, playback, subtitle, lifecycle, Watch Next, and room journeys against a controlled server.
- [ ] Complete physical TV tests for remote input, audio routes, CEC, HDR, refresh rate, 4K, and any advertised premium format.
- [ ] Complete TalkBack, privacy/data-safety, deep-link, protected-profile, low-memory, and network-failure checks.
- [ ] Run Play's current TV quality and pre-launch review. Record the report and resolve release blockers before production rollout.
- [ ] Prepare reviewer access without real user credentials.
- [ ] Archive signed artifacts, checksums, mapping, contract version, release notes, and rollback source reference outside the repository's ignored temporary directory.

## Rollback

For Google Play, halt a rollout or use a staged rollout and stop promotion of the affected version. A Play rollback is not an APK downgrade: Android rejects a lower `versionCode`, as recorded by `signing-compat-api36.txt`. Rollback means building a new release with a higher `versionCode` from the previous known-good source and signing it with the compatible channel key.

For sideload, distribute a higher-versioned APK signed with the certificate already installed on the device. A different certificate produces `INSTALL_FAILED_UPDATE_INCOMPATIBLE`; an unsigned APK cannot replace a signed install. Do not instruct users to uninstall as the normal rollback path, because uninstall removes local credentials and settings and can hide a signing or versioning mistake.

## Current release state

The current evidence package contains:

- an unsigned release APK and AAB;
- a QA release APK signed with the Android debug key;
- a debug APK;
- an R8 mapping file and SHA-256 manifest;
- a passing 16 KB native-library audit for the audited unsigned APK;
- signing/upgrade compatibility results; and
- launch smoke results on the 4 KB API 36, 4 KB API 31, and 16 KB API 36 emulators.

It does not contain an owner-signed release, a Play-signed universal APK, a Play upload, reviewer access, or a publication result. See [`ACCEPTANCE.md`](ACCEPTANCE.md) for the complete evidence and blocked-gate matrix.