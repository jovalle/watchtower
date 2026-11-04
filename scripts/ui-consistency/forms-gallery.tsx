import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
// The audit bundler aliases this package to Remix's installed router.
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { UserMenu } from "../../app/components/UserMenu";
import { FilterDropdown } from "../../app/components/ui/FilterDropdown";
import { ContextMenu } from "../../app/components/ui/ContextMenu";
import { Toaster, toast } from "../../app/components/ui/Toast";
import { StreamingDashboard } from "../../app/components/StreamingDashboard";
import { IntegrationsSection } from "../../app/components/settings/IntegrationsSection";
import { TraktConnectSection } from "../../app/components/settings/TraktConnectSection";
import type { PlexUser } from "../../app/lib/auth/plex.server";
import scenarios from "./forms-gallery-cases.json";

export { scenarios };
const id = new URLSearchParams(location.search).get("case") ?? scenarios[0].id;
const scenario = scenarios.find((item) => item.id === id) ?? scenarios[0];
const long = "AnExtraordinarilyLongUnbrokenMediaOrDeviceTitle".repeat(5);
const user = { id: 1, uuid: "fixture", username: "Fixture Member", title: id === "usermenu-long" ? long : "Fixture Member", email: id === "usermenu-long" ? `${long}@example.invalid` : "member@example.invalid", thumb: id === "usermenu-avatar" ? "/__audit/poster.svg" : "" } as PlexUser;
const session = { ratingKey: "session-1", key: "/library/metadata/1", type: "episode", title: long, grandparentTitle: "An Example Series", parentIndex: 2, index: 3, duration: 3600000, viewOffset: 1234000, thumb: "", sessionKey: "session-1", User: { title: long, thumb: "/__audit/poster.svg" }, Player: { state: "playing", product: "Android TV", device: long, platform: long, platformVersion: "14", address: "192.168.1.1", secure: true, local: true }, Session: { location: "lan", bandwidth: 12500 }, Media: [{ videoCodec: "hevc", audioCodec: "truehd", audioChannels: 8 }] };
const sessions = [session, { ...session, ratingKey: "session-2", sessionKey: "session-2", grandparentTitle: "A Transcoding Series", Player: { ...session.Player, state: "buffering", local: false, relayed: true }, Session: { location: "wan", bandwidth: 4000 }, TranscodeSession: { videoDecision: "transcode", audioDecision: "transcode", videoCodec: "h264", audioCodec: "aac", audioChannels: 2, width: 1920, height: 1080, speed: 1.4, transcodeHwFullPipeline: true } }, { ...session, ratingKey: "session-3", sessionKey: "session-3", grandparentTitle: "A Paused Movie", type: "movie", title: "A Paused Movie", Player: { ...session.Player, state: "paused" }, TranscodeSession: { videoDecision: "transcode", audioDecision: "directplay", videoCodec: "h264", speed: 0.6, transcodeHwFullPipeline: false } }];
const history = Array.from({ length: 10 }, (_, index) => ({ ratingKey: `history-${index}`, key: `/library/metadata/history-${index}`, type: index % 2 ? "movie" : "episode", title: index ? `Example Title ${index}` : long, grandparentTitle: index ? "Example Series" : long, parentIndex: 1, index: index + 1, thumb: "", lastViewedAt: Math.floor(Date.now() / 1000) - index * 90000 }));
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let historyCalls = 0;

// All component requests resolve to synthetic local responses; no service is called.
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  if (url.pathname === "/api/plex/sessions") {
    if (id === "streaming-active-loading") await pause(60000);
    if (id === "streaming-active-error") return json({ error: "Synthetic sessions failure" }, 503);
    return json({ sessions: id.includes("active-populated") || id.includes("active-expanded") ? sessions : [] });
  }
  if (url.pathname === "/api/plex/sessions/history") {
    historyCalls++;
    if (id === "streaming-history-loading" || (id === "streaming-history-more-pending" && historyCalls > 1)) await pause(60000);
    if (id === "streaming-history-error") return json({ error: "Synthetic history failure" }, 503);
    return json({ history: id === "streaming-history-empty" ? [] : history, hasMore: true });
  }
  if (url.pathname === "/api/integrations") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (id === "integrations-pending") await pause(60000);
    if (id === "integrations-error") return json({ ok: false, error: `Could not reach the configured service: ${long}` }, 503);
    if (body.intent === "detect") return json({ url: "http://seerr.example.invalid:5055" });
    return json({ ok: true, message: "Synthetic connection succeeded." });
  }
  if (url.pathname === "/api/trakt") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.intent === "start") return json({ userCode: "ABCD-EFGH", verificationUrl: "http://localhost/__audit/activate", interval: 60 });
    if (body.intent === "poll") return json({ status: "pending" });
    if (id.endsWith("failure")) return json({ error: `Synthetic Trakt failure. Try again. ${long}` }, 503);
    return json({ ok: true });
  }
  return json({ error: "No synthetic response for this request." }, 404);
};

