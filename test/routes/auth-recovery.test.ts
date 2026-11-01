import { expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ get: (key: string) => key === "pendingPinId" ? 12 : "/app/search", unset: vi.fn() }));
vi.mock("~/lib/auth/session.server", () => ({ getSession: async () => session, commitSession: async () => "cookie", createUserSession: vi.fn(), sanitizeRedirectTo: (value: string) => value }));
vi.mock("~/lib/auth/plex.server", () => ({ completeLogin: async () => null }));
import { loader } from "~/routes/auth.callback";
it("shows a retry page after an incomplete Plex sign-in", async () => {
  const response = await loader({ request: new Request("http://localhost/auth/callback"), params: {}, context: {} });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ redirectTo: "/app/search" });
  expect(session.unset).toHaveBeenCalledWith("pendingPinId");
});
