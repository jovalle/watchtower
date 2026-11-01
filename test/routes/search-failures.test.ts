import { expect, it, vi } from "vitest";
const result = vi.hoisted(() => ({ plex: { success: false }, tmdb: { success: true, data: [] } }));
vi.mock("~/lib/auth/session.server", () => ({ requireServerToken: async () => "token" }));
vi.mock("~/lib/auth/user.server", () => ({ getCurrentUser: async () => null }));
vi.mock("~/lib/env.server", () => ({ env: { PLEX_SERVER_URL: "http://plex", PLEX_CLIENT_ID: "test" } }));
vi.mock("~/lib/plex/client.server", () => ({ PlexClient: class { search() { return result.plex; } } }));
vi.mock("~/lib/tmdb/client.server", () => ({ createTMDBClient: () => ({ searchMulti: () => result.tmdb }) }));
vi.mock("~/lib/integrations/seerr.server", () => ({ createSeerrClient: async () => null }));
import { loader } from "~/routes/app.search";
it("reports a failed library search separately from empty results", async () => {
  const response = await loader({ request: new Request("http://localhost/app/search?q=test"), params: {}, context: {} });
  expect(await response.json()).toMatchObject({ library: [], libraryError: true, discoverError: false });
});
