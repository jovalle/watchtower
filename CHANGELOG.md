# Changelog

All notable changes to Watchtower are documented here. Versions follow [Semantic Versioning](https://semver.org) and notes are generated from [Conventional Commits](https://www.conventionalcommits.org).

## [1.8.0](https://github.com/jovalle/watchtower/compare/v1.7.0...v1.8.0) (2026-09-27)

### 🚀 Features

- **a11y:** Move between cards with a remote or arrow keys and restore route focus ([`67f5774`](https://github.com/jovalle/watchtower/commit/67f577497888a766dc64a775e6f69961ee1be6c1))
- **details:** Play TMDB trailers in a modal ([`a0acb1d`](https://github.com/jovalle/watchtower/commit/a0acb1dfb065f76689f970435ec97b71163af9da))
- **home:** Use Plex continue watching hub and collapse duplicate versions ([`679fbb3`](https://github.com/jovalle/watchtower/commit/679fbb36aa9f7af43e7d032e5f8928401d969438))
- **home:** Add trending and promoted collection rows with per-user toggles ([`d208b3a`](https://github.com/jovalle/watchtower/commit/d208b3a80da918fed22f49856be96d700443c1fb))

  Home rows can be turned off individually. A library-only preference hides TMDB trending, search results, and recommendations.

- **nav:** Organize browsing into Watch, Discover and My Stuff with a personal Home ([`83e9ec6`](https://github.com/jovalle/watchtower/commit/83e9ec6dc0ed66d8b9fb535ad60778547337eb36))

  Movies, TV, New and Lists routes redirect to their new locations.

- **notifications:** Notify users when their Seerr requests change ([`6824d8f`](https://github.com/jovalle/watchtower/commit/6824d8f479bc85c518712abf4a640e60873881ad))
- **player:** Skip intro, next-episode countdown, and picture-in-picture ([`6efaf6c`](https://github.com/jovalle/watchtower/commit/6efaf6ca9f0acc855818dc809226f91822ed6f1b))

  Read Plex intro/credits markers and show a Skip Intro button, with an optional per-user auto-skip preference in settings. Offer the next episode (crossing seasons) with a 10s countdown during credits or at the end. Cache the plex.tv user lookup so loaders can read preferences cheaply.

- **player:** Direct-play files the browser can decode ([`a886665`](https://github.com/jovalle/watchtower/commit/a886665447da15cc3a5b0f6fd8067fcfa401cbd4))

  The browser reports its supported containers and codecs in a cookie. When the original file matches (and isn't Dolby Vision profile 5), the player streams it through the range-request proxy instead of Plex HLS, with the existing transcode fallback on errors. Mobile devices no longer always transcode when their browser can play the file.

- **player:** Switch audio and subtitle tracks ([`8544e95`](https://github.com/jovalle/watchtower/commit/8544e9544139ce090ec341c31b9c9ec00dc0b836))

  Track picks are saved per user on the Plex server, as Plex apps do, and the stream restarts at the current position. External SRT/VTT subtitles load in place as a WebVTT sidecar; embedded, styled, and image subtitles are burned in by Plex over HLS. Direct file playback falls back to HLS when the saved audio track isn't the file's default or a subtitle must be burned in.

- **plex:** Paginate library and watchlist reads and match titles by provider GUID ([`cf0b1d2`](https://github.com/jovalle/watchtower/commit/cf0b1d2ee1eca0765c814f5ed05f338c5db2bd45))

  /library/all?guid= does not match secondary GUIDs, so findByGuid scans paginated GUID metadata and shares the scan across concurrent lookups. Watchlist cache version 4 refreshes previously truncated snapshots.

- **search:** Add library and TMDB search with Cmd+K shortcut ([`b921956`](https://github.com/jovalle/watchtower/commit/b921956a4a46d6f703e2695882f4e8382c39c160))
- **seerr:** Request missing titles through Seerr ([`66697e1`](https://github.com/jovalle/watchtower/commit/66697e130de8c41f394c9b8d43942320c01c1db3))

  The server owner connects Seerr from Settings > Integrations (detect, test, save); the API key stays on the server. Titles not in the library open a request dialog, and requests are filed as the user's own Seerr account so Seerr permissions and quotas apply.

- **seerr:** Show 4K and season request state and add Requests and Issues pages ([`fc08eb7`](https://github.com/jovalle/watchtower/commit/fc08eb7c2b4e2b458231fb8da9e41f7428d8092f))
- **setup:** Configure the Plex server at /setup instead of environment variables ([`e95e05c`](https://github.com/jovalle/watchtower/commit/e95e05c429902694ee843f608c1785381890ccc0))

  The server URL, token and machine ID are saved under DATA_PATH/config by the Plex owner using the setup code from the startup log. Settings already imported server-config.server.ts, so the previous commit did not typecheck.

- **titles:** Open TMDB and IMDb titles on library detail pages by exact GUID ([`f156ebc`](https://github.com/jovalle/watchtower/commit/f156ebc8ee8545a5670053464e657a82c7d973ed))

  Watchlist entries no longer offer Play from a title and year match alone.

- **trakt:** Connect Trakt accounts and scrobble playback ([`09f181a`](https://github.com/jovalle/watchtower/commit/09f181aaa595e687e0a0ab3cbc761c4c12e4100f))

  The server owner adds Trakt app credentials under Integrations. Each user links their account with Trakt's device-code flow; tokens are kept server-side per user and refreshed automatically. Playback state changes reported to Plex are mirrored to Trakt scrobble start/pause/stop.

- **ui:** Add the Watchtower logo and toast confirmations in settings ([`bef205f`](https://github.com/jovalle/watchtower/commit/bef205f16189cd126d7a4539c44a7901b3f7a419))

### 🛡️ Security

- **security:** Keep Plex tokens out of the browser ([`b1db40a`](https://github.com/jovalle/watchtower/commit/b1db40a411b3c232c28c6180a830a37c68741c91))

  Details, lists, and watchlist loaders no longer return the Plex token or server URL. Watchlist and New & Popular images from Plex Discover load through /api/plex/discover-image, which attaches the user's plex.tv token server-side; caches holding the old token-bearing URLs are invalidated. The watchlist debug endpoint is limited to the server owner in development and no longer returns a token prefix.

### 🐛 Bug Fixes

- **images:** Restrict image proxy to image paths and allowed hosts ([`d309277`](https://github.com/jovalle/watchtower/commit/d309277a906f551f7e4d97cbe3e5593fd976de60))

  Unauthenticated requests used the admin PLEX_TOKEN for any path and appended it to arbitrary absolute URLs. Limit Plex paths to image prefixes, never forward tokens to external hosts, and only pass through image responses.

- **integrations:** Align Seerr statuses and Trakt auth with current APIs ([`f8fe1e8`](https://github.com/jovalle/watchtower/commit/f8fe1e838fdf31e60c4299345339680a28917384))

  Blocklisted Seerr titles no longer offer a request; deleted titles can be requested again. Trakt OAuth calls use auth.trakt.tv, send a versioned User-Agent, and share one refresh per user because refresh tokens are single-use. Movie scrobbles include title and year, and episodes without a TVDB ID fall back to show IDs with season and episode numbers.

- **player:** Scope playback to owned sessions and harden the stream proxies ([`15c5c67`](https://github.com/jovalle/watchtower/commit/15c5c677cffeaffaf9f6f8a824a7052c24b3c97c))

  Timeline writes are serialized per session and ordered across replacement sessions; HLS and stream proxies follow redirected playlists and honor Range and cancellation. Also adds the autoplay preference and the native receiver picker.

- **trakt:** Read the watchlist client ID from Integrations ([`47cfe27`](https://github.com/jovalle/watchtower/commit/47cfe2778d2bedb12305bb32ac3a6491d5f147f6))

  The Trakt watchlist import now uses the client ID saved in Settings > Integrations, falling back to TRAKT_CLIENT_ID.

### ♻️ Refactoring

- **trakt:** Remove the TRAKT_CLIENT_ID environment fallback ([`8a12e55`](https://github.com/jovalle/watchtower/commit/8a12e5568163ba4dd8429d7bebc9484697a01e61))

### 📚 Documentation

- Add the delivery plan, playback evaluation and implementation handoff ([`3868ec9`](https://github.com/jovalle/watchtower/commit/3868ec919091798d0ecf3e97f44ca61925c5c119))

<details>
<summary><strong>🔧 Maintenance</strong> (4)</summary>

- **deps:** Update actions/checkout action to v6 ([`a224600`](https://github.com/jovalle/watchtower/commit/a2246001602dbe0ba4140f28a3a47b044db6d92c)) by @renovate[bot]
- **deps:** Update actions/setup-node action to v6 ([`d480d4c`](https://github.com/jovalle/watchtower/commit/d480d4c79472afc13dfae2237716cfb962cc8fd1)) by @renovate[bot]
- **deps:** Update dependency node to v24 ([`025a8d1`](https://github.com/jovalle/watchtower/commit/025a8d19f45142f6f6337c0e6ee1b5e15ac5d546)) by @renovate[bot]
- **deps:** Remove unused @tanstack/react-virtual ([`aae18cf`](https://github.com/jovalle/watchtower/commit/aae18cf9107b7a4a3e87bba56fb4a470e1631659))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.8.0
```

**Full Changelog**: [`v1.7.0...v1.8.0`](https://github.com/jovalle/watchtower/compare/v1.7.0...v1.8.0)

<sub>28 commits · 167 days since v1.7.0</sub>

## [1.7.0](https://github.com/jovalle/watchtower/compare/v1.6.0...v1.7.0) (2026-04-13)

### 🚀 Features

- **auth:** Enhance session management with redirect sanitization and meta tags ([`bab3876`](https://github.com/jovalle/watchtower/commit/bab3876f191e4440d404f734c2f26ea493d92bee))

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.7.0
```

**Full Changelog**: [`v1.6.0...v1.7.0`](https://github.com/jovalle/watchtower/compare/v1.6.0...v1.7.0)

<sub>1 commit · 18 days since v1.6.0</sub>

## [1.6.0](https://github.com/jovalle/watchtower/compare/v1.5.0...v1.6.0) (2026-03-26)

### 🚀 Features

- **vote:** Implement private cinema (movie night ranked choice voting) dashboard ([`36676f0`](https://github.com/jovalle/watchtower/commit/36676f00df93758b0db2700bcc82daad735de182))

  feat(vote): create vote layout for authenticated and guest users

  fix(server): silently reject Chrome DevTools well-known probes

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.6.0
```

**Full Changelog**: [`v1.5.0...v1.6.0`](https://github.com/jovalle/watchtower/compare/v1.5.0...v1.6.0)

<sub>1 commit · 78 days since v1.5.0</sub>

## [1.5.0](https://github.com/jovalle/watchtower/compare/v1.4.0...v1.5.0) (2026-01-07)

### 🚀 Features

- **images:** Add server-side resizing for poster and backdrop images ([`49ad481`](https://github.com/jovalle/watchtower/commit/49ad481ba08a6bb76d25019a62392eea387a64db))

### ⚡ Performance

- **watchlist:** Implement deferred loading ([`aa93937`](https://github.com/jovalle/watchtower/commit/aa939379671c912a43572b7367fff7c7c06fdc40))

<details>
<summary><strong>🔧 Maintenance</strong> (1)</summary>

- Add .serena to gitignore and update default client ID ([`ef4b645`](https://github.com/jovalle/watchtower/commit/ef4b645c1a0a75578dfae007f7ab7464e8856ed0))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.5.0
```

**Full Changelog**: [`v1.4.0...v1.5.0`](https://github.com/jovalle/watchtower/compare/v1.4.0...v1.5.0)

<sub>3 commits · 1 day since v1.4.0</sub>

## [1.4.0](https://github.com/jovalle/watchtower/compare/v1.3.0...v1.4.0) (2026-01-06)

### 🚀 Features

- **images:** Add server-side image caching ([`63c0139`](https://github.com/jovalle/watchtower/commit/63c013992dee26cb44e72b813472cb2928def95a))
- **player:** Improve HLS/transcode stream handling ([`c05d1a8`](https://github.com/jovalle/watchtower/commit/c05d1a847d0408aa7ac557be84286f2e524a3cc6))
- **server:** Add custom Express server with structured logging ([`ab8fa12`](https://github.com/jovalle/watchtower/commit/ab8fa1296312fee4298f1de2dde1ff37bda5ff77))
- **streaming:** Add HLS proxy for transcoded video streams ([`bc83d4f`](https://github.com/jovalle/watchtower/commit/bc83d4f3277d8a2fd1b3f337a4c6527194ad30cb))

### 🐛 Bug Fixes

- **server:** Resolve ESLint warning for dynamic import ([`51700e1`](https://github.com/jovalle/watchtower/commit/51700e175d3879f70844bf9b79d51b59142bb82b))

### ♻️ Refactoring

- **ui:** Improve MediaRow scroll for touch devices ([`31237c5`](https://github.com/jovalle/watchtower/commit/31237c5397f160e40c613589d4ea57470307468b))

### 📚 Documentation

- Convert roadmap to checkbox format ([`ffe2b68`](https://github.com/jovalle/watchtower/commit/ffe2b68ffca0e7411e82ffa7678df074deecdb6e))

<details>
<summary><strong>🔧 Maintenance</strong> (2)</summary>

- **build:** Add lockfile sync target ([`e6566ba`](https://github.com/jovalle/watchtower/commit/e6566ba58c66fafd4482501ecad9a0a78de2c9c5))
- **deps:** Add express, lru-cache, react-virtual and sync lockfiles ([`945cd24`](https://github.com/jovalle/watchtower/commit/945cd24bc06bae2ef01d6b2bab47a62b89638946))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.4.0
```

**Full Changelog**: [`v1.3.0...v1.4.0`](https://github.com/jovalle/watchtower/compare/v1.3.0...v1.4.0)

<sub>9 commits · 1 day since v1.3.0</sub>

## [1.3.0](https://github.com/jovalle/watchtower/compare/v1.2.1...v1.3.0) (2026-01-05)

### 🚀 Features

- **auth:** Add server access verification for shared users ([`f634ce7`](https://github.com/jovalle/watchtower/commit/f634ce7a66b3452b6a4cc749467d35d4e75b9793))
- **cache:** Add cache clearing endpoint for server owners ([`ea7dbc7`](https://github.com/jovalle/watchtower/commit/ea7dbc707e632977006771a5454612ba115238c3))
- **ratings:** Add OMDb integration for external ratings display ([`f8c3f5a`](https://github.com/jovalle/watchtower/commit/f8c3f5a3d72b9b46f6c60a27ba624018ac2bad92))
- **settings:** Add per-user watchlist configuration ([`963a8e8`](https://github.com/jovalle/watchtower/commit/963a8e84bc74c38db4d2fdd0226e773170b3b384))
- **watchlist:** Integrate per-user settings for trakt/imdb sources ([`0c478d0`](https://github.com/jovalle/watchtower/commit/0c478d0be020166b98f5eb120fa5dae482eef748))

### 🐛 Bug Fixes

- **mobile:** Prevent white bar artifacts with proper backgrounds and safe-area insets ([`08cf0c0`](https://github.com/jovalle/watchtower/commit/08cf0c08fda3d2354309ab46474787cf2f1c7869))
- **ui:** Update components for new auth context ([`73bac53`](https://github.com/jovalle/watchtower/commit/73bac53aac51b45ece3c3dc0a10748833834d5aa))
- Isolate user-specific cache data to prevent cross-user data leakage ([`d6d738a`](https://github.com/jovalle/watchtower/commit/d6d738a1f8748710f5e47c91268f6ee287132c4f))

### ♻️ Refactoring

- **api:** Migrate plex routes to use server-specific tokens ([`5fe1c53`](https://github.com/jovalle/watchtower/commit/5fe1c53dfa2d5973e191df45d13bb5de0deeab36))
- **config:** Simplify env vars and add per-user settings migration ([`52b4e77`](https://github.com/jovalle/watchtower/commit/52b4e7723d67396766dc42d109897cbc192506e9))
- **plex:** Clean up client and add type definitions ([`3bddced`](https://github.com/jovalle/watchtower/commit/3bddced929db6f9912a2ab09da551384b198d063))
- **routes:** Update app routes for new auth system ([`b8ecda4`](https://github.com/jovalle/watchtower/commit/b8ecda48e5e4eb4519c77b4ed14dc38b027b2ce4))

<details>
<summary><strong>🔧 Maintenance</strong> (1)</summary>

- Add linting configs and update gitignore ([`52f4b4e`](https://github.com/jovalle/watchtower/commit/52f4b4e843a791de171267755e5110b2a4bc8304))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.3.0
```

**Full Changelog**: [`v1.2.1...v1.3.0`](https://github.com/jovalle/watchtower/compare/v1.2.1...v1.3.0)

<sub>13 commits · 3 days since v1.2.1</sub>

## [1.2.1](https://github.com/jovalle/watchtower/compare/v1.2.0...v1.2.1) (2026-01-02)

### 🐛 Bug Fixes

- Proxy absolute image URLs to prevent mixed content errors ([`9f43d3a`](https://github.com/jovalle/watchtower/commit/9f43d3a05d328d9c6f53ab9f04df02de2f2afa3c))

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.2.1
```

**Full Changelog**: [`v1.2.0...v1.2.1`](https://github.com/jovalle/watchtower/compare/v1.2.0...v1.2.1)

<sub>1 commit</sub>

## [1.2.0](https://github.com/jovalle/watchtower/compare/v1.1.0...v1.2.0) (2026-01-02)

### 🚀 Features

- **dashboard:** Add real-time streaming sessions dashboard ([`ad5e618`](https://github.com/jovalle/watchtower/commit/ad5e61812a56237964aca558e89734fac47bb839))
- **library:** Add macOS dock-style magnification to alphabet sidebar ([`f37723f`](https://github.com/jovalle/watchtower/commit/f37723f5753641546d004a44febc6780765d1f96))
- **plex:** Add streaming session types and API client methods ([`f7c0910`](https://github.com/jovalle/watchtower/commit/f7c0910bcc50f5b0f07d09104338bb6f26358bd8))
- **pwa:** Add progressive web app support with install prompt ([`0550301`](https://github.com/jovalle/watchtower/commit/0550301ef8b882e071bea2bdb9e2643ababdd663))
- **ui:** Add FilterDropdown multi-select component ([`1db9f18`](https://github.com/jovalle/watchtower/commit/1db9f18f2bf9a1986384ebe853b5462f56c7d645))

### 🐛 Bug Fixes

- **player:** Use named imports from hls.js to resolve lint warnings ([`d7a8d4d`](https://github.com/jovalle/watchtower/commit/d7a8d4dcefe5da6ceec8237cc32847df7cc09a78))
- **ui:** Minor tweaks to header, library, and media components ([`c59ac06`](https://github.com/jovalle/watchtower/commit/c59ac0671efe60379d16c28c62023d079f9e9283))
- **ui:** Improve ProxiedImage empty src handling and cache detection ([`3a9d329`](https://github.com/jovalle/watchtower/commit/3a9d32966bcac84ce1b92b7ff5f0028e2cf4a5a2))

### ♻️ Refactoring

- **media:** Reorganize media detail and watchlist pages ([`5f17298`](https://github.com/jovalle/watchtower/commit/5f17298512b669f705a4e9c49fbff18bd1d5be05))

<details>
<summary><strong>🔧 Maintenance</strong> (2)</summary>

- **docker:** Harden container security and update env config ([`8f9715a`](https://github.com/jovalle/watchtower/commit/8f9715ab0a0a11232bf15491903d54992dc5526f))
- Add frozen lockfile check and ci target ([`7ee7959`](https://github.com/jovalle/watchtower/commit/7ee7959c0281edf36f4f9853b732c3ba7054bbd4))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.2.0
```

**Full Changelog**: [`v1.1.0...v1.2.0`](https://github.com/jovalle/watchtower/compare/v1.1.0...v1.2.0)

<sub>11 commits · 1 day since v1.1.0</sub>

## [1.1.0](https://github.com/jovalle/watchtower/compare/v1.0.2...v1.1.0) (2026-01-01)

### 🚀 Features

- **docker:** Default PLEX_SERVER_URL to http://plex:32400 ([`e811c60`](https://github.com/jovalle/watchtower/commit/e811c60da07b624d5ca96ce1d07aebe2fb52028d))
- Add Plex image proxy API and ProxiedImage component ([`bbc6b5c`](https://github.com/jovalle/watchtower/commit/bbc6b5c3bf601748207bd7ba7f9f2464aa754a6c))
- Add startup health checks and Plex connectivity logging ([`04abb94`](https://github.com/jovalle/watchtower/commit/04abb9488b0a69236f0361e1784248eb5c85467d))

### ♻️ Refactoring

- **auth:** Remove login page, redirect directly to Plex OAuth ([`eec1ea4`](https://github.com/jovalle/watchtower/commit/eec1ea4b2a692c07b4197006b22e4829df61714b))
- **media:** Replace img tags with ProxiedImage component ([`e2a10a2`](https://github.com/jovalle/watchtower/commit/e2a10a2ffa0c976cc5b045b0fa5c0ac09970a62c))
- **routes:** Use shared image proxy helpers across all routes ([`0bc9ffa`](https://github.com/jovalle/watchtower/commit/0bc9ffaa7ee5d69b3ad457c85d9a25352413ded6))

### 📚 Documentation

- Generating favicons ([`91cfef0`](https://github.com/jovalle/watchtower/commit/91cfef09e913ea5e312c8685d163862ae2ffec31))

<details>
<summary><strong>🔧 Maintenance</strong> (8)</summary>

- Update favicon assets ([`091d943`](https://github.com/jovalle/watchtower/commit/091d9438970fa5d92f741739e337ad9b41de67c9))
- **release:** Switch from exec to npm plugin for version bumping ([`c7a92d2`](https://github.com/jovalle/watchtower/commit/c7a92d2f28c7aaa12a83ee41f8622c0eb1072654))
- Add Makefile with dev, build, test, and docker targets ([`7d1a670`](https://github.com/jovalle/watchtower/commit/7d1a670534eb2be7e1dc300362587cdd8f582cb1))
- Make lint ([`7641053`](https://github.com/jovalle/watchtower/commit/7641053c926a85d32348c55b5d0bc1a7b0c6b41a))
- Ensure lint-free to commit ([`82b0c90`](https://github.com/jovalle/watchtower/commit/82b0c90a816a4c33a1114e6fec24fbf1b5750c67))
- Trigger release on successful builds ([`a2661b5`](https://github.com/jovalle/watchtower/commit/a2661b5a3e09b5eeedeba16859dad2288c4dc18d))
- **docker:** Skip lifecycle scripts in prod install to avoid missing husky ([`799092e`](https://github.com/jovalle/watchtower/commit/799092e9226fb3c20133bbac6f0f731e6dde84f8))
- **release:** Create .release-version file for docker publish trigger ([`ea2c7ab`](https://github.com/jovalle/watchtower/commit/ea2c7ab9bc663f881e19f047db1314b25144a26f))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.1.0
```

**Full Changelog**: [`v1.0.2...v1.1.0`](https://github.com/jovalle/watchtower/compare/v1.0.2...v1.1.0)

<sub>15 commits · 1 day since v1.0.2</sub>

## [1.0.2](https://github.com/jovalle/watchtower/compare/v1.0.1...v1.0.2) (2025-12-31)

### 🐛 Bug Fixes

- Set lighter mango for hover (used dittotones to generate palette) ([`88137e1`](https://github.com/jovalle/watchtower/commit/88137e14005f96cf79522788fb94003b838db13b))
- Docker compose build/up ([`6c06295`](https://github.com/jovalle/watchtower/commit/6c062951fb919cd38cec9c0fbfdaa74c11c2534c))

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.0.2
```

**Full Changelog**: [`v1.0.1...v1.0.2`](https://github.com/jovalle/watchtower/compare/v1.0.1...v1.0.2)

<sub>2 commits · 2 days since v1.0.1</sub>

## [1.0.1](https://github.com/jovalle/watchtower/compare/v1.0.0...v1.0.1) (2025-12-29)

### 🐛 Bug Fixes

- Enable git credentials for semantic-release ([`6014f61`](https://github.com/jovalle/watchtower/commit/6014f6196e0ccdcf65cb1118296a520547a7649b))

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.0.1
```

**Full Changelog**: [`v1.0.0...v1.0.1`](https://github.com/jovalle/watchtower/compare/v1.0.0...v1.0.1)

<sub>1 commit</sub>

## [1.0.0](https://github.com/jovalle/watchtower/releases/tag/v1.0.0) (2025-12-29)

### ♻️ Refactoring

- First release ([`8e706a5`](https://github.com/jovalle/watchtower/commit/8e706a58eead5a163b4281f3d2c1d23ae31990ae))

<details>
<summary><strong>🔧 Maintenance</strong> (1)</summary>

- Add README ([`ba2e5b4`](https://github.com/jovalle/watchtower/commit/ba2e5b4b182130c39fd92e5f2de9059dcb297b70))

</details>

### 🐳 Upgrade

```sh
docker pull ghcr.io/jovalle/watchtower:1.0.0
```

<sub>2 commits</sub>

