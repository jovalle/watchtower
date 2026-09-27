import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider, Outlet } from "react-router-dom";
import WatchNavigation from "~/components/library/WatchNavigation";
import IssuePage from "~/routes/app.issues_.$id";

// Use one router instance: Remix bundles a different react-router version in this workspace.
vi.mock("@remix-run/react", async () => await import("react-router-dom"));

afterEach(cleanup);

it("navigates between the Movies and Series library tabs", async () => {
  const router = createMemoryRouter(
    [
      {
        path: "/app/watch",
        element: (
          <>
            <WatchNavigation />
            <Outlet />
          </>
        ),
        children: [
          { index: true, element: <p>Trending titles</p> },
          { path: "movies", element: <p>Movie library</p> },
          { path: "series", element: <p>Series library</p> },
        ],
      },
    ],
    { initialEntries: ["/app/watch"] }
  );
  render(<RouterProvider router={router} />);
  fireEvent.click(screen.getByRole("link", { name: "Movies" }));
  expect(await screen.findByText("Movie library")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Movies" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  fireEvent.click(screen.getByRole("link", { name: "Series" }));
  expect(await screen.findByText("Series library")).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/app/watch/series");
});

it("shows Seerr status 2 as resolved and submits a reopen action", async () => {
  let intent: FormDataEntryValue | null = null;
  const router = createMemoryRouter(
    [
      {
        path: "/app/issues/:id",
        element: <IssuePage />,
        loader: () => ({
          error: null,
          item: {
            id: 4,
            title: "Alien",
            status: 2,
            canEdit: true,
            comments: [
              {
                id: 1,
                message: "Audio restored",
                createdAt: "2026-09-25T12:00:00Z",
                user: { displayName: "Jay" },
              },
            ],
          },
        }),
        action: async ({ request }) => {
          intent = (await request.formData()).get("intent");
          return { error: null };
        },
      },
    ],
    { initialEntries: ["/app/issues/4"] }
  );
  render(<RouterProvider router={router} />);
  expect(await screen.findByText("Issue #4 · Resolved")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reopen issue" }));
  await waitFor(() => expect(intent).toBe("open"));
});
