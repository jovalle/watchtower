import { afterEach, expect, it, vi } from "vitest";
import { action } from "~/routes/api.plex.timeline";
import { registerPlaybackSession } from "~/lib/plex/playback-session.server";
vi.mock("~/lib/auth/session.server", () => ({ requireServerToken: async () => "session-token" }));
vi.mock("~/lib/auth/user.server", () => ({ getCurrentUser: async () => null }));
vi.mock("~/lib/env.server", () => ({ env: { PLEX_SERVER_URL: "http://plex.test:32400", PLEX_CLIENT_ID: "watchtower-test" } }));
afterEach(() => vi.unstubAllGlobals());
const report = (body: unknown) => action({ request: new Request("http://watchtower.test/api/plex/timeline", { method: "POST", body: JSON.stringify(body) }), params: {}, context: {} });

it("reports to the same isolated Plex client identity that owns the stream", async () => {
  const session = "00000000-0000-4000-8000-000000000001";
  registerPlaybackSession(session, "42", "http://plex.test:32400", "session-token", `watchtower-test-${session}`);
  const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", upstream);
  const response = await report({ ratingKey: "42", state: "playing", time: 351000, duration: 1594240, session });
  expect(await response.json()).toEqual({ success: true });
  const [url, options] = upstream.mock.calls[0];
  expect(new URL(url).searchParams.get("time")).toBe("351000");
  expect(new Headers(options.headers).get("X-Plex-Client-Identifier")).toBe(`watchtower-test-${session}`);
});

it("cannot advance another user's session", async () => {
  const session = "00000000-0000-4000-8000-000000000002";
  registerPlaybackSession(session, "42", "http://plex.test:32400", "other-user", "other-client");
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  expect((await report({ ratingKey: "42", state: "playing", time: 1000, duration: 2000, session })).status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

it.each([
  ["null JSON", null],
  ["invalid session identity", { ratingKey: "42", state: "playing", time: 0, duration: 1000, session: "another-client" }],
  ["non-finite duration", { ratingKey: "42", state: "playing", time: 0, duration: Infinity }],
])("rejects %s before contacting Plex", async (_, body) => {
  const upstream = vi.fn();
  vi.stubGlobal("fetch", upstream);
  expect((await report(body)).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});

it("serializes progress and ignores late reports after seeking backwards or replacing a session", async () => {
  const session = "00000000-0000-4000-8000-000000000003";
  const replacement = "00000000-0000-4000-8000-000000000004";
  registerPlaybackSession(session, "42", "http://plex.test:32400/", "session-token", "first-client");
  let finishFirst!: () => void;
  let started!: () => void;
  const firstStarted = new Promise<void>((resolve) => { started = resolve; });
  const upstream = vi.fn().mockImplementationOnce(async () => {
    started();
    await new Promise<void>((resolve) => { finishFirst = resolve; });
    return new Response(null, { status: 200 });
  }).mockImplementation(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", upstream);
  const body = { ratingKey: "42", state: "playing", time: 90000, duration: 200000, session, sequence: 1 };
  const first = report(body);
  await firstStarted;
  const backward = report({ ...body, time: 10000, sequence: 3 });
  finishFirst();
  await Promise.all([first, backward]);
  expect(await (await report({ ...body, sequence: 2 })).json()).toEqual({ success: true, ignored: true });
  registerPlaybackSession(replacement, "42", "http://plex.test:32400", "session-token", "second-client");
  await report({ ...body, session: replacement, time: 11000 });
  expect(await (await report({ ...body, state: "stopped", sequence: 4 })).json()).toEqual({ success: true, ignored: true });
  expect(upstream.mock.calls.map(([url]) => new URL(url).searchParams.get("time"))).toEqual(["90000", "10000", "11000"]);
});
