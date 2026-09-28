import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  destroySession: vi.fn(),
  getCurrentUser: vi.fn(),
  getWebDevice: vi.fn(),
  leaveDeviceMemberships: vi.fn(),
}));

vi.mock("~/lib/auth/session.server", () => ({
  getSession: mocks.getSession,
  destroySession: mocks.destroySession,
}));
vi.mock("~/lib/auth/user.server", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("~/lib/rooms/principal.server", () => ({ getWebDevice: mocks.getWebDevice }));
vi.mock("~/lib/rooms/coordinator.server", () => ({ leaveDeviceMemberships: mocks.leaveDeviceMemberships }));

import { action } from "~/routes/auth.logout";

beforeEach(() => {
  mocks.getSession.mockReset().mockResolvedValue({ session: true });
  mocks.destroySession.mockReset().mockResolvedValue("destroyed-cookie");
  mocks.getCurrentUser.mockReset().mockResolvedValue({ id: 42 });
  mocks.getWebDevice.mockReset().mockResolvedValue({ deviceSessionId: "device-1", setCookie: null });
  mocks.leaveDeviceMemberships.mockReset();
});

it("leaves memberships for the current user and web device before logout", async () => {
  const response = await action({ request: new Request("http://watchtower.test/auth/logout", { method: "POST" }), params: {}, context: {} });
  expect(mocks.leaveDeviceMemberships).toHaveBeenCalledWith("42", "device-1");
  expect(response.status).toBe(302);
  expect(response.headers.get("Set-Cookie")).toBe("destroyed-cookie");
});

it("still destroys the session when room identity cleanup fails", async () => {
  mocks.getWebDevice.mockRejectedValue(new Error("cookie unavailable"));
  const response = await action({ request: new Request("http://watchtower.test/auth/logout", { method: "POST" }), params: {}, context: {} });
  expect(response.status).toBe(302);
  expect(mocks.destroySession).toHaveBeenCalledWith({ session: true });
  expect(mocks.leaveDeviceMemberships).not.toHaveBeenCalled();
});