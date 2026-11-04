import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import Notifications from "~/routes/app.notifications";
import LinkDevicePage from "~/routes/app.link";

vi.mock("@remix-run/react", async () => await import("react-router-dom"));
afterEach(cleanup);

it("shows a notification load error without claiming the inbox is empty", async () => {
  const router = createMemoryRouter([{ path: "/", element: <Notifications />, loader: () => ({ notifications: [], limited: false, error: "Seerr unavailable" }) }]);
  render(<RouterProvider router={router} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Seerr unavailable");
  expect(screen.queryByText(/No updates yet/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark All Read" })).toBeDisabled();
});

it("disables read actions while submitting and exposes action errors", async () => {
  let finish!: (result: { error: string }) => void;
  const router = createMemoryRouter([{
    path: "/", element: <Notifications />,
    loader: () => ({ notifications: [{ id: "1", title: "Arrival", state: "Available", createdAt: 0, read: false, href: "/app/requests" }], error: null, limited: false }),
    action: () => new Promise((resolve) => { finish = resolve; }),
  }]);
  render(<RouterProvider router={router} />);
  fireEvent.click(await screen.findByRole("button", { name: "Mark All Read" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Mark Read" })).toBeDisabled());
  await act(async () => finish({ error: "Couldn't mark notifications read." }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't mark notifications read.");
});

it("prevents repeat TV link submissions and announces invalid codes as errors", async () => {
  let finish!: (result: { ok: boolean; message: string; authorization: null }) => void;
  const router = createMemoryRouter([{
    path: "/", element: <LinkDevicePage />,
    loader: () => ({ code: "ABCD-EFGH", csrf: "fixture", devices: [] }),
    action: () => new Promise((resolve) => { finish = resolve; }),
  }]);
  render(<RouterProvider router={router} />);
  const submit = await screen.findByRole("button", { name: "Continue" });
  fireEvent.click(submit);
  await waitFor(() => expect(submit).toBeDisabled());
  await act(async () => finish({ ok: false, message: "That code is invalid or has expired.", authorization: null }));
  expect(await screen.findByRole("alert")).toHaveTextContent("That code is invalid or has expired.");
  expect(submit).not.toBeDisabled();
});
