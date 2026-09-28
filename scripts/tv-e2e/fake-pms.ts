/** Minimal fake Plex server for local isolated Watchtower TV testing. */
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const port = Number(process.argv[2] ?? process.env.PORT ?? 32499);
const media = path.resolve("tmp/tv-e2e/media/movie.mp4");
const metadata = { ratingKey: "1", key: "/library/metadata/1", guid: "plex://movie/0123456789abcdef01234567", type: "movie", title: "Harness Movie", duration: 120000, thumb: "/library/metadata/1/thumb/1", Media: [{ id: 10, duration: 120000, bitrate: 2500, width: 1280, height: 720, videoCodec: "h264", audioCodec: "aac", audioChannels: 2, container: "mp4", Part: [{ id: 100, key: "/library/parts/100/file.mp4", duration: 120000, size: 1, container: "mp4", Stream: [{ id: 1, streamType: 1, codec: "h264" }, { id: 2, streamType: 2, codec: "aac", channels: 2, selected: true }, { id: 3, streamType: 3, codec: "srt", key: "/library/streams/3" }] }] }] };
createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  console.log(JSON.stringify({ path: url.pathname, tokenPresent: request.headers["x-plex-token"] !== undefined || url.searchParams.has("X-Plex-Token") }));
  response.setHeader("Content-Type", "application/json");
  if (url.pathname === "/") return response.end(JSON.stringify({ MediaContainer: { machineIdentifier: "fake-machine", friendlyName: "Fake PMS", version: "1", platform: "test", platformVersion: "1", myPlex: true } }));
  if (url.pathname === "/library/sections") return response.end(JSON.stringify({ MediaContainer: { Directory: [{ key: "1", type: "movie", title: "Movies", uuid: "movies" }] } }));
  if (url.pathname === "/library/sections/1/all" || url.pathname === "/library/recentlyAdded") return response.end(JSON.stringify({ MediaContainer: { Metadata: [metadata], totalSize: 1, offset: Number(url.searchParams.get("X-Plex-Container-Start") ?? 0) } }));
  if (url.pathname === "/library/all") return response.end(JSON.stringify({ MediaContainer: { Metadata: [metadata], totalSize: 1, offset: Number(url.searchParams.get("X-Plex-Container-Start") ?? 0) } }));
  if (url.pathname === "/hubs/continueWatching/items" || url.pathname === "/hubs") return response.end(JSON.stringify({ MediaContainer: { Metadata: [], Hub: [] } }));
  if (url.pathname === "/library/metadata/1") return response.end(JSON.stringify({ MediaContainer: { Metadata: [metadata] } }));
  if (url.pathname === "/library/parts/100/file.mp4") {
    const size = statSync(media).size; const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? ""); const start = match ? Number(match[1]) : 0; const end = match?.[2] ? Number(match[2]) : size - 1;
    response.writeHead(match ? 206 : 200, { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Content-Length": end - start + 1, ...(match ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) }); return createReadStream(media, { start, end }).pipe(response);
  }
  if (url.pathname === "/library/streams/3") { response.setHeader("Content-Type", "text/plain"); return response.end("1\n00:00:00,000 --> 00:00:02,000\nHarness\n"); }
  if (url.pathname.endsWith("/decision")) return response.end(JSON.stringify({ MediaContainer: { generalDecisionCode: 1000, videoDecision: "copy", audioDecision: "copy" } }));
  if (url.pathname.endsWith("/start.m3u8")) { response.setHeader("Content-Type", "application/vnd.apple.mpegurl"); return response.end(`#EXTM3U\nsession/${url.searchParams.get("session")}/base/index.m3u8\n`); }
  if (/\/session\/[^/]+\/base\/index\.m3u8$/.test(url.pathname)) { response.setHeader("Content-Type", "application/vnd.apple.mpegurl"); return response.end(readFileSync(path.resolve("tmp/tv-e2e/media/hls/index.m3u8"), "utf8")); }
  if (/\/session\/[^/]+\/base\/segment-\d+\.ts$/.test(url.pathname)) { response.setHeader("Content-Type", "video/mp2t"); return createReadStream(path.resolve("tmp/tv-e2e/media/hls", path.basename(url.pathname))).pipe(response); }
  if (url.pathname.endsWith("/ping") || url.pathname.endsWith("/stop")) { response.statusCode = 200; return response.end("{}"); }
  if (["/:/timeline", "/:/scrobble", "/:/unscrobble", "/:/rate"].includes(url.pathname) || url.pathname.startsWith("/library/parts/")) { response.statusCode = 200; return response.end("{}"); }
  response.statusCode = 404; response.end(JSON.stringify({ MediaContainer: {} }));
}).listen(port, "127.0.0.1", () => console.error(`fake PMS listening on ${port}`));