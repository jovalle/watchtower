# Watch Together local acceptance harness

Reproduction tooling for `docs/handoffs/watch-together/ACCEPTANCE.md`. It runs the real production build (Express + Remix, real room coordinator, real SSE) against a **synthetic** Plex upstream and a **stubbed** plex.tv identity lookup. It never uses real Plex accounts, tokens, media or watch history, and it does not exercise Plex OAuth, Plex transcoding, codecs or WAN conditions.

Everything it writes goes to `tmp/wt-harness/` (gitignored): isolated `DATA_PATH`, generated media, signed synthetic cookies, logs and JSON results. Ports: Watchtower `9331`, synthetic Plex `32519` (override with `WT_HARNESS_APP_PORT` / `WT_HARNESS_PLEX_PORT`, then rerun `setup.mjs`). `run.mjs` refuses to start when either port is already taken or `server.json` points at another port, so it never talks to another local harness.

## Requirements

- `ffmpeg` (media generation uses the built-in `testsrc` pattern, which shows a running timestamp).
- Google Chrome installed (Playwright's bundled Chromium lacks H.264/AAC).
- `playwright-core` in the scratch directory only (the project lockfile is untouched):

```sh
just build
node docs/handoffs/watch-together/harness/setup.mjs
bun add --cwd tmp/wt-harness playwright-core@1.57.0
node docs/handoffs/watch-together/harness/run.mjs protocol   # HTTP/SSE multi-client checks
node docs/handoffs/watch-together/harness/run.mjs browser    # two/three-browser journey
```

Results: `tmp/wt-harness/artifacts/{protocol-e2e,browser-e2e}.json`, upstream request log `fake-plex.jsonl`, server log `server.log`.

## What the synthetic upstream models

| Model | Not modeled |
| --- | --- |
| Per-user item access (`alice`, `bob` all items; `carol` none; `dave` episode 1 only) | Real Plex library sharing, restrictions, entitlements |
| Direct-file byte ranges and a fixed 2 s-segment HLS VOD playlist | Plex transcoder, `offset`/`copyts` timestamp behaviour, adaptive bitrate |
| Timeline/scrobble/ping/stop endpoints, logged per user and client identifier | Plex history semantics, Trakt |
| Per-user segment throttling to induce real buffering | Network loss patterns other than Chrome offline mode |

Skew is measured by sampling each page's `video.currentTime` with that page's wall clock on the same host and projecting both samples to one instant. That removes the need to compare unsynchronized clocks, but loopback timing is far better than real devices or networks and must not be reported as device or WAN evidence.
