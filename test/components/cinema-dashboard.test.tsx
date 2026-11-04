import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, Outlet } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import PrivateDashboard from "~/routes/private._index";
import VoteDashboard from "~/routes/vote._index";
vi.mock("@remix-run/react", async () => await import("react-router-dom"));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it.each([PrivateDashboard, VoteDashboard])("keeps carousel controls outside showing links and links to the active detail route", async (Dashboard) => {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(900);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300);
  const router = createMemoryRouter([{ path: "/", element: <Outlet context={{ guestName: "" }} />, children: [{ index: true, element: <Dashboard />, loader: () => ({ isAuthenticated: true, showings: [{ id: "show", name: "Friday Night", status: "coming_soon", createdBy: { name: "Host" }, createdAt: 0, updatedAt: 0, movieCount: 4, voterCount: 0, moviePreviews: [{ ratingKey: "1", title: "Example", posterUrl: "" }] }] }) }] }]);
  render(<RouterProvider router={router} />);
  const next = await screen.findByRole("button", { name: "Scroll Right" });
  await waitFor(() => expect(next.closest("a")).toBeNull());
  expect(screen.getByRole("link", { name: "Friday Night" })).toHaveAttribute("href", "/private/show");
});
