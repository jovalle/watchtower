// Starts the synthetic Plex upstream and the production Watchtower build, runs one suite, stops both.
// Usage: node docs/handoffs/watch-together/harness/run.mjs protocol|browser
import { spawn } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { APP_PORT, ART, BASE, HARNESS, ROOT, WORK } from "./paths.mjs";

const suite = process.argv[2];
if (!["protocol", "browser"].includes(suite)) throw new Error("usage: run.mjs protocol|browser");
const serverLog = createWriteStream(`${ART}server.log`, { flags: "a" });

export function startServer() {
  const child = spawn(process.execPath, ["--import", `${HARNESS}plextv-shim.mjs`, "--import", "tsx", "server.ts"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(APP_PORT),
      DATA_PATH: `${WORK}data`,
      SECURE_COOKIES: "false",
      SESSION_SECRET: readFileSync(`${ART}.secret`, "utf8").trim(),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(serverLog, { end: false });
  child.stderr.pipe(serverLog, { end: false });
  return child;
}

export async function waitForServer() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/v1/clock`)).status === 401) return;
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Watchtower did not start");
}

const plex = spawn(process.execPath, [`${HARNESS}fake-plex.mjs`], { stdio: "inherit" });
const server = { current: startServer() };
let exitCode = 1;
try {
  await waitForServer();
  const { run } = await import(`./${suite}-e2e.mjs`);
  exitCode = (await run({ server, startServer, waitForServer })) ? 0 : 1;
} finally {
  server.current.kill("SIGTERM");
  plex.kill("SIGTERM");
}
process.exit(exitCode);
