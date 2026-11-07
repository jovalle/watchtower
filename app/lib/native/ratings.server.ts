import { createOMDbClient } from "~/lib/omdb/client.server";
import { createTMDBClient } from "~/lib/tmdb/client.server";
import type { PlexMetadata } from "~/lib/plex/types";
import type { MediaRatingsResponse, ProviderRating } from "./contract";

function provider(image: unknown): ProviderRating["source"] {
  switch (typeof image === "string" ? /^([^:]+):\/\//.exec(image)?.[1] : null) {
    case "imdb": return "imdb";
    case "themoviedb": return "tmdb";
    case "thetvdb": return "tvdb";
    case "rottentomatoes": return "rotten_tomatoes";
    default: return "plex";
  }
}

function rating(source: ProviderRating["source"], kind: ProviderRating["kind"], value: unknown, maxValue: 10 | 100): ProviderRating | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maxValue
    ? { source, kind, value, maxValue }
    : null;
}

export function plexRatings(metadata: PlexMetadata): ProviderRating[] {
  const ratings: ProviderRating[] = [];
  const add = (image: string | undefined, value: unknown, type?: string) => {
    const source = provider(image);
    const kind = source !== "plex" && source !== "rotten_tomatoes"
      ? "rating" : type === "audience" || type === "critic" ? type : source === "rotten_tomatoes" ? "critic" : "rating";
    const item = rating(source, kind, value, 10);
    if (!item || ratings.some((other) => other.source === source && other.kind === kind)) return;
    if (source === "rotten_tomatoes") {
      item.value = Math.round(item.value * 100) / 10;
      item.maxValue = 100;
    }
    ratings.push(item);
  };
  for (const entry of metadata.Rating ?? []) add(entry.image, entry.value, entry.type);
  add(metadata.ratingImage, metadata.rating);
  add(metadata.audienceRatingImage, metadata.audienceRating, "audience");
  return ratings;
}

function decimal(value: string | undefined, percentage = false): number | null {
  if (typeof value !== "string" || !(percentage ? /^\d+(?:\.\d+)?%$/ : /^\d+(?:\.\d+)?$/).test(value)) return null;
  return Number(percentage ? value.slice(0, -1) : value);
}

async function omdbRatings(imdbId: string): Promise<MediaRatingsResponse> {
  const client = createOMDbClient();
  if (!client) return { ratings: [], warnings: ["OMDb ratings are not configured."] };
  try {
    const result = await client.getRatingsByIMDbId(imdbId);
    if (result.success) {
      const items = [
        rating("imdb", "rating", decimal(result.data.imdb?.rating), 10),
        rating("rotten_tomatoes", "critic", decimal(result.data.rottenTomatoes?.rating, true), 100),
      ];
      return { ratings: items.filter((item): item is ProviderRating => item !== null), warnings: [] };
    }
  } catch { /* Optional provider failures must leave Plex ratings usable. */ }
  return { ratings: [], warnings: ["OMDb ratings are unavailable."] };
}

async function tmdbRatings(type: "movie" | "show", id: number): Promise<MediaRatingsResponse> {
  const client = createTMDBClient();
  if (!client) return { ratings: [], warnings: ["TMDB ratings are not configured."] };
  try {
    const title = await client.getTitle(type, id);
    if (title) {
      const item = title.voteCount > 0 ? rating("tmdb", "rating", title.voteAverage, 10) : null;
      return { ratings: item ? [item] : [], warnings: [] };
    }
  } catch { /* Optional provider failures must leave Plex ratings usable. */ }
  return { ratings: [], warnings: ["TMDB ratings are unavailable."] };
}

export async function mediaRatings(metadata: PlexMetadata): Promise<MediaRatingsResponse> {
  const imdbId = metadata.Guid?.find((entry) => /^imdb:\/\/tt\d+$/.test(entry.id))?.id.slice(7);
  const tmdbId = metadata.Guid?.find((entry) => /^tmdb:\/\/[1-9]\d*$/.test(entry.id))?.id.slice(7);
  const results = await Promise.all([
    imdbId ? omdbRatings(imdbId) : null,
    tmdbId && Number.isSafeInteger(Number(tmdbId)) && (metadata.type === "movie" || metadata.type === "show")
      ? tmdbRatings(metadata.type, Number(tmdbId)) : null,
  ]);
  const ratings = plexRatings(metadata);
  for (const result of results) {
    for (const item of result?.ratings ?? []) {
      const existing = ratings.findIndex((other) => other.source === item.source && other.kind === item.kind);
      if (existing === -1) ratings.push(item);
      else ratings[existing] = item;
    }
  }
  return { ratings, warnings: results.flatMap((result) => result?.warnings ?? []) };
}
