import { afterEach, expect, it, vi } from "vitest";
import { loader } from "~/routes/app.watch.$ratingKey";
import { action } from "~/routes/api.plex.scrobble";

vi.mock("~/lib/auth/session.server", () => ({ requireServerToken: async () => "user-token" }));
vi.mock("~/lib/auth/user.server", () => ({ getCurrentUser: async () => null }));
vi.mock("~/lib/env.server", () => ({ env: { PLEX_SERVER_URL: "http://plex.test:32400", PLEX_CLIENT_ID: "wt" } }));
afterEach(() => vi.unstubAllGlobals());

it.each([["?t=0", 0], ["", 125], ["?t=5000", 5], ["?t=broken", 125], ["?t=-1", 125], ["?t=5junk", 125]])(
  "resolves resume position for %s without treating zero as absent", async (query, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ MediaContainer: {
      Metadata: [{ ratingKey: "42", type: "movie", title: "Example", viewOffset: 125000, duration: 600000 }],
    } })));
    const response = await loader({ request: new Request(`http://watchtower.test/app/watch/42${query}`), params: { ratingKey: "42" }, context: {} });
    const data = await response.json();
    expect(data.resumePositionSeconds).toBe(expected);
    expect(new URL(data.streamUrl, "http://watchtower.test").searchParams.get("offset") ?? "0").toBe(String(expected));
  }
);

it.each([null, [], {}, { ratingKey: 42 }])("rejects invalid scrobble body %j before contacting Plex", async (body) => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const response = await action({ request: new Request("http://watchtower.test/api/plex/scrobble", { method: "POST", body: JSON.stringify(body) }), params: {}, context: {} });
  expect(response.status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});
