import { expect, it, vi } from "vitest";
import { loadUpstreamLibrary } from "~/lib/upstream-library.server";

it("merges bounded pages across sections and filters genres by each section's Plex ID", async () => {
  const getLibraryFacet = vi.fn(async (section: string, facet: string) => ({ success: true as const, data: facet === "genre" ? [{ key: section === "1" ? "11" : "22", title: "Drama" }] : facet === "year" ? [{ key: "2020", title: "2020" }] : [{ key: "A", title: "A", size: 100 }] }));
  const getLibraryPage = vi.fn(async (section: string, options: { offset: number; limit: number; genre?: string }) => {
    expect(options.genre).toBe(section === "1" ? "11" : "22");
    const items = Array.from({ length: Math.min(options.limit, 100 - options.offset) }, (_, i) => ({ ratingKey: `${section}-${i + options.offset}`, title: `A${String((i + options.offset) * 2 + (section === "1" ? 0 : 1)).padStart(3, "0")}`, type: "movie", guid: "x" }));
    return { success: true as const, data: { total: 100, offset: options.offset, items } };
  });
  const result = await loadUpstreamLibrary({ getLibraryFacet, getLibraryPage } as never, ["1", "2"], { sort: "titleSort", genre: "Drama" }, 1);
  expect(result.total).toBe(200);
  expect(result.items).toHaveLength(48);
  expect(result.items.slice(0, 4).map((item) => item.ratingKey)).toEqual(["1-0", "2-0", "1-1", "2-1"]);
  expect(result.letters.A.page).toBe(1);
  expect(getLibraryPage.mock.calls.every(([, options]) => options.limit <= 48)).toBe(true);
});
it("places unrated titles after rated titles in ascending rating order", async () => {
  const getLibraryFacet = vi.fn(async (_section: string, facet: string) => ({ success: true as const, data: facet === "firstCharacter" ? [{ key: "A", title: "A", size: 4 }] : [] }));
  const getLibraryPage = vi.fn(async (_section: string, options: { offset: number; limit: number; filter?: string }) => {
    const all = [{ ratingKey: "n1", title: "A", userRating: undefined }, { ratingKey: "n2", title: "B", userRating: undefined }, { ratingKey: "r1", title: "C", userRating: 2 }, { ratingKey: "r2", title: "D", userRating: 8 }];
    const source = options.filter?.includes("userRating") ? all.slice(2) : all;
    return { success: true as const, data: { total: source.length, offset: options.offset, items: source.slice(options.offset, options.offset + options.limit) } };
  });
  const result = await loadUpstreamLibrary({ getLibraryFacet, getLibraryPage } as never, ["1"], { sort: "userRating" }, 1);
  expect(result.items.map((item) => item.ratingKey)).toEqual(["r1", "r2", "n1", "n2"]);
});
it("seeks a deep multi-section page without reading the preceding index", async () => {
  let fetched = 0;
  const getLibraryFacet = vi.fn(async (_section: string, facet: string) => ({ success: true as const, data: facet === "firstCharacter" ? [{ key: "A", title: "A", size: 10000 }] : [] }));
  const getLibraryPage = vi.fn(async (section: string, options: { offset: number; limit: number }) => {
    const size = Math.max(0, Math.min(options.limit, 10000 - options.offset));
    fetched += size;
    return { success: true as const, data: { total: 10000, offset: options.offset, items: Array.from({ length: size }, (_, i) => ({ ratingKey: `${section}-${options.offset + i}`, title: `A${String((options.offset + i) * 2 + (section === "1" ? 0 : 1)).padStart(6, "0")}` })) } };
  });
  const result = await loadUpstreamLibrary({ getLibraryFacet, getLibraryPage } as never, ["1", "2"], { sort: "titleSort" }, 100);
  expect(result.items).toHaveLength(48);
  expect(result.items[0].title).toBe("A004752");
  expect(fetched).toBeLessThan(500);
});
it.each([1, 2, 5, 9])("preserves descending order and ties across three libraries on page %s", async (page) => {
  const sections = ["1", "2", "3"];
  const libraries = Object.fromEntries(sections.map((section) => [section, Array.from({ length: 150 }, (_, i) => ({ ratingKey: `${section}-${i}`, title: `Title ${String(Math.floor((149 - i) / 3)).padStart(3, "0")}`, type: "movie" }))]));
  const getLibraryFacet = vi.fn(async (_section: string, facet: string) => ({ success: true as const, data: facet === "firstCharacter" ? [{ title: "T", key: "T", size: 150 }] : [] }));
  const getLibraryPage = vi.fn(async (section: string, options: { offset: number; limit: number }) => ({ success: true as const, data: { total: 150, offset: options.offset, items: libraries[section].slice(options.offset, options.offset + options.limit) } }));
  const expected = sections.flatMap((section) => libraries[section]).sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true })).slice((page - 1) * 48, page * 48);
  const result = await loadUpstreamLibrary({ getLibraryFacet, getLibraryPage } as never, sections, { sort: "titleSort:desc" }, page);
  expect(result.items.map((item) => item.ratingKey)).toEqual(expected.map((item) => item.ratingKey));
});
it("merges ascending ratings across libraries with nulls last, even on later pages", async () => {
  const sections = ["1", "2"];
  const data: Record<string, Array<{ ratingKey: string; title: string; userRating?: number }>> = Object.fromEntries(sections.map((section) => [section, [
    ...Array.from({ length: 25 }, (_, i) => ({ ratingKey: `${section}-n${i}`, title: `Unrated ${i}` })),
    ...Array.from({ length: 75 }, (_, i) => ({ ratingKey: `${section}-r${i}`, title: `Rated ${i}`, userRating: Math.floor(i / 10) + 1 })),
  ]]));
  const getLibraryFacet = vi.fn(async () => ({ success: true as const, data: [] }));
  const getLibraryPage = vi.fn(async (section: string, options: { offset: number; limit: number; filter?: string }) => {
    const items = options.filter?.includes("userRating") ? data[section].slice(25) : data[section];
    return { success: true as const, data: { items: items.slice(options.offset, options.offset + options.limit), offset: options.offset, total: items.length } };
  });
  const expected = sections.flatMap((section) => data[section]).sort((a, b) => (a.userRating ?? Infinity) - (b.userRating ?? Infinity)).slice(144, 192);
  const result = await loadUpstreamLibrary({ getLibraryFacet, getLibraryPage } as never, sections, { sort: "userRating" }, 4);
  expect(result.items.map((item) => item.ratingKey)).toEqual(expected.map((item) => item.ratingKey));
});
it("fails visibly if any accessible section cannot provide a page", async () => {
  const getLibraryFacet = vi.fn(async () => ({ success: true as const, data: [] }));
  const getLibraryPage = vi.fn(async (section: string) => section === "1"
    ? { success: true as const, data: { total: 1, offset: 0, items: [{ ratingKey: "1", title: "A" }] } }
    : { success: false as const, error: { code: 503, message: "offline" } });
  await expect(loadUpstreamLibrary({ getLibraryFacet, getLibraryPage } as never, ["1", "2"], { sort: "titleSort" }, 1)).rejects.toMatchObject({ status: 503 });
});
