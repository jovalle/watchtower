/**
 * Local Android TV x Watch Together journey against a combined server build that includes the room API.
 * Synthetic data only: fake PMS, stubbed plex.tv (plextv-shim.mjs), harness cookies and device sessions
 * under tmp/tv-room-e2e. Emulator + loopback timing is NOT device, Plex or WAN evidence.
 *
 * Prerequisites (repository root): `just build`, `bun scripts/tv-e2e/generate-media.ts`, one running
 * emulator with the debug app and its androidTest APK installed (`./gradlew :app:installDebug
 * :app:installDebugAndroidTest` in android-tv/). Usage: `bun scripts/tv-e2e/room-e2e.ts`.
 * Writes tmp/tv-room-e2e/results.json and server.log. Exit code 1 when any check fails.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createWriteStream, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createCookieSessionStorage } from "@remix-run/node";
import { saveServerConfig } from "../../app/lib/config/server-config.server";
import { resetNativeCryptoForTests } from "../../app/lib/native/crypto.server";
import { createDeviceSession, resetDeviceStoreForTests } from "../../app/lib/native/device-store.server";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Client = {
  get: (route: string) => Promise<Response>;
  post: (route: string, body: unknown) => Promise<Response>;
  del: (route: string) => Promise<Response>;
  headers: () => Record<string, string>;
};

const exec = promisify(execFile);
const WORK = path.resolve("tmp/tv-room-e2e");
const DATA = path.join(WORK, "data");
const PORT = 9031;
const BASE = `http://127.0.0.1:${PORT}`;
const TV_BASE = `http://10.0.2.2:${PORT}`;
const PKG = "io.github.jovalle.watchtower.tv.debug";
const ADB = path.join(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools", "adb");
const MOVIE = { ratingKey: "1", mediaId: "10", partId: "100" };
const results: Array<{ id: string; pass: boolean; detail: unknown }> = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// ROOM_E2E_ONLY=A|B runs one scenario; ROOM_E2E_HOLD=1 keeps the seeded servers up; ROOM_E2E_TRACE=1 logs room revisions.
const ONLY = process.env.ROOM_E2E_ONLY;
const TRACE = process.env.ROOM_E2E_TRACE === "1";

function record(id: string, pass: boolean, detail: unknown = {}) {
  results.push({ id, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${JSON.stringify(detail)}`);
}

async function seed(secret: string) {
  process.env.DATA_PATH = DATA;
  await rm(WORK, { recursive: true, force: true });
  await mkdir(DATA, { recursive: true });
  resetNativeCryptoForTests();
  resetDeviceStoreForTests();
  saveServerConfig({ serverUrl: "http://127.0.0.1:32499", machineIdentifier: "fake-machine", serverName: "Fake PMS", token: "fake-owner-token", adminUserId: 1001, adminUsername: "Test Owner" });
  const device = (name: string, userId: string, title: string, account: string, server: string, owner: boolean) =>
    createDeviceSession({
      name, platform: "android-tv", model: "Harness", appVersion: "e2e",
      account: { userId, title }, profile: { userId, title, restricted: false, owner, protected: false },
      serverMachineId: "fake-machine", serverName: "Fake PMS",
      accountPlexToken: account, plexToken: account, serverToken: server, isOwner: owner,
    });
  const tv = await device("Emulator TV", "1001", "Test Owner", "fake-account-token", "fake-owner-token", true);
  const den = await device("Den TV (scripted)", "1003", "Den", "den-account-token", "den-server-token", false);
  const storage = createCookieSessionStorage({ cookie: { name: "__plex_session", httpOnly: true, path: "/", sameSite: "lax", secrets: [secret], secure: false } });
  const session = await storage.getSession();
  session.set("plexToken", "bob-token");
  session.set("serverToken", "bob-server-token");
  session.set("isOwner", false);
  session.set("serverMachineId", "fake-machine");
  const cookie = (await storage.commitSession(session)).split(";")[0];
  return { tv, den, cookie };
}

function startServers(secret: string): ChildProcess[] {
  const log = createWriteStream(path.join(WORK, "server.log"));
  const pms = spawn("bun", ["scripts/tv-e2e/fake-pms.ts", "32499"], { stdio: ["ignore", "pipe", "pipe"] });
  const app = spawn("node", ["--import", path.resolve("scripts/tv-e2e/plextv-shim.mjs"), "--import", "tsx", "server.ts"], {
    env: { ...process.env, NODE_ENV: "production", DATA_PATH: DATA, PORT: String(PORT), SECURE_COOKIES: "false", SESSION_SECRET: secret },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const child of [pms, app]) {
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
  }
  return [pms, app];
}

async function waitForServer() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/api/v1/instance`)).ok) return;
    } catch {
      // still starting
    }
    await sleep(200);
  }
  throw new Error("Watchtower did not start");
}

function webClient(cookie: string): Client {
  const jar = new Map([[cookie.slice(0, cookie.indexOf("=")), cookie.slice(cookie.indexOf("=") + 1)]]);
  const absorb = (response: Response) => {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      jar.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1));
    }
    return response;
  };
  const headers = () => ({ Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") });
  return {
    headers,
    get: async (route) => absorb(await fetch(BASE + route, { headers: headers(), redirect: "manual" })),
    post: async (route, body) => absorb(await fetch(BASE + route, { method: "POST", headers: { ...headers(), "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify(body) })),
    del: async (route) => absorb(await fetch(BASE + route, { method: "DELETE", headers: { ...headers(), Origin: BASE } })),
  };
}

function bearerClient(token: string): Client {
  const headers = () => ({ Authorization: `Bearer ${token}`, "X-Watchtower-Identity-Version": "1" });
  return {
    headers,
    get: (route) => fetch(BASE + route, { headers: headers() }),
    post: (route, body) => fetch(BASE + route, { method: "POST", headers: { ...headers(), "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    del: (route) => fetch(BASE + route, { method: "DELETE", headers: headers() }),
  };
}

async function mutation(client: Client, route: string, fields: Json) {
  const sample = await (await client.get("/api/v1/clock")).json();
  return client.post(route, { requestId: randomUUID(), epoch: sample.epoch, expiresAtMs: sample.sentAtMs + 30_000, ...fields });
}

/** A scripted room participant (web cookie or native bearer) that mirrors the protocol, not a real player. */
class Member {
  control!: Json;
  presenceView!: Json;
  membership!: Json;
  offsetMs = 0;
  private commandSequence = 0;
  private presenceSequence = 0;
  private abort = new AbortController();
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastPresence: Json | null = null;
  ended: Json | null = null;

