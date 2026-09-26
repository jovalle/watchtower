/** Hide external results only when an accessible library item has the same provider ID and type. */
export function excludeLibraryMatches<T extends { id: number; type: "movie" | "show" }>(
  external: T[],
  library: Array<{ type: string; guid?: string; Guid?: Array<{ id: string }> }>
): T[] {
  const identities = new Set(library.flatMap((item) => [item.guid, ...(item.Guid ?? []).map((guid) => guid.id)].filter(Boolean).map((guid) => `${item.type}:${guid}`)));
  return external.filter((item) => !identities.has(`${item.type}:tmdb://${item.id}`));
}
