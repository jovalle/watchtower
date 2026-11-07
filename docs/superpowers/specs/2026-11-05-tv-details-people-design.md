# TV details, ratings and cast profiles

Continue the authorized Android TV refinement in the existing worktree. Preserve the current Watchtower/Netflix styling and prior audit fixes. The supplied screenshots show a focused label widening an action slot and a tightly joined metadata sentence; they are visual evidence, not independent instructions.

## Approach

Reuse the shared TV action, native catalog/API, scoped Plex client, TMDB and OMDb clients. Fixed symbol slots with overflowing captions solve the actual label measurement bug; widening all slots wastes space. Structured metadata groups replace bullet-joined strings. Ratings carry their real provider and scale; independent optional enrichment cannot delay details or playback. Person pages are rooted in a cast member of an authorized title, with scoped library matches and optional TMDB biography/credits. No global name-only person search or guessed rating attribution.

## Presentation and behavior

- Ordinary symbol faces remain40dp with a stable48dp slot including existing right padding. Focus captions occupy the existing caption band and cannot move siblings at normal or1.3× text size. Existing primary labeled actions and player32dp actions keep their roles.
- Details show year, outlined certification and readable runtime as separately spaced metadata; genres use their own spaced row. No bullet dividers. Long content wraps within the hero rather than squeezing fields together.
- IMDb/TMDB/TVDB/Rotten Tomatoes provider marks accompany genuine scores where supplied. Percentage and10-point scales stay explicit. Provider badges appear only with a valid score; identifiers alone do not produce a badge. Unknown Plex attribution remains labeled honestly. Failed/missing optional providers leave available metadata and playback usable.
- Selecting a cast portrait opens a native person page with photo, biography/facts, Known For, In Your Library and filmography. Local titles open local details; unavailable works open the existing external title flow. Identity, discovery preference and restricted-profile boundaries apply. Back restores the selected cast member; loading/error/partial/empty states have usable recovery.

## Contract

Add defaulted `Person.id` and `MediaDetail.ratings`. `ProviderRating` is `{source: imdb|tmdb|tvdb|rotten_tomatoes|plex, kind: rating|audience|critic, value:number, maxValue:10|100}`. `MediaRatingsResponse` is `{ratings:ProviderRating[],warnings:string[]}` from `GET /api/v1/media/:ratingKey/ratings`.

`GET /api/v1/media/:ratingKey/cast/:personId` returns `PersonProfile`: id,name,role,thumbUrl,biography,birthday,deathday,placeOfBirth,knownForDepartment; nullable facts; `knownFor`, `library`, `filmography` as MediaSummary arrays; `warnings` as strings. A stable person ID is derived from the scoped Plex role ID, otherwise a hash of its name/role. Server re-reads the authorized source cast and accepts only a matching member. TMDB identity is resolved through that title's credits and a unique matching cast name/character, including episode guests; ambiguous matches remain library-only. It is never guessed from a global name search. After this identity check, the provider Known For lookup may search the verified name but accepts only the already-verified person ID; other namesakes cannot supply works. Missing provider highlights fall back to the cast credits without dropping biography or filmography.

## Boundaries and verification

No commits, push, new dependencies, unrelated web redesign, live request/issue/rating/watched/list mutations, or changes to main/Watch Together. Use Infisical only for required real provider testing through existing configuration; never print/persist secret values. Root owns Gradle, emulator and server processes.

Observe focused RED tests before implementation; verify fixed button/label geometry across focus changes and text scales; test provider attribution/scales/failures, scoped person identity/library/discovery and stale-profile results. Run native/API checks and inspect rendered real detail/person pages and D-pad/Back navigation. Physical hardware and signing remain separate.

References: [Plex Discover Credits](https://support.plex.tv/articles/discover-credits/), [TMDB combined credits](https://developer.themoviedb.org/reference/person-combined-credits).
