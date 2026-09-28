/** Isolated local smoke driver. Reads only the test credential emitted by seed.ts. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.env.WATCHTOWER_URL ?? "http://127.0.0.1:9031";
const token = (await readFile(path.resolve("tmp/tv-e2e/token.txt"), "utf8")).trim();
const auth = { Authorization: `Bearer ${token}`, "X-Watchtower-Identity-Version": "1" };
const transcript: string[] = [];
async function request(label: string, url: string, init: RequestInit = {}) {
  const response = await fetch(`${root}${url}`, { ...init, headers: { ...auth, ...init.headers } });
  const contentType = response.headers.get("Content-Type") ?? "";
  const body = contentType.includes("json") || contentType.includes("mpegurl") ? await response.text() : `<${(await response.arrayBuffer()).byteLength} bytes>`;
  transcript.push(`### ${label}\nstatus=${response.status}\n${body}`);
  if (!response.ok) throw new Error(`${label} failed with ${response.status}: ${body}`);
  return body;
}

await request("GET /api/v1/instance", "/api/v1/instance");
await request("GET /api/v1/me", "/api/v1/me");
const home = JSON.parse(await request("GET /api/v1/home", "/api/v1/home"));
if (!home.rows.some((row: { kind: string }) => row.kind === "next_episodes")) {
  throw new Error("Home did not expose the next-episodes row.");
}
const libraries = JSON.parse(await request("GET /api/v1/libraries", "/api/v1/libraries"));
if (libraries.items.length !== 2) throw new Error("Expected movie and show libraries.");
await request("GET movie library", "/api/v1/libraries/1/items");
await request("GET show library", "/api/v1/libraries/2/items");
await request("GET /api/v1/media/1", "/api/v1/media/1");
await request("GET multipart metadata", "/api/v1/media/2");
await request("GET subtitled MKV metadata", "/api/v1/media/3");
await request("GET show seasons", "/api/v1/media/10/children");
await request("GET specials", "/api/v1/media/11/children");
await request("GET season episodes", "/api/v1/media/12/children");
await request("GET adjacent episode", "/api/v1/media/120/adjacent");
await request("GET search", "/api/v1/search?q=Harness&limit=10");
await request("GET collections", "/api/v1/libraries/1/collections");
await request("GET collection items", "/api/v1/collections/500/items");
await request("GET playlists", "/api/v1/playlists");
await request("GET playlist items", "/api/v1/playlists/600/items");
const caps = { schemaVersion: 1, device: { manufacturer: "Test", model: "Harness", sdkInt: 36 }, display: { widthPx: 1920, heightPx: 1080, refreshRatesHz: [60], hdrTypes: [] }, video: [{ codec: "h264", profiles: [], maxWidth: 1920, maxHeight: 1080, maxFrameRate: 60, maxBitrateKbps: 20000, tenBit: false, hdrTypes: [] }], audio: [{ codec: "aac", maxChannels: 2, passthrough: false }], containers: ["mp4"], subtitles: ["srt"], audioOutput: { type: "speaker", maxChannels: 2 }, maxVideoBitrateKbps: 20000 };
const playbackBody = { ratingKey: "1", mediaId: null, startPositionMs: 0, audioStreamId: null, subtitleStreamId: null, subtitlesOff: true, quality: "original", forceTranscode: false, capabilities: caps, replacesPlaybackId: null, reason: "start" };
const file = JSON.parse(await request("POST /api/v1/playback file", "/api/v1/playback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(playbackBody) }));
await request("GET file Range", `/api/v1/playback/${file.playbackId}/file/100`, { headers: { Range: "bytes=0-99" } });
const multipart = JSON.parse(await request("POST multipart playback", "/api/v1/playback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...playbackBody, ratingKey: "2", startPositionMs: 35000 }) }));
if (multipart.delivery.activePartIndex !== 1) throw new Error("Multipart resume did not select part two.");
await request("GET multipart part two", `/api/v1/playback/${multipart.playbackId}/file/201`, { headers: { Range: "bytes=0-99" } });
const subtitled = JSON.parse(await request("POST subtitled MKV playback", "/api/v1/playback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...playbackBody, ratingKey: "3", mediaId: "30", subtitleStreamId: "304", subtitlesOff: false, capabilities: { ...caps, containers: ["mp4", "mkv"] } }) }));
if (subtitled.tracks.subtitleDelivery !== "sidecar" || !subtitled.tracks.sidecarUrl) throw new Error("External SRT was not delivered as a sidecar.");
await request("GET subtitle sidecar", subtitled.tracks.sidecarUrl);
const hls = JSON.parse(await request("POST /api/v1/playback HLS", "/api/v1/playback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...playbackBody, startPositionMs: 10000, quality: "720p-4", forceTranscode: true }) }));
const master = await request("GET HLS master", hls.delivery.parts[0].url);
const child = master.split("\n").find((line: string) => line && !line.startsWith("#"));
if (!child) throw new Error("HLS master did not contain a child playlist.");
const variant = await request("GET HLS child", child);
const segment = variant.split("\n").find((line: string) => line && !line.startsWith("#"));
if (!segment) throw new Error("HLS child playlist did not contain a segment.");
await request("GET HLS segment", segment);
await request("POST timeline", `/api/v1/playback/${hls.playbackId}/timeline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: "playing", positionMs: 12000, durationMs: 120000, sequence: 1 }) });
await request("PUT watched", "/api/v1/media/1/watched", { method: "PUT" });
await request("PUT rating", "/api/v1/media/1/rating", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: 8 }) });
await request("POST stop", `/api/v1/playback/${hls.playbackId}/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positionMs: 12000, durationMs: 120000, sequence: 2 }) });
const callResponse = await fetch("http://127.0.0.1:32499/__calls");
if (!callResponse.ok) throw new Error("Could not read fake PMS call audit.");
const calls = await callResponse.json() as Array<{ path: string; method: string; expectedProfileToken: boolean }>;
const mutationPaths = ["/:/timeline", "/:/scrobble", "/:/rate", "/library/parts/100"];
for (const expected of mutationPaths) {
  if (!calls.some((call) => call.path.startsWith(expected))) throw new Error(`Missing recorded mutation: ${expected}`);
}
if (calls.some((call) => !call.expectedProfileToken)) throw new Error("A fake PMS request did not use the expected per-profile token.");
transcript.push(`### fake PMS call audit\nstatus=200\n${JSON.stringify(calls)}`);
const redacted = transcript.join("\n\n")
  .replaceAll(token, "wtd_***")
  .replace(/wtd_[A-Za-z0-9_-]{43}/g, "wtd_***");
await writeFile(path.resolve("tmp/tv-e2e/smoke.log"), `${redacted}\n`);
console.error("E2E smoke passed; transcript: ./tmp/tv-e2e/smoke.log");