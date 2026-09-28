// Prepares tmp/wt-harness: synthetic media, isolated server config, session secret and signed cookies.
import { createCookieSessionStorage } from "@remix-run/node";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLEX_PORT, WORK } from "./paths.mjs";

const media = join(WORK, "media");
const config = join(WORK, "data", "config");
const artifacts = join(WORK, "artifacts");
for (const dir of [media, config, artifacts]) mkdirSync(dir, { recursive: true, mode: 0o700 });

if (!existsSync(join(media, "index.m3u8"))) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=130",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=130",
    "-c:v", "libx264", "-preset", "veryfast", "-g", "50", "-keyint_min", "50", "-sc_threshold", "0", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", join(media, "clip.mp4")]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", join(media, "clip.mp4"), "-c", "copy",
    "-f", "hls", "-hls_time", "2", "-hls_playlist_type", "vod", "-hls_segment_filename", join(media, "seg%05d.ts"), join(media, "index.m3u8")]);
}

const secret = `harness-only-${randomBytes(16).toString("hex")}`;
writeFileSync(join(artifacts, ".secret"), secret, { mode: 0o600 });
writeFileSync(join(config, "server.json"), JSON.stringify({
  version: 1,
  serverUrl: `http://127.0.0.1:${PLEX_PORT}`,
  machineIdentifier: "synthetic-machine",
  serverName: "Synthetic",
  // The synthetic upstream rejects this token, so any owner-token fallback would fail loudly.
  token: "owner-synthetic-token-never-accepted",
  adminUserId: 1001,
  adminUsername: "alice",
  configuredAt: Date.now(),
}), { mode: 0o600 });

const storage = createCookieSessionStorage({ cookie: { name: "__plex_session", httpOnly: true, path: "/", sameSite: "lax", secrets: [secret], secure: false } });
const cookies = {};
for (const [name, isOwner] of [["alice", true], ["bob", false], ["carol", false], ["dave", false]]) {
  const session = await storage.getSession();
  session.set("plexToken", `${name}-token`);
  session.set("serverToken", `${name}-token`);
  session.set("isOwner", isOwner);
  session.set("serverMachineId", "synthetic-machine");
  const header = await storage.commitSession(session);
  cookies[name] = decodeURIComponent(header.split(";")[0].slice("__plex_session=".length));
}
writeFileSync(join(artifacts, "cookies.json"), JSON.stringify(cookies), { mode: 0o600 });
console.log(`prepared ${WORK}`);
