import { afterEach, describe, expect, it, vi } from "vitest";
import { nativePlexClient } from "~/lib/native/catalog.server";
import { registerNativePlaybackSession } from "~/lib/plex/playback-session.server";
import { action as timeline } from "~/routes/api.v1.playback.$playbackId.timeline";
import { action as stop } from "~/routes/api.v1.playback.$playbackId.stop";

vi.mock("~/lib/native/principal.server", () => ({
  requireNativePrincipal: vi.fn(async () => principal),
  recheckPrincipal: vi.fn(async () => undefined),
  markPrincipalForVerification: vi.fn(),
}));
vi.mock("~/lib/plex/cache.server", () => ({
  invalidateCache: vi.fn(async () => undefined),
  getUserCacheKey: vi.fn(() => "home"),
}));
vi.mock("~/lib/trakt/scrobble.server", () => ({
  scrobbleTimeline: vi.fn(async () => undefined),
}));

const principal = {
  deviceSessionId: "timeline-device",
  identityVersion: 1,
  serverMachineId: "machine",
  serverUrl: "http://plex.test",
  userId: "1",
  accountUserId: "1",
  serverToken: "profile-token",
  plexToken: "account-token",
  isOwner: true,
  profile: { userId: "1", title: "Owner", restricted: false, owner: true, protected: false },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("native Plex timeline identity", () => {
  it.each([
    ["timeline", timeline, "playing", 200],
    ["stop", stop, "stopped", 204],
  ] as const)("reports %s with the stream's client identity", async (name, action, state, status) => {
    const playbackId = `timeline-identity-${name}`;
    registerNativePlaybackSession(playbackId, principal, {
      ratingKey: "42",
      clientId: "watchtower-isolated-stream",
      mediaId: "10",
      partIds: ["100"],
      partKeys: { "100": "/library/parts/100/file.mp4" },
      allowedSubtitleStreams: {},
      delivery: "hls",
      hlsQuery: "?session=timeline-session",
    });
    const upstream = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", upstream);

    const response = await action({
      request: new Request(`http://watchtower.test/api/v1/playback/${playbackId}/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "playing", positionMs: 351000, durationMs: 1594240, sequence: 1 }),
      }),
      params: { playbackId },
      context: {},
    });

    expect(response.status).toBe(status);
    const [url, options] = upstream.mock.calls[0];
    expect(new URL(String(url)).pathname).toBe("/:/timeline");
    expect(new URL(String(url)).searchParams.get("state")).toBe(state);
    expect(new URL(String(url)).searchParams.get("time")).toBe("351000");
    expect(new Headers(options?.headers).get("X-Plex-Client-Identifier")).toBe("watchtower-isolated-stream");
    expect(new Headers(options?.headers).get("X-Plex-Token")).toBe("profile-token");
  });

  it("keeps the configured client identity for catalog callers", async () => {
    vi.stubEnv("PLEX_CLIENT_ID", "watchtower-catalog");
    const upstream = vi.fn<typeof fetch>(async () => Response.json({ MediaContainer: { Metadata: [{ ratingKey: "42" }] } }));
    vi.stubGlobal("fetch", upstream);

    await nativePlexClient(principal).getMetadata("42");

    const [, options] = upstream.mock.calls[0];
    expect(new Headers(options?.headers).get("X-Plex-Client-Identifier")).toBe("watchtower-catalog");
  });

  it.each(["HTTP 503", "network"])("stops the transcoder while preserving a final timeline %s failure", async (failure) => {
    const playbackId = `stop-failure-${failure}`;
    registerNativePlaybackSession(playbackId, principal, {
      ratingKey: "42", clientId: "watchtower-isolated-stream", mediaId: "10", partIds: ["100"],
      partKeys: { "100": "/library/parts/100/file.mp4" }, allowedSubtitleStreams: {}, delivery: "hls", hlsQuery: "?session=timeline-session",
    });
    const upstream = vi.fn<typeof fetch>(async (input) => {
      if (new URL(String(input)).pathname === "/:/timeline") {
        if (failure === "network") throw new TypeError("fetch failed");
        return new Response(null, { status: 503 });
      }
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", upstream);

    const response = await stop({
      request: new Request(`http://watchtower.test/api/v1/playback/${playbackId}/stop`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionMs: 351000, durationMs: 1594240, sequence: 1 }),
      }), params: { playbackId }, context: {},
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "upstream_unavailable", retryable: true } });
    expect(upstream.mock.calls.map(([input]) => new URL(String(input)).pathname))
      .toEqual(["/:/timeline", "/video/:/transcode/universal/stop"]);
  });

  it("does not send a transcoder command for an invalid stop body", async () => {
    const playbackId = "invalid-stop-body";
    registerNativePlaybackSession(playbackId, principal, {
      ratingKey: "42", clientId: "watchtower-isolated-stream", mediaId: "10", partIds: ["100"],
      partKeys: { "100": "/library/parts/100/file.mp4" }, allowedSubtitleStreams: {}, delivery: "hls", hlsQuery: "?session=timeline-session",
    });
    const upstream = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", upstream);
    const response = await stop({
      request: new Request(`http://watchtower.test/api/v1/playback/${playbackId}/stop`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionMs: -1, durationMs: 1594240, sequence: 1 }),
      }), params: { playbackId }, context: {},
    });
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
