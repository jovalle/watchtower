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
await request("GET /api/v1/home", "/api/v1/home");
await request("GET /api/v1/libraries", "/api/v1/libraries");
await request("GET /api/v1/media/1", "/api/v1/media/1");
const caps = { schemaVersion: 1, device: { manufacturer: "Test", model: "Harness", sdkInt: 36 }, display: { widthPx: 1920, heightPx: 1080, refreshRatesHz: [60], hdrTypes: [] }, video: [{ codec: "h264", profiles: [], maxWidth: 1920, maxHeight: 1080, maxFrameRate: 60, maxBitrateKbps: 20000, tenBit: false, hdrTypes: [] }], audio: [{ codec: "aac", maxChannels: 2, passthrough: false }], containers: ["mp4"], subtitles: ["srt"], audioOutput: { type: "speaker", maxChannels: 2 }, maxVideoBitrateKbps: 20000 };
const playbackBody = { ratingKey: "1", mediaId: null, startPositionMs: 0, audioStreamId: null, subtitleStreamId: null, subtitlesOff: true, quality: "original", forceTranscode: false, capabilities: caps, replacesPlaybackId: null, reason: "start" };
const file = JSON.parse(await request("POST /api/v1/playback file", "/api/v1/playback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(playbackBody) }));
await request("GET file Range", `/api/v1/playback/${file.playbackId}/file/100`, { headers: { Range: "bytes=0-99" } });
const hls = JSON.parse(await request("POST /api/v1/playback HLS", "/api/v1/playback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...playbackBody, startPositionMs: 10000, quality: "720p-4", forceTranscode: true }) }));
const master = await request("GET HLS master", hls.delivery.parts[0].url);
const child = master.split("\n").find((line: string) => line && !line.startsWith("#"));
if (!child) throw new Error("HLS master did not contain a child playlist.");
const variant = await request("GET HLS child", child);
const segment = variant.split("\n").find((line: string) => line && !line.startsWith("#"));
if (!segment) throw new Error("HLS child playlist did not contain a segment.");
await request("GET HLS segment", segment);
await request("POST timeline", `/api/v1/playback/${hls.playbackId}/timeline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: "playing", positionMs: 12000, durationMs: 120000, sequence: 1 }) });
await request("POST stop", `/api/v1/playback/${hls.playbackId}/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positionMs: 12000, durationMs: 120000, sequence: 2 }) });
await writeFile(path.resolve("tmp/tv-e2e/smoke.log"), `${transcript.join("\n\n").replaceAll(token, "wtd_***")}\n`);
console.error("E2E smoke passed; transcript: ./tmp/tv-e2e/smoke.log");