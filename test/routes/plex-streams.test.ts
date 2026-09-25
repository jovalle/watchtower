import { afterEach, expect, it, vi } from "vitest";
import { action } from "~/routes/api.plex.streams";

vi.mock("~/lib/auth/session.server", () => ({ requireServerToken: async () => "user-token" }));
vi.mock("~/lib/env.server", () => ({ env: { PLEX_SERVER_URL: "http://plex.test:32400", PLEX_CLIENT_ID: "wt" } }));
afterEach(() => vi.unstubAllGlobals());

const post = (body: unknown) =>
  action({
    request: new Request("http://watchtower.test/api/plex/streams", { method: "POST", body: JSON.stringify(body) }),
    params: {},
    context: {},
  });

it("saves the subtitle choice on the part with the user's token", async () => {
  const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", upstream);

  const response = await post({ partId: 500, subtitleStreamID: 0 });

  expect(response.status).toBe(200);
  const [url, init] = upstream.mock.calls[0];
  expect(url).toBe("http://plex.test:32400/library/parts/500?allParts=1&subtitleStreamID=0");
  expect(init.method).toBe("PUT");
  expect(init.headers["X-Plex-Token"]).toBe("user-token");
});

it.each([
  [{ audioStreamID: 1 }],
  [{ partId: 500 }],
  [{ partId: 500, audioStreamID: 1, subtitleStreamID: 2 }],
  [{ partId: 500, audioStreamID: 0 }],
  [{ partId: "500/../../:/prefs", audioStreamID: 1 }],
])("rejects %j without calling Plex", async (body) => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  expect((await post(body)).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});