  constructor(readonly client: Client, envelope: Json) {
    this.control = envelope.snapshot;
    this.presenceView = envelope.snapshot;
    this.membership = envelope.membership;
    this.commandSequence = envelope.membership.nextCommandSequence;
    this.presenceSequence = envelope.membership.nextPresenceSequence;
  }

  get roomId(): string { return this.control.roomId; }

  apply(snapshot: Json) {
    if (snapshot.revision > this.control.revision) {
      this.control = snapshot;
      if (TRACE) console.log(`TRACE t=${Math.round(performance.now() + this.offsetMs)} rev=${snapshot.revision} ${snapshot.phase}/${snapshot.reason} anchor=${JSON.stringify(snapshot.anchor)} gen=${snapshot.mediaGeneration}/${snapshot.preparationGeneration}`);
    }
    if (snapshot.presenceRevision >= this.presenceView.presenceRevision) this.presenceView = snapshot;
  }

  async syncClock() {
    let best: { rtt: number; offset: number } | null = null;
    for (let index = 0; index < 5; index += 1) {
      const sent = performance.now();
      const sample = await (await this.client.get("/api/v1/clock")).json();
      const received = performance.now();
      const rtt = received - sent - (sample.sentAtMs - sample.receivedAtMs);
      const offset = (sample.receivedAtMs - sent + (sample.sentAtMs - received)) / 2;
      if (!best || rtt < best.rtt) best = { rtt, offset };
    }
    this.offsetMs = best?.offset ?? 0;
  }

  targetNowMs(): number {
    const snapshot = this.control;
    const serverNow = performance.now() + this.offsetMs;
    const elapsed = snapshot.phase === "playing" ? Math.max(0, serverNow - snapshot.anchor.effectiveAtMs) : 0;
    return Math.min(Math.max(snapshot.anchor.positionMs + elapsed, 0), snapshot.durationMs);
  }

