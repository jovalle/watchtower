import type { SeerrClient, SeerrMedia } from "./seerr.server";

export function listParams(request: Request, filters: string[]) {
  const params = new URL(request.url).searchParams;
  const requestedPage = Number(params.get("page") || 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 10000)
      : 1;
  const filter = params.get("filter") || "all";
  return { page, filter: filters.includes(filter) ? filter : "all" };
}

export function positiveId(value: unknown): number {
  const id =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid ID.");
  return id;
}

export async function mediaTitles<T extends { media: SeerrMedia }>(
  client: SeerrClient,
  userId: number,
  items: T[]
) {
  return Promise.all(
    items.map(async (item) => {
      const title = await client
        .getTitle(item.media.mediaType, item.media.tmdbId, userId)
        .catch(() => null);
      return {
        ...item,
        title: title?.title || title?.name || `Title #${item.media.tmdbId}`,
        posterUrl: title?.posterPath
          ? `https://image.tmdb.org/t/p/w185${title.posterPath}`
          : null,
      };
    })
  );
}
