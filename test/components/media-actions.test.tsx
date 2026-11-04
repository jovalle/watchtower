import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import MediaDetailPage from "~/routes/app.media.$type.$ratingKey";
import { mediaDetailFixture } from "../fixtures/media-detail";

vi.mock("@remix-run/react", async () => await import("react-router-dom"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(["movie", "show"] as const)("names the %s watchlist action and preserves its pending and saved states", async (type) => {
  let respond!: (response: Response) => void;
  const upstream = vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; }));
  vi.stubGlobal("fetch", upstream);
  const router = createMemoryRouter([{ path: "/", element: <MediaDetailPage />, loader: () => mediaDetailFixture(type) }]);
  render(<RouterProvider router={router} />);
  const add = await screen.findByRole("button", { name: "Add to Watchlist" });
  expect(add).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(add);
  expect(add).toBeDisabled();
  fireEvent.click(add);
  expect(upstream).toHaveBeenCalledOnce();
  expect(upstream).toHaveBeenCalledWith("/api/plex/list", expect.objectContaining({ method: "POST", body: JSON.stringify({ ratingKey: "42" }) }));
  respond(Response.json({ ok: true }));
  await waitFor(() => expect(screen.getByRole("button", { name: "In Watchlist" })).toHaveAttribute("aria-pressed", "true"));
  expect(screen.getByRole("button", { name: "In Watchlist" })).toBeEnabled();
});

it.each(["movie", "show"] as const)("resets the %s watchlist action when navigating between titles", async (type) => {
  let respond!: (response: Response) => void;
  const upstream = vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; }));
  vi.stubGlobal("fetch", upstream);
  const router = createMemoryRouter([{
    path: "/:ratingKey",
    element: <MediaDetailPage />,
    loader: ({ params }) => {
      const data = mediaDetailFixture(type, params.ratingKey === "saved");
      return { ...data, metadata: { ...data.metadata, ratingKey: params.ratingKey } };
    },
  }], { initialEntries: ["/saved"] });
  render(<RouterProvider router={router} />);
  fireEvent.click(await screen.findByRole("button", { name: "In Watchlist" }));
  expect(upstream).toHaveBeenLastCalledWith("/api/plex/list", expect.objectContaining({ method: "DELETE", body: JSON.stringify({ ratingKey: "saved" }) }));
  await act(() => router.navigate("/new"));
  expect(screen.getByRole("button", { name: "Add to Watchlist" })).toBeEnabled();
  await act(async () => { respond(Response.json({ ok: true })); });
  expect(screen.getByRole("button", { name: "Add to Watchlist" })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Add to Watchlist" }));
  expect(upstream).toHaveBeenLastCalledWith("/api/plex/list", expect.objectContaining({ method: "POST", body: JSON.stringify({ ratingKey: "new" }) }));
  await act(async () => { respond(Response.json({ ok: true })); });
  expect(screen.getByRole("button", { name: "In Watchlist" })).toHaveAttribute("aria-pressed", "true");
});

it.each(["season", "episode"] as const)("keeps watchlist actions off the %s page", async (type) => {
  const router = createMemoryRouter([{ path: "/", element: <MediaDetailPage />, loader: () => mediaDetailFixture(type) }]);
  render(<RouterProvider router={router} />);
  await screen.findByRole("button", { name: "Trailer" });
  expect(screen.queryByRole("button", { name: "Add to Watchlist" })).toBeNull();
});
