import type { PlexMediaItem, PlexMetadata, PlexRole } from "~/lib/plex/types";
import { getUserSettings } from "~/lib/settings/storage.server";
import { createTMDBClient, type TMDBClient } from "~/lib/tmdb/client.server";
import type { TMDBPersonCredit } from "~/lib/tmdb/types";
import { castPersonId, imageUrl, mediaSummary, nativePlexClient, plexData } from "./catalog.server";
import type { MediaSummary, PersonProfile } from "./contract";
import { NativeError } from "./http.server";
import type { NativePrincipal } from "./principal.server";

const TMDB_UNAVAILABLE = "Biography or filmography is temporarily unavailable. Retry to load more information.";
const LIBRARY_PARTIAL = "Some library works could not be loaded. Results are incomplete; retry to refresh.";

function externalGuid(metadata: PlexMediaItem, provider: "tmdb" | "imdb"): string | null {
  return metadata.Guid?.find((item) => item.id.startsWith(`${provider}://`))?.id.slice(provider.length + 3) ?? null;
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

async function titleIdentity(tmdb: TMDBClient, source: PlexMetadata): Promise<{ id: number; type: "movie" | "show" } | null> {
  const type = source.type === "movie" ? "movie" : source.type === "show" ? "show" : null;
  if (!type) return null;
  const id = externalGuid(source, "tmdb");
  if (id && /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0) return { id: Number(id), type };
  const imdb = externalGuid(source, "imdb");
  if (!imdb || !/^tt\d+$/.test(imdb)) return null;
  const result = await tmdb.findByIMDB(imdb);
  if (!result.success) throw new Error("TMDB unavailable");
  return result.data?.type === type ? { id: result.data.id, type } : null;
}

function creditDate(credit: TMDBPersonCredit): string {
  return (credit.media_type === "movie" ? credit.release_date : credit.first_air_date) ?? "";
}

function uniqueCredits(credits: TMDBPersonCredit[]): TMDBPersonCredit[] {
  const works = new Map<string, TMDBPersonCredit>();
  for (const credit of credits) {
    if (!credit || (credit.media_type !== "movie" && credit.media_type !== "tv") || !Number.isSafeInteger(credit.id) || credit.id <= 0 || credit.adult) continue;
    const title = credit.media_type === "movie" ? credit.title : credit.name;
    if (typeof title !== "string" || !title.trim()) continue;
    const key = `${credit.media_type}:${credit.id}`;
    if (!works.has(key) || (credit.popularity ?? 0) > (works.get(key)!.popularity ?? 0)) works.set(key, credit);
  }
  return [...works.values()];
}

function creditSummary(credit: TMDBPersonCredit, local: PlexMediaItem[]): MediaSummary {
  const type = credit.media_type === "movie" ? "movie" : "show";
  const match = local.find((item) => item.type === type && externalGuid(item, "tmdb") === String(credit.id));
  if (match) return mediaSummary(match);
  const date = creditDate(credit);
  return {
    ratingKey: null, type, title: credit.media_type === "movie" ? credit.title : credit.name,
    year: /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null,
    posterUrl: imageUrl(credit.poster_path ? `https://image.tmdb.org/t/p/w500${credit.poster_path}` : undefined, 400, 600),
    backdropUrl: imageUrl(credit.backdrop_path ? `https://image.tmdb.org/t/p/w1280${credit.backdrop_path}` : undefined, 1280, 720),
    thumbUrl: null, durationMs: null, viewOffsetMs: null, viewCount: 0, leafCount: null,
    viewedLeafCount: null, contentRating: null, showTitle: null, seasonNumber: null, episodeNumber: null,
    parentRatingKey: null, grandparentRatingKey: null, summary: credit.overview ?? null,
    external: { provider: "tmdb", id: String(credit.id), type },
  };
}

async function enrichPerson(
  profile: PersonProfile,
  source: PlexMetadata,
  role: PlexRole,
  local: PlexMediaItem[],
  client: ReturnType<typeof nativePlexClient>,
): Promise<void> {
  const tmdb = createTMDBClient();
  if (!tmdb) {
    profile.warnings.push("Biography and filmography are unavailable. Titles from your library are shown below.");
    return;
  }
  let title = source;
  let episode: { season: number; episode: number } | undefined;
  if (source.type === "episode") {
    if (!source.grandparentRatingKey || !Number.isSafeInteger(source.parentIndex) || !Number.isSafeInteger(source.index) || source.parentIndex! < 0 || source.index! < 1) {
      profile.warnings.push("Extended profile information is unavailable for this episode. Titles from your library are shown below.");
      return;
    }
    const parent = await client.getMetadata(source.grandparentRatingKey);
    if (!parent.success) {
      if (parent.error.status === 401) plexData(parent);
      profile.warnings.push(TMDB_UNAVAILABLE);
      return;
    }
    title = parent.data;
    if (title.type !== "show") {
      profile.warnings.push("Extended profile information is unavailable for this episode. Titles from your library are shown below.");
      return;
    }
    episode = { season: source.parentIndex!, episode: source.index! };
  }
  const identity = await titleIdentity(tmdb, title);
  if (!identity) {
    profile.warnings.push("Extended profile information could not be verified. Titles from your library are shown below.");
    return;
  }
  const cast = await tmdb.getTitleCast(identity.type, identity.id, episode);
  if (!cast.success) {
    profile.warnings.push(TMDB_UNAVAILABLE);
    return;
  }
  const matches = [...new Set(cast.data.filter((person) =>
    Number.isSafeInteger(person.id) && person.id > 0 && typeof person.name === "string" &&
    normalized(person.name) === normalized(role.tag) &&
    (!role.role?.trim() || (typeof person.character === "string" && normalized(person.character) === normalized(role.role)))
  ).map((person) => person.id))];
  if (matches.length !== 1) {
    profile.warnings.push("Extended profile information could not be verified. Titles from your library are shown below.");
    return;
  }
  const [details, credits, knownFor] = await Promise.all([
    tmdb.getPerson(matches[0]), tmdb.getPersonCredits(matches[0]), tmdb.getPersonKnownFor(matches[0], role.tag),
  ]);
  if (details.success && details.data.id === matches[0] && normalized(details.data.name) === normalized(role.tag)) {
    const person = details.data;
    profile.biography = person.biography || null;
    profile.birthday = person.birthday ?? null;
    profile.deathday = person.deathday ?? null;
    profile.placeOfBirth = person.place_of_birth ?? null;
    profile.knownForDepartment = person.known_for_department ?? null;
    if (person.profile_path) profile.thumbUrl = imageUrl(`https://image.tmdb.org/t/p/w500${person.profile_path}`, 400, 600);
  } else profile.warnings.push(TMDB_UNAVAILABLE);
  const all = credits.success ? uniqueCredits(credits.data) : [];
  const curated = knownFor.success && knownFor.data ? uniqueCredits(knownFor.data) : [];
  profile.knownFor = (curated.length ? curated : [...all].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.id - b.id))
    .slice(0, 12).map((item) => creditSummary(item, local));
  if (credits.success) {
    profile.filmography = [...all].sort((a, b) => creditDate(b).localeCompare(creditDate(a)) ||
      (a.media_type === "movie" ? a.title : a.name).localeCompare(b.media_type === "movie" ? b.title : b.name) || a.id - b.id).map((item) => creditSummary(item, local));
  } else profile.warnings.push(TMDB_UNAVAILABLE);
}

