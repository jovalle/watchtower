import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { FilterDropdown } from "~/components/ui/FilterDropdown";
import { ContextMenu } from "~/components/ui/ContextMenu";
import { UserMenu } from "~/components/UserMenu";
import { TraktConnectSection } from "~/components/settings/TraktConnectSection";
import type { PlexUser } from "~/lib/auth/plex.server";

vi.mock("@remix-run/react", async () => await import("react-router-dom"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("exposes filter expansion and selected options and returns focus on Escape", () => {
  render(<FilterDropdown label="Type" options={[{ value: "movie", label: "Movies" }]} selected={["movie"]} onChange={() => {}} />);
  const trigger = screen.getByRole("button", { name: /Type.*Movies/ });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  const option = screen.getByRole("button", { name: "Movies", pressed: true });
  option.focus();
  fireEvent.keyDown(option, { key: "Escape" });
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("focuses context actions and supports keyboard movement past disabled items", () => {
  render(<ContextMenu position={{ x: 10, y: 10 }} onClose={() => {}} items={[
    { label: "Play", onClick() {} }, { label: "Unavailable", disabled: true, onClick() {} }, { label: "Remove", onClick() {} },
  ]} />);
  expect(screen.getByRole("menuitem", { name: "Play" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(screen.getByRole("menuitem", { name: "Remove" })).toHaveFocus();
});

it("names the account disclosure when the user has no avatar", () => {
  const router = createMemoryRouter([{ path: "/", element: <UserMenu user={{ username: "Jay" } as PlexUser} /> }]);
  render(<RouterProvider router={router} />);
  expect(screen.getByRole("button", { name: "Account Menu" })).toHaveAttribute("aria-expanded", "false");
});

it("keeps Trakt connected and reports a failed disconnect", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Trakt unavailable" }), { status: 503 })));
  render(<TraktConnectSection initial={{ available: true, connected: true, username: "Jay", scrobble: true }} />);
  fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Trakt unavailable"));
  expect(screen.getByText("Connected as Jay.")).toBeInTheDocument();
});
