# Watchtower Android TV

Watchtower Android TV is a native Kotlin application for Android TV and Google TV. Its UI uses Jetpack Compose for TV, and playback uses AndroidX Media3. It is not a WebView wrapper. The app talks to the Watchtower native JSON API under `/api/v1`; the Watchtower server remains responsible for Plex access, authorization, media decisions, and protected resources.

The combined `codex/watchtower-wip` branch contains this TV client, the native API, and the Watch Together room server. The separate TV/integration branch names have been archived; their feature history remains in WIP. See [the acceptance handoff](../docs/handoffs/android-tv/ACCEPTANCE.md) for the historical acceptance evidence.

## Requirements

- macOS, Linux, or Windows with an Android SDK installation.
- JDK 21 at runtime. The Android module uses Java 17 source and target compatibility, but the Gradle/Android toolchain is run with JDK 21.
- Android SDK platform 37 and build-tools `36.0.0`.
- Android settings: `compileSdk = 37`, `targetSdk = 36`, and `minSdk = 28`.
- Gradle wrapper `9.8.0`.
- Android Gradle Plugin `9.4.1`.
- Kotlin `2.4.20`.

The version catalog also pins Compose BOM `2026.09.00`, Compose for TV `1.1.0`, Media3 `1.11.1`, OkHttp `5.5.0`, Kotlin coroutines `1.11.0`, Kotlin serialization `1.11.0`, Coil `3.6.3`, and ZXing `3.5.4`. Use the repository wrapper from `android-tv/`; do not substitute a system Gradle installation.

Set `JAVA_HOME` and `ANDROID_HOME` before invoking the wrapper. For example:

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

Adjust those paths for the local installation. The wrapper distribution checksum is pinned in `android-tv/gradle/wrapper/gradle-wrapper.properties`.

## Project layout

The application module is `android-tv/app`. Kotlin sources are under `app/src/main/java/io/github/jovalle/watchtower/tv/`:

- `api/` contains JSON DTOs, the `/api/v1` client, HTTP clients, server-address validation, and API errors.
- `auth/` contains the Android Keystore credential store and session, pairing, expiry, sign-out, and identity-change handling.
- `pairing/` contains the server address, browser-approved pairing, QR, profile chooser, and PIN screens.
- `catalog/` contains home, library, search, details, seasons, episodes, lists, ratings, requests, and catalog state.
- `playback/` contains Media3 player ownership, media-source construction, capability detection, track mapping, timeline mapping, progress reporting, policies, and the player screen.
- `rooms/` contains the Watch Together protocol client, authority checks, session state, synchronization, and room screens.
- `platform/` contains validated deep links, system voice-search integration, and Android TV Watch Next provider integration.
- `settings/` contains local playback preferences and the settings screen.
- `ui/` contains the application shell and shared TV UI composition.
- `navigation/` contains player route integration.
- `AppGraph.kt`, `WatchtowerApp.kt`, and `MainActivity.kt` assemble the application and lifecycle.

Resources include the Leanback launcher banner and icon, strings, the release network-security policy, and backup/data-extraction rules. JVM tests are under `app/src/test`; instrumentation and Compose tests are under `app/src/androidTest`.

## Build and test

Run commands from `android-tv/`. The recorded TV branch gate was:

```sh
./gradlew :app:testDebugUnitTest :app:lintDebug :app:lintRelease :app:assembleDebug :app:connectedDebugAndroidTest
```

`connectedDebugAndroidTest` requires a running compatible emulator or device. A unit-test, lint, and APK build without a connected device is:

```sh
./gradlew :app:testDebugUnitTest :app:lintDebug :app:lintRelease :app:assembleDebug
```

The CI build also assembles the instrumentation APK, release APK, and release bundle:

```sh
./gradlew :app:testDebugUnitTest :app:lintDebug :app:lintRelease :app:assembleDebug :app:assembleDebugAndroidTest :app:assembleRelease :app:bundleRelease --console=plain
```

