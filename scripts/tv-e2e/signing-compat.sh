#!/usr/bin/env bash
# Upgrade and cross-channel signing compatibility check on one emulator (ANDROID_SERIAL).
# Uses the local Android debug key and a throwaway TEST-ONLY key generated under tmp/ (never a release key).
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
bt="$ANDROID_HOME/build-tools/36.0.0"
adb="$ANDROID_HOME/platform-tools/adb"
pkg=io.github.jovalle.watchtower.tv
work="$root/tmp/tv/signing-test"
rm -rf "$work" && mkdir -p "$work"

build() { # versionCode -> unsigned release APK copy
  (cd "$root/android-tv" && ./gradlew :app:assembleRelease "-Pwatchtower.tv.versionCode=$1" --console=plain -q)
  cp "$root/android-tv/app/build/outputs/apk/release/app-release-unsigned.apk" "$work/v$1-unsigned.apk"
}
sign() { # in out keystore pass alias
  cp "$1" "$2"
  "$bt/apksigner" sign --ks "$3" --ks-pass "pass:$4" --key-pass "pass:$4" --ks-key-alias "$5" "$2"
}
install() { "$adb" install -r "$1" 2>&1 | grep -oE "Success|INSTALL_[A-Z_]+|no signatures|failed to install" | head -1 || true; }
installed() { "$adb" shell dumpsys package "$pkg" | grep -E "versionCode=|firstInstallTime=|lastUpdateTime=" | sed 's/^ *//' | tr '\n' ' '; echo; }

keytool -genkeypair -keystore "$work/throwaway-TEST-ONLY.jks" -storepass test-only-pass -keypass test-only-pass \
  -alias test -keyalg RSA -keysize 2048 -validity 1 -dname "CN=Watchtower TV TEST ONLY, O=Not a release key" >/dev/null 2>&1

build 1
build 2
sign "$work/v1-unsigned.apk" "$work/v1-debugkey.apk" "$HOME/.android/debug.keystore" android androiddebugkey
sign "$work/v2-unsigned.apk" "$work/v2-debugkey.apk" "$HOME/.android/debug.keystore" android androiddebugkey
sign "$work/v2-unsigned.apk" "$work/v2-otherkey.apk" "$work/throwaway-TEST-ONLY.jks" test-only-pass test

"$adb" uninstall "$pkg" >/dev/null 2>&1 || true
echo "1. fresh install v1 (key A):      $(install "$work/v1-debugkey.apk")"; installed
echo "2. upgrade to v2 (same key A):     $(install "$work/v2-debugkey.apk")"; installed
echo "3. downgrade to v1 (key A):        $(install "$work/v1-debugkey.apk")"
echo "4. v2 signed with key B over A:    $(install "$work/v2-otherkey.apk")"; installed
echo "5. unsigned v2 over A:             $(install "$work/v2-unsigned.apk")"
