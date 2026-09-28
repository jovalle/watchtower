import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceCapabilities } from "~/lib/native/contract";
import { negotiatePlayback } from "~/lib/native/playback.server";
import { ownedNativePlaybackSession } from "~/lib/plex/playback-session.server";

vi.mock("~/lib/native/principal.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/native/principal.server")>()),
  recheckPrincipal: vi.fn(async () => undefined),
}));

const principal = Object.freeze({ deviceSessionId: "device-a", identityVersion: 1, serverMachineId: "machine", serverUrl: "http://plex.test", userId: "1", accountUserId: "1", serverToken: "server-token", plexToken: "plex-token", isOwner: true, profile: { userId: "1", title: "Owner", restricted: false, owner: true, protected: false } });
const caps: DeviceCapabilities = { schemaVersion: 1, device: { manufacturer: "Test", model: "TV", sdkInt: 36 }, display: { widthPx: 1920, heightPx: 1080, refreshRatesHz: [24, 60], hdrTypes: [] }, video: [{ codec: "h264", profiles: [], maxWidth: 1920, maxHeight: 1080, maxFrameRate: 60, maxBitrateKbps: 20000, tenBit: false, hdrTypes: [] }], audio: [{ codec: "aac", maxChannels: 2, passthrough: false }], containers: ["mp4"], subtitles: ["srt", "vtt"], audioOutput: { type: "speaker", maxChannels: 2 }, maxVideoBitrateKbps: 20000 };
const metadata = { ratingKey: "1", key: "/library/metadata/1", guid: "plex://movie/0123456789abcdef01234567", type: "movie", title: "Movie", duration: 120000, Media: [{ id: 10, duration: 120000, bitrate: 2000, width: 1280, height: 720, videoCodec: "h264", audioCodec: "aac", audioChannels: 2, container: "mp4", Part: [{ id: 100, key: "/library/parts/100/file.mp4", duration: 120000, container: "mp4", Stream: [{ id: 1, streamType: 1, codec: "h264" }, { id: 2, streamType: 2, codec: "aac", channels: 2, selected: true }] }] }] };
const request = { ratingKey: "1", mediaId: null, startPositionMs: 0, audioStreamId: null, subtitleStreamId: null, subtitlesOff: true, quality: "original", forceTranscode: false, capabilities: caps, replacesPlaybackId: null, reason: "start" as const };

afterEach(() => vi.unstubAllGlobals());

describe("native playback negotiation", () => {
  it("serves every part directly when source and tracks fit declared capabilities", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => String(input).includes("/library/metadata/1") ? Response.json({ MediaContainer: { Metadata: [metadata] } }) : new Response(null, { status: 500 })));
    const result = await negotiatePlayback(principal, "TV", request);
    expect(result.delivery.method).toBe("direct_play");
    expect(result.delivery.parts[0].url).toBe(`/api/v1/playback/${result.playbackId}/file/100`);
    expect(ownedNativePlaybackSession(result.playbackId, principal)?.native?.deviceSessionId).toBe("device-a");
    expect(ownedNativePlaybackSession(result.playbackId, { ...principal, deviceSessionId: "device-b" })).toBeNull();
  });

  it("uses HLS direct stream when audio needs conversion", async () => {
    const incompatible = structuredClone(metadata); incompatible.Media[0].audioCodec = "truehd"; incompatible.Media[0].Part[0].Stream[1].codec = "truehd";
    const upstream = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/library/metadata/1") return Response.json({ MediaContainer: { Metadata: [incompatible] } });
      if (url.pathname === "/library/parts/100" && init?.method === "PUT") return new Response(null, { status: 200 });
      if (url.pathname.endsWith("/decision")) return Response.json({ MediaContainer: { generalDecisionCode: 1000, videoDecision: "copy", audioDecision: "transcode" } });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", upstream);
    const result = await negotiatePlayback(principal, "TV", request);
    expect(result.delivery.method).toBe("direct_stream");
    expect(result.delivery.plexDecision).toEqual({ video: "copy", audio: "transcode", subtitle: null });
  });
});