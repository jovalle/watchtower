import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loader } from "~/routes/api.plex.hls.$ratingKey.$";
import { loader as directLoader } from "~/routes/api.plex.stream.$ratingKey";
import { registerPlaybackSession } from "~/lib/plex/playback-session.server";

vi.mock("~/lib/auth/session.server", () => ({ requireServerToken: async () => "session-token" }));
vi.mock("~/lib/env.server", () => ({ env: { PLEX_SERVER_URL: "http://plex.test:32400" } }));
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  for (const session of ["unique", "s"]) registerPlaybackSession(session, "42", "http://plex.test:32400", "session-token", `test-${session}`);
});

it("negotiates before starting a stream and authenticates both requests from the session", async () => {
  let negotiated = false;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = new URL(input);
    expect(url.searchParams.get("X-Plex-Token")).toBe("session-token");
    if (url.pathname.endsWith("/decision")) {
      negotiated = true;
      return Response.json({ MediaContainer: { generalDecisionCode: 1001 } });
    }
    return negotiated
      ? new Response("#EXTM3U\nsession/unique/base/index.m3u8", { headers: { "Content-Type": "application/vnd.apple.mpegurl" } })
      : new Response("No media decision", { status: 400 });
  }));
  const response = await loader({
    request: new Request("http://watchtower.test/api/plex/hls/42/start.m3u8?session=unique&X-Plex-Token=untrusted-token"),
    params: { ratingKey: "42", "*": "start.m3u8" }, context: {},
  });
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("#EXTM3U\nhttp://watchtower.test/api/plex/hls/42/session/unique/base/index.m3u8");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});

it("surfaces a refused media decision without starting a doomed stream", async () => {
  const upstream = vi.fn().mockResolvedValue(Response.json({ MediaContainer: { generalDecisionCode: 2000 } }));
  vi.stubGlobal("fetch", upstream);
  const response = await loader({ request: new Request("http://watchtower.test/api/plex/hls/42/start.m3u8?session=unique"), params: { ratingKey: "42", "*": "start.m3u8" }, context: {} });
  expect(response.status).toBe(422);
  expect(await response.text()).toMatch(/cannot play this item/);
  expect(upstream).toHaveBeenCalledTimes(1);
});

it("preserves byte ranges for HLS media and unsatisfiable range responses", async () => {
  const upstream = vi.fn().mockImplementation(async (_url, init) => {
    expect(new Headers(init.headers).get("Range")).toBe("bytes=10-19");
    return new Response("0123456789", { status: 206, headers: { "Content-Range": "bytes 10-19/100", "Accept-Ranges": "bytes", "Content-Length": "10" } });
  });
  vi.stubGlobal("fetch", upstream);
  const args = { request: new Request("http://watchtower.test/api/plex/hls/42/session/s/file.mp4", { headers: { Range: "bytes=10-19" } }), params: { ratingKey: "42", "*": "session/s/file.mp4" }, context: {} };
  const response = await loader(args);
  expect(response.status).toBe(206);
  expect(response.headers.get("Content-Range")).toBe("bytes 10-19/100");
  expect(await response.text()).toBe("0123456789");
  upstream.mockResolvedValue(new Response(null, { status: 416, headers: { "Content-Range": "bytes */100" } }));
  const rejected = await loader(args);
  expect(rejected.status).toBe(416);
  expect(rejected.headers.get("Content-Range")).toBe("bytes */100");
});

it("resolves media and URI attributes against a redirected playlist without leaking tokens", async () => {
  const playlist = new Response('#EXTM3U\n#EXT-X-MAP:URI="init.mp4?X-Plex-Token=secret"\n../chunk.ts?X-Plex-Token=secret', { headers: { "Content-Type": "application/vnd.apple.mpegurl" } });
  Object.defineProperty(playlist, "url", { value: "http://plex.test:32400/video/:/transcode/universal/session/s/base/index.m3u8" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(playlist));
  const response = await loader({ request: new Request("http://watchtower.test/api/plex/hls/42/session/s/index.m3u8"), params: { ratingKey: "42", "*": "session/s/index.m3u8" }, context: {} });
  expect(await response.text()).toBe('#EXTM3U\n#EXT-X-MAP:URI="http://watchtower.test/api/plex/hls/42/session/s/base/init.mp4"\nhttp://watchtower.test/api/plex/hls/42/session/s/chunk.ts');
});

it("cancels direct-file transport when the browser disconnects", async () => {
  const abort = new AbortController();
  let streamSignal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    if (String(input).includes("/library/metadata/")) return Response.json({ MediaContainer: { Metadata: [{ Media: [{ Part: [{ key: "/library/parts/5/file.mp4" }] }] }] } });
    streamSignal = init?.signal as AbortSignal;
    return new Response("media", { headers: { "Content-Type": "video/mp4" } });
  }));
  const response = await directLoader({ request: new Request("http://watchtower.test/api/plex/stream/42", { signal: abort.signal }), params: { ratingKey: "42" }, context: {} });
  expect(await response.text()).toBe("media");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  abort.abort();
  expect(streamSignal?.aborted).toBe(true);
});

it.each(["start.m3u8", "stop", "ping", "session/foreign/chunk.ts"])("rejects another user's session for %s before contacting Plex", async (resource) => {
  registerPlaybackSession("foreign", "42", "http://plex.test:32400", "other-user-token", "other-client");
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  const response = await loader({ request: new Request(`http://watchtower.test/api/plex/hls/42/${resource}?session=foreign`), params: { ratingKey: "42", "*": resource }, context: {} });
  expect(response.status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});
