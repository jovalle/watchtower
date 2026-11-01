import type { PlexClient } from "./plex/client.server";
import type { PlexMetadata } from "./plex/types";
import type { TMDBRecommendation } from "./tmdb/types";

export function splitContinueWatching<
  T extends {
    type: string;
    viewOffset?: number | null;
    viewCount?: number | null;
  },
>(items: T[]): { continuing: T[]; nextEpisodes: T[] } {
  return {
    continuing: items.filter((item) => Boolean(item.viewOffset)),
    nextEpisodes: items.filter(
      (item) =>
        item.type === "episode" && !item.viewOffset && !item.viewCount,
    ),
  };
}

export async function resolveTrendingLibraryMatches(
  client: PlexClient,
  trending: TMDBRecommendation[],
): Promise<
  Array<{ recommendation: TMDBRecommendation; match: PlexMetadata | null }>
> {
  return Promise.all(
    trending.map(async (recommendation) => {
      const matches = await client.findByTmdbId(
        recommendation.type,
        recommendation.id,
      );
      return {
        recommendation,
        match: matches.success ? (matches.data[0] ?? null) : null,
      };
    }),
  );
}

/** Plex history and similar titles are requested with this viewer's server token. */
export async function personalRecommendations(client: PlexClient) {
  const viewed = await client.getRecentlyViewed({ limit: 1 });
  if (!viewed.success || !viewed.data.items.length) return null;
  const seed = viewed.data.items[0];
  const detail = await client.getMetadata(seed.ratingKey);
  if (!detail.success) return null;
  const keys = [...new Set((detail.data.Similar ?? []).flatMap((item) => item.ratingKey ? [item.ratingKey] : item.id ? [String(item.id)] : []))].slice(0, 8);
  const matches = await Promise.all(keys.map((key) => client.getMetadata(key)));
  const items = matches.flatMap((result) => result.success && ["movie", "show"].includes(result.data.type) && !result.data.viewCount && !result.data.viewedLeafCount && !result.data.viewOffset && result.data.ratingKey !== seed.ratingKey ? [result.data] : []);
  return items.length ? { title: `Because you watched ${seed.title}`, items } : null;
}
