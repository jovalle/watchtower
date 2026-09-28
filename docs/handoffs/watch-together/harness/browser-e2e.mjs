// Multi-browser Watch Together journey (installed Google Chrome, headless) against the real server
// and synthetic Plex. Skew = both pages' video.currentTime projected to one instant using each
// page's wall clock on the SAME host. Loopback evidence only: not WAN, device or Plex evidence.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { ART, BASE, PLEX, WORK } from "./paths.mjs";

const { chromium } = createRequire(`${WORK}package.json`)("playwright-core");
const cookies = JSON.parse(readFileSync(`${ART}cookies.json`, "utf8"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stats = (values) => {
  const sorted = values.map(Math.abs).sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return { n: sorted.length, p50Ms: +at(0.5)?.toFixed(1), p95Ms: +at(0.95)?.toFixed(1), maxMs: +sorted.at(-1)?.toFixed(1) };
};
const throttle = (token, delayMs) => fetch(`${PLEX}/__control/throttle`, { method: "POST", body: JSON.stringify({ token, delayMs }) });

export async function run({ server, startServer, waitForServer }) {
  const out = { startedAt: new Date().toISOString(), browser: null, scenarios: [] };
  const log = (...args) => console.log(new Date().toISOString().slice(11, 23), ...args);
  const record = (id, pass, detail = {}) => { out.scenarios.push({ id, pass, ...detail }); log(pass ? "PASS" : "FAIL", id, JSON.stringify(detail)); };
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  out.browser = `Google Chrome ${browser.version()} headless via playwright-core (macOS host)`;
  const commands = [];
  const presence = [];
  const consoleLines = [];
  const viewers = [];

  async function viewer(name) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await context.addCookies([{ name: "__plex_session", value: encodeURIComponent(cookies[name]), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    viewers.push({ name, page });
    page.on("console", (message) => {
      if (/\[VideoPlayer\]|Room|room/.test(message.text())) consoleLines.push(`${new Date().toISOString().slice(11, 23)} ${name}: ${message.text().slice(0, 200)}`);
      if (consoleLines.length > 600) consoleLines.shift();
    });
    page.on("response", async (response) => {
      if (response.url().includes("/presence")) {
        const report = response.request().postDataJSON() ?? {};
        const body = await response.json().catch(() => null);
        presence.push({ viewer: name, at: new Date().toISOString().slice(11, 23), seq: report.presenceSequence, generation: `${report.mediaGeneration}:${report.preparationGeneration}`, ready: report.ready, buffering: report.buffering, replacing: report.replacingSource, error: report.error, status: response.status(), ignored: body?.ack?.ignored ?? body?.error?.code });
        return;
      }
      if (!response.url().includes("/commands")) return;
      const body = await response.json().catch(() => null);
      commands.push({ viewer: name, at: new Date().toISOString().slice(11, 23), type: response.request().postDataJSON()?.type, status: response.status(), result: body?.error?.code ?? body?.snapshot?.phase });
    });
    return { name, context, page };
  }
  const media = (page) => page.evaluate(() => {
    const video = document.querySelector("video");
    if (!video) return null;
    return { t: video.currentTime, paused: video.paused, rate: video.playbackRate, readyState: video.readyState, wall: performance.timeOrigin + performance.now(), pipeline: video.currentSrc.includes("/api/plex/stream/") ? "direct_file" : video.currentSrc ? "hls" : "none", path: location.pathname + location.search };
  }).catch(() => null);
  async function skew(a, b) {
    const [x, y] = await Promise.all([media(a.page), media(b.page)]);
    if (!x || !y) return null;
    const common = Math.max(x.wall, y.wall);
    const project = (m) => m.t * 1000 + (m.paused ? 0 : (common - m.wall) * m.rate);
    return { skewMs: project(x) - project(y), x, y };
  }
  async function sampleSkew(a, b, count, everyMs) {
    const values = [];
    for (let index = 0; index < count; index += 1) {
      const sample = await skew(a, b);
      if (sample && !sample.x.paused && !sample.y.paused) values.push(sample.skewMs);
      await sleep(everyMs);
    }
    return values;
  }
  // The panel collapses while playing; expand it before reading the member list.
  const panel = (page) => page.evaluate(() => {
    const aside = document.querySelector("aside");
    aside?.querySelector(':scope > button[aria-expanded="false"]')?.click();
    return aside?.innerText ?? "";
  }).catch(() => "");
  const body = (page) => page.evaluate(() => document.body.innerText).catch(() => "");
  async function until(check, timeoutMs, label) {
    const start = Date.now();
    for (;;) {
      const value = await check();
      if (value) return { value, ms: Date.now() - start };
      if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
      await sleep(100);
    }
  }
  async function step(id, fn) {
    try {
      await fn();
    } catch (error) {
      const screens = Object.fromEntries(await Promise.all(viewers.map(async ({ name, page }) => [name, await page.evaluate(() =>
        [document.querySelector("aside")?.innerText, document.querySelector('[role="alertdialog"]')?.innerText].filter(Boolean).join(" | ").replace(/\s+/g, " ").slice(0, 400)
      ).catch(() => "closed")])));
      record(id, false, { error: String(error).slice(0, 300), screens });
    }
  }
  // Keyboard seeks use the progress slider: arrow keys elsewhere drive focus navigation (useRemoteNavigation).
  async function sliderKeys(page, key, times) {
    await page.mouse.move(640, 300);
    await page.getByRole("slider", { name: "Video progress" }).focus();
    for (let index = 0; index < times; index += 1) await page.keyboard.press(key);
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  }
  const bothPlaying = async (a, b) => { const [x, y] = await Promise.all([media(a.page), media(b.page)]); return x && y && !x.paused && !y.paused && { x, y }; };

  const A = await viewer("alice");
  const B = await viewer("bob");
  let invite = "";
  try {
    await step("WT-01/WT-02 create room and invite link", async () => {
      await A.page.goto(`${BASE}/app/watch/4242?together=1`);
      await A.page.getByRole("button", { name: "Start from beginning" }).dblclick();
      await A.page.waitForURL(/room=/);
      invite = await A.page.locator("#room-invite").inputValue();
      const creates = readFileSync(`${ART}server.log`, "utf8").match(/POST \/api\/v1\/rooms \{"status":201/g)?.length ?? 0;
      record("WT-01/WT-02 create room and invite link", /\/join#i=[A-Za-z0-9_-]{43}$/.test(invite) && !new URL(A.page.url()).searchParams.has("i"), { invite: invite.replace(/#i=.*/, "#i=<redacted>"), roomCreatesLogged: creates, doubleClick: true });
    });

    await step("WT-03 invite landing redeems fragment and clears it", async () => {
      await B.page.goto(invite);
      await B.page.waitForURL(/\/app\/watch\/4242\?room=/, { timeout: 15000 });
      const leftovers = await B.page.evaluate(() => ({ hash: location.hash, stored: sessionStorage.getItem("wt:invite"), history: history.length }));
      record("WT-03 invite landing redeems fragment and clears it", leftovers.hash === "" && leftovers.stored === null, leftovers);
    });

    await step("WT-04 lobby readiness", async () => {
      await A.page.waitForSelector("aside");
      await B.page.waitForSelector("aside");
      const lobby = await panel(A.page);
      const beforeReady = !/\bReady\b/.test(lobby) && /Alice \(Host\)/.test(lobby) && /Bob/.test(lobby);
      await A.page.getByRole("button", { name: /I'm ready|Tap to start playback/ }).click();
      await B.page.getByRole("button", { name: /I'm ready|Tap to start playback/ }).click();
      const ready = await until(async () => ((await panel(A.page)).match(/\bReady\b/g) ?? []).length === 2, 20000, "both ready");
      const unnamed = await A.page.evaluate(() => [...document.querySelectorAll("aside button")].filter((button) => !(button.getAttribute("aria-label") || button.textContent?.trim())).length);
      const live = await A.page.evaluate(() => document.querySelectorAll('aside [aria-live="polite"]').length);
      record("WT-04 lobby readiness", beforeReady, { loadingNotReadyBeforeGesture: beforeReady, msToBothReady: ready.ms });
      record("WT-19 panel buttons named, one polite live region", unnamed === 0 && live === 1, { unnamedButtons: unnamed, liveRegions: live });
    });

    let pipelines = [];
    await step("WT-05 coordinated start", async () => {
      const before = await Promise.all([media(A.page), media(B.page)]);
      await A.page.getByRole("button", { name: "Start", exact: true }).click();
      const started = await until(() => bothPlaying(A, B), 10000, "both playing");
      pipelines = [started.value.x.pipeline, started.value.y.pipeline];
      // Started from the beginning: a lobby wait must not be added to the start position.
      const startPositionS = +started.value.x.t.toFixed(2);
      record("WT-05 coordinated start", before.every((m) => m.paused) && startPositionS < 3, { pausedBeforeStart: before.map((m) => m.paused), msToBothPlaying: started.ms, startPositionS, pipelines });
    });

    await step("WT-07 steady-state skew", async () => {
      await sleep(5000);
      const values = await sampleSkew(A, B, 60, 500);
      record("WT-07 steady-state skew", stats(values).p95Ms <= 500, { ...stats(values), window: "30 s after 5 s warm-up", pipelines });
    });

    await step("WT-06 host pause (Space) reaches everyone", async () => {
      await A.page.keyboard.press("Space");
      const paused = await until(async () => { const [x, y] = await Promise.all([media(A.page), media(B.page)]); return x.paused && y.paused; }, 5000, "both paused");
      await sleep(700);
      const sample = await skew(A, B);
      record("WT-06 host pause (Space) reaches everyone", Math.abs(sample.skewMs) <= 250, { msToBothPaused: paused.ms, pausedPositionSkewMs: Math.round(sample.skewMs) });
    });

    await step("WT-06 non-host transport keys do nothing", async () => {
      const before = await media(B.page);
      const count = commands.length;
      await B.page.keyboard.press("Space");
      await B.page.keyboard.press("k");
      await sliderKeys(B.page, "ArrowRight", 1);
      await sleep(1500);
      const after = await media(B.page);
      const bobCommands = commands.slice(count).filter((command) => command.viewer === "bob");
      record("WT-06 non-host transport keys do nothing", after.paused && Math.abs(after.t - before.t) < 0.3 && bobCommands.length === 0, { stillPaused: after.paused, movedS: +(after.t - before.t).toFixed(3), bobCommandPosts: bobCommands.length, explained: /Only the host/.test(await panel(B.page)) });
    });

    await step("WT-06 host seek via slider while paused, then resume", async () => {
      const from = (await media(A.page)).t;
      await sliderKeys(A.page, "ArrowRight", 1);
      const landed = await until(async () => { const [x, y] = await Promise.all([media(A.page), media(B.page)]); return Math.abs(x.t - (from + 10)) < 0.5 && Math.abs(y.t - (from + 10)) < 0.5; }, 10000, "both at seek target");
      await until(async () => /Room is paused/.test(await panel(A.page)), 10000, "barrier released to paused");
      await A.page.keyboard.press("Space");
      await until(() => bothPlaying(A, B), 8000, "both resumed");
      await sleep(3000);
      const values = await sampleSkew(A, B, 10, 300);
      record("WT-06 host seek via slider while paused, then resume", stats(values).p95Ms <= 500, { msToBothAtTarget: landed.ms, ...stats(values) });
    });

    await step("WT-13/WTT-10 local quality change keeps the room", async () => {
      let bobPaused = false;
      await A.page.mouse.move(640, 300);
      await A.page.getByRole("button", { name: "Settings" }).click();
      await A.page.getByRole("button", { name: "1080p (20 Mbps)" }).click();
      await A.page.waitForURL(/quality=1080p-20/, { timeout: 10000 });
      const url = new URL(A.page.url());
      const replaced = await until(async () => {
        const [x, y] = await Promise.all([media(A.page), media(B.page)]);
        if (y?.paused) bobPaused = true;
        return x && !x.paused && x.pipeline === "hls" && x;
      }, 25000, "alice playing replacement");
      await sleep(4000);
      const values = await sampleSkew(A, B, 10, 300);
      record("WT-13/WTT-10 local quality change keeps the room", url.searchParams.has("room") && !url.searchParams.has("t") && !bobPaused && stats(values).p95Ms <= 500, { roomParamKept: url.searchParams.has("room"), bobPausedDuringReplacement: bobPaused, msToReplacementPlaying: replaced.ms, pipelines: ["hls", "direct_file"], ...stats(values) });
    });

    await step("WT-09 blocking member buffering pauses the room once; host resumes", async () => {
      await throttle("alice-token", 6000);
      const paused = await until(async () => { const y = await media(B.page); return y.paused && /buffering/i.test(await panel(B.page)) && y; }, 45000, "room paused for buffering");
      const reason = await panel(B.page);
      await throttle("alice-token", 0);
      await until(async () => /Alice \(Host\)\s*Ready/.test(await panel(A.page)), 60000, "alice ready again");
      await sleep(5000);
      const stillPaused = (await media(B.page)).paused && (await media(A.page)).paused;
      const pauses = commands.filter((command) => command.type === "pause").length;
      const heldAt = (await media(A.page)).t;
      await A.page.keyboard.press("Space");
      await until(() => bothPlaying(A, B), 15000, "resumed by host");
      // Resuming continues from the held position; the paused time must not be skipped.
      const resumeJumpS = +((await media(A.page)).t - heldAt).toFixed(2);
      record("WT-09 blocking member buffering pauses the room once; host resumes", stillPaused && resumeJumpS < 2.5, { msToGroupPause: paused.ms, memberSeesBlockingBuffering: /Buffering - blocking/.test(reason), noAutoResumeAfterReady: stillPaused, resumeJumpS, hostPauseCommandsDuringBuffering: pauses });
    });

    await step("WT-10 member offline: reconnecting, local pause, recovery", async () => {
      await sleep(3000);
      await B.context.setOffline(true);
      const reconnecting = await until(async () => { const y = await media(B.page); return /Reconnecting/.test(await body(B.page)) && y.paused && y; }, 30000, "bob reconnecting + paused");
      const aliceStillPlaying = !(await media(A.page)).paused;
      await sleep(Math.max(0, 20000 - reconnecting.ms));
      await B.context.setOffline(false);
      const recovered = await until(async () => { const sample = await skew(A, B); return sample && !sample.y.paused && Math.abs(sample.skewMs) <= 500 && sample; }, 30000, "bob resynchronised");
      record("WT-10 member offline: reconnecting, local pause, recovery", aliceStillPlaying, { msToReconnectingPaused: reconnecting.ms, hostKeptPlaying: aliceStillPlaying, offlineMs: 20000, msToResyncAfterOnline: recovered.ms, skewAfterMs: Math.round(recovered.value.skewMs) });
    });

    const D = await viewer("dave");
    await step("WT-08 late join during playback does not pause others", async () => {
      // Rewind well before the credits so the late join happens mid-title.
      const at = (await media(A.page)).t;
      if (at > 40) {
        await sliderKeys(A.page, "ArrowLeft", Math.ceil((at - 20) / 10));
        await until(() => bothPlaying(A, B), 20000, "playing after rewind");
      }
      await sleep(2000);
      const count = commands.length;
      await D.page.goto(invite);
      await D.page.waitForURL(/\/app\/watch\/4242\?room=/, { timeout: 15000 });
      await D.page.getByRole("button", { name: /I'm ready|Tap to start playback/ }).click({ timeout: 15000 });
      let othersPaused = false;
      const caughtUp = await until(async () => {
        const [a, b] = await Promise.all([media(A.page), media(B.page)]);
        if (a.paused || b.paused) othersPaused = true;
        const sample = await skew(A, D);
        return sample && !sample.y.paused && Math.abs(sample.skewMs) <= 500 && sample;
      }, 30000, "dave caught up");
      record("WT-08 late join during playback does not pause others", !othersPaused && commands.length === count, { othersPaused, msToCatchUp: caughtUp.ms, skewMs: Math.round(caughtUp.value.skewMs) });
    });

    await step("WT-14 host Skip Intro is one room seek; members get no skip button", async () => {
      const at = (await media(A.page)).t;
      await sliderKeys(A.page, "ArrowLeft", Math.ceil((at - 6) / 10));
      await until(() => bothPlaying(A, B), 20000, "playing after seek back");
      const visible = await until(async () => (await A.page.getByRole("button", { name: "Skip Intro" }).count()) > 0, 15000, "host skip button");
      const memberButtons = await B.page.getByRole("button", { name: "Skip Intro" }).count();
      const seeksBefore = commands.filter((command) => command.type === "seek").length;
      await A.page.getByRole("button", { name: "Skip Intro" }).click();
      await until(async () => { const [x, y] = await Promise.all([media(A.page), media(B.page)]); return x.t >= 14.5 && y.t >= 14.5 && x.t < 25 && y.t < 25; }, 15000, "both past intro");
      const seeks = commands.filter((command) => command.type === "seek").length - seeksBefore;
      record("WT-14 host Skip Intro is one room seek; members get no skip button", memberButtons === 0 && seeks === 1, { hostButtonMs: visible.ms, memberSkipButtons: memberButtons, seekCommands: seeks });
    });

    await step("WT-15/WTT-13 shared next episode; member without access removed first", async () => {
      await until(() => bothPlaying(A, B), 20000, "playing");
      const at = (await media(A.page)).t;
      await sliderKeys(A.page, "ArrowRight", Math.ceil((119 - at) / 10));
      const countdown = await until(async () => /Next episode in/.test(await panel(B.page)), 40000, "member countdown");
      const countdownText = await panel(B.page);
      const daveEnded = await until(async () => /cannot access the room's current title/.test(await body(D.page)), 45000, "dave access denied");
      const daveLeaks = /Synthetic Episode 2|4243/.test(await body(D.page)) || (await D.page.evaluate(() => location.pathname)).includes("4243");
      const advanced = await until(async () => { const [x, y] = await Promise.all([media(A.page), media(B.page)]); return x?.path.startsWith("/app/watch/4243") && y?.path.startsWith("/app/watch/4243") && !x.paused && !y.paused; }, 60000, "both playing next episode");
      await sleep(3000);
      const values = await sampleSkew(A, B, 10, 300);
      record("WT-15/WTT-13 shared next episode; member without access removed first", !/Synthetic Episode 2/.test(countdownText) && !daveLeaks, { msToMemberCountdown: countdown.ms, countdownRevealsTitle: /Synthetic Episode 2/.test(countdownText), msToDaveDenied: daveEnded.ms, deniedMemberSawNextItem: daveLeaks, msToBothPlayingNext: advanced.ms, ...stats(values) });
    });
    await D.context.close();

    await step("WT-16 progress isolation in upstream timeline log", async () => {
      const upstream = readFileSync(`${ART}fake-plex.jsonl`, "utf8").trim().split("\n").map((line) => JSON.parse(line)).filter((entry) => entry.at >= Date.parse(out.startedAt));
      const timelines = upstream.filter((entry) => entry.kind === "timeline");
      const byUser = Object.groupBy(timelines, (entry) => entry.user);
      const shared = (byUser.Alice ?? []).filter((entry) => (byUser.Bob ?? []).some((other) => other.clientId === entry.clientId)).length;
      const scrobbles = upstream.filter((entry) => entry.kind === "scrobble").map((entry) => entry.user);
      // app/lib/startup.server.ts validates the configured owner token once ("/" then "/library/sections");
      // that pre-existing check is reported separately. Any other unknown-token request fails WT-16.
      const unknownToken = upstream.filter((entry) => entry.kind === "rejected-token");
      const startupChecks = unknownToken.filter((entry) => entry.path === "/" || entry.path === "/library/sections").length;
      const ownerTokenUse = unknownToken.length - startupChecks;
      record("WT-16 progress isolation in upstream timeline log", (byUser.Alice?.length ?? 0) > 0 && (byUser.Bob?.length ?? 0) > 0 && shared === 0 && ownerTokenUse === 0, {
        timelineReports: Object.fromEntries(Object.entries(byUser).map(([user, entries]) => [user, entries.length])),
        clientIdsPerUser: Object.fromEntries(Object.entries(byUser).map(([user, entries]) => [user, new Set(entries.map((entry) => entry.clientId)).size])),
        clientIdsSharedAcrossUsers: shared, scrobbles, upstreamRequestsWithUnknownToken: ownerTokenUse, startupOwnerTokenChecks: startupChecks,
      });
    });

    await step("WT-11 host loss: pause, grace, deterministic transfer", async () => {
      const offlineAt = Date.now();
      await A.context.setOffline(true);
      const paused = await until(async () => (await media(B.page)).paused, 30000, "bob paused after host loss");
      const pausedAfterMs = Date.now() - offlineAt;
      await until(async () => /Bob \(Host\)/.test(await panel(B.page)), 70000, "bob becomes host");
      record("WT-11 host loss: pause, grace, deterministic transfer", paused.value === true, { msToGroupPause: pausedAfterMs, msToTransfer: Date.now() - offlineAt, policy: "15 s stale presence + 30 s grace (+ sweep and heartbeat granularity)" });
    });

    await step("WT-18 coordinator restart ends the room visibly", async () => {
      server.current.kill("SIGTERM");
      await new Promise((resolve) => server.current.once("exit", resolve));
      const restartedAt = Date.now();
      server.current = startServer();
      await waitForServer();
      await until(async () => /server restarted|has ended|no longer available|expired/i.test(await body(B.page)), 45000, "bob sees ended");
      const bobMedia = await media(B.page);
      const message = await B.page.evaluate(() => document.querySelector('[role="alertdialog"] h2')?.textContent ?? "");
      const actions = await B.page.evaluate(() => [...document.querySelectorAll('[role="alertdialog"] button')].map((button) => button.textContent));
      record("WT-18 coordinator restart ends the room visibly", bobMedia?.paused !== false, { msFromRestart: Date.now() - restartedAt, message, actions, playerPaused: bobMedia?.paused });
    });
  } finally {
    out.commands = commands;
    out.presence = presence;
    out.console = consoleLines;
    writeFileSync(`${ART}browser-e2e.json`, JSON.stringify(out, null, 2));
    await browser.close();
  }
  console.log(`scenarios: ${out.scenarios.filter((scenario) => scenario.pass).length}/${out.scenarios.length} passed`);
  return out.scenarios.every((scenario) => scenario.pass);
}
