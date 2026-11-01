import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeError } from "~/lib/native/http.server";
import { registerNativePlaybackSession } from "~/lib/plex/playback-session.server";

const plex = vi.hoisted(() => ({
  getMetadata: vi.fn(),
  reportTimeline: vi.fn(),
  scrobble: vi.fn(),
}));
const principal = vi.hoisted(() => ({
  requireNativePrincipal: vi.fn(),
  recheckPrincipal: vi.fn(),
}));

vi.mock("~/lib/native/catalog.server", () => ({
  nativePlexClient: () => plex,
  plexData: <T>(result: { success: true; data: T }) => result.data,
}));
vi.mock("~/lib/native/principal.server", () => ({
  requireNativePrincipal: principal.requireNativePrincipal,
  recheckPrincipal: principal.recheckPrincipal,
}));
vi.mock("~/lib/trakt/scrobble.server", () => ({
  scrobbleTimeline: vi.fn(async () => undefined),
}));

import { action } from "~/routes/api.v1.media.$ratingKey.watched";
import { action as timelineAction } from "~/routes/api.v1.playback.$playbackId.timeline";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("native mutation identity races", () => {
  it("rejects a profile switch before the Plex write", async () => {
    principal.requireNativePrincipal.mockResolvedValue({
      deviceSessionId: "device-1",
      identityVersion: 1,
    });
    principal.recheckPrincipal.mockRejectedValue(
      new NativeError(
        409,
        "identity_version_mismatch",
        "The active profile changed.",
      ),
    );
    plex.getMetadata.mockResolvedValue({ success: true, data: {} });

    const response = await action({
      request: new Request("https://watchtower.test/api/v1/media/1/watched", {
        method: "PUT",
      }),
      params: { ratingKey: "1" },
      context: {},
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "identity_version_mismatch" },
    });
    expect(plex.scrobble).not.toHaveBeenCalled();
  });

  it("rejects queued timeline work when the profile changes while it waits", async () => {
    const activePrincipal = {
      deviceSessionId: "device-1",
      identityVersion: 1,
      serverMachineId: "machine-1",
      serverUrl: "http://plex.test:32400",
      userId: "10",
      accountUserId: "10",
      serverToken: "old-server-token",
      plexToken: "old-plex-token",
      isOwner: true,
      profile: {
        userId: "10",
        title: "Owner",
        restricted: false,
        owner: true,
        protected: false,
      },
    };
    registerNativePlaybackSession("queued-race", activePrincipal, {
      ratingKey: "1",
      clientId: "client-queued-race",
      mediaId: "10",
      partIds: ["100"],
      partKeys: { "100": "/library/parts/100/file.mp4" },
      allowedSubtitleStreams: {},
      delivery: "file",
      hlsQuery: null,
    });
    principal.requireNativePrincipal.mockResolvedValue(activePrincipal);
    principal.recheckPrincipal
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new NativeError(
          409,
          "identity_version_mismatch",
          "The active profile changed. Retry from the current identity.",
        ),
      );
    let releaseFirstWrite!: () => void;
    plex.reportTimeline.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirstWrite = () => resolve({ success: true, data: {} });
        }),
    );

    const timelineRequest = (sequence: number) =>
      new Request(
        "https://watchtower.test/api/v1/playback/queued-race/timeline",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            state: "playing",
            positionMs: sequence * 1_000,
            durationMs: 60_000,
            sequence,
          }),
        },
      );
    const first = timelineAction({
      request: timelineRequest(1),
      params: { playbackId: "queued-race" },
      context: {},
    });
    await vi.waitFor(() => expect(plex.reportTimeline).toHaveBeenCalledTimes(1));
    const queued = timelineAction({
      request: timelineRequest(2),
      params: { playbackId: "queued-race" },
      context: {},
    });
    releaseFirstWrite();

    expect((await first).status).toBe(200);
    const queuedResponse = await queued;
    expect(queuedResponse.status).toBe(409);
    expect(await queuedResponse.json()).toMatchObject({
      error: { code: "identity_version_mismatch" },
    });
    expect(plex.reportTimeline).toHaveBeenCalledTimes(1);
    expect(principal.recheckPrincipal).toHaveBeenCalledTimes(2);
  });
});