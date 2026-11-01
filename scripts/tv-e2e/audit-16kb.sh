#!/usr/bin/env bash
# Audits native libraries in an APK for ABI coverage and 16 KB page-size compatibility (zip + ELF alignment).
# Usage: scripts/tv-e2e/audit-16kb.sh <apk>
set -euo pipefail
apk="$1"
bt="${ANDROID_HOME:-$HOME/Library/Android/sdk}/build-tools/36.0.0"
work="$(mktemp -d "${TMPDIR:-/tmp}/wt-16kb.XXXXXX")"
trap 'rm -rf "$work"' EXIT
echo "# Native library / 16 KB audit of $(basename "$apk")"
unzip -l "$apk" | awk '/ lib\//{print "entry: "$4}'
echo "zipalign -c -P 16: $("$bt/zipalign" -c -P 16 -v 4 "$apk" | tail -1)"
unzip -o -q "$apk" 'lib/*' -d "$work" || { echo "no native libraries"; exit 0; }
python3 - "$work" <<'EOF'
import glob, struct, sys
for p in sorted(glob.glob(sys.argv[1] + "/lib/*/*.so")):
    b = open(p, "rb").read()
    e = "<" if b[5] == 1 else ">"
    if b[4] == 2:
        off = struct.unpack_from(e + "Q", b, 0x20)[0]; size, count = struct.unpack_from(e + "HH", b, 0x36); field, fmt = 48, "Q"
    else:
        off = struct.unpack_from(e + "I", b, 0x1C)[0]; size, count = struct.unpack_from(e + "HH", b, 0x2A); field, fmt = 28, "I"
    aligns = [struct.unpack_from(e + fmt, b, off + i * size + field)[0] for i in range(count) if struct.unpack_from(e + "I", b, off + i * size)[0] == 1]
    name = p.split("/lib/", 1)[1]
    print(f"ELF lib/{name}: {'ELF64' if b[4] == 2 else 'ELF32'} LOAD p_align={sorted(set(aligns))} {'>=16K OK' if min(aligns) >= 16384 else 'NOT 16K'}")
EOF
