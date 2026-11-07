/** Generates isolated local media fixtures for the TV backend harness. */
import { mkdir, access, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const directory = path.resolve("tmp/tv-e2e/media");
await mkdir(directory, { recursive: true });
async function generate(file: string, duration: number) {
  const target = path.join(directory, file);
  try { if ((await stat(target)).size > 0) return; } catch { /* generate below */ }
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=size=640x360:rate=24:duration=${duration}`, "-f", "lavfi", "-i", `sine=frequency=440:duration=${duration}`, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-y", target], { stdio: "inherit" });
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
}
await generate("movie.mp4", 60);
await generate("movie-part-1.mp4", 30);
await generate("movie-part-2.mp4", 30);
await generate("episode.mp4", 30);
const subtitle = path.join(directory, "movie.srt");
try { await access(subtitle); } catch { await writeFile(subtitle, "1\n00:00:00,000 --> 00:00:02,000\nHarness subtitle\n"); }
const mkv = path.join(directory, "movie-subtitled.mkv");
try { await access(mkv); } catch {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path.join(directory, "movie.mp4"), "-i", subtitle, "-map", "0", "-map", "1", "-c", "copy", "-c:s", "srt", "-y", mkv], { stdio: "inherit" });
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
}
const hls = path.join(directory, "hls-4"); await mkdir(hls, { recursive: true });
try { await access(path.join(hls, "index.m3u8")); } catch {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path.join(directory, "movie.mp4"), "-c", "copy", "-hls_time", "4", "-hls_playlist_type", "vod", "-hls_segment_filename", path.join(hls, "segment-%03d.ts"), path.join(hls, "index.m3u8")], { stdio: "inherit" });
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
}