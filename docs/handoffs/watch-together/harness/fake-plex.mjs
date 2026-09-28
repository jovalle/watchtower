// Synthetic Plex Media Server for the Watch Together harness. Not a Plex emulator: fixed
// metadata for synthetic users, a pre-segmented test clip, and request logging.
import { createServer } from "node:http";
import { appendFileSync, createReadStream, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ART, PLEX_PORT, WORK } from "./paths.mjs";

const MEDIA = join(WORK, "media");
const LOG = join(ART, "fake-plex.jsonl");
const USERS = {
  "alice-token": { name: "Alice", allowed: ["4242", "4243"] },
  "bob-token": { name: "Bob", allowed: ["4242", "4243"] },
  "carol-token": { name: "Carol", allowed: [] },
  "dave-token": { name: "Dave", allowed: ["4242"] },
};
const throttle = new Map();
const playlist = readFileSync(join(MEDIA, "index.m3u8"), "utf8");

function episode(ratingKey) {
  const first = ratingKey === "4242";
  return {
    ratingKey, key: `/library/metadata/${ratingKey}`, type: "episode", title: `Synthetic Episode ${first ? 1 : 2}`,
    grandparentTitle: "Synthetic Show", parentTitle: "Season 1", parentRatingKey: "4200", grandparentRatingKey: "4100",
    parentIndex: 1, index: first ? 1 : 2, duration: 130000,
    Media: [{
      id: first ? 9001 : 9002, duration: 130000, container: "mp4", videoCodec: "h264", audioCodec: "aac", videoResolution: "360", bitrate: 600,
      Part: [{
        id: first ? 9101 : 9102, key: `/library/parts/${first ? 9101 : 9102}/file.mp4`, duration: 130000, container: "mp4",
        Stream: [
          { id: 1, streamType: 1, codec: "h264", displayTitle: "360p (H.264)", default: true },
          { id: 2, streamType: 2, codec: "aac", channels: 1, displayTitle: "English (AAC Mono)", language: "English", languageCode: "eng", selected: true, default: true },
        ],
      }],
    }],
    Marker: [
      { type: "intro", startTimeOffset: 5000, endTimeOffset: 15000 },
      { type: "credits", startTimeOffset: 118000, endTimeOffset: 130000 },
    ],
  };
}

const log = (entry) => appendFileSync(LOG, `${JSON.stringify({ at: Date.now(), ...entry })}\n`);
const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const delayFor = (token) => new Promise((resolve) => setTimeout(resolve, throttle.get(token) ?? 0));

function file(req, res, path, type) {
  const size = statSync(path).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (!range) {
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    return createReadStream(path).pipe(res);
  }
  const start = range[1] ? Number(range[1]) : 0;
  const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  res.writeHead(206, { "Content-Type": type, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" });
  createReadStream(path, { start, end }).pipe(res);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PLEX_PORT}`);
  if (url.pathname === "/__control/throttle") {
    const body = await new Promise((resolve) => { let data = ""; req.on("data", (chunk) => (data += chunk)); req.on("end", () => resolve(JSON.parse(data))); });
    throttle.set(body.token, body.delayMs);
    return json(res, 200, { ok: true });
  }
  const token = req.headers["x-plex-token"] ?? url.searchParams.get("X-Plex-Token");
  const user = USERS[token];
  const clientId = req.headers["x-plex-client-identifier"] ?? url.searchParams.get("X-Plex-Client-Identifier");
  if (!user) {
    log({ kind: "rejected-token", path: url.pathname });
    return json(res, 401, { error: "unauthorized" });
  }
  const path = url.pathname;
  const metadata = /^\/library\/metadata\/(\d+)$/.exec(path);
  if (metadata) {
    if (!["4242", "4243"].includes(metadata[1])) return json(res, 404, {});
    if (!user.allowed.includes(metadata[1])) return json(res, 403, {});
    return json(res, 200, { MediaContainer: { size: 1, Metadata: [episode(metadata[1])] } });
  }
  if (path === "/library/metadata/4200/children" || path === "/library/metadata/4100/allLeaves") {
    return json(res, 200, { MediaContainer: { Metadata: ["4242", "4243"].filter((key) => user.allowed.includes(key)).map(episode) } });
  }
  if (path === "/video/:/transcode/universal/decision") return json(res, 200, { MediaContainer: { generalDecisionCode: 1000 } });
  if (path === "/video/:/transcode/universal/start.m3u8") {
    const session = url.searchParams.get("session");
    log({ kind: "hls-start", user: user.name, clientId, session, offset: url.searchParams.get("offset") });
    res.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl" });
    return res.end(playlist.replace(/^(seg\d+\.ts)$/gm, `session/${session}/base/$1`));
  }
  const segment = /^\/video\/:\/transcode\/universal\/session\/[a-f0-9-]+\/base\/(seg\d+\.ts)$/.exec(path);
  if (segment) {
    await delayFor(token);
    return file(req, res, join(MEDIA, segment[1]), "video/mp2t");
  }
  if (/^\/video\/:\/transcode\/universal\/(ping|stop)$/.test(path)) {
    log({ kind: path.endsWith("stop") ? "hls-stop" : "hls-ping", user: user.name, clientId, session: url.searchParams.get("session") });
    return json(res, 200, {});
  }
  if (/^\/library\/parts\/910[12]\/file\.mp4$/.test(path)) {
    await delayFor(token);
    return file(req, res, join(MEDIA, "clip.mp4"), "video/mp4");
  }
  if (path === "/:/timeline") {
    log({ kind: "timeline", user: user.name, clientId, ratingKey: url.searchParams.get("ratingKey"), state: url.searchParams.get("state"), time: Number(url.searchParams.get("time")) });
    return json(res, 200, {});
  }
  if (path === "/:/scrobble") {
    log({ kind: "scrobble", user: user.name, key: url.searchParams.get("key") });
    return json(res, 200, {});
  }
  if (/^\/library\/parts\/\d+$/.test(path) && req.method === "PUT") return json(res, 200, {});
  return json(res, 404, {});
}).listen(PLEX_PORT, "127.0.0.1", () => console.log(`synthetic plex on ${PLEX_PORT}`));