When release signing variables are absent, the release APK and AAB from these tasks are unsigned. The release build is minified and resource-shrunk, so a successful build is not evidence of a signed distribution artifact.

## Run against a local Watchtower server

The debug build sets a debug-only `ALLOW_CLEARTEXT` flag, the address validator accepts `http://`, and the debug source set overrides `res/xml/network_security_config.xml` (`app/src/debug/res/xml/`) to permit cleartext, so a debug build can reach a LAN or emulator development server such as `http://10.0.2.2:9031`; the emulator room E2E runs this way. Release builds use `app/src/main/res/xml/network_security_config.xml`: HTTPS only, system certificate authorities only, no user-added CAs and no cleartext.

From the repository root, the local harness can provide an isolated server and fake PMS:

```sh
bun scripts/tv-e2e/generate-media.ts
bun scripts/tv-e2e/fake-pms.ts 32499
bun scripts/tv-e2e/seed.ts > ./tmp/tv-e2e/token.txt
just build
NODE_ENV=production DATA_PATH=./tmp/tv-e2e/data PORT=9031 SECURE_COOKIES=false node --import tsx server.ts
```

On a standard Android emulator, enter `http://10.0.2.2:9031` in the debug app. `localhost` inside the emulator is the emulator itself. A physical TV must use a reachable address for the server, and a release build must use an HTTPS origin with a certificate trusted by the TV. The app accepts only an origin without a path, query, or fragment.

The app validates `/api/v1/instance` before pairing. It checks the API version, the server's minimum client version when present, setup state, and whether pairing is enabled. Pairing then works as follows:

1. The TV creates a device-authorization request and displays an eight-character code, a verification URL, and a QR code.
2. The user opens the verification URL in a browser, signs in through the normal Watchtower/Plex flow, confirms the named TV, and approves the request.
3. The TV polls at the server-provided interval, backs off after `429`, and handles approval, denial, expiry, and network retry states.
4. On approval, the TV stores the opaque Watchtower device session encrypted with AES-GCM using an Android Keystore key in `noBackupFilesDir`. It restores a remembered session on restart and clears it on sign-out, revocation, expiry, server change, or credential/key failure.

The pairing code is not a credential. The QR value is the verification URL; the polling secret is kept by the TV and is not put in the QR code. Profile switching, when enabled by the server, sends the PIN to the server for upstream verification rather than checking it locally.

## Local TV E2E harness

The scripts under [`scripts/tv-e2e`](../scripts/tv-e2e/) use isolated synthetic data under `./tmp/tv-e2e` or `./tmp/tv-room-e2e`. They do not contact a real Plex account when used with the supplied fake PMS and `plextv-shim.mjs`.

- `generate-media.ts` creates testsrc2 H.264/AAC MP4 media, two 30-second MP4 parts, a subtitled MKV with SRT, and HLS files.
- `fake-pms.ts` serves the synthetic catalog and media on port `32499`, including Range responses, HLS, subtitle, library, collection, playlist, search, and mutation fixtures.
- `seed.ts` creates the isolated Watchtower data and emits a harness bearer token. Keep its `DATA_PATH` separate from any real server data.
- `smoke.ts` exercises instance, identity, home, libraries, details, seasons, search, collections, playlists, direct Range playback, multipart resume, subtitle sidecar, HLS resources, timeline, watched, rating, stop, and the fake-PMS call audit.
- `room-e2e.ts` runs the Android TV and Watch Together room journey. It needs a server branch containing the Watch Together room API, not only `codex/android-tv`. Its peers are scripted protocol clients: one web cookie session and one native bearer session.
- `package-artifacts.sh` produces the debug APK, unsigned release APK and AAB, R8 mapping, checksums, and a clearly labeled QA copy signed with the local Android debug key.
- `signing-compat.sh` checks same-key upgrade, downgrade, different-key update, and unsigned-install behavior on one emulator.
- `audit-16kb.sh <apk>` checks APK zip alignment and ELF `LOAD` segment alignment for packaged native libraries.
- `release-smoke.sh <apk>` installs and launches a QA APK on each connected emulator and checks for an app process and fatal crash entries.

