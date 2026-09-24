function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function yearOf(date: string | undefined): number | undefined {
  const year = date ? parseInt(date.slice(0, 4), 10) : NaN;
  return Number.isNaN(year) ? undefined : year;
}

/**
 * Drops external results that are already in the library, matching on type, title, and year (within one year).
 */
export function excludeLibraryMatches<
  T extends { title: string; type: "movie" | "show"; releaseDate?: string },
>(external: T[], library: Array<{ title: string; type: string; year?: number }>): T[] {
  const owned = library.map((item) => ({ ...item, key: normalizeTitle(item.title) }));
  return external.filter((item) => {
    const key = normalizeTitle(item.title);
    const year = yearOf(item.releaseDate);
    return !owned.some(
      (o) =>
        o.type === item.type &&
        o.key === key &&
        (year === undefined || o.year === undefined || Math.abs(o.year - year) <= 1),
    );
  });
}