export async function getPersonProfile(principal: NativePrincipal, ratingKey: string, personId: string): Promise<PersonProfile> {
  if (!/^\d+$/.test(ratingKey) || !/^(?:plex:\d+|name:[a-f0-9]{16})$/.test(personId) ||
    (personId.startsWith("plex:") && !Number.isSafeInteger(Number(personId.slice(5))))) {
    throw new NativeError(400, "invalid_request", "Invalid source media or cast identifier.");
  }
  const client = nativePlexClient(principal);
  const source = plexData(await client.getMetadata(ratingKey), true);
  const role = source.Role?.find((item) => castPersonId(item) === personId);
  if (!role) throw new NativeError(404, "not_found", "Cast member not found on this title.");
  const profile: PersonProfile = {
    id: personId, name: role.tag, role: role.role ?? null, thumbUrl: imageUrl(role.thumb, 400, 600),
    biography: null, birthday: null, deathday: null, placeOfBirth: null, knownForDepartment: null,
    knownFor: [], library: [], filmography: [], warnings: [],
  };
  const local = new Map<string, PlexMediaItem>([[source.ratingKey, source]]);
  if (Number.isSafeInteger(role.id) && role.id! >= 0) {
    const sections = await client.getLibraries();
    if (!sections.success) {
      if (sections.error.status === 401) plexData(sections);
      profile.warnings.push(LIBRARY_PARTIAL);
    } else {
      const results = await Promise.all(sections.data.filter((section) => section.type === "movie" || section.type === "show")
        .map((section) => client.getLibraryItemsByActor(section.key, String(role.id))));
      for (const result of results) {
        if (result.success) {
          for (const item of result.data) if (item.type === "movie" || item.type === "show") local.set(item.ratingKey, item);
        } else {
          if (result.error.status === 401) plexData(result);
          profile.warnings.push(LIBRARY_PARTIAL);
        }
      }
    }
  } else profile.warnings.push("More library titles could not be matched to this cast member. Showing this title.");
  profile.library = [...local.values()].map(mediaSummary);
  const disabled = (await getUserSettings(Number(principal.userId)))?.preferences.discoveryDisabled;
  if (principal.profile.restricted || disabled) {
    profile.warnings.push("This profile shows titles from your library only.");
  } else {
    try {
      await enrichPerson(profile, source, role, [...local.values()], client);
    } catch (error) {
      if (error instanceof NativeError) throw error;
      profile.warnings.push(TMDB_UNAVAILABLE);
    }
  }
  profile.warnings = [...new Set(profile.warnings)];
  return profile;
}
