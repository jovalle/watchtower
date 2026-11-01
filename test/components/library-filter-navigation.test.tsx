import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import MoviesPage from "~/routes/app.watch.movies";
import SeriesPage from "~/routes/app.watch.series";
vi.mock("@remix-run/react", async () => await import("react-router-dom"));
afterEach(cleanup);

it.each([["movies", MoviesPage], ["series", SeriesPage]] as const)("clears all %s filters in one navigation while keeping the sort", async (type, Page) => {
  const router = createMemoryRouter([{ path: `/app/watch/${type}`, element: <Page />, loader: ({ request }) => {
    const params = new URL(request.url).searchParams;
    return { items: [], libraryKey: "1", page: 1, pages: 1, total: 0, letters: {}, keys: [], availableFilters: { genres: ["Drama"], years: [2020] }, currentFilters: { sort: params.get("sort") || "titleSort", sortDirection: params.get("dir") || "asc", filter: params.get("filter") || "all", genre: params.get("genre") || undefined, year: params.get("year") ? Number(params.get("year")) : undefined } };
  } }], { initialEntries: [`/app/watch/${type}?filter=unwatched&genre=Drama&sort=addedAt&dir=desc&page=3`] });
  render(<RouterProvider router={router} />);
  fireEvent.click(await screen.findByRole("button", { name: "Drama" }));
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  await waitFor(() => expect(router.state.location.search).toBe("?sort=addedAt&dir=desc"));
});
