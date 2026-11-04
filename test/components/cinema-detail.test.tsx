import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, Outlet } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import ShowingDetail from "~/routes/private.$showingId";
vi.mock("@remix-run/react", async () => await import("react-router-dom"));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function detailRouter() {
  vi.stubGlobal("EventSource", class { close() {} });
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const movie = { ratingKey: "1", title: "Example", posterUrl: "", addedBy: { name: "Host" }, watched: false };
  const showing = { id: "show", name: "Friday Night", movies: [movie], votes: [], history: [], createdBy: { name: "Host", plexUserId: 1 }, createdAt: 0 };
  const router = createMemoryRouter([{ path: "/private", element: <Outlet context={{ user: { id: 1, username: "Host" }, guestName: "", guestToken: "" }} />, children: [{ path: "show", element: <ShowingDetail />, loader: () => ({ showing, bordaScores: [], currentUserPicks: 1, isOwner: true, userId: 1 }) }] }, { path: "/api/vote/votes", action: () => ({ error: "Vote could not be saved." }) }, { path: "/api/vote/showings", action: () => ({ error: "Showing could not be deleted." }) }], { initialEntries: ["/private/show"] });
  render(<RouterProvider router={router} />);
  return router;
}
it("keeps rejected votes on the voting tab and explains the failure", async () => {
  detailRouter();
  fireEvent.click(await screen.findByRole("button", { name: "Submit Vote" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Vote could not be saved.");
  expect(screen.getByRole("button", { name: "Submit Vote" })).toBeEnabled();
});
it("keeps a failed deletion in the confirmation modal instead of leaving the showing", async () => {
  const router = detailRouter();
  fireEvent.click(await screen.findByRole("button", { name: "Friday Night" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete Showing" }));
  await waitFor(() => expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Showing could not be deleted.");
  expect(router.state.location.pathname).toBe("/private/show");
  expect(screen.getByRole("dialog", { name: "Delete Showing" })).toBeInTheDocument();
});
