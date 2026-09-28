import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceCapabilities } from "~/lib/native/contract";
import type { UserSettings } from "~/lib/settings/types";
import { negotiatePlayback } from "~/lib/native/playback.server";
import {
  ownedNativePlaybackSession,
  registerNativePlaybackSession,
} from "~/lib/plex/playback-session.server";

const settings = vi.hoisted(() => ({
  getUserSettings: vi.fn<() => Promise<UserSettings | null>>(async () => null),
}));

vi.mock("~/lib/settings/storage.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/settings/storage.server")>()),
  getUserSettings: settings.getUserSettings,
}));

vi.mock("~/lib/native/principal.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/native/principal.server")>()),
  recheckPrincipal: vi.fn(async () => undefined),
}));

const principal = Object.freeze({ deviceSessionId: "device-a", identityVersion: 1, serverMachineId: "machine", serverUrl: "http://plex.test", userId: "1", accountUserId: "1", serverToken: "server-token", plexToken: "plex-token", isOwner: true, profile: { userId: "1", title: "Owner", restricted: false, owner: true, protected: false } });
const caps: DeviceCapabilities = { schemaVersion: 1, device: { manufacturer: "Test", model: "TV", sdkInt: 36 }, display: { widthPx: 1920, heightPx: 1080, refreshRatesHz: [24, 60], hdrTypes: [] }, video: [{ codec: "h264", profiles: [], maxWidth: 1920, maxHeight: 1080, maxFrameRate: 60, maxBitrateKbps: 20000, tenBit: false, hdrTypes: [] }], audio: [{ codec: "aac", maxChannels: 2, passthrough: false }], containers: ["mp4"], subtitles: ["srt", "vtt"], audioOutput: { type: "speaker", maxChannels: 2 }, maxVideoBitrateKbps: 20000 };
const metadata = { ratingKey: "1", key: "/library/metadata/1", guid: "plex://movie/0123456789abcdef01234567", type: "movie", title: "Movie", duration: 120000, Media: [{ id: 10, duration: 120000, bitrate: 2000, width: 1280, height: 720, videoCodec: "h264", audioCodec: "aac", audioChannels: 2, container: "mp4", Part: [{ id: 100, key: "/library/parts/100/file.mp4", duration: 120000, container: "mp4", Stream: [{ id: 1, streamType: 1, codec: "h264" }, { id: 2, streamType: 2, codec: "aac", channels: 2, selected: true }] }] }] };
const request = { ratingKey: "1", mediaId: null, startPositionMs: 0, audioStreamId: null, subtitleStreamId: null, subtitlesOff: true, quality: "original", forceTranscode: false, capabilities: caps, replacesPlaybackId: null, reason: "start" as const };

type MutableStream = Record<string, unknown> & {
  id: number;
  streamType: number;
  codec: string;
  channels?: number;
  selected?: boolean;
  key?: string;
};
type MutableMetadata = Record<string, unknown> & {
  Media: Array<
    Record<string, unknown> & {
      audioCodec: string;
      container: string;
      videoCodec: string;
      duration: number;
      Part: Array<
        Record<string, unknown> & {
          container: string;
          duration: number;
          Stream: MutableStream[];
        }
      >;
    }
  >;
};

function mutableMetadata(): MutableMetadata {
  return structuredClone(metadata) as unknown as MutableMetadata;
}

afterEach(() => {
  vi.unstubAllGlobals();
  settings.getUserSettings.mockReset();
  settings.getUserSettings.mockResolvedValue(null);
});

function plexFetch(
  item: unknown,
  decision: unknown = {
    MediaContainer: {
      generalDecisionCode: 1000,
      videoDecision: "copy",
      audioDecision: "transcode",
    },
  },
) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/library/metadata/1") {
      return Response.json({ MediaContainer: { Metadata: [item] } });
    }
    if (url.pathname === "/library/parts/100" && init?.method === "PUT") {
      return new Response(null, { status: 200 });
    }
    if (url.pathname.endsWith("/decision")) return Response.json(decision);
    return new Response(null, { status: 404 });
  });
}

