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
