import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerNativePlaybackSession,
  replaceNativePlaybackSession,
} from "~/lib/plex/playback-session.server";
import {
  requireOwnedPlayback,
  proxyNativeFile,
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
  afterEach(() => vi.unstubAllGlobals());

  it("authorizes the selected part before direct streaming with the same playback identity", async () => {
    const session = registerNativePlaybackSession("direct-session", principal, {
      ratingKey: "1", clientId: "client-direct-session", mediaId: "20", mediaIndex: 2,
      partIds: ["100", "101"], partKeys: { "101": "/library/parts/101/file.mp4" },
      allowedSubtitleStreams: {}, delivery: "file", hlsQuery: null,
    });
    let approvedClient: string | null = null;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, options?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(options?.headers);
      if (url.pathname.endsWith("/decision")) {
        expect(url.searchParams.get("directPlay")).toBe("1");
        expect(url.searchParams.get("hasMDE")).toBe("1");
        expect(url.searchParams.get("mediaIndex")).toBe("2");
        expect(url.searchParams.get("partIndex")).toBe("1");
        expect(headers.get("X-Plex-Token")).toBe(principal.serverToken);
        approvedClient = headers.get("X-Plex-Client-Identifier");
        return Response.json({ MediaContainer: { Metadata: [{ Media: [{ Part: [{ decision: "directplay" }] }] }] } });
      }
      if (!approvedClient || headers.get("X-Plex-Client-Identifier") !== approvedClient) return new Response(null, { status: 503 });
      expect(headers.get("Range")).toBe("bytes=100-199");
      return new Response("media bytes", { status: 206, headers: { "Content-Range": "bytes 100-199/1000" } });
    }));
    const response = await proxyNativeFile(new Request("https://watchtower.test/file", { headers: { Range: "bytes=100-199" } }), principal, session, "101");
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 100-199/1000");
    expect(await response.text()).toBe("media bytes");
  });

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
