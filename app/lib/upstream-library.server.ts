import type { PlexClient } from "./plex/client.server";
import type { LibraryQueryOptions, PlexMediaItem } from "./plex/types";

const PAGE_SIZE = 48;

export async function loadUpstreamLibrary(client: PlexClient, sections: string[], options: LibraryQueryOptions, requestedPage: number) {
  const facets = await Promise.all(sections.map(async (section) => {
    const [genres, years] = await Promise.all([
      client.getLibraryFacet(section, "genre", { filter: options.filter, year: options.year }),
      client.getLibraryFacet(section, "year", { filter: options.filter }),
    ]);
    if (!genres.success || !years.success) throw new Response("Could not load library filters. Refresh to try again.", { status: 503 });
    const genre = options.genre ? genres.data.find((item) => item.title === options.genre)?.key : undefined;
    return { section, genres: genres.data, years: years.data, genre, active: !options.genre || !!genre };
  }));
  const genres = [...new Set(facets.flatMap((f) => f.genres.map((g) => g.title)))].sort();
  const years = [...new Set(facets.flatMap((f) => f.years.map((y) => Number(y.title)).filter(Number.isFinite)))].sort((a, b) => b - a);
  const queryFor = (genre?: string) => ({ ...options, genre });
  const active = facets.filter((f) => f.active);
  const first = await Promise.all(active.map(async (f) => {
    const query = queryFor(f.genre);
    const [page, letters, rated] = await Promise.all([
      client.getLibraryPage(f.section, { ...query, offset: 0, limit: PAGE_SIZE }),
      client.getLibraryFacet(f.section, "firstCharacter", query),
      ["userRating", "audienceRating", "rating"].includes(query.sort || "")
        ? client.getLibraryPage(f.section, { ...query, filter: [query.filter, `${query.sort}%3E=0`].filter(Boolean).join("&"), offset: 0, limit: PAGE_SIZE })
        : Promise.resolve(null),
    ]);
    if (!page.success || !letters.success || (rated && !rated.success)) throw new Response("Could not finish loading your library. Refresh to try again.", { status: 503 });
    return { ...f, query, items: rated?.success ? rated.data.items : page.data.items, total: page.data.total, ratedTotal: rated?.success ? rated.data.total : null, letters: letters.data };
  }));
  const total = first.reduce((sum, part) => sum + part.total, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pages) : 1;
  const [field = "titleSort", direction] = (options.sort ?? "titleSort").split(":");
  const value = (item: PlexMediaItem) => field === "titleSort" ? item.titleSort || item.title : item[field as keyof PlexMediaItem];
  const compare = (a: PlexMediaItem, b: PlexMediaItem) => {
    const left = value(a), right = value(b);
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true });
    return direction === "desc" ? -result : result;
  };
  const read = async (part: typeof first[number], start: number, count: number) => {
    const items: PlexMediaItem[] = [];
    while (items.length < count && start + items.length < part.total) {
      const position = start + items.length;
      const rated = part.ratedTotal !== null && position < part.ratedTotal;
      const offset = part.ratedTotal !== null && !rated ? position - part.ratedTotal : position;
      const limit = Math.min(count - items.length, PAGE_SIZE, rated ? part.ratedTotal! - offset : part.total - position);
      const filter = rated ? [part.query.filter, `${part.query.sort}%3E=0`].filter(Boolean).join("&") : part.query.filter;
      const next = await client.getLibraryPage(part.section, { ...part.query, filter, offset, limit });
      if (!next.success || next.data.total !== (rated ? part.ratedTotal : part.total)) throw new Response("Library changed while loading. Refresh to try again.", { status: 503 });
      items.push(...next.data.items);
    }
    return items;
  };
  const samples = first.map((part) => new Map(part.items.map((item, index) => [index, item])));
  const at = async (section: number, index: number) => {
    const cached = samples[section].get(index);
    if (cached) return cached;
    const [item] = await read(first[section], index, 1);
    if (!item) throw new Response("Library changed while loading. Refresh to try again.", { status: 503 });
    samples[section].set(index, item);
    return item;
  };
  const starts = first.map(() => 0);
  const ends = first.map((part) => part.total);
  let remaining = (page - 1) * PAGE_SIZE;
  if (first.length === 1) { starts[0] = remaining; remaining = 0; }
  while (remaining > 0) {
    let pivotSection = 0;
    for (let i = 1; i < first.length; i++) if (ends[i] - starts[i] > ends[pivotSection] - starts[pivotSection]) pivotSection = i;
    const pivotIndex = Math.floor((starts[pivotSection] + ends[pivotSection]) / 2);
    const pivot = await at(pivotSection, pivotIndex);
    const bounds = await Promise.all(first.map(async (_part, section) => {
      let lo = starts[section], hi = ends[section];
      while (lo < hi) {
        const middle = Math.floor((lo + hi) / 2);
        const item = await at(section, middle);
        const order = compare(item, pivot) || section - pivotSection || middle - pivotIndex;
        if (order <= 0) lo = middle + 1; else hi = middle;
      }
      return lo;
    }));
    const rank = bounds.reduce((sum, bound, i) => sum + bound - starts[i], 0);
    if (remaining >= rank) {
      for (let i = 0; i < starts.length; i++) starts[i] = bounds[i];
      remaining -= rank;
    } else {
      bounds[pivotSection]--;
      if (remaining === rank - 1) { for (let i = 0; i < starts.length; i++) starts[i] = bounds[i]; remaining = 0; }
      else for (let i = 0; i < ends.length; i++) ends[i] = bounds[i];
    }
  }
  const chunks = await Promise.all(first.map((part, i) => starts[i] === 0 && part.items.length >= Math.min(PAGE_SIZE, part.total) ? part.items : read(part, starts[i], PAGE_SIZE)));
  const items = chunks.flat().sort(compare).slice(0, PAGE_SIZE);
  const firstItems = await Promise.all(first.flatMap((part, index) => part.total ? [at(index, 0)] : []));
  const firstKey = firstItems.sort(compare)[0]?.ratingKey || "";
  const counts = new Map<string, number>();
  for (const part of first) for (const letter of part.letters) counts.set(letter.title, (counts.get(letter.title) || 0) + (letter.size || 0));
  const letters: Record<string, { page: number; ratingKey: string }> = {};
  let offset = 0;
  const sortedLetters = [...counts.keys()].sort();
  if (direction === "desc") sortedLetters.reverse();
  for (const letter of sortedLetters) {
    if (!counts.get(letter)) continue;
    const targetPage = Math.floor(offset / PAGE_SIZE) + 1;
    const match = targetPage === page ? items[offset % PAGE_SIZE] : undefined;
    letters[letter] = { page: targetPage, ratingKey: match?.ratingKey || "" };
    offset += counts.get(letter) || 0;
  }
  return { items, total, page, pages, letters, firstKey, sections: first.map(({ section, query, total: size }) => ({ section, query, total: size })), availableFilters: { genres, years } };
}
