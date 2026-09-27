import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SeerrRequest } from "~/lib/integrations/seerr.server";
import { requestState } from "~/lib/integrations/request-state";

const config = vi.hoisted(() => ({ DATA_PATH: "" }));
vi.mock("~/lib/env.server", () => ({ env: config }));
vi.mock("~/lib/integrations/storage.server", () => ({ getIntegrations: async () => ({ version: 1, seerr: { url: "http://seerr.test", apiKey: "fixture-key" } }) }));
let item: SeerrRequest;
let deleted = false;
let unavailable = false;
beforeEach(async () => {
  config.DATA_PATH = await mkdtemp(join(tmpdir(), "watchtower-inbox-test-"));
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
  item = { id: 1, status: 1, createdAt: "2026-09-25", is4k: false, requestedBy: { id: 10 }, media: { id: 5, tmdbId: 17, mediaType: "tv", status: 2, status4k: 1 } };
  deleted = false;
  unavailable = false;
  vi.stubGlobal("fetch", vi.fn(async (input, init) => {
    const url = new URL(String(input));
    if (unavailable) return new Response(null, { status: 503 });
    if (url.pathname === "/api/v1/user") return Response.json({ results: [{ id: 10, plexId: 1 }, { id: 20, plexId: 2 }] });
    expect(new Headers(init?.headers).get("X-Api-User")).toMatch(/^(10|20)$/);
    if (url.pathname === "/api/v1/request") return Response.json({ pageInfo: { pages: 1, page: 1, results: deleted ? 0 : 1 }, results: deleted ? [] : [item] });
    if (url.pathname === "/api/v1/request/1") return deleted ? new Response(null, { status: 404 }) : Response.json(item);
    if (url.pathname === "/api/v1/tv/17") return Response.json({ id: 17, mediaType: "tv", name: "Example Series" });
    throw new Error(`Unexpected fixture path: ${url.pathname}`);
  }));
});
afterEach(async () => { vi.useRealTimers(); vi.unstubAllGlobals(); await rm(config.DATA_PATH, { recursive: true, force: true }); });
const nextPoll = () => vi.setSystemTime(Date.now() + 61000);

it("persists transitions, deduplicates concurrent polls and restarts, and isolates users", async () => {
  let { requestInbox } = await import("~/lib/integrations/notifications.server");
  expect((await requestInbox(1)).notifications).toEqual([]);
  await requestInbox(2);
  item.status = 2;
  item.media.status = 3;
  nextPoll();
  const results = await Promise.all([requestInbox(1), requestInbox(1)]);
  expect(results.map((result) => result.notifications.map((notice) => notice.state))).toEqual([["Processing"], ["Processing"]]);
  expect((await requestInbox(2)).notifications).toEqual([]);
  item.media.status = 4;
  nextPoll();
  expect((await requestInbox(1)).notifications[0].state).toBe("Partially available");
  item.media.status = 5;
  nextPoll();
  const available = await requestInbox(1);
  expect(available.notifications[0]).toMatchObject({ title: "Example Series", state: "Available", href: "/app/media/show/tmdb-17", read: false });
  await requestInbox(1, available.notifications[0].id);
  vi.resetModules();
  ({ requestInbox } = await import("~/lib/integrations/notifications.server"));
  nextPoll();
  const restarted = await requestInbox(1);
  expect(restarted.notifications.map((notice) => notice.state)).toEqual(["Available", "Partially available", "Processing"]);
  expect(restarted.notifications[0].read).toBe(true);
  const files = await readdir(join(config.DATA_PATH, "notifications"));
  expect(files.filter((file) => file.endsWith(".json"))).toHaveLength(2);
  expect(await readFile(join(config.DATA_PATH, "notifications", files.find((file) => file.startsWith("2-"))!), "utf8")).not.toContain("Example Series");
});

it("retains the inbox during outages and only reports deletion after a confirmed 404", async () => {
  const { requestInbox } = await import("~/lib/integrations/notifications.server");
  await requestInbox(1);
  item.status = 4;
  nextPoll();
  expect((await requestInbox(1)).notifications[0].state).toBe("Failed");
  deleted = true;
  unavailable = true;
  nextPoll();
  const offline = await requestInbox(1);
  expect(offline.error).toMatch(/Couldn't refresh/);
  expect(offline.notifications.map((notice) => notice.state)).toEqual(["Failed"]);
  unavailable = false;
  nextPoll();
  expect((await requestInbox(1)).notifications[0].state).toBe("Cancelled or deleted");
});

it("keeps regular and 4K availability separate and does not hide denial or failure", () => {
  item.is4k = true;
  item.media.status = 5;
  item.media.status4k = 4;
  item.status = 2;
  expect(requestState(item)).toBe("Partially available");
  item.status = 3;
  expect(requestState(item)).toBe("Declined");
  item.status = 4;
  expect(requestState(item)).toBe("Failed");
  item.media.status4k = 6;
  expect(requestState(item)).toBe("Blocked");
});

it("notifies a return to a previous state without duplicating unchanged polls or read state", async () => {
  const { requestInbox } = await import("~/lib/integrations/notifications.server");
  await requestInbox(1);
  item.status = 4;
  nextPoll();
  const first = (await requestInbox(1)).notifications[0];
  await requestInbox(1, first.id);
  item.status = 2;
  item.media.status = 3;
  nextPoll();
  await requestInbox(1);
  item.status = 4;
  nextPoll();
  const retryFailure = await requestInbox(1);
  expect(retryFailure.notifications.map((notice) => notice.state)).toEqual(["Failed", "Processing", "Failed"]);
  expect(retryFailure.notifications[0].id).not.toBe(first.id);
  expect(retryFailure.notifications[0].read).toBe(false);
  expect(retryFailure.notifications[2].read).toBe(true);
  nextPoll();
  expect((await requestInbox(1)).notifications).toEqual(retryFailure.notifications);
});