  subscribe() {
    void fetch(`${BASE}/api/v1/rooms/${this.roomId}/events`, { headers: this.client.headers(), signal: this.abort.signal }).then(async (response) => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          for (let index = buffer.indexOf("\n\n"); index >= 0; index = buffer.indexOf("\n\n")) {
            const frame = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            const type = /^event: (.+)$/m.exec(frame)?.[1];
            const data = /^data: (.+)$/m.exec(frame)?.[1];
            if (!type || !data) continue;
            const event = JSON.parse(data);
            if (type === "snapshot") this.apply(event);
            if (type === "ended") this.ended = event;
          }
        }
      } catch {
        // aborted
      }
    }).catch(() => undefined);
  }

  async waitFor(predicate: (member: Member) => boolean, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate(this)) return true;
      await sleep(200);
    }
    return predicate(this);
  }

  others(): Json[] {
    return this.presenceView.participants.filter((participant: Json) => participant.participantId !== this.membership.participantId);
  }

  async command(type: string, payload: Json = {}) {
    const snapshot = this.control;
    const response = await this.client.post(`/api/v1/rooms/${this.roomId}/commands`, {
      commandId: randomUUID(), commandSequence: this.commandSequence++, membershipVersion: this.membership.membershipVersion,
      epoch: snapshot.epoch, mediaGeneration: snapshot.mediaGeneration, expectedRevision: snapshot.revision, type, payload,
    });
    const json = await response.json().catch(() => null);
    if (response.ok && json?.snapshot) this.apply(json.snapshot);
    return { status: response.status, json };
  }

  async presence(fields: Json) {
    this.lastPresence = fields;
    const snapshot = this.control;
    const response = await this.client.post(`/api/v1/rooms/${this.roomId}/presence`, {
      epoch: snapshot.epoch, membershipVersion: this.membership.membershipVersion, mediaGeneration: snapshot.mediaGeneration,
      preparationGeneration: snapshot.preparationGeneration, presenceSequence: this.presenceSequence++,
      buffering: false, replacingSource: false, error: null, ...fields, positionMs: Math.round(this.targetNowMs()),
    });
    const json = await response.json().catch(() => null);
    if (response.ok && json?.snapshot) this.apply(json.snapshot);
    return { status: response.status, json };
  }

  /** Keeps this scripted participant connected, like the clients' 5 s presence heartbeat. */
  keepAlive() {
    this.heartbeat = setInterval(() => {
      if (this.lastPresence && !this.ended) void this.presence(this.lastPresence).catch(() => undefined);
    }, 4_000);
  }

  close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.abort.abort();
  }
}

async function adb(...args: string[]) {
  const { stdout } = await exec(ADB, args, { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

const key = (code: string) => adb("shell", "input", "keyevent", code);
const mediaKey = (action: string) => adb("shell", "cmd", "media_session", "dispatch", action);

/** The TV's MediaSession PlaybackState, extrapolated to the device's current elapsed realtime. */
async function tvPlayback(): Promise<{ state: number; positionMs: number; speed: number } | null> {
  const out = await adb("shell", "dumpsys media_session; cat /proc/uptime");
  const nowMs = Math.round(Number.parseFloat(out.trim().split("\n").at(-1)!.split(" ")[0]) * 1000);
  let found: { state: number; positionMs: number; speed: number } | null = null;
  for (const block of out.split(`package=${PKG}`).slice(1)) {
    const match = /state=PlaybackState \{state=(?:[A-Z_]+\()?(\d+)\)?, position=(-?\d+), buffered position=-?\d+, speed=([\d.]+), updated=(\d+)/.exec(block);
    if (!match) continue;
    const state = Number(match[1]);
    const speed = Number(match[3]);
    const position = Number(match[2]);
    found = { state, speed, positionMs: state === 3 ? position + speed * (nowMs - Number(match[4])) : position };
  }
  return found;
}

async function skew(member: Member) {
  const tv = await tvPlayback();
  const target = member.targetNowMs();
  return {
    tvState: tv?.state ?? null,
    tvMs: tv ? Math.round(tv.positionMs) : null,
    targetMs: Math.round(target),
    skewMs: tv ? Math.round(tv.positionMs - target) : null,
    speed: tv?.speed ?? null,
  };
}

async function uiXml(): Promise<string> {
  await adb("shell", "uiautomator", "dump", "/sdcard/wt-ui.xml");
  return adb("shell", "cat", "/sdcard/wt-ui.xml");
}

async function tapText(text: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const xml = await uiXml().catch(() => "");
    const match = new RegExp(`text="${text}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`).exec(xml);
    if (match) {
      const [x1, y1, x2, y2] = match.slice(1).map(Number);
      await adb("shell", "input", "tap", String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2)));
      return true;
    }
    await sleep(1_000);
  }
  return false;
}

async function uiMatch(pattern: RegExp, timeoutMs: number): Promise<RegExpExecArray | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = pattern.exec(await uiXml().catch(() => ""));
    if (match) return match;
    await sleep(1_000);
  }
  return null;
}

