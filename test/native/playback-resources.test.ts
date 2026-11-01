import { describe, expect, it, vi } from "vitest";
import {
  registerNativePlaybackSession,
  replaceNativePlaybackSession,
} from "~/lib/plex/playback-session.server";
import {
  requireOwnedPlayback,
  serializedTimeline,
} from "~/lib/native/playback-resources.server";

const principal = {
  deviceSessionId: "device-a",
  identityVersion: 1,
  serverMachineId: "machine",
  serverUrl: "http://plex.test",
  userId: "10",
  accountUserId: "10",
  serverToken: "profile-token",
  plexToken: "account-token",
  isOwner: true,
  profile: {
    userId: "10",
    title: "Owner",
    restricted: false,
    owner: true,
    protected: false,
  },
};

describe("native playback resource ownership", () => {
  it("does not expose a session to another device on the same account", () => {
    registerNativePlaybackSession("owned-by-a", principal, {
      ratingKey: "1",
      clientId: "client-owned-by-a",
      mediaId: "10",
      partIds: ["100"],
      partKeys: { "100": "/library/parts/100/file.mp4" },
      allowedSubtitleStreams: {},
      delivery: "file",
      hlsQuery: null,
    });

    expect(() =>
      requireOwnedPlayback("owned-by-a", {
        ...principal,
        deviceSessionId: "device-b",
      }),
    ).toThrowError(expect.objectContaining({ status: 404, code: "not_found" }));
  });

  it("ignores timeline work for a replaced session", async () => {
    const session = registerNativePlaybackSession("replaced", principal, {
      ratingKey: "1",
      clientId: "client-replaced",
      mediaId: "10",
      partIds: ["100"],
      partKeys: { "100": "/library/parts/100/file.mp4" },
      allowedSubtitleStreams: {},
      delivery: "hls",
      hlsQuery: "?session=replaced",
    });
    replaceNativePlaybackSession("replaced");
    const operation = vi.fn(async () => undefined);

    await expect(serializedTimeline(session, 1, operation)).resolves.toBe(false);
    expect(operation).not.toHaveBeenCalled();
  });
});