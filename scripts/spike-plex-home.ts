/** Operator-only Plex Home API shape probe. Output contains keys and value types only. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const token = process.env.PLEX_TOKEN;
if (!token) throw new Error("PLEX_TOKEN is required; no request was sent.");

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, shape(nested)]));
  return value === null ? "null" : typeof value;
}

const headers = { Accept: "application/json", "X-Plex-Token": token, "X-Plex-Product": "Watchtower" };
const usersResponse = await fetch("https://plex.tv/api/v2/home/users", { headers });
if (!usersResponse.ok) throw new Error(`Plex Home list failed with HTTP ${usersResponse.status}`);
const users = await usersResponse.json();
const first = (Array.isArray(users) ? users : users?.users)?.[0];
let switchShape: unknown = "not_attempted";
if (first?.uuid && process.env.PLEX_HOME_SPIKE_SWITCH === "1") {
  const response = await fetch(`https://plex.tv/api/v2/home/users/${encodeURIComponent(first.uuid)}/switch`, { method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams() });
  switchShape = { status: response.status, body: shape(await response.json().catch(() => null)) };
}
const output = path.resolve("tmp/plex-home-spike.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ list: { status: usersResponse.status, body: shape(users) }, switch: switchShape }, null, 2));
console.error(`Wrote sanitized Plex Home response shapes to ${output}`);