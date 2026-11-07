import { expect, it } from "vitest";
import { libraryPage } from "~/lib/library-page";

it("pages the complete sorted result and maps letters across page boundaries", () => {
  const items = Array.from({ length: 102 }, (_, i) => ({ ratingKey: String(i), title: i < 51 ? `A${i}` : `Z${i}` }));
  const result = libraryPage(items, "2");
  expect(result.items).toHaveLength(48);
  expect(result.items[0].ratingKey).toBe("48");
  expect(result.total).toBe(102);
  expect(result.letters.Z).toEqual({ page: 2, ratingKey: "51" });
  expect(libraryPage(items, "999").page).toBe(3);
  expect(libraryPage(items, "-1").page).toBe(1);
});