describe("native playback negotiation", () => {
  it("serves every part directly when source and tracks fit declared capabilities", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input) => String(input).includes("/library/metadata/1") ? Response.json({ MediaContainer: { Metadata: [metadata] } }) : new Response(null, { status: 500 })));
    const result = await negotiatePlayback(principal, "TV", request);
    expect(result.delivery.method).toBe("direct_play");
    expect(result.delivery.mimeType).toBe("video/mp4");
    expect(result.delivery.parts[0].url).toBe(`/api/v1/playback/${result.playbackId}/file/100`);
    expect(ownedNativePlaybackSession(result.playbackId, principal)?.native?.deviceSessionId).toBe("device-a");
    expect(ownedNativePlaybackSession(result.playbackId, { ...principal, deviceSessionId: "device-b" })).toBeNull();
  });

  it("uses HLS direct stream when audio needs conversion", async () => {
    const incompatible = mutableMetadata(); incompatible.Media[0].audioCodec = "truehd"; incompatible.Media[0].Part[0].Stream[1].codec = "truehd";
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
    expect(
      upstream.mock.calls.some(([, init]) => init?.method === "PUT"),
    ).toBe(false);
  });

  it("normalizes Plex codec and container names before capability checks", async () => {
    const source = mutableMetadata();
    source.Media[0].audioCodec = "dca";
    source.Media[0].container = "m4v";
    source.Media[0].Part[0].container = "m4v";
    source.Media[0].Part[0].Stream[1].codec = "dca";
    vi.stubGlobal("fetch", plexFetch(source));

    const result = await negotiatePlayback(principal, "TV", request);

    expect(result.delivery.method).toBe("direct_stream");
    expect(result.source).toMatchObject({ audioCodec: "dts", container: "mp4" });
  });

  it("client-renders a supported embedded PGS subtitle for file delivery", async () => {
    const source = mutableMetadata();
    source.Media[0].Part[0].Stream.push({
      id: 3,
      streamType: 3,
      codec: "hdmv_pgs_subtitle",
      selected: true,
    });
    vi.stubGlobal("fetch", plexFetch(source));

    const result = await negotiatePlayback(principal, "TV", {
      ...request,
      subtitlesOff: false,
      capabilities: { ...caps, subtitles: ["pgs"] },
    });

    expect(result.delivery.method).toBe("direct_play");
    expect(result.tracks.subtitleDelivery).toBe("embedded");
    expect(result.tracks.sidecarUrl).toBeNull();
  });

  it("burns unsupported embedded PGS subtitles into HLS", async () => {
    const source = mutableMetadata();
    source.Media[0].Part[0].Stream.push({
      id: 3,
      streamType: 3,
      codec: "hdmv_pgs_subtitle",
      selected: true,
    });
    vi.stubGlobal("fetch", plexFetch(source));

    const result = await negotiatePlayback(principal, "TV", {
      ...request,
      subtitlesOff: false,
    });

    expect(result.delivery).toMatchObject({
      type: "hls",
      method: "transcode",
      mimeType: "application/x-mpegURL",
    });
    expect(result.tracks.subtitleDelivery).toBe("burned");
    expect(result.diagnostics).toEqual(["Selected subtitle is burned into HLS."]);
  });

  it("delivers an external normalized SRT sidecar during HLS playback", async () => {
    const source = mutableMetadata();
    source.Media[0].container = "mkv";
    source.Media[0].Part[0].container = "mkv";
    source.Media[0].Part[0].Stream.push({
      id: 3,
      streamType: 3,
      codec: "subrip",
      key: "/library/streams/3",
      selected: true,
    });
    vi.stubGlobal("fetch", plexFetch(source));

    const result = await negotiatePlayback(principal, "TV", {
      ...request,
      quality: "720p-4",
      subtitlesOff: false,
    });

    expect(result.tracks.subtitleDelivery).toBe("sidecar");
    expect(result.tracks.sidecarUrl).toBe(
      `/api/v1/playback/${result.playbackId}/subtitles/3`,
    );
    expect(result.delivery.mimeType).toBe("application/x-mpegURL");
  });

  it("uses the Matroska MIME type for direct MKV files", async () => {
    const source = mutableMetadata();
    source.Media[0].container = "mkv";
    source.Media[0].Part[0].container = "mkv";
    vi.stubGlobal("fetch", plexFetch(source));

    const result = await negotiatePlayback(principal, "TV", {
      ...request,
      capabilities: { ...caps, containers: ["mp4", "mkv"] },
    });

    expect(result.delivery).toMatchObject({
      method: "direct_play",
      mimeType: "video/x-matroska",
    });
  });

  it("uses an HDR10-compatible Dolby Vision 8 base layer without DV support", async () => {
    const source = mutableMetadata();
    source.Media[0].videoCodec = "HEVC";
    source.Media[0].videoProfile = "main 10";
    source.Media[0].bitDepth = 10;
    Object.assign(source.Media[0].Part[0].Stream[0], {
      codec: "hevc",
      DOVIProfile: 8,
      DOVIBLCompatID: 1,
    });
    const hevcCaps: DeviceCapabilities = {
      ...caps,
      video: [
        {
          codec: "hevc",
          profiles: ["MAIN 10"],
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 60,
          maxBitrateKbps: 20000,
          tenBit: true,
          hdrTypes: ["hdr10"],
        },
      ],
    };
    vi.stubGlobal("fetch", plexFetch(source));

    const result = await negotiatePlayback(principal, "TV", {
      ...request,
      capabilities: hevcCaps,
    });

    expect(result.delivery.method).toBe("direct_play");
    expect(result.source.hdr).toBe("dolby-vision");
  });

  it("transcodes Dolby Vision profile 5 when the client lacks DV", async () => {
    const source = mutableMetadata();
    source.Media[0].videoCodec = "hevc";
    source.Media[0].Part[0].Stream[0] = {
      id: 1,
      streamType: 1,
      codec: "hevc",
      DOVIProfile: 5,
    };
    const hevcCaps: DeviceCapabilities = {
      ...caps,
      video: [{ ...caps.video[0], codec: "hevc", hdrTypes: ["hdr10"] }],
    };
    vi.stubGlobal("fetch", plexFetch(source));

    const result = await negotiatePlayback(principal, "TV", {
      ...request,
      capabilities: hevcCaps,
    });

    expect(result.delivery.method).toBe("transcode");
  });

  it("prefers nested Plex stream decisions and writes only changed selections", async () => {
    const source = mutableMetadata();
    source.Media[0].Part[0].Stream.push({
      id: 4,
      streamType: 2,
      codec: "aac",
      channels: 2,
    });
    const upstream = plexFetch(source, {
      MediaContainer: {
        generalDecisionCode: "1000",
        videoDecision: "transcode",
        Metadata: [
          {
            Media: [
              {
                Part: [
                  {
                    Stream: [
                      { streamType: 1, decision: "copy" },
                      { streamType: 2, decision: "transcode" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    vi.stubGlobal("fetch", upstream);

    const result = await negotiatePlayback(principal, "TV", {
      ...request,
      quality: "720p-4",
      audioStreamId: "4",
    });

    expect(result.delivery.plexDecision).toEqual({
      video: "copy",
      audio: "transcode",
      subtitle: null,
    });
    const selectionCalls = upstream.mock.calls.filter(
      ([input, init]) =>
        new URL(String(input)).pathname === "/library/parts/100" &&
        init?.method === "PUT",
    );
    expect(selectionCalls).toHaveLength(1);
    const selectionUrl = new URL(String(selectionCalls[0][0]));
    expect(selectionUrl.searchParams.get("audioStreamID")).toBe("4");
    expect(selectionUrl.searchParams.has("subtitleStreamID")).toBe(false);
  });

  it("populates adjacent episodes, saved autoplay, and multipart resume offsets", async () => {
    const episode = mutableMetadata();
    Object.assign(episode, {
      type: "episode",
      ratingKey: "1",
      grandparentRatingKey: "show-1",
      viewOffset: 125_500,
    });
    episode.Media[0].duration = 180_000;
    episode.Media[0].Part.push({
      id: 101,
      key: "/library/parts/101/file.mp4",
      duration: 60_000,
      container: "mp4",
      Stream: [
        { id: 8, streamType: 1, codec: "h264" },
        { id: 9, streamType: 2, codec: "aac", channels: 2, selected: true },
      ],
    });
    settings.getUserSettings.mockResolvedValue({
      version: 1,
      traktUsername: null,
      imdbWatchlistIds: [],
      updatedAt: 0,
      preferences: {
        autoSkipIntro: true,
        autoPlayNextEpisode: false,
        showContinueWatching: true,
        showRecentlyAdded: true,
        showTrending: true,
        showCollections: true,
        discoveryDisabled: false,
      },
    });
    const upstream = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/library/metadata/1") {
        return Response.json({ MediaContainer: { Metadata: [episode] } });
      }
      if (url.pathname === "/library/metadata/show-1/allLeaves") {
        return Response.json({
          MediaContainer: {
            Metadata: [
              { ...episode, ratingKey: "0", title: "Previous" },
              episode,
              { ...episode, ratingKey: "2", title: "Next" },
            ],
          },
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", upstream);

    const result = await negotiatePlayback(principal, "TV", {
      ...request,
      startPositionMs: null,
    });

    expect(result.delivery.activePartIndex).toBe(1);
    expect(result.delivery.parts.map(({ startMs }) => startMs)).toEqual([
      0,
      120_000,
    ]);
    expect(result.tracks.selectedAudioStreamId).toBe("9");
    expect(result.nextItem?.title).toBe("Next");
    expect(result.previousItem?.title).toBe("Previous");
    expect(result.autoplay).toEqual({
      autoSkipIntro: true,
      autoPlayNextEpisode: false,
    });
  });

  it("stops an old HLS transcoder before marking its session replaced", async () => {
    const old = registerNativePlaybackSession("old-playback", principal, {
      ratingKey: "1",
      clientId: "watchtower-old-playback",
      mediaId: "10",
      partIds: ["100"],
      partKeys: { "100": "/library/parts/100/file.mp4" },
      allowedSubtitleStreams: {},
      delivery: "hls",
      hlsQuery: "?session=old-playback",
    });
    let replacedDuringStop: boolean | undefined;
    const upstream = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/library/metadata/1") {
        return Response.json({ MediaContainer: { Metadata: [metadata] } });
      }
      if (url.pathname.endsWith("/stop")) {
        replacedDuringStop = old.native?.replaced;
        return new Response(null, { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", upstream);

    await negotiatePlayback(principal, "TV", {
      ...request,
      replacesPlaybackId: "old-playback",
    });

    expect(replacedDuringStop).toBe(false);
    expect(old.native?.replaced).toBe(true);
    expect(
      upstream.mock.calls.some(([input]) =>
        new URL(String(input)).pathname.endsWith("/stop"),
      ),
    ).toBe(true);
  });

  it("rejects unknown media and stream identifiers", async () => {
    vi.stubGlobal("fetch", plexFetch(metadata));

    await expect(
      negotiatePlayback(principal, "TV", {
        ...request,
        mediaId: "missing",
      }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(
      negotiatePlayback(principal, "TV", {
        ...request,
        audioStreamId: "missing",
      }),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
  });

  it("returns unsupported_media when Plex rejects the decision", async () => {
    vi.stubGlobal(
      "fetch",
      plexFetch(metadata, {
        MediaContainer: { generalDecisionCode: 2000 },
      }),
    );

    await expect(
      negotiatePlayback(principal, "TV", {
        ...request,
        quality: "720p-4",
      }),
    ).rejects.toMatchObject({ status: 422, code: "unsupported_media" });
  });
});