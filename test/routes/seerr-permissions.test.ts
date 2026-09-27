import { afterEach, expect, it, vi } from "vitest";
import { loader, action } from "~/routes/api.seerr";
vi.mock("~/lib/auth/user.server", () => ({ requireUser: async () => ({ id: 456 }) }));
vi.mock("~/lib/integrations/storage.server", () => ({ getIntegrations: async () => ({ seerr: { url: "http://seerr-permissions.test", apiKey: "fixture-key" } }) }));
afterEach(() => vi.unstubAllGlobals());
const status = (id: string) => loader({ request: new Request(`http://watchtower.test/api/seerr?type=tv&tmdbId=${id}`), params: {}, context: {} });
it("reads title availability under the mapped user's permissions", async () => {
  const upstream = vi.fn(async (url: string) => Response.json(url.includes("/user?") ? { results: [{ id: 23, plexId: 456 }] } : { mediaInfo: { status: 4 } }));
  vi.stubGlobal("fetch", upstream);
  const response = await status("123");
  expect(await response.json()).toMatchObject({ status: "partially_available" });
  const calls = vi.mocked(fetch).mock.calls;
  expect(new Headers(calls.at(-1)?.[1]?.headers).get("X-Api-User")).toBe("23");
});
it.each(["123wrong", "1.5", "9007199254740993"])("rejects ambiguous provider ID %s", async (id) => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  expect((await status(id)).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});

it("keeps a successful request distinct from a failed availability refresh", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = String(input);
    if (url.includes("/user?")) return Response.json({ results: [{ id: 23, plexId: 456 }] });
    if (url.endsWith("/request")) return Response.json({ id: 789 }, { status: 201 });
    return Response.json({ message: "Unavailable" }, { status: 503 });
  }));
  const response = await action({ request: new Request("http://watchtower.test/api/seerr", { method: "POST", body: JSON.stringify({ type: "tv", tmdbId: 123 }) }), params: {}, context: {} });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, status: null, statusError: expect.stringContaining("Request created") });
});

it("shows the viewer's request decisions without leaking another user's requests", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input) => Response.json(String(input).includes("/user?") ? { results: [{ id: 23, plexId: 456 }] } : {
    mediaInfo: { status: 1, status4k: 1, requests: [
      { id: 1, status: 3, is4k: false, requestedBy: { id: 23 } },
      { id: 2, status: 4, is4k: true, requestedBy: { id: 23 } },
      { id: 3, status: 1, is4k: false, requestedBy: { id: 99 } },
    ] },
  })));
  expect(await (await status("123")).json()).toMatchObject({ requests: [
    { id: 2, is4k: true, state: "Failed" }, { id: 1, is4k: false, state: "Declined" },
  ] });
});
