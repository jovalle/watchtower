# TV backend E2E harness

This harness uses only isolated fake credentials and data under `./tmp/tv-e2e`.
It provides movie and show libraries, Specials plus two regular seasons, episode
markers and `allLeaves`, Continue Watching and next-episode data, multipart and
subtitled media, collections, playlists, search, HLS, and mutation call auditing.

```sh
bun scripts/tv-e2e/generate-media.ts
bun scripts/tv-e2e/fake-pms.ts 32499
bun scripts/tv-e2e/seed.ts > ./tmp/tv-e2e/token.txt
just build
NODE_ENV=production DATA_PATH=./tmp/tv-e2e/data PORT=9031 SECURE_COOKIES=false node --import ./scripts/tv-e2e/fixture-fetch.mjs --import tsx server.ts
TOKEN=$(head -1 ./tmp/tv-e2e/token.txt)
curl -sS http://127.0.0.1:9031/api/v1/instance
curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:9031/api/v1/me
curl -sS -H "Authorization: Bearer $TOKEN" -H 'X-Watchtower-Identity-Version: 1' http://127.0.0.1:9031/api/v1/libraries
bun scripts/tv-e2e/smoke.ts
```

The smoke driver writes a redacted transcript to `./tmp/tv-e2e/smoke.log`.
The fake PMS `/__calls` endpoint reports request paths, methods, and whether the
expected per-profile token was used; it never returns token values.

## Emulator Pairing and Playback

The fixture preload supplies only the synthetic account's Plex identity and server-access responses. It refuses any `DATA_PATH` other than `./tmp/tv-e2e/data`; keep it out of real-server commands. The app still uses the normal instance, device-authorization, CSRF-protected approval, polling, and encrypted session-storage flows. This tests pairing without a real Plex login.

Forward the fixture port so the Mac browser and emulator can use the same address:

```sh
adb -s emulator-5554 reverse tcp:9031 tcp:9031
adb -s emulator-5554 install -r android-tv/app/build/outputs/apk/debug/app-debug.apk
```

Launch Watchtower and enter `http://127.0.0.1:9031`. After typing, close the TV keyboard with Back, then press Down and Select on Continue. Approve the displayed code from the repository root:

```sh
bun scripts/tv-e2e/pair.ts BCDF-GHJK
```

The helper creates a synthetic browser session locally and submits the normal lookup and approval forms. It never prints a device credential. For a real Watchtower server, use its normal signed-in `/app/link` page instead.

While the player controls are visible, capture and check fullscreen remote focus:

```sh
adb -s emulator-5554 shell uiautomator dump /sdcard/player.xml
adb -s emulator-5554 pull /sdcard/player.xml ./tmp/tv-e2e/player.xml
python3 scripts/tv-e2e/assert-player-screen.py ./tmp/tv-e2e/player.xml
```

Press Pause before inspecting a short fixture so it does not finish during the check. Screenshots, logs, and synthetic session data under `tmp/` stay Git-ignored.
