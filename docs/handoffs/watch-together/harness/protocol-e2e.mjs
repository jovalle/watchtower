// Multi-client HTTP/SSE checks against the real server. Measures command -> peer SSE delivery
// on one host clock, heartbeat cadence, auth/CSRF/leak properties and restart behaviour.
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { ART, BASE } from "./paths.mjs";

const cookies = JSON.parse(readFileSync(`${ART}cookies.json`, "utf8"));
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function client(name) {
  const jar = new Map([["__plex_session", encodeURIComponent(cookies[name])]]);
  const header = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  const absorb = (response) => {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      jar.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1));
    }
    return response;
  };
  return {
    header,
    get: async (path, headers = {}) => absorb(await fetch(BASE + path, { headers: { Cookie: header(), ...headers } })),
    post: async (path, body, headers = {}) => absorb(await fetch(BASE + path, {
      method: "POST",
      headers: { Cookie: header(), "Content-Type": "application/json", Origin: BASE, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })),
  };
}

async function mutation(c, path, fields) {
  const sample = await (await c.get("/api/v1/clock")).json();
  return c.post(path, { requestId: randomUUID(), epoch: sample.epoch, expiresAtMs: sample.sentAtMs + 30_000, ...fields });
}

function events(c, roomId) {
  const controller = new AbortController();
  const seen = [];
  const waiters = [];
  const started = performance.now();
  const ready = fetch(`${BASE}/api/v1/rooms/${roomId}/events`, { headers: { Cookie: c.header(), "Last-Event-ID": "stale:1:1" }, signal: controller.signal }).then((response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    (async () => {
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
            const event = { type, data: JSON.parse(data), atMs: performance.now() - started };
            seen.push(event);
            for (const waiter of [...waiters]) if (waiter.match(event)) { waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(event); }
          }
        }
      } catch {
        // aborted
      }
    })();
    return { status: response.status, headers: Object.fromEntries(response.headers) };
  });
  const next = (match, timeoutMs = 10_000) => new Promise((resolve, reject) => {
    const found = seen.find(match);
    if (found) return resolve(found);
    const waiter = { match, resolve };
    waiters.push(waiter);
    setTimeout(() => { if (waiters.includes(waiter)) { waiters.splice(waiters.indexOf(waiter), 1); reject(new Error("timeout waiting for event")); } }, timeoutMs);
  });
  return { ready, seen, next, started, close: () => controller.abort() };
}

