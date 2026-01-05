## [1.3.0](https://github.com/jovalle/watchtower/compare/v1.2.1...v1.3.0) (2026-01-05)

### 🚀 Features

* **auth:** add server access verification for shared users ([f634ce7](https://github.com/jovalle/watchtower/commit/f634ce7a66b3452b6a4cc749467d35d4e75b9793))
* **cache:** add cache clearing endpoint for server owners ([ea7dbc7](https://github.com/jovalle/watchtower/commit/ea7dbc707e632977006771a5454612ba115238c3))
* **ratings:** add OMDb integration for external ratings display ([f8c3f5a](https://github.com/jovalle/watchtower/commit/f8c3f5a3d72b9b46f6c60a27ba624018ac2bad92))
* **settings:** add per-user watchlist configuration ([963a8e8](https://github.com/jovalle/watchtower/commit/963a8e84bc74c38db4d2fdd0226e773170b3b384))
* **watchlist:** integrate per-user settings for trakt/imdb sources ([0c478d0](https://github.com/jovalle/watchtower/commit/0c478d0be020166b98f5eb120fa5dae482eef748))

### 🐛 Bug Fixes

* isolate user-specific cache data to prevent cross-user data leakage ([d6d738a](https://github.com/jovalle/watchtower/commit/d6d738a1f8748710f5e47c91268f6ee287132c4f))
* **mobile:** prevent white bar artifacts with proper backgrounds and safe-area insets ([08cf0c0](https://github.com/jovalle/watchtower/commit/08cf0c08fda3d2354309ab46474787cf2f1c7869))
* **ui:** update components for new auth context ([73bac53](https://github.com/jovalle/watchtower/commit/73bac53aac51b45ece3c3dc0a10748833834d5aa))

### ♻️ Refactoring

* **api:** migrate plex routes to use server-specific tokens ([5fe1c53](https://github.com/jovalle/watchtower/commit/5fe1c53dfa2d5973e191df45d13bb5de0deeab36))
* **config:** simplify env vars and add per-user settings migration ([52b4e77](https://github.com/jovalle/watchtower/commit/52b4e7723d67396766dc42d109897cbc192506e9))
* **plex:** clean up client and add type definitions ([3bddced](https://github.com/jovalle/watchtower/commit/3bddced929db6f9912a2ab09da551384b198d063))
* **routes:** update app routes for new auth system ([b8ecda4](https://github.com/jovalle/watchtower/commit/b8ecda48e5e4eb4519c77b4ed14dc38b027b2ce4))

## [1.2.1](https://github.com/jovalle/watchtower/compare/v1.2.0...v1.2.1) (2026-01-02)

### 🐛 Bug Fixes

* proxy absolute image URLs to prevent mixed content errors ([9f43d3a](https://github.com/jovalle/watchtower/commit/9f43d3a05d328d9c6f53ab9f04df02de2f2afa3c))

## [1.2.0](https://github.com/jovalle/watchtower/compare/v1.1.0...v1.2.0) (2026-01-02)

### 🚀 Features

* **dashboard:** add real-time streaming sessions dashboard ([ad5e618](https://github.com/jovalle/watchtower/commit/ad5e61812a56237964aca558e89734fac47bb839))
* **library:** add macOS dock-style magnification to alphabet sidebar ([f37723f](https://github.com/jovalle/watchtower/commit/f37723f5753641546d004a44febc6780765d1f96))
* **plex:** add streaming session types and API client methods ([f7c0910](https://github.com/jovalle/watchtower/commit/f7c0910bcc50f5b0f07d09104338bb6f26358bd8))
* **pwa:** add progressive web app support with install prompt ([0550301](https://github.com/jovalle/watchtower/commit/0550301ef8b882e071bea2bdb9e2643ababdd663))
* **ui:** add FilterDropdown multi-select component ([1db9f18](https://github.com/jovalle/watchtower/commit/1db9f18f2bf9a1986384ebe853b5462f56c7d645))

### 🐛 Bug Fixes

* **player:** use named imports from hls.js to resolve lint warnings ([d7a8d4d](https://github.com/jovalle/watchtower/commit/d7a8d4dcefe5da6ceec8237cc32847df7cc09a78))
* **ui:** improve ProxiedImage empty src handling and cache detection ([3a9d329](https://github.com/jovalle/watchtower/commit/3a9d32966bcac84ce1b92b7ff5f0028e2cf4a5a2))
* **ui:** minor tweaks to header, library, and media components ([c59ac06](https://github.com/jovalle/watchtower/commit/c59ac0671efe60379d16c28c62023d079f9e9283))

### ♻️ Refactoring

* **media:** reorganize media detail and watchlist pages ([5f17298](https://github.com/jovalle/watchtower/commit/5f17298512b669f705a4e9c49fbff18bd1d5be05))

## [1.1.0](https://github.com/jovalle/watchtower/compare/v1.0.2...v1.1.0) (2026-01-01)

### 🚀 Features

* add Plex image proxy API and ProxiedImage component ([bbc6b5c](https://github.com/jovalle/watchtower/commit/bbc6b5c3bf601748207bd7ba7f9f2464aa754a6c))
* add startup health checks and Plex connectivity logging ([04abb94](https://github.com/jovalle/watchtower/commit/04abb9488b0a69236f0361e1784248eb5c85467d))
* **docker:** default PLEX_SERVER_URL to http://plex:32400 ([e811c60](https://github.com/jovalle/watchtower/commit/e811c60da07b624d5ca96ce1d07aebe2fb52028d))

### ♻️ Refactoring

* **auth:** remove login page, redirect directly to Plex OAuth ([eec1ea4](https://github.com/jovalle/watchtower/commit/eec1ea4b2a692c07b4197006b22e4829df61714b))
* **media:** replace img tags with ProxiedImage component ([e2a10a2](https://github.com/jovalle/watchtower/commit/e2a10a2ffa0c976cc5b045b0fa5c0ac09970a62c))
* **routes:** use shared image proxy helpers across all routes ([0bc9ffa](https://github.com/jovalle/watchtower/commit/0bc9ffaa7ee5d69b3ad457c85d9a25352413ded6))

## [1.0.2](https://github.com/jovalle/watchtower/compare/v1.0.1...v1.0.2) (2025-12-31)

### 🐛 Bug Fixes

* docker compose build/up ([6c06295](https://github.com/jovalle/watchtower/commit/6c062951fb919cd38cec9c0fbfdaa74c11c2534c))
* set lighter mango for hover (used dittotones to generate palette) ([88137e1](https://github.com/jovalle/watchtower/commit/88137e14005f96cf79522788fb94003b838db13b))

## [1.0.1](https://github.com/jovalle/watchtower/compare/v1.0.0...v1.0.1) (2025-12-29)

### 🐛 Bug Fixes

* enable git credentials for semantic-release ([6014f61](https://github.com/jovalle/watchtower/commit/6014f6196e0ccdcf65cb1118296a520547a7649b))

## 1.0.0 (2025-12-29)

### ♻️ Refactoring

* first release ([8e706a5](https://github.com/jovalle/watchtower/commit/8e706a58eead5a163b4281f3d2c1d23ae31990ae))
