import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Header } from "~/components/layout/Header";
import type { PlexUser } from "~/lib/auth/plex.server";
vi.mock("@remix-run/react", async () => await import("react-router-dom"));
const user = { id: 1, username: "Tester", title: "Tester" } as PlexUser;
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.show = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ sessions: [] }), { headers: { "Content-Type": "application/json" } })));
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount(discoveryDisabled = false) {
  const router = createMemoryRouter([
    { path: "/app/*", element: <Header user={user} discoveryDisabled={discoveryDisabled} /> },
    { path: "/api/notifications", loader: () => ({ unread: 0 }) },
  ], { initialEntries: ["/app/watch/movies"] });
  render(<RouterProvider router={router} />);
  return router;
}
it("opens activity from navigation after closing the menu and restores focus", async () => {
  mount();
  const menu = screen.getByRole("button", { name: "Open Menu" });
  menu.focus();
  fireEvent.click(menu);
  const dialog = screen.getByRole("dialog", { name: "Navigation Menu" });
  expect(within(dialog).getByRole("link", { name: "Notifications" })).toHaveAttribute("href", "/app/notifications");
  fireEvent.click(within(dialog).getByRole("button", { name: "Streaming Activity" }));
  await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
  expect(screen.getByRole("dialog", { name: "Streaming Activity" })).toBeVisible();
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(menu).toHaveFocus());
});
it("closes navigation on links and Escape and preserves discovery restrictions", async () => {
  const router = mount(true);
  expect(screen.queryByRole("link", { name: "Discover", hidden: true })).toBeNull();
  const menu = screen.getByRole("button", { name: "Open Menu" });
  fireEvent.click(menu);
  let dialog = screen.getByRole("dialog", { name: "Navigation Menu" });
  fireEvent.click(within(dialog).getByRole("link", { name: "Notifications" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/app/notifications"));
  expect(dialog).not.toHaveAttribute("open");
  fireEvent.click(menu);
  dialog = screen.getByRole("dialog", { name: "Navigation Menu" });
  fireEvent(dialog, new Event("cancel", { bubbles: true }));
  await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
});

it("closes overlays when switching between compact and desktop navigation", async () => {
  const breakpoint = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => breakpoint);
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Open Menu" }));
  const menu = screen.getByRole("dialog", { name: "Navigation Menu" });
  fireEvent.click(within(menu).getByRole("button", { name: "Streaming Activity" }));
  const activity = screen.getByRole("dialog", { name: "Streaming Activity" });
  await act(async () => { breakpoint.matches = true; breakpoint.dispatchEvent(new Event("change")); });
  expect(activity).not.toHaveAttribute("open");
  expect(menu).not.toHaveAttribute("open");
});
