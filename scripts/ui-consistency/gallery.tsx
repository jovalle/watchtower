import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { RankedChoiceVoter } from "../../app/components/vote/RankedChoiceVoter";
import { GuestIdentity } from "../../app/components/vote/GuestIdentity";
import { MovieSelector } from "../../app/components/vote/MovieSelector";
import { RequestModal } from "../../app/components/media/RequestModal";
import { ListSelectorModal } from "../../app/components/media/ListSelectorModal";
import { TrailerModal } from "../../app/components/media/TrailerModal";
import { InstallPrompt } from "../../app/components/pwa/InstallPrompt";
import { Toaster, toast } from "../../app/components/ui/Toast";

export const scenarioIds = [
  "request-loading", "request-error", "request-available", "request-blocked", "request-unknown", "request-partial", "request-pending", "request-submit-error", "request-many-seasons",
  "playlist-loading", "playlist-error", "playlist-empty", "playlist-full", "playlist-pending", "playlist-submit-error", "trailer",
  "movie-results", "movie-empty", "movie-loading", "movie-search-error", "movie-added", "movie-limit", "movie-add-pending", "movie-add-error",
  "ranked-new", "ranked-existing", "ranked-pending", "ranked-empty", "ranked-long", "guest-empty", "guest-prefilled", "guest-pending", "guest-error", "install-banner", "toast", "toast-long",
] as const;
const selected = new URLSearchParams(location.search).get("case") ?? scenarioIds[0];
if (!scenarioIds.includes(selected as typeof scenarioIds[number])) throw new Error(`Unknown gallery case: ${selected}`);
const long = "AnExtraordinarilyLongUnbrokenMediaOrProfileName".repeat(3);
const movies = Array.from({ length: 8 }, (_, index) => ({ ratingKey: String(index + 1), title: index === 0 ? long : `Example Movie ${index + 1}`, year: 2024, posterUrl: "/__audit/poster.svg" }));
const waitForever = () => new Promise<never>(() => {});
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
// The gallery never calls a service: every component fetch is answered here.
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  if (url.pathname === "/api/seerr") {
    if (selected === "request-loading" || (init?.method === "POST" && selected === "request-pending")) return waitForever();
    if (selected === "request-error" || (init?.method === "POST" && selected === "request-submit-error")) return response({ error: "The request service is unavailable. Try again." }, 503);
    const status = selected === "request-available" ? "available" : selected === "request-blocked" ? "blocklisted" : selected === "request-partial" || selected === "request-many-seasons" ? "partially_available" : "unknown";
    return response({ status, status4k: "unknown", seasons: selected === "request-many-seasons" ? Array.from({ length: 24 }, (_, i) => ({ number: i + 1, status: i % 2 ? "unknown" : "available", status4k: "unknown" })) : [], requests: [] });
  }
  if (url.pathname === "/api/plex/playlist") {
    if (selected === "playlist-loading" || (init?.method === "POST" && selected === "playlist-pending")) return waitForever();
    if (selected === "playlist-error" || (init?.method === "POST" && selected === "playlist-submit-error")) return response({ error: "Could not update the playlist." }, 503);
    return response({ playlists: selected === "playlist-empty" ? [] : Array.from({ length: 14 }, (_, i) => ({ ratingKey: String(i + 1), title: `Playlist ${i + 1}`, leafCount: 2, containsItem: i === 1, playlistItemId: i === 1 ? "existing" : null })) });
  }
  if (url.pathname === "/api/vote/movies") {
    if (selected === "movie-add-pending") return waitForever();
    return selected === "movie-add-error" ? response({ error: "Your movie could not be added. Check your connection and try again." }, 503) : response({ success: true });
  }
  if (url.pathname === "/api/vote/guest") {
    if (selected === "guest-pending") return waitForever();
    return selected === "guest-error" ? response({ error: "That name is already in use. Choose a different name." }, 409) : response({ token: "synthetic-gallery-guest" });
  }
  return response({ error: `No synthetic response for ${url.pathname}` }, 404);
};
Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } });

/** Exercise the real control once to expose its pending/error/disclosure state. */
function clickWhenReady(label: string) {
  let attempts = 0;
  const timer = setInterval(() => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent?.trim() === label);
    if (button && !button.disabled) { button.click(); clearInterval(timer); }
    else if (++attempts > 80) clearInterval(timer);
  }, 25);
  return () => clearInterval(timer);
}