async function webPlaybackSession(client: Client, roomId: string) {
  const response = await client.get(`/app/watch/${MOVIE.ratingKey}?room=${roomId}&_data=${encodeURIComponent("routes/app.watch.$ratingKey")}`);
  if (!response.ok) return { status: response.status, id: null };
  const data = await response.json();
  return { status: response.status, id: new URL(data.streamUrl, BASE).searchParams.get("session") };
}

async function nativePlayback(client: Client) {
  const body = JSON.parse(readFileSync("contracts/native/v1/playback-request.json", "utf8"));
  const response = await client.post("/api/v1/playback", { ...body, ratingKey: MOVIE.ratingKey, mediaId: MOVIE.mediaId, startPositionMs: 0 });
  const json = await response.json().catch(() => null);
  return { status: response.status, id: (json?.playbackId as string | undefined) ?? null };
}

async function launch(uri: string) {
  await adb("shell", "am", "force-stop", PKG);
  // Single quotes keep '&' and '#' literal for the device shell.
  await adb("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", `'${uri}'`, PKG);
}

async function webHostTvGuest(cookie: string) {
  const bob = webClient(cookie);
  const created = await mutation(bob, "/api/v1/rooms", { media: MOVIE, startPositionMs: 0, autoAdvance: false });
  const envelope = await created.json();
  record("TVR-A0 web host creates a room", created.status === 201, { status: created.status });
  if (created.status !== 201) return;
  const host = new Member(bob, envelope);
  await host.syncClock();
  host.subscribe();
  if (TRACE) console.log(`TRACE created anchor=${JSON.stringify(envelope.snapshot.anchor)} phase=${envelope.snapshot.phase}`);
  const web = await webPlaybackSession(bob, host.roomId);
  record("TVR-A1 web host registers a room-scoped playback session", web.id !== null, { status: web.status });
  await host.presence({ playbackSessionId: web.id, ready: web.id !== null });
  if (TRACE) console.log(`TRACE after host presence anchor=${JSON.stringify(host.control.anchor)} rev=${host.control.revision}`);
  host.keepAlive();

  await launch(`watchtower://join#i=${envelope.invitation.secret}`);
  const joined = await host.waitFor((member) => member.presenceView.participants.length === 2, 45_000);
  record("TVR-A2 TV joins through a watchtower://join invite link", joined, { participants: host.presenceView.participants.length });
  if (!joined) return host.close();
  await sleep(2_000);
  await key("KEYCODE_DPAD_CENTER"); // Lobby focuses "Open player".
  const ready = await host.waitFor((member) => member.others()[0]?.ready === true, 60_000);
  record("TVR-A3 TV player claims readiness at the room target", ready, { tv: host.others()[0] });

  const play = await host.command("play");
  record("TVR-A4 web host play accepted", play.status === 200, { status: play.status, code: play.json?.error?.code });
  if (TRACE) {
    for (let sample = 0; sample < 12; sample += 1) {
      console.log(`TRACE skew ${JSON.stringify(await skew(host))}`);
      await sleep(400);
    }
  }
  await sleep(4_000);
  const afterPlay = await skew(host);
  record("TVR-A5 TV follows host play", afterPlay.tvState === 3 && Math.abs(afterPlay.skewMs ?? Infinity) < 750, afterPlay);
  await sleep(6_000);
  const steady = await skew(host);
  record("TVR-A6 TV stays within 500 ms while playing (loopback)", steady.tvState === 3 && Math.abs(steady.skewMs ?? Infinity) < 500, steady);

  const revision = host.control.revision;
  await mediaKey("pause");
  await sleep(3_000);
  const guestKey = await skew(host);
  record("TVR-A7 guest TV media key cannot pause the room", host.control.revision === revision && host.control.phase === "playing" && guestKey.tvState === 3, { ...guestKey, phase: host.control.phase });

  const seek = await host.command("seek", { positionMs: 30_000 });
  await sleep(4_000);
  const afterSeek = await skew(host);
  record("TVR-A8 TV follows host seek", seek.status === 200 && afterSeek.tvState === 3 && Math.abs(afterSeek.skewMs ?? Infinity) < 750, { status: seek.status, ...afterSeek });

  const pause = await host.command("pause");
  await sleep(3_000);
  const afterPause = await skew(host);
  record("TVR-A9 TV follows host pause", pause.status === 200 && afterPause.tvState === 2 && Math.abs(afterPause.skewMs ?? Infinity) < 500, { status: pause.status, ...afterPause });

  const end = await host.command("end");
  await sleep(2_500);
  const afterEnd = await tvPlayback();
  const message = await uiMatch(/The host ended the room\./, 5_000);
  record("TVR-A10 host End reaches the TV", end.status === 200 && afterEnd?.state !== 3 && message !== null, { status: end.status, tvState: afterEnd?.state, messageShown: message !== null });
  host.close();
  await key("KEYCODE_BACK");
}

