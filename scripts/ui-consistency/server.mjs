/* eslint-env node, es2020 */
import express from "express";
import { createRequestHandler } from "@remix-run/express";
import { json } from "@remix-run/node";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { build as bundle } from "esbuild";
import { cases as browse } from "./browse-fixtures";
import { cases as forms } from "./forms-fixtures";
const dataDirectory = mkdtempSync(join(tmpdir(), "watchtower-ui-consistency-"));
process.env.DATA_PATH = dataDirectory;
process.env.SESSION_SECRET = "ui-consistency-fixtures-only";
process.env.NODE_ENV = "production";
globalThis.fetch = () => Promise.reject(new Error("The consistency preview blocks outbound requests."));
const original = await import("../../build/server/index.js");
const redirectAliases = new Set([
    "routes/app.movies", "routes/app.tv", "routes/app.new", "routes/app.watch._index",
    "routes/app.stuff._index", "routes/app.discover_.movies", "routes/app.discover_.series", "routes/link",
]);
const publicCases = (await import("./public-fixtures")).cases;
const user = { id: 1, uuid: "audit-user", username: "Layout Tester", title: "Layout Tester", email: "tester@example.invalid", thumb: "" };
const remixRequire = createRequire(import.meta.resolve("@remix-run/react"));
for (const name of ["gallery", "forms-gallery"]) {
    if (!existsSync(resolve(`scripts/ui-consistency/${name}.tsx`)))
        continue;
    await bundle({ entryPoints: [`scripts/ui-consistency/${name}.tsx`], outfile: `tmp/consistency-audit/${name}.js`, bundle: true, format: "esm", platform: "browser", tsconfig: "tsconfig.json", alias: { "react-router-dom": dirname(remixRequire.resolve("react-router-dom/package.json")), "react-router": dirname(remixRequire.resolve("react-router/package.json")) }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning" });
}
const player = browse.find(c => c.id === "player-loading").data;
const readyPlayer = { ...player, streamUrl: "/__audit/video.webm", durationMs: 60000, parentTitle: "Season 1", parentIndex: 1, index: 1, quality: { id: "original", label: "Original", isOriginal: true }, availableQualities: [{ id: "original", label: "Original", isOriginal: true }], autoPlayNextEpisode: false, autoSkipIntro: false, markers: [{ type: "intro", start: 0, end: 10 }, { type: "credits", start: 50, end: 60 }], mediaId: "1", partIdValue: "1", partCount: 1, burnedSubtitleId: null, room: null };
const extras = [
    { id: "app-error", path: "/app/media/movie/missing", routeId: "routes/app.media.$type.$ratingKey", error: 404 },
    { id: "app-fatal", path: "/app/media/movie/missing", routeId: "routes/app.media.$type.$ratingKey", error: 500 },
    { id: "root-error", path: "/", routeId: "root", error: 500 },
    { id: "player-ready", path: "/app/watch/42", routeId: "routes/app.watch.$ratingKey", data: readyPlayer },
    { id: "player-tracks", path: "/app/watch/42", routeId: "routes/app.watch.$ratingKey", data: { ...readyPlayer, audioTracks: [{ id: 1, displayTitle: "English · Stereo", selected: true }, { id: 2, displayTitle: "French · Stereo" }], subtitleTracks: [{ id: 3, displayTitle: "English (SDH)", codec: "srt" }], availableQualities: [{ id: "original", label: "Original", isOriginal: true }, { id: "720p-4", label: "720p · 4 Mbps", isOriginal: false }] } },
    { id: "room-create", path: "/app/watch/42?together=1", routeId: "routes/app.watch.$ratingKey", data: { ...readyPlayer, watchTogetherEnabled: true, togetherRequested: true } },
];
const cases = [...browse, ...forms, ...publicCases, ...extras];
const byId = new Map(cases.map(c => [c.id, c]));
const records = Object.values(original.routes).filter((r) => r.module.default).map((r) => ({ id: r.id, path: r.path, index: r.index, parentId: r.parentId }));
writeFileSync(resolve("tmp/consistency-audit/routes.json"), JSON.stringify(records, null, 2));
writeFileSync(resolve("tmp/consistency-audit/cases.json"), JSON.stringify(cases.map(({ id, path, routeId, ...rest }) => ({ id, path, routeId, hasAction: !!rest.actionData, delayMs: rest.delayMs ?? 0 })), null, 2));
const cookies = (request) => Object.fromEntries((request.headers.get("cookie") ?? "").split(";").map(p => p.trim().split("=")));
const pick = (request) => byId.get(new URL(request.url).searchParams.get("audit") ?? cookies(request)["wt-audit"]) ?? cases[0];
const invoke = (data, request) => typeof data === "function" ? data(request) : data;
function apiData(id, scenario, request) {
    const url = new URL(request.url);
    if (id === "routes/api.notifications")
        return { items: [], notifications: [], unread: 0 };
    if (id === "routes/api.plex.sessions")
        return { sessions: [], error: null };
    if (id === "routes/api.plex.sessions.history")
        return { history: [], sessions: [] };
    if (id === "routes/api.plex.playlists")
        return { playlists: [] };
    if (id === "routes/api.plex.playlist")
        return { playlists: [{ ratingKey: "9", title: "Example Playlist", leafCount: 2 }], memberships: [], success: true };
    if (id === "routes/api.seerr")
        return { enabled: true, status: "unknown", status4k: "unknown", error: null, canRequest: true, seasons: [], profiles: [{ id: 1, name: "Standard" }], rootFolders: [{ id: 1, path: "/media" }], requests: [] };
    if (id === "routes/api.vote.showings")
        return { showings: [] };
    if (id === "routes/api.vote.movies")
        return { success: true, movies: [] };
    if (id === "routes/api.vote.search")
        return { results: [] };
    if (id === "routes/api.logos")
        return {};
    if (id === "routes/api.plex.health")
        return { ok: true };
    if (id === "routes/api.cache")
        return { success: true, cleared: 0 };
    if (id === "routes/api.validate.trakt" || id === "routes/api.validate.imdb")
        return { valid: true, success: true };
    if (id === "routes/api.v1.rooms.join")
        return json({ error: { code: "room_ended", message: "This room has ended." } }, { status: 410 });
    if (scenario.id.includes("api-error"))
        return json({ error: "Synthetic request failed." }, { status: 503 });
    if (url.pathname.startsWith("/api/"))
        return { ok: true, success: true, status: "ok", error: null, items: [], results: [], data: [] };
    return {};
}
const routes = Object.fromEntries(Object.entries(original.routes).map(([id, r]) => [id, {
        ...r, module: { ...r.module,
            ...(r.module.loader ? { loader: async ({ request }) => {
                    const c = pick(request);
                    if (c.error && c.routeId === id)
                        throw new Response(c.error === 404 ? "Not Found" : "Fixture failure", { status: c.error });
                    if (id.startsWith("routes/api."))
                        return apiData(id, c, request);
                    if (c.parentData && Object.hasOwn(c.parentData, id))
                        return invoke(c.parentData[id], request);
                    if (id === "root")
                        return {};
                    if (id === "routes/app")
                        return { user, discoveryDisabled: false };
                    if (id === "routes/private" || id === "routes/vote")
                        return { user, isOwner: true };
                    if (id === c.routeId)
                        return invoke(c.data ?? {}, request);
                    const fallback = cases.find(x => x.routeId === id && x.data);
                    if (fallback)
                        return invoke(fallback.data, request);
                    // Only these inspected aliases are pure internal redirects.
                    if (redirectAliases.has(id))
                        return r.module.loader({ request, params: {}, context: {} });
                    throw new Response(`Missing fixture: ${id}`, { status: 500 });
                } } : {}),
            ...(r.module.action ? { action: async ({ request }) => {
                    const c = pick(request);
                    if (c.delayMs)
                        await new Promise(resolve => setTimeout(resolve, c.delayMs));
                    if (id.startsWith("routes/api."))
                        return apiData(id, c, request);
                    return c.actionData ?? { error: null, ok: true, message: "Fixture action completed." };
                } } : {}),
        }
    }]));
const app = express();
app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "connect-src 'self' blob:; img-src 'self' data:; frame-src 'none'; media-src 'self' blob:; font-src 'self';");
    if (typeof req.query.audit === "string" && byId.has(req.query.audit))
        res.setHeader("Set-Cookie", `wt-audit=${req.query.audit}; Path=/; SameSite=Lax`);
    next();
});
app.get("/__audit/cases", (_req, res) => res.json(cases.map(c => ({ id: c.id, path: c.path, routeId: c.routeId }))));
app.get("/__audit/:gallery", (req, res, next) => {
    const name = req.params.gallery;
    if (!["gallery", "forms-gallery"].includes(name))
        return next();
    res.type("html").send(`<!doctype html><html lang="en" class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${original.assets.routes.root.css[0]}"><title>Watchtower State Gallery</title></head><body><div id="gallery-root"></div><script type="module" src="/__audit/files/${name}.js"></script></body></html>`);
});
app.use("/__audit/files", express.static("tmp/consistency-audit"));
app.get("/__audit/poster.svg", (_req, res) => res.type("svg").send('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#262626"/><text x="200" y="300" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#d1d5db">Layout Fixture</text></svg>'));
app.get("/__audit/no-video.mp4", (_req, res) => res.status(404).end());
app.get("/__audit/video.webm", (_req, res) => res.sendFile(resolve("test/fixtures/consistency-video.webm"), { dotfiles: "allow" }));
app.get("/api/vote/events/:id", (req, res) => { res.setHeader("Content-Type", "text/event-stream"); res.write("event: connected\ndata: {}\n\n"); req.on("close", () => res.end()); });
app.use(express.static("build/client"));
app.use(express.static("public"));
app.all("{*splat}", createRequestHandler({ build: { ...original, routes }, mode: "production" }));
const server = app.listen(9345, "127.0.0.1", () => console.log(`Consistency fixtures: http://127.0.0.1:9345 (${cases.length} cases)`));
process.on("SIGINT", () => server.close(() => { rmSync(dataDirectory, { recursive: true, force: true }); process.exit(0); }));
