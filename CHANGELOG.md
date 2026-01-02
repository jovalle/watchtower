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