const clickButton = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === name)?.click();

function Gallery() {
  const [streamOpen, setStreamOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);
  const [selected, setSelected] = useState<string[]>(id === "filter-selected" ? ["movie", "series"] : []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (id.startsWith("usermenu")) document.querySelector<HTMLButtonElement>('[aria-label="Account Menu"]')?.click();
      if (id.startsWith("filter")) document.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click();
      if (id === "toast-long") toast(`Watchlist saved. ${long}`);
      if (id.startsWith("streaming-history")) clickButton("Recent");
      if (id === "integrations-pending") clickButton("Detect");
      if (id === "integrations-error") clickButton("Test");
      if (id === "trakt-pairing") clickButton("Connect Trakt");
      if (id === "trakt-disconnect-failure") clickButton("Disconnect");
      if (id === "trakt-scrobble-failure") document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    }, 100);
    const second = setTimeout(() => {
      if (id === "streaming-history-more-pending") clickButton("Load More");
      if (id === "streaming-active-expanded") document.querySelectorAll<HTMLButtonElement>('dialog button[aria-expanded="false"]').forEach((button) => button.click());
    }, 550);
    return () => { clearTimeout(timer); clearTimeout(second); };
  }, []);
  const options = id === "filter-no-options" ? [] : id === "filter-many" ? Array.from({ length: 28 }, (_, index) => ({ value: `${index}`, label: index === 0 ? long : `Filter Option ${index + 1}`, count: index + 1 })) : [{ value: "movie", label: "Movies", count: 12 }, { value: "series", label: "Series", count: 8 }, { value: "unavailable", label: "Not Available", count: 2 }];
  const items = id === "context-many" ? Array.from({ length: 40 }, (_, index) => ({ label: index ? `Playlist ${index + 1}` : long, onClick() {}, disabled: index === 2 })) : [{ label: id === "context-long" ? long : "Play", onClick() {} }, { label: "Unavailable Action", disabled: true, onClick() {} }, { label: "Remove from Watchlist", destructive: true, onClick() {} }];
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8 text-foreground-primary">
      <h1 className="mb-6 text-2xl font-bold">{scenario.group}</h1>
      <Toaster />
      {id.startsWith("usermenu") && <div style={{ position: "fixed", right: 16, top: 10, display: "flex", height: 44, alignItems: "center" }}><UserMenu user={user} /></div>}
      {id.startsWith("filter") && <div className="flex justify-end"><FilterDropdown label="Type" options={options} selected={selected} onChange={setSelected} /></div>}
      {id.startsWith("context") && contextOpen && <ContextMenu position={{ x: innerWidth - 12, y: innerHeight - 12 }} items={items} onClose={() => setContextOpen(false)} />}
      {id.startsWith("streaming") && <div style={{ position: "fixed", right: 16, top: 10, display: "flex", height: 44, alignItems: "center" }}><StreamingDashboard isOpen={streamOpen} onOpenChange={setStreamOpen} triggerClassName="flex" /></div>}
      {id.startsWith("integrations") && <IntegrationsSection initial={id === "integrations-unconfigured" ? { seerr: null, trakt: null } : { seerr: { url: "http://seerr.example.invalid:5055", hasApiKey: true }, trakt: { clientId: long, hasClientSecret: true } }} />}
      {id.startsWith("trakt") && <TraktConnectSection initial={{ available: id !== "trakt-unconfigured", connected: id === "trakt-connected" || id.endsWith("failure"), username: id.endsWith("failure") ? long : "Fixture Member", scrobble: true }} />}
    </main>
  );
}

const router = createMemoryRouter([{ path: "*", element: <Gallery />, action: () => ({ ok: true }) }]);
const mount = document.getElementById("gallery-root") ?? document.getElementById("root") ?? document.body.appendChild(document.createElement("div"));
createRoot(mount).render(<RouterProvider router={router} />);
