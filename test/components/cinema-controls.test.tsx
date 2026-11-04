import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MovieSelector } from "~/components/vote/MovieSelector";

const search = vi.hoisted(() => ({ state: "idle", data: { results: [{ ratingKey: "1", title: "Example", posterUrl: "" }] }, load: vi.fn() }));
vi.mock("@remix-run/react", () => ({ useFetcher: () => search }));
afterEach(() => { search.state = "idle"; cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function renderSelector(onClose = vi.fn()) {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn();
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  return render(<MovieSelector showingId="show" currentPicks={0} maxPicks={5} existingKeys={new Set()} onClose={onClose} onMovieAdded={() => {}} />);
}
it("opens a modal with named search/close controls and supports cancel", () => {
  const onClose = vi.fn();
  renderSelector(onClose);
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce();
  expect(screen.getByRole("textbox", { name: "Search Movies" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Close Add Movie" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Close Add Movie" }));
  expect(onClose).toHaveBeenCalledOnce();
  onClose.mockClear();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(onClose).toHaveBeenCalledOnce();
});
it("reports rejected additions and leaves the movie available to retry", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Your picks are full." }) }));
  renderSelector();
  fireEvent.click(await screen.findByRole("button", { name: "Add" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Your picks are full."));
  expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Added" })).not.toBeInTheDocument();
});
it("shows the minimum search hint instead of stale catalog cards for one character", async () => {
  renderSelector();
  await screen.findByRole("button", { name: "Add" });
  fireEvent.change(screen.getByRole("textbox", { name: "Search Movies" }), { target: { value: "x" } });
  expect(screen.getByText("Type at least 2 characters to search")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
});
it("ignores a delayed catalog response after the query becomes too short", () => {
  search.state = "loading";
  const { rerender } = renderSelector();
  fireEvent.change(screen.getByRole("textbox", { name: "Search Movies" }), { target: { value: "x" } });
  search.state = "idle";
  rerender(<MovieSelector showingId="show" currentPicks={0} maxPicks={5} existingKeys={new Set()} onClose={() => {}} onMovieAdded={() => {}} />);
  expect(screen.getByText("Type at least 2 characters to search")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add" })).not.toBeInTheDocument();
});