async function tvHostWithGuests(cookie: string, denToken: string, tvToken: string) {
  await launch("watchtower://media/1?server=fake-machine&action=details");
  const tapped = await tapText("Watch together", 30_000);
  record("TVR-B0 details offers Watch together for a rooms-enabled profile", tapped);
  if (!tapped) return;
  const invite = await uiMatch(/#i=([A-Za-z0-9_-]{43})/, 20_000);
  record("TVR-B1 TV host lobby shows a fragment-only invite link", invite !== null && !/[?&]i=/.test(invite[0]));
  if (!invite) return;

  const bob = webClient(cookie);
  const joined = await mutation(bob, "/api/v1/rooms/join", { invite: invite[1] });
  const envelope = await joined.json();
  record("TVR-B2 web guest joins the TV-hosted room", joined.ok, { status: joined.status, code: envelope?.error?.code });
  if (!joined.ok) return;
  const guest = new Member(bob, envelope);
  await guest.syncClock();
  guest.subscribe();
  const tvParticipantId = guest.control.hostParticipantId;
  const web = await webPlaybackSession(bob, guest.roomId);
  await guest.presence({ playbackSessionId: web.id, ready: web.id !== null });
  guest.keepAlive();

  const den = bearerClient(denToken);
  const denJoined = await mutation(den, "/api/v1/rooms/join", { invite: invite[1] });
  const denEnvelope = await denJoined.json();
  record("TVR-B3 a second TV identity (bearer) joins the same room", denJoined.ok, { status: denJoined.status });
  let denMember: Member | null = null;
  if (denJoined.ok) {
    denMember = new Member(den, denEnvelope);
    await denMember.syncClock();
    denMember.subscribe();
    const foreign = await denMember.presence({ playbackSessionId: web.id, ready: true });
    const denView = () => denMember!.presenceView.participants.find((participant: Json) => participant.participantId === denMember!.membership.participantId);
    record("TVR-B4 presence cannot claim another device's playback session", foreign.status >= 400 || foreign.json?.ack?.ignored === true || denView()?.ready !== true, { status: foreign.status, error: foreign.json?.error?.code, ready: denView()?.ready });
    const playback = await nativePlayback(den);
    const own = await denMember.presence({ playbackSessionId: playback.id, ready: true });
    record("TVR-B5 native presence with its own playback session is accepted", own.status === 200 && own.json?.ack?.ignored === false, { playbackStatus: playback.status, status: own.status });
    denMember.keepAlive();
  }

  await key("KEYCODE_DPAD_CENTER"); // Lobby focuses "Open player".
  const hostReady = await guest.waitFor((member) => member.presenceView.participants.find((participant: Json) => participant.participantId === tvParticipantId)?.ready === true, 60_000);
  record("TVR-B6 TV host player claims readiness", hostReady);

  await mediaKey("play");
  const playing = await guest.waitFor((member) => member.control.phase === "playing", 10_000);
  record("TVR-B7 TV host MediaSession play becomes a room command", playing && guest.control.reason === "host_played", { phase: guest.control.phase, reason: guest.control.reason });
  const denPlaying = denMember ? await denMember.waitFor((member) => member.control.phase === "playing", 5_000) : false;
  record("TVR-B8 the bearer participant receives the host's play over SSE", denPlaying);
  await sleep(4_000);
  const hostSkew = await skew(guest);
  record("TVR-B9 TV host plays at the room target (loopback)", hostSkew.tvState === 3 && Math.abs(hostSkew.skewMs ?? Infinity) < 750, hostSkew);

  const guestPause = await guest.command("pause");
  record("TVR-B10 guest transport command is rejected (not_host)", guestPause.status === 403 && guestPause.json?.error?.code === "not_host", { status: guestPause.status, code: guestPause.json?.error?.code });

  await mediaKey("pause");
  const paused = await guest.waitFor((member) => member.control.phase === "paused" && member.control.reason === "host_paused", 10_000);
  record("TVR-B11 TV host MediaSession pause becomes a room command", paused, { phase: guest.control.phase, reason: guest.control.reason });

  const revoked = await bearerClient(tvToken).del("/api/v1/session");
  const transferred = await guest.waitFor((member) => member.control.hostParticipantId !== tvParticipantId, 15_000);
  record("TVR-B12 signing the TV out ends its membership and transfers host", revoked.ok && transferred, { status: revoked.status, reason: guest.control.reason });
  await sleep(4_000);
  const afterRevoke = await tvPlayback();
  record("TVR-B13 the signed-out TV stops room playback", afterRevoke?.state !== 3, { tvState: afterRevoke?.state ?? null });
  guest.close();
  denMember?.close();
}

const secret = `harness-only-${randomBytes(16).toString("hex")}`;
const seeded = await seed(secret);
const children = startServers(secret);
let failed = true;
try {
  await waitForServer();
  const instance = await (await fetch(`${BASE}/api/v1/instance`)).json();
  record("TVR-00 combined server advertises rooms", instance.features?.rooms === true, { features: instance.features });
  await adb("shell", "pm", "clear", PKG);
  const seededTv = await adb(
    "shell", "am", "instrument", "-w",
    "-e", "class", "io.github.jovalle.watchtower.tv.e2e.SeedCredentialTest",
    "-e", "wtBaseUrl", TV_BASE,
    "-e", "wtToken", seeded.tv.accessToken,
    "-e", "wtDeviceSessionId", seeded.tv.record.deviceSessionId,
    "-e", "wtIdentityVersion", "1",
    "-e", "wtExpiresAtMs", String(seeded.tv.record.expiresAtMs),
    `${PKG}.test/androidx.test.runner.AndroidJUnitRunner`,
  );
  record("TVR-01 harness credential stored on the emulator", /OK \(1 test\)/.test(seededTv));
  if (process.env.ROOM_E2E_HOLD === "1") {
    console.log(`holding: ${BASE} (Ctrl-C to stop)`);
    await new Promise<void>((resolve) => process.once("SIGINT", () => resolve()));
  }
  if (!ONLY || ONLY === "A") await webHostTvGuest(seeded.cookie);
  if (!ONLY || ONLY === "B") await tvHostWithGuests(seeded.cookie, seeded.den.accessToken, seeded.tv.accessToken);
  failed = results.some((result) => !result.pass);
} finally {
  await writeFile(path.join(WORK, "results.json"), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  for (const child of children) child.kill("SIGTERM");
}
console.log(`${results.filter((result) => result.pass).length}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
