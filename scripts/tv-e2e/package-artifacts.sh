#!/usr/bin/env bash
# Local release-artifact packaging for the Android TV app (no production keys).
# Produces debug, unsigned release APK/AAB, the R8 mapping, and a QA copy of the release APK signed with the
# local Android *debug* key (clearly labeled; never distribute it as a release). Output: tmp/tv/artifacts/.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
bt="$ANDROID_HOME/build-tools/36.0.0"
out="$root/tmp/tv/artifacts"

cd "$root/android-tv"
./gradlew :app:assembleDebug :app:assembleRelease :app:bundleRelease --console=plain -q
version="$("$bt/aapt2" dump badging app/build/outputs/apk/release/app-release-unsigned.apk | sed -n "s/.*versionCode='\([0-9]*\)' versionName='\([^']*\)'.*/\2-\1/p" | head -1)"

rm -rf "$out" && mkdir -p "$out"
cp app/build/outputs/apk/debug/app-debug.apk "$out/watchtower-tv-$version-debug.apk"
cp app/build/outputs/apk/release/app-release-unsigned.apk "$out/watchtower-tv-$version-release-unsigned.apk"
cp app/build/outputs/bundle/release/app-release.aab "$out/watchtower-tv-$version-release-unsigned.aab"
cp app/build/outputs/mapping/release/mapping.txt "$out/mapping-$version.txt"
qa="$out/watchtower-tv-$version-release-QA-DEBUG-KEY-SIGNED.apk"
cp "$out/watchtower-tv-$version-release-unsigned.apk" "$qa"
"$bt/apksigner" sign --ks "$HOME/.android/debug.keystore" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey "$qa"

cd "$out"
shasum -a 256 ./*.apk ./*.aab ./mapping-*.txt | sed 's#  \./#  #' > SHA256SUMS
for apk in ./*.apk; do
  if "$bt/apksigner" verify "$apk" >/dev/null 2>&1; then state="signed ($("$bt/apksigner" verify --print-certs "$apk" | sed -n 's/^Signer #1 certificate DN: //p'))"; else state="UNSIGNED"; fi
  printf '%s\t%s\t%s\n' "${apk#./}" "$("$bt/aapt2" dump badging "$apk" | head -1 | sed "s/ platformBuildVersion.*//")" "$state"
done > MANIFEST.tsv
cat SHA256SUMS MANIFEST.tsv
