# TV backend E2E harness

This harness uses only isolated fake credentials and data under `./tmp/tv-e2e`.

```sh
bun scripts/tv-e2e/generate-media.ts
bun scripts/tv-e2e/fake-pms.ts 32499
bun scripts/tv-e2e/seed.ts > ./tmp/tv-e2e/token.txt
just build
NODE_ENV=production DATA_PATH=./tmp/tv-e2e/data PORT=9031 SECURE_COOKIES=false node --import tsx server.ts
TOKEN=$(head -1 ./tmp/tv-e2e/token.txt)
curl -sS http://127.0.0.1:9031/api/v1/instance
curl -sS -H "Authorization: Bearer $TOKEN" http://127.0.0.1:9031/api/v1/me
curl -sS -H "Authorization: Bearer $TOKEN" -H 'X-Watchtower-Identity-Version: 1' http://127.0.0.1:9031/api/v1/libraries
```