The room driver supports these environment variables:

```sh
ANDROID_SERIAL=emulator-5554 bun scripts/tv-e2e/room-e2e.ts
ROOM_E2E_ONLY=A ANDROID_SERIAL=emulator-5554 bun scripts/tv-e2e/room-e2e.ts
ROOM_E2E_ONLY=B ANDROID_SERIAL=emulator-5556 bun scripts/tv-e2e/room-e2e.ts
ROOM_E2E_TRACE=1 ANDROID_SERIAL=emulator-5554 bun scripts/tv-e2e/room-e2e.ts
ROOM_E2E_HOLD=1 ANDROID_SERIAL=emulator-5554 bun scripts/tv-e2e/room-e2e.ts
```

`ROOM_E2E_ONLY=A|B` selects one scenario. `ROOM_E2E_TRACE=1` logs room revisions. `ROOM_E2E_HOLD=1` leaves the seeded servers running for inspection. The recorded evidence is in [`docs/handoffs/android-tv/evidence`](../docs/handoffs/android-tv/evidence/).

## Versioning

The default version is `versionCode = 1` and `versionName = 0.1.0`. Override them with Gradle properties or environment variables:

```sh
./gradlew :app:assembleRelease -Pwatchtower.tv.versionCode=2 -Pwatchtower.tv.versionName=0.2.0
WATCHTOWER_TV_VERSION_CODE=2 WATCHTOWER_TV_VERSION_NAME=0.2.0 ./gradlew :app:assembleRelease
```

Gradle properties take precedence over their environment-variable counterparts. The version code must be a positive integer no greater than `2100000000`. The application ID is `io.github.jovalle.watchtower.tv`; debug uses the suffix `io.github.jovalle.watchtower.tv.debug` and `-debug` in the version name.

## Release signing variables

Release signing is configured only from the environment:

```text
WATCHTOWER_TV_KEYSTORE
WATCHTOWER_TV_KEYSTORE_PASSWORD
WATCHTOWER_TV_KEY_ALIAS
WATCHTOWER_TV_KEY_PASSWORD
```

When `WATCHTOWER_TV_KEYSTORE` is absent, the build does not create the `release` signing configuration and the release APK/AAB are unsigned. When it is present, the build reads the other three variables and assigns the resulting release configuration to the minified release build. Do not commit these values, the keystore, or production credentials. The local packaging script's `release-QA-DEBUG-KEY-SIGNED.apk` is signed with the Android debug key and is for emulator smoke checks only.

## Sideloading and upgrades

Install an APK, not an AAB, with `adb`:

```sh
adb devices
adb -s "$ANDROID_SERIAL" install -r <apk>
```

The debug APK has the `.debug` application ID and can coexist with the release application ID. A release APK must be signed before it can be installed. For an update, keep the application ID and signing certificate the same and increase `versionCode`. The recorded compatibility check in [`signing-compat-api36.txt`](../docs/handoffs/android-tv/evidence/signing-compat-api36.txt) observed:

- a fresh version 1 install with key A: `Success`;
- version 2 over version 1 with the same key A: `Success`;
- version 1 over version 2 with key A: `INSTALL_FAILED_VERSION_DOWNGRADE`;
- version 2 with key B over the installed key A: `INSTALL_FAILED_UPDATE_INCOMPATIBLE`;
- an unsigned version 2 over the installed signed package: install failure.

An uninstall can remove the installed app and its local data, but it is not a certificate migration. Plan cross-channel signing before distributing the same application ID through sideload and Google Play; the trade-offs and release procedure are in [`RELEASE.md`](../docs/handoffs/android-tv/RELEASE.md).

## Handoffs

- [Acceptance matrix and recorded evidence](../docs/handoffs/android-tv/ACCEPTANCE.md)
- [Release and cross-channel signing procedure](../docs/handoffs/android-tv/RELEASE.md)
- [Native API v1 contract](../docs/handoffs/android-tv/CONTRACT.md)