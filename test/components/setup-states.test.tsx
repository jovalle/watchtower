import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import Setup from "~/routes/setup";
vi.mock("@remix-run/react", async () => await import("react-router-dom"));
afterEach(cleanup);
it.each([false, true])("only enables setup connection submission when a server is reachable (%s)", async (ok) => {
  const router = createMemoryRouter([{ path: "/setup", element: <Setup />, loader: () => ({ step: "select", username: "Fixture", current: null, servers: [{ machineIdentifier: "fixture", name: "Fixture Server", connections: [{ uri: "http://127.0.0.1:32400", local: true, relay: false, ok, error: "Connection timed out", latencyMs: 10 }] }] }) }], { initialEntries: ["/setup"] });
  render(<RouterProvider router={router} />);
  const submit = await screen.findByRole("button", { name: "Use This Connection" });
  if (ok) expect(submit).toBeEnabled();
  else expect(submit).toBeDisabled();
});
