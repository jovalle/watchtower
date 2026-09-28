import { afterEach, expect, it, vi } from "vitest";
import { loader } from "~/routes/app.watch.$ratingKey";

vi.mock("~/lib/auth/session.server", () => ({ requireServerToken: async () => "user-token" }));
vi.mock("~/lib/auth/user.server", () => ({ getCurrentUser: async () => null }));
vi.mock("~/lib/env.server", () => ({ env: { PLEX_SERVER_URL: "http://plex.test:32400", PLEX_CLIENT_ID: "wt", SESSION_SECRET: "test-secret", SECURE_COOKIES: false } }));
vi.mock("~/lib/rooms/principal.server", () => ({
  resolveRoomPrincipal: async () => ({ ok: true, principal: { deviceSessionId: "device-1" }, setCookie: null }),
  getWebDevice: async () => ({ deviceSessionId: "device-1", setCookie: null }),
}));
vi.mock("~/lib/rooms/coordinator.server", () => ({
  isWatchTogetherEnabled: () => true,
  getMemberPlaybackContext: () => ({
    roomId: "room-1",
    ratingKey: "42",
    mediaId: "900",
    partId: "901",
    targetPositionMs: 30_000,
    phase: "paused",
    isHost: false,
  }),
}));
afterEach(() => vi.unstubAllGlobals());

function plexItem(mediaId: number, partId: number) {
  return Response.json({ MediaContainer: { Metadata: [{
    ratingKey: "42",
    type: "movie",
    title: "Example",
    duration: 600_000,
    Media: [{ id: mediaId, Part: [{ id: partId, key: `/library/parts/${partId}/file.mkv` }] }],
  }] } });
}

it("streams the room's exact media and part for a member", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(plexItem(900, 901)));
  const response = await loader({ request: new Request("http://watchtower.test/app/watch/42?room=room-1"), params: { ratingKey: "42" }, context: {} });
  const data = await response.json();
  expect(data.mediaId).toBe("900");
  expect(data.partIdValue).toBe("901");
  expect(data.resumePositionSeconds).toBe(30);
});

it("refuses to substitute a different Plex media for the room's edition", async () => {
  const upstream = vi.fn().mockResolvedValue(plexItem(950, 951));
  vi.stubGlobal("fetch", upstream);
  const thrown = await loader({ request: new Request("http://watchtower.test/app/watch/42?room=room-1"), params: { ratingKey: "42" }, context: {} })
    .then(() => null, (error: unknown) => error);

  expect(thrown).toBeInstanceOf(Response);
  expect((thrown as Response).status).toBe(409);
  await expect((thrown as Response).text()).resolves.toContain("changed on Plex");
  // Only the metadata read happened: no playback session was started for the wrong media.
  expect(upstream).toHaveBeenCalledOnce();
});
