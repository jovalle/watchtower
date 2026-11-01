import { StrictMode } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixtures from "../../fixtures/rooms/v1/fixtures.json";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@remix-run/react", () => ({
  useLoaderData: () => ({ signedIn: false }),
  useNavigate: () => navigate,
}));
vi.mock("~/lib/auth/session.server", () => ({ getPlexToken: vi.fn() }));
import JoinLanding from "~/routes/join";
import JoinRoomPage from "~/routes/app.rooms.join";

beforeEach(() => {
  navigate.mockReset();
  sessionStorage.clear();
  history.replaceState(null, "", "/join#i=secret-fragment");
});
afterEach(cleanup);

it("stores the fragment invite, strips it from history, and routes login itself", async () => {
  render(<JoinLanding />);
  await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  expect(sessionStorage.getItem("wt:invite")).toBe("secret-fragment");
  expect(location.hash).toBe("");
  expect(navigate).toHaveBeenCalledWith(
    "/auth/redirect?redirectTo=%2Fapp%2Frooms%2Fjoin",
    { replace: true }
  );
});

it("joins and navigates exactly once under React StrictMode", async () => {
  const envelope = structuredClone(fixtures.createResponse);
  sessionStorage.setItem("wt:invite", "strict-invite");
  const fetchMock = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    if (url === "/api/v1/clock") {
      const now = performance.now();
      return new Response(JSON.stringify({
        ...fixtures.clock,
        receivedAtMs: now,
        sentAtMs: now,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(envelope), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <StrictMode>
      <JoinRoomPage />
    </StrictMode>
  );

  await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  expect(
    fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")
  ).toHaveLength(1);
  expect(navigate).toHaveBeenCalledWith(
    `/app/watch/${envelope.snapshot.media.ratingKey}?room=${envelope.snapshot.roomId}`,
    { replace: true }
  );
  expect(sessionStorage.getItem("wt:invite")).toBeNull();
});