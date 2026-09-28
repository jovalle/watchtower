import { describe, expect, it } from "vitest";
import { rewritePlaylistUrls } from "~/lib/plex/hls-proxy.server";

describe.each([
  {
    client: "web",
    base: "https://watchtower.test/api/plex/hls/42",
  },
  {
    client: "native",
    base: "https://watchtower.test/api/v1/playback/playback-1/hls",
  },
])("$client HLS playlist rewriting", ({ base }) => {
  it("maps absolute other-host media and URI attributes through the local proxy", () => {
    const playlist = [
      "#EXTM3U",
      '#EXT-X-MAP:URI="https://node.plex.direct:32400/video/:/transcode/universal/session/s/init.mp4?X-Plex-Token=secret&foo=1"',
      "https://node.plex.direct:32400/video/:/transcode/universal/session/s/chunk.ts?X-Plex-Token=secret&bar=2",
    ].join("\n");

    expect(
      rewritePlaylistUrls(
        playlist,
        base,
        "http://configured-plex.test:32400/video/:/transcode/universal/start.m3u8",
      ),
    ).toBe(
      [
        "#EXTM3U",
        `#EXT-X-MAP:URI="${base}/session/s/init.mp4?foo=1"`,
        `${base}/session/s/chunk.ts?bar=2`,
      ].join("\n"),
    );
  });
});