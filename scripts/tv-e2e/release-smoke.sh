#!/usr/bin/env bash
# Launch smoke for the QA (debug-key-signed) minified release APK on every connected emulator.
set -uo pipefail
adb="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
apk="$1"
pkg=io.github.jovalle.watchtower.tv
for s in $("$adb" devices | awk '/emulator-/{print $1}'); do
  "$adb" -s "$s" uninstall "$pkg" >/dev/null 2>&1
  inst=$("$adb" -s "$s" install "$apk" 2>&1 | grep -oE "Success|INSTALL_[A-Z_]+" | head -1)
  "$adb" -s "$s" logcat -c
  start=$("$adb" -s "$s" shell am start -W -n "$pkg/$pkg.MainActivity" 2>&1 | grep -E "^Status" | tr -d '\r')
  sleep 8
  pid=$("$adb" -s "$s" shell pidof "$pkg" | tr -d '\r')
  crash=$("$adb" -s "$s" logcat -d | grep -E "FATAL EXCEPTION" -A2 | grep -c "Process: $pkg")
  printf '%s sdk=%s page=%s model=%s install=%s %s pid=%s app_crashes=%s\n' "$s" \
    "$("$adb" -s "$s" shell getprop ro.build.version.sdk | tr -d '\r')" \
    "$("$adb" -s "$s" shell getconf PAGE_SIZE | tr -d '\r')" \
    "$("$adb" -s "$s" shell getprop ro.product.model | tr -d '\r')" "$inst" "$start" "${pid:-none}" "$crash"
done
