import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { PosterCard } from "~/components/media/PosterCard";
import Movies from "~/routes/app.watch.movies";
import Series from "~/routes/app.watch.series";
import Search from "~/routes/app.search";

vi.mock("@remix-run/react", async () => await import("react-router-dom"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows the rating when a library is sorted by My Rating without an editor", () => {
  render(<PosterCard title="Movie" posterUrl="" showRating rating={8} />);
  expect(screen.getByText("8.0")).toBeVisible();
});

it("changes playlist membership twice without opening the poster", async () => {
  const restoreScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  const navigate = vi.fn();
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) =>
    Response.json(options ? {} : { playlists: [{ ratingKey: "9", title: "Favorites", leafCount: 2, containsItem: false }] }));
  vi.stubGlobal("fetch", fetcher);
  render(<PosterCard title="Movie" posterUrl="" details={{}} ratingKey="7" onClick={navigate} />);
  fireEvent.focus(screen.getByRole("button", { name: "Movie" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to Playlist" }));
  const choice = await screen.findByRole("button", { name: /Favorites/ });
  fireEvent.click(choice);
  await waitFor(() => expect(choice).toHaveAttribute("aria-pressed", "true"));
  fireEvent.click(choice);
  await waitFor(() => expect(choice).toHaveAttribute("aria-pressed", "false"));
  expect(JSON.parse(String(fetcher.mock.calls.at(-1)?.[1]?.body))).toMatchObject({ itemRatingKey: "7", playlistItemId: null });
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByRole("button", { name: "Add to Playlist" })).toHaveFocus();
  restoreScroll.mockRestore();
});

it.each([Movies, Series])("keeps library cards mounted until destination data is ready", async (Library) => {
  const data = { items: [{ ratingKey: "1", title: "Library Item", posterUrl: "" }], libraryKey: "1", keys: ["1"],
    currentFilters: { filter: "all", sort: "addedAt", sortDirection: "desc" }, availableFilters: { genres: [], years: [] }, page: 1, pages: 1, total: 1, letters: {} };
  const router = createMemoryRouter([{ path: "/", element: <Library />, loader: () => data },
    { path: "/next", element: <p>Next</p>, loader: () => new Promise(() => {}) }]);
  render(<RouterProvider router={router} />);
  const card = await screen.findByRole("button", { name: "Library Item" });
  await act(() => { void router.navigate("/next"); });
  expect(card).toBeInTheDocument();
  router.dispose();
});

it("reflects same-route query navigation in the search box", async () => {
  const router = createMemoryRouter([{ path: "/app/search", element: <Search />, loader: ({ request }) =>
    ({ q: new URL(request.url).searchParams.get("q") ?? "", library: [], discover: [] }) }], {initialEntries:["/app/search?q=first"]});
  render(<RouterProvider router={router} />);
  const search = await screen.findByRole("searchbox");
  await act(() => router.navigate("/app/search?q=second"));
  expect(search).toHaveValue("second");
});

it("holds the library card's watchlist toggle while saving and reports a rejected update", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
  const data = { items: [{ ratingKey: "1", title:"Movie", posterUrl:"", details:{}, isInWatchlist:false }], libraryKey:"1", keys:["1"],
    currentFilters:{filter:"all",sort:"addedAt",sortDirection:"desc"}, availableFilters:{genres:[],years:[]},page:1,pages:1,total:1,letters:{} };
  const router = createMemoryRouter([{ path:"/", element:<Movies/>,loader:()=>data }]);
  render(<RouterProvider router={router}/>);
  fireEvent.focus(await screen.findByRole("button",{name:"Movie"}));
  const toggle = screen.getByRole("button",{name:"Add to Watchlist"});
  fireEvent.click(toggle);
  expect(toggle).toBeDisabled();
  await act(async () => resolve(new Response(null,{status:503})));
  expect(toggle).toBeEnabled();
  expect(toggle).toHaveAttribute("aria-pressed","false");
  expect(screen.getByRole("alert")).toHaveTextContent("watchlist");
});

it("keeps the focused card action outside its details button", () => {
  render(<PosterCard title="Movie" posterUrl="" details={{}} onPlay={() => {}} />);
  const details = screen.getByRole("button",{name:"Movie"});
  fireEvent.focus(details);
  expect(details).not.toContainElement(screen.getByRole("button",{name:"Play"}));
});

it("places a library menu above its trigger when landscape leaves too little space below", async () => {
  const { LibraryHeader } = await import("~/components/library/LibraryHeader");
  const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => new DOMRect(40, 280, 150, 44));
  vi.stubGlobal("innerHeight", 375);
  try {
    render(<LibraryHeader title="Movies" currentSort="title" sortOptions={[{value:"title",label:"Title"},{value:"year",label:"Year"}]} onSortChange={() => {}} />);
    fireEvent.click(screen.getByRole("button",{name:"Title"}));
    const panel = screen.getByRole("button",{name:"Year"}).parentElement!;
    expect(panel.style.bottom).toBe("100%");
    expect(panel.style.maxHeight).toBe("268px");
  } finally { rect.mockRestore(); }
});

it.each([
  ["movies", Movies, { filter: "all", genre: "Drama" }],
  ["series", Series, { filter: "unwatched", year: 2024 }],
] as const)("explains an empty filtered %s library and exposes Clear Filters", async (_family, Library, filters) => {
  const data = { libraryKey:"1", items:[], keys:[], letters:{}, page:1, pages:1, total:0,
    availableFilters:{genres:["Drama"],years:[2024]}, currentFilters:{sort:"titleSort",sortDirection:"asc",...filters} };
  const router = createMemoryRouter([{ path:"/", element:<Library />, loader:()=>data }]);
  render(<RouterProvider router={router} />);
  expect(await screen.findByText("No titles match your filters. Try clearing them.")).toBeVisible();
  expect(screen.getByRole("button",{name:"Clear Filters"})).toBeEnabled();
});
