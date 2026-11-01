import { expect, it, vi } from "vitest";
vi.mock("~/lib/plex/cache.server", () => ({
  getUserCacheKey: (key: string, token: string) => `${key}:${token}`,
}));
import { getLibraryIndex } from "~/lib/library-index.server";
it("reuses an index only for the same user, sections and filters", async () => {
  const fetch = vi.fn(async () => ({ success: true as const, data: [{ ratingKey: "1" }] }));
  const client = { getLibraryItemsForSections: fetch } as never;
  await getLibraryIndex(client, "a", ["1"], { sort: "titleSort" });
  await getLibraryIndex(client, "a", ["1"], { sort: "titleSort" });
  expect(fetch).toHaveBeenCalledTimes(1);
  await getLibraryIndex(client, "b", ["1"], { sort: "titleSort" });
  await getLibraryIndex(client, "a", ["2"], { sort: "titleSort" });
  await getLibraryIndex(client, "a", ["1"], { sort: "addedAt" });
  expect(fetch).toHaveBeenCalledTimes(4);
});
it("drops a user's cached indexes after playback changes", async () => {
  const { invalidateLibraryIndex } = await import("~/lib/library-index.server");
  const fetch = vi.fn(async () => ({ success: true as const, data: [{ ratingKey: "1" }] }));
  const client = { getLibraryItemsForSections: fetch } as never;
  await getLibraryIndex(client, "invalidate", ["1"], {});
  invalidateLibraryIndex("invalidate");
  await getLibraryIndex(client, "invalidate", ["1"], {});
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not repopulate an index invalidated during a pending request", async () => {
  const { invalidateLibraryIndex } = await import("~/lib/library-index.server");
  let finish!: (result: { success: true; data: { ratingKey: string }[] }) => void;
  const fetch = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue({ success: true, data: [{ ratingKey: "new" }] });
  const client = { getLibraryItemsForSections: fetch } as never;
  const pending = getLibraryIndex(client, "race", ["1"], {});
  invalidateLibraryIndex("race");
  finish({ success: true, data: [{ ratingKey: "old" }] });
  await pending;
  const next = await getLibraryIndex(client, "race", ["1"], {});
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(next.success && next.data[0].ratingKey).toBe("new");
});
