# TV details, ratings and cast profiles

Implemented in the existing uncommitted `codex/android-tv` worktree. The prior native audit, player fixes, main layout audit and separate Watch Together work are preserved. No dependencies, commits or pushes were added.

## Result

| Request | Implementation and observed behavior |
| --- | --- |
| Focus labels must not displace controls | The shared action Box had expanded to fit its caption. Symbol actions now have a fixed40dp face/48dp slot; labels draw in the caption band. Tests and real-library measurements compare all six button rectangles while focus crosses Start Over, Watchlist, Rate, Watched and More at normal and1.3× text. Primary viewing actions retain their readable labels. |
| Spaced metadata without bullets | Facts are separate layout items: year, outlined certification and compact runtime. Genres occupy their own wrapping group. Padding/gaps replace joined bullet strings; long text wraps within the hero. |
| Provider badges and ratings | Native vector marks identify IMDb, TMDB, TVDB and Rotten Tomatoes. Genuine sourced scores retain explicit10-point/percentage scales; RT critics and audience remain separate. IMDb/TMDB/TVDB are canonicalized to one score each. Valid optional enrichment replaces cached scores; invalid/missing values preserve the Plex baseline. Following the user’s badge refinement, identifiers without valid scores are omitted entirely. Unknown-source scores remain labeled Plex. |
| Details/playback must remain responsive | Optional OMDb/TMDB ratings load through a separate endpoint and ViewModel. Required details/playback do not wait for them. Identity/generation fences reject late profile/retry results. |
| Cast portraits must open profiles | Cast cards support pointer, Enter and D-pad with circular focus treatment. IDs are scoped Plex actor IDs or a stable name/role hash; legacy payloads without IDs explain profile unavailability. |
| Biography, known works and library titles | The person page has a photo, supplied biography/facts, Known For, In Your Library and filmography. Library works span all accessible movie/show sections with pagination and GUIDs. External identity is derived from the authorized title's own TMDB credits, including episode guests; ambiguous identities remain library-only. Provider Known For highlights are read only for the already-verified person ID; namesakes are ignored, and unavailable highlights fall back to cast credits. The complete filmography remains separate. Local matches require type plus exact TMDB ID. Restricted/discovery-disabled profiles remain library-only. |
| Back and long content | Saved shelf selection/scroll restores the work after details and the selected cast portrait after leaving the person page. Returning cast focus suppresses the initial Play focus request. Long biography text has bounded remote scrolling and lets focus leave at its ends. Retry/partial/empty states retain usable content and Back. |

## Contracts and validation

New additive contracts are `ProviderRating`, `MediaRatingsResponse` and `PersonProfile`. `Person.id` defaults null and `MediaDetail.ratings` defaults empty for older servers. Updated golden fixtures and explicit legacy decoding tests cover the new fields.

Both new routes use existing native authentication and final principal checks. Review caught unvalidated rating selectors reaching a Plex path: the ratings endpoint now accepts numeric local keys only, and shared `PlexClient.getMetadata` rejects path/query/fragment/percent selectors before any fetch while retaining numeric/opaque IDs. Mock tests prove malformed input cannot trigger upstream requests; no real mutation was attempted.

Provider artwork sources and conversion are documented in `android-tv/PROVIDER-MARKS.md`. No raster generation or new rendering library is involved.

## Verification

The broad results below cover the original details/profile implementation. The subsequent badge-only refinement is recorded separately.

- 144native JVM tests passed, including compatibility, independent ratings loading, stale identities and retry generations.
- 137complete emulator tests passed, including caption geometry, metadata/badges, long biography, partial profiles, local/external work callbacks and both focus-restoration levels.
- 559web/API tests across93files passed; type checking, changed-file ESLint and production build passed.
- Debug/release lint report zero errors. Existing/nonblocking warnings remain (53debug/52release).
- Unsigned release APK/AAB, R8 and16KB alignment across all four shipped native ABIs passed.
- Real paired-library details show IMDb8.8/10, RT critics97%, RT audience97%, TMDB8.5/10 with cached Plex metadata preserved and fresh TMDB/OMDb enrichment verified against the configured live providers. A later refinement omits all badges without valid scores, including the previously shown TVDB metadata-only badge. Facts and long captions were inspected at1.0/1.3×; all six measured button bounds remain unchanged across focus moves.
- A real Lee Van Cleef cast selection opened the matching profile and library title. Back restored that title and then Lee's source cast portrait. Live provider checks additionally verified populated biography/facts, Known For and filmography, opening an unavailable work without submitting a request, and restoring focus after both external and local details. Native fixtures cover missing/malformed providers and identity changes.

