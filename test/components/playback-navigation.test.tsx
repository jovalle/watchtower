import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Link, useOutletContext } from "@remix-run/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AppLayout from "~/routes/app";

vi.mock("@remix-run/react", async () => ({
  ...(await import("react-router-dom")),
  useLoaderData: () => ({ user: {} }),
}));
vi.mock("~/components/layout", () => ({ Header: () => null }));
vi.mock("~/lib/auth/session.server", () => ({}));
vi.mock("~/lib/auth/plex.server", () => ({}));
vi.mock("~/lib/config/server-config.server", () => ({}));
afterEach(cleanup);

function PlayerDestination() {
  const { playbackBackTo } = useOutletContext<{ playbackBackTo: string }>();
  return (
    <>
      <output aria-label="Back destination">{playbackBackTo}</output>
      <Link to="?t=600000">Seek</Link>
    </>
  );
}

it.each([
  "/app/search?q=boys",
  "/app/watch/movies?sort=titleSort",
  "/app/watch/series?filter=unwatched",
  "/app/watch/recent?tab=top10",
  "/app/watch/42?t=100000",
])("remembers a non-player page across seek navigation from %s", (entry) => {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="app" element={<AppLayout />}>
          <Route
            path="search"
            element={<Link to="/app/watch/42?t=100000">Play</Link>}
          />
          <Route
            path="watch/movies"
            element={<Link to="/app/watch/42?t=100000">Play</Link>}
          />
          <Route
            path="watch/recent"
            element={<Link to="/app/watch/42?t=100000">Play</Link>}
          />
          <Route
            path="watch/series"
            element={<Link to="/app/watch/42?t=100000">Play</Link>}
          />
          <Route path="watch/:id" element={<PlayerDestination />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  if (!entry.startsWith("/app/watch/42"))
    fireEvent.click(screen.getByText("Play"));
  fireEvent.click(screen.getByText("Seek"));
  expect(screen.getByLabelText("Back destination")).toHaveTextContent(
    !entry.startsWith("/app/watch/42") ? entry : /^\/app$/
  );
});

it("restores focus to the same browse control when returning from a title", () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  try {
    render(<MemoryRouter initialEntries={["/app/search?q=fixture"]}><Routes><Route path="app" element={<AppLayout />}>
      <Route path="search" element={<><h1>Search</h1><Link to="/app/media/movie/42">Fixture movie</Link><Link to="/app/media/movie/43">Other movie</Link></>} />
      <Route path="media/movie/:id" element={<><h1>Title detail</h1><Link to="/app/search?q=fixture">Back to results</Link></>} />
    </Route></Routes></MemoryRouter>);
    screen.getByText("Fixture movie").focus();
    fireEvent.click(screen.getByText("Fixture movie"));
    expect(screen.getByText("Title detail")).toHaveFocus();
    fireEvent.click(screen.getByText("Back to results"));
    expect(screen.getByText("Fixture movie")).toHaveFocus();
  } finally {
    if (original) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
});