export async function run({ server, startServer, waitForServer }) {
  const results = { startedAt: new Date().toISOString(), base: BASE, checks: [] };
  const record = (id, pass, detail) => { results.checks.push({ id, pass, ...detail }); console.log(pass ? "PASS" : "FAIL", id, JSON.stringify(detail)); };
  const alice = client("alice");
  const bob = client("bob");
  const carol = client("carol");
  try {
    const anonymous = await fetch(`${BASE}/api/v1/clock`);
    record("WTT-06 anonymous clock is 401 JSON", anonymous.status === 401 && (await anonymous.json()).error.code === "unauthenticated", { status: anonymous.status });

    const created = await mutation(alice, "/api/v1/rooms", { media: { ratingKey: "4242", mediaId: "9001", partId: "9101" }, startPositionMs: 0, autoAdvance: true });
    const envelope = await created.json();
    record("WT-01 create returns lobby envelope", created.status === 201 && envelope.snapshot.phase === "lobby", { status: created.status });
    const roomId = envelope.snapshot.roomId;
    const invite = envelope.invitation.secret;
    const epoch = envelope.snapshot.epoch;

    const foreign = await alice.post(`/api/v1/rooms/${roomId}/leave`, { epoch, membershipVersion: 1 }, { Origin: "https://attacker.example" });
    record("WTT-06 cross-origin POST rejected", foreign.status === 403 && (await foreign.json()).error.code === "csrf_rejected", { status: foreign.status });
    const plain = await alice.post(`/api/v1/rooms/${roomId}/leave`, "{}", { "Content-Type": "text/plain" });
    record("WTT-06 text/plain POST rejected", plain.status === 415, { status: plain.status });
    const huge = await alice.post(`/api/v1/rooms/${roomId}/leave`, JSON.stringify({ pad: "x".repeat(20_000) }));
    record("WTT-06 oversized body rejected", huge.status === 413, { status: huge.status });
    const bearer = await fetch(`${BASE}/api/v1/rooms/${roomId}`, { headers: { Authorization: "Bearer synthetic", Cookie: alice.header() } });
    record("WTT-05 cookie+bearer is ambiguous, no fallback", bearer.status === 401 && (await bearer.json()).error.code === "identity_ambiguous", { status: bearer.status });

    const probe = await bob.get(`/api/v1/rooms/${roomId}`);
    const probeText = await probe.text();
    record("WTT-05 non-member GET concealed", probe.status === 404 && !probeText.includes("4242"), { status: probe.status });
    const probeStream = await bob.get(`/api/v1/rooms/${roomId}/events`);
    record("WTT-05 non-member SSE refused before streaming", probeStream.status === 404 && probeStream.headers.get("content-type").startsWith("application/json"), { status: probeStream.status });

    const denied = await mutation(carol, "/api/v1/rooms/join", { invite });
    const deniedBody = await denied.json();
    record("WT-03 user without item access denied by own Plex permissions", denied.status === 403 && deniedBody.error.code === "media_forbidden" && !JSON.stringify(deniedBody).includes("4242"), { status: denied.status, code: deniedBody.error?.code });

    const joined = await mutation(bob, "/api/v1/rooms/join", { invite });
    const bobEnvelope = await joined.json();
    record("WT-03 authorized join; member gets no invite", joined.status === 200 && bobEnvelope.invitation === null, { status: joined.status });

    const aliceEvents = events(alice, roomId);
    const bobEvents = events(bob, roomId);
    const sse = await bobEvents.ready;
    await aliceEvents.ready;
    const first = await bobEvents.next((event) => event.type === "snapshot");
    record("WT-20 SSE headers and immediate full snapshot despite stale Last-Event-ID", sse.status === 200 && sse.headers["content-type"].startsWith("text/event-stream") && sse.headers["x-accel-buffering"] === "no" && sse.headers["cache-control"].includes("no-transform") && first.atMs < 1000 && first.data.roomId === roomId, { cacheControl: sse.headers["cache-control"], firstSnapshotMs: Math.round(first.atMs) });

    let bobPresence = bobEnvelope.membership.nextPresenceSequence;
    const forged = await bob.post(`/api/v1/rooms/${roomId}/presence`, {
      epoch, membershipVersion: 1, mediaGeneration: 1, preparationGeneration: 1, presenceSequence: bobPresence++,
      playbackSessionId: randomUUID(), positionMs: 0, ready: true, buffering: false, replacingSource: false, error: null,
    });
    const forgedSelf = (await forged.json()).snapshot.participants.find((participant) => participant.participantId === bobEnvelope.membership.participantId);
    record("WTT-05 unowned playbackSessionId cannot claim readiness", forged.status === 200 && forgedSelf.ready === false, { ready: forgedSelf.ready });

    const beats = [];
    for (let index = 0; index < 3; index += 1) beats.push(await bobEvents.next((event) => event.type === "heartbeat" && !beats.includes(event), 8000));
    const gaps = beats.slice(1).map((beat, index) => Math.round(beat.atMs - beats[index].atMs));
    record("WT-20 named heartbeat every <= 5 s", gaps.every((gap) => gap >= 3500 && gap <= 5000), { gapsMs: gaps });

    let sequence = envelope.membership.nextCommandSequence;
    let revision = first.data.revision;
    const latencies = [];
    for (let index = 0; index < 40; index += 1) {
      const sentAt = performance.now() - bobEvents.started;
      const response = await alice.post(`/api/v1/rooms/${roomId}/commands`, {
        commandId: randomUUID(), commandSequence: sequence++, membershipVersion: 1, epoch, mediaGeneration: 1,
        expectedRevision: revision, type: "set-policy", payload: { autoAdvance: index % 2 === 0 },
      });
      const body = await response.json();
      if (response.status !== 200) throw new Error(`command ${response.status} ${JSON.stringify(body)}`);
      revision = body.snapshot.revision;
      const delivered = await bobEvents.next((event) => event.type === "snapshot" && event.data.revision === revision);
      latencies.push(delivered.atMs - sentAt);
      await sleep(100);
    }
    record("WT-20 command -> peer SSE delivery p95 <= 500 ms (loopback)", percentile(latencies, 95) <= 500, {
      samples: latencies.length, p50Ms: +percentile(latencies, 50).toFixed(1), p95Ms: +percentile(latencies, 95).toFixed(1), maxMs: +Math.max(...latencies).toFixed(1),
    });

    const retryBody = { commandId: randomUUID(), commandSequence: sequence++, membershipVersion: 1, epoch, mediaGeneration: 1, expectedRevision: revision, type: "set-policy", payload: { autoAdvance: true } };
    const firstTry = await (await alice.post(`/api/v1/rooms/${roomId}/commands`, retryBody)).json();
    const secondTry = await (await alice.post(`/api/v1/rooms/${roomId}/commands`, retryBody)).json();
    revision = firstTry.snapshot.revision;
    record("WTT-01 identical retry returns the cached result without a new transition", JSON.stringify(firstTry.snapshot.revision) === JSON.stringify(secondTry.snapshot.revision) && secondTry.snapshot.revision === revision, { revision });

    const stale = await alice.post(`/api/v1/rooms/${roomId}/commands`, { commandId: randomUUID(), commandSequence: sequence++, membershipVersion: 1, epoch, mediaGeneration: 1, expectedRevision: revision - 1, type: "pause", payload: {} });
    const staleBody = await stale.json();
    record("WTT-01 stale revision 409 with current snapshot", stale.status === 409 && staleBody.error.code === "stale_revision" && staleBody.snapshot.revision === revision, { status: stale.status });

    const nonHost = await bob.post(`/api/v1/rooms/${roomId}/commands`, { commandId: randomUUID(), commandSequence: 1, membershipVersion: 1, epoch, mediaGeneration: 1, expectedRevision: revision, type: "pause", payload: {} });
    record("WT-06 non-host command 403", nonHost.status === 403, { status: nonHost.status });

    const burst = [];
    for (let index = 0; index < 35; index += 1) {
      burst.push((await alice.post(`/api/v1/rooms/${roomId}/commands`, { commandId: randomUUID(), commandSequence: sequence++, membershipVersion: 1, epoch, mediaGeneration: 1, expectedRevision: 0, type: "pause", payload: {} })).status);
    }
    record("WTT-16 command burst is rate-limited, not queued", burst.includes(429), { statuses: [...new Set(burst)] });
    await sleep(2100);

    const removal = await alice.post(`/api/v1/rooms/${roomId}/commands`, { commandId: randomUUID(), commandSequence: sequence++, membershipVersion: 1, epoch, mediaGeneration: 1, expectedRevision: revision, type: "remove-participant", payload: { participantId: bobEnvelope.membership.participantId } });
    const ended = await bobEvents.next((event) => event.type === "ended");
    record("WT-12 removal ends the member stream with a minimal envelope", removal.status === 200 && ended.data.reason === "removed" && !("snapshot" in ended.data), { reason: ended.data.reason });
    const removedGet = await bob.get(`/api/v1/rooms/${roomId}`);
    const rejoin = await mutation(bob, "/api/v1/rooms/join", { invite });
    record("WT-12 removed member denied and cannot rejoin with the old invite", removedGet.status === 403 && rejoin.status === 403, { get: removedGet.status, rejoin: rejoin.status });

    const rotated = await mutation(alice, `/api/v1/rooms/${roomId}/invitations`, { membershipVersion: 1, action: "rotate" });
    const rotatedBody = await rotated.json();
    const oldInvite = await mutation(carol, "/api/v1/rooms/join", { invite });
    record("WT-02 rotation invalidates the previous invite", rotated.status === 200 && rotatedBody.invitation.secret !== invite && oldInvite.status === 404, { oldInviteStatus: oldInvite.status });

    aliceEvents.close();
    bobEvents.close();

    // WT-18: a coordinator restart expires rooms; stale epochs cannot resurrect them.
    const stream = events(alice, roomId);
    await stream.ready;
    await stream.next((event) => event.type === "snapshot");
    server.current.kill("SIGTERM");
    await new Promise((resolve) => server.current.once("exit", resolve));
    server.current = startServer();
    await waitForServer();
    const afterRestart = await alice.get(`/api/v1/rooms/${roomId}`);
    const clock = await (await alice.get("/api/v1/clock")).json();
    const staleEpochPresence = await alice.post(`/api/v1/rooms/${roomId}/presence`, { epoch, membershipVersion: 1, mediaGeneration: 1, preparationGeneration: 1, presenceSequence: 99, playbackSessionId: null, positionMs: 0, ready: false, buffering: false, replacingSource: false, error: null });
    const staleCreate = await alice.post("/api/v1/rooms", { requestId: randomUUID(), epoch, expiresAtMs: clock.sentAtMs + 30_000, media: { ratingKey: "4242", mediaId: "9001", partId: "9101" }, startPositionMs: 0, autoAdvance: false });
    record("WT-18 restart: new epoch, old room gone, stale epoch rejected", clock.epoch !== epoch && afterRestart.status === 404 && staleEpochPresence.status === 404 && staleCreate.status === 409, { epochChanged: clock.epoch !== epoch, get: afterRestart.status, presence: staleEpochPresence.status, staleCreate: staleCreate.status });
    stream.close();

    await sleep(500);
    const serverLog = readFileSync(`${ART}server.log`, "utf8");
    const secrets = [invite, rotatedBody.invitation.secret, "alice-token", "bob-token", "carol-token", readFileSync(`${ART}.secret`, "utf8").trim()];
    record("WT-21 no invite, token or session secret in server log", secrets.every((secret) => !serverLog.includes(secret)), { logBytes: serverLog.length });
  } catch (error) {
    record("harness", false, { error: String(error) });
  }
  writeFileSync(`${ART}protocol-e2e.json`, JSON.stringify(results, null, 2));
  console.log(`checks: ${results.checks.filter((check) => check.pass).length}/${results.checks.length} passed`);
  return results.checks.every((check) => check.pass);
}
