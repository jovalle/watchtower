import { fileURLToPath } from "node:url";

export const HARNESS = fileURLToPath(new URL(".", import.meta.url));
export const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
export const WORK = `${ROOT}tmp/wt-harness/`;
export const ART = `${WORK}artifacts/`;
export const APP_PORT = Number(process.env.WT_HARNESS_APP_PORT ?? 9331);
export const PLEX_PORT = Number(process.env.WT_HARNESS_PLEX_PORT ?? 32519);
export const BASE = `http://127.0.0.1:${APP_PORT}`;
export const PLEX = `http://127.0.0.1:${PLEX_PORT}`;
