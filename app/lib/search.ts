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
 * Finds the library item matching an external title on type, title, and year (within one year).
 */
export function findLibraryMatch<L extends { title: string; type: string; year?: number }>(
  external: { title: string; type: "movie" | "show"; releaseDate?: string },
  library: L[],
): L | undefined {
  const key = normalizeTitle(external.title);
  const year = yearOf(external.releaseDate);
  return library.find(
    (item) =>
      item.type === external.type &&
      normalizeTitle(item.title) === key &&
      (year === undefined || item.year === undefined || Math.abs(item.year - year) <= 1),
  );
}

/**
 * Drops external results that are already in the library.
 */
export function excludeLibraryMatches<
  T extends { title: string; type: "movie" | "show"; releaseDate?: string },
>(external: T[], library: Array<{ title: string; type: string; year?: number }>): T[] {
  return external.filter((item) => !findLibraryMatch(item, library));
}