function Gallery() {
  const [notice, setNotice] = useState("");
  const [closed, setClosed] = useState(false);
  const [guestName, setGuestName] = useState(selected === "guest-empty" ? "" : "Fixture Guest");
  useEffect(() => {
    document.title = `Watchtower Gallery: ${selected}`;
    if (selected === "movie-add-error" || selected === "movie-add-pending") return clickWhenReady("Add");
    if (selected === "request-pending" || selected === "request-submit-error") return clickWhenReady("Request");
    if (selected === "playlist-pending" || selected === "playlist-submit-error") {
      const timer = setInterval(() => {
        const choice = document.querySelector<HTMLButtonElement>('dialog button[aria-pressed="false"]');
        if (choice && !choice.disabled) { choice.click(); clearInterval(timer); }
      }, 25);
      return () => clearInterval(timer);
    }
    if (selected === "guest-error" || selected === "guest-pending") return clickWhenReady("Join");
    if (selected === "install-banner") {
      localStorage.removeItem("pwa-install-dismissed");
      const timer = setTimeout(() => {
        const event = new Event("beforeinstallprompt", { cancelable: true });
        Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: "accepted" }) });
        window.dispatchEvent(event);
      }, 100);
      return () => clearTimeout(timer);
    }
    if (selected.startsWith("toast")) {
      const timer = setTimeout(() => toast(selected === "toast-long" ? long : "Your changes were saved."), 100);
      return () => clearTimeout(timer);
    }
  }, []);

  if (closed) return <main className="page-gutter mx-auto py-8 text-foreground-primary"><h1 className="text-2xl font-semibold">Overlay Closed</h1><p role="status" className="mt-4">{notice}</p></main>;
  if (selected.startsWith("request-")) return <RequestModal item={{ tmdbId: 17, type: selected === "request-partial" || selected === "request-many-seasons" ? "show" : "movie", title: long, year: "2024", posterUrl: "/__audit/poster.svg", tmdbUrl: "https://example.invalid/title" }} onClose={() => setClosed(true)} />;
  if (selected.startsWith("playlist-")) return <ListSelectorModal itemRatingKey="42" itemTitle={long} position={{ x: innerWidth - 20, y: innerHeight - 20 }} onClose={() => setClosed(true)} />;
  if (selected === "trailer") return <TrailerModal youtubeKey="fixture" title={long} onClose={() => setClosed(true)} />;
  if (selected.startsWith("movie-")) return <MovieSelector showingId="gallery" currentPicks={selected === "movie-limit" ? 5 : selected === "movie-added" ? 1 : 0} maxPicks={5} existingKeys={new Set(selected === "movie-added" ? ["1"] : [])} onClose={() => { setNotice("Selector closed"); setClosed(true); }} onMovieAdded={() => setNotice("Synthetic movie added")} />;
  if (selected.startsWith("ranked-")) return <main className="page-gutter mx-auto max-w-2xl py-8 text-foreground-primary"><h1 className="mb-6 text-3xl font-bold">Rank Movies</h1><RankedChoiceVoter movies={selected === "ranked-empty" ? [] : movies.slice(0, selected === "ranked-long" ? 8 : 3)} existingRankings={selected === "ranked-existing" ? ["3", "1", "2"] : []} onSubmit={rankings => setNotice(`Synthetic ballot: ${rankings.join(", ")}`)} isSubmitting={selected === "ranked-pending"} />{notice && <p role="status" className="mt-4">{notice}</p>}</main>;
  if (selected.startsWith("guest-")) return <main className="page-gutter mx-auto max-w-xl py-8 text-foreground-primary"><h1 className="mb-6 text-3xl font-bold">Join the Showing</h1><GuestIdentity guestName={guestName} guestToken="" onNameConfirmed={name => { setGuestName(name); setNotice(`Joined as ${name}`); }} />{notice && <p role="status" className="mt-4">{notice}</p>}</main>;
  return <main className="relative min-h-dvh bg-background-primary text-foreground-primary"><h1 className="sr-only">Watchtower Notification Gallery</h1><InstallPrompt /><Toaster /></main>;
}

const router = createMemoryRouter([
  { path: "/", element: <Gallery /> },
  { path: "/api/vote/search", loader: async () => {
    if (selected === "movie-loading") return waitForever();
    if (selected === "movie-search-error") return { error: "The catalog could not be loaded. Check your connection and try again." };
    return { results: selected === "movie-empty" ? [] : movies };
  } },
]);
const root = document.getElementById("gallery-root") ?? document.getElementById("root");
if (!root) throw new Error("Gallery requires #gallery-root or #root");
createRoot(root).render(<RouterProvider router={router} />);
