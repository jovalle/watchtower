# TV details and people implementation plan

> Execute the already-authorized autonomous workflow; root integrates independent backend/person tasks and owns all native/device/server checks. Keep work uncommitted.

**Goal:** Stable action labels, readable metadata and truthful provider scores, with navigable cast profiles and works.
**Architecture:** Existing Compose/Media3/native catalog patterns; additive DTOs and routes; optional TMDB/OMDb enrichment; no new dependencies.
**Spec:** docs/superpowers/specs/2026-11-05-tv-details-people-design.md.

## Review focus

Long captions at1.3× must not alter neighboring bounds. Missing/unknown/malformed provider ratings must not be misattributed or block playback. Duplicate person names must not select the wrong biography. Restricted/changed profiles must not leak library or discovery results. Back/refresh/error must retain the selected cast/work and a reachable recovery action.

## Tasks and ownership

- [x] Root: checkpoint; define shared TS/Kotlin additive types and API/data-source methods, keeping legacy constructor/default compatibility. Add fixtures for ratings and a person profile.
- [x] Ratings backend worker: RED/GREEN source attribution and scale tests; Plex-supplied rating mapping, optional independently loaded OMDb/TMDB endpoint, configuration/outage fallbacks and principal fences. Own rating-specific server files/tests and narrow catalog mapper edits. Root owns contract declarations.
- [x] People backend worker: RED/GREEN authorized-cast lookup, same-name ambiguity, all scoped libraries, episode guests, discovery/restriction, missing config/upstream and identity fences. Own new person service/route, TMDB person methods/types and tests; consume root contracts/catalog cast-ID helper.
- [x] People UI worker: native person profile screen/state/route with biography, shelves, local/external callbacks, partial/error/retry/empty and identity cancellation. Add tests for Back/work navigation and stale results. Own new PersonProfiles files/strings/tests; root wires AppRoot and source cast.
- [x] Root: action geometry regression RED at1.0/1.3; fix shared slot measurement; metadata/badge components and independent ratings loading with regressions. Wire actionable cast and focus restoration plus person route.
- [x] Root: focused/full native/API checks, rendered detail/provider/person matrix and D-pad/Back; release checks appropriate to changes, fresh independent review, handoff and evidence. Leave emulator stopped on Home.

Final checks: 144 JVM,137 emulator and559 web/API tests pass; type checking, changed-file ESLint, debug/release lint, production build, unsigned APK/AAB and four-ABI16KB alignment pass. Explicit cloud import approval resolved the initial automatic rejection; only the two approved provider keys were imported and passed directly from Infisical to the sidecar. Live provider biography/facts, signature-film Known For, full filmography, local/external details and both Back paths pass. The final source and artifact hashes are recorded in acceptance-results.json/source-sha256.json. Emulator is at normal text size on Home, with no active playback.