Raw RED/GREEN/build/device/paired logs and screenshots are under `tmp/tv-details-2026-11-05/`. The pre-change checkpoint is `pre-details-source.tgz`; the final receipt binds artifacts to their hashes. Final source review found no remaining concrete blocker. A separate gpt-6-astra artifact review verified all209source hashes and fourbuild hashes and found no discrepancies. Its report is `tmp/tv-details-2026-11-05/evidence-review.md`; no full transcript was supplied for independent authorization/secret-handling review. The append-only decision trail is `tmp/tv-redesign/decisions.tsv`, phase `details-*`.

## Badge-only refinement

Provider identifiers alone no longer render a badge. All providers require a finite, in-range rating; a rated TVDB series still displays its badge. The updated five-test metadata suite reproduced two failures before the change and passed afterward; debug build/lint passed and the updated APK was installed. Evidence is in `tmp/tv-badges-values-2026-11-05/`. Earlier receipts and source hashes describe the pre-refinement implementation rather than this small follow-up. No API, credential or playback changes were needed.

## Watchlist state follow-up

The details mapper's nullable membership had been interpreted as absent, and both states shared the hollow icon. Membership now loads independently via the authenticated `/media/:ratingKey/watchlist` endpoint using the active account's complete paginated Plex watchlist. It does not gate details/playback. Saved items use a filled bookmark and Remove; confirmed absent items use Add; unknown/error uses Check Watchlist rather than a mutation. Successful writes update current and cached show state only after confirmation. Failed writes retain the confirmed state, and episode-to-show navigation preserves or reloads membership. Unsupported episode/season watchlist actions are omitted.

Final checks for this follow-up:152full JVM tests,566web/API tests, debug build/lint and22relevant emulator tests on the final APK passed. The whole141-device suite passed before the final series-cache correction and is explicitly retained as earlier evidence. Live existing Triangle of Sadness and The Witcher memberships, including episode-preview→show return, were verified without watchlist mutations or playback. Detailed proof and current hashes are in `tmp/tv-watchlist-state-2026-11-05/acceptance-results.json`; earlier receipt hashes remain historical. Fresh source review caught and closed the series-cache gap. Release/signing and hardware checks were not repeated.

## Provider connection and release boundary

The user explicitly approved importing only `TMDB_API_KEY` and `OMDB_API_KEY` from the existing local Watchtower configuration into cloud Infisical after automatic review rejected the initially unapproved import. The approved import succeeded in Technis → Watchtower → Development (`dev`, `/`, project `1c2b6cea-09af-462b-8355-91222596c699`). Neither value was printed or persisted in a new plaintext file, and unrelated secrets were not fetched. The original local configuration is unchanged.

The provider-enabled sidecar on port9002 is launched with `tmp/tv-details-2026-11-05/launch-with-infisical.mjs`. It fetches only those two named secrets through the authenticated CLI, validates them in memory and passes them directly to the consuming server process. Public metadata and project connection evidence are in `live-provider-check.json` and `provider-project.json`; neither contains credentials. Live TMDB biography, facts and works and fresh TMDB/OMDb scores have been exercised against the paired library. Port9001 and the separate main layout audit are untouched.

To restart the isolated sidecar after stopping its current process, from this worktree run:

```sh
NODE_ENV=production DATA_PATH=./tmp/tv-real/data PORT=9002 SECURE_COOKIES=false node tmp/tv-details-2026-11-05/launch-with-infisical.mjs
```

The authenticated Technis CLI profile is required; the launcher fetches only the named Development secrets rather than exporting the environment.

No real request, issue, rating, watched-state or playlist mutation was performed. Physical-TV hardware validation and production signing/distribution remain outside these emulator/unsigned-release checks.
