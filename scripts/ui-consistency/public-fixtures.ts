const long = "AnExtraordinarilyLongUnbrokenShowingOrProfileName".repeat(3);
const user = { id: 1, username: "Fixture Host", title: "Fixture Host", thumb: "", email: "fixture@example.invalid" };
const cinemaParent = (signedIn = false) => ({ user: signedIn ? user : null, isOwner: signedIn });
const integrations = { seerr: null, trakt: null };
const movies = Array.from({ length: 7 }, (_, index) => ({ ratingKey: String(index + 1), title: index ? `Example Movie ${index + 1}` : long, year: 2024, posterUrl: "/__audit/poster.svg", summary: "Fixture movie summary.", addedBy: { name: index ? "Fixture Host" : long, plexUserId: 1 }, addedAt: 1793700000000, watched: index === 6 }));
const showing = { id: "fixture-show", name: "Friday Night at the Cinema", status: "coming_soon", createdBy: { name: "Fixture Host", plexUserId: 1 }, createdAt: 1793700000000, updatedAt: 1793700000000, movies, votes: [{ voter: { name: long, plexUserId: 1 }, rankings: ["1", "2", "3", "4", "5", "6"], votedAt: 1793700000000, updatedAt: 1793700000000 }], history: [{ action: "movie_added", actor: { name: long }, target: long, timestamp: 1793700000000 }] };
const detail = { showing, bordaScores: movies.filter(m => !m.watched).map((m, index) => ({ ratingKey: m.ratingKey, title: m.title, score: 6 - index })), currentUserPicks: 2, isOwner: true, userId: 1 };
const summary = { id: showing.id, name: long, status: "coming_soon", createdBy: showing.createdBy, createdAt: showing.createdAt, updatedAt: showing.updatedAt, movieCount: 7, voterCount: 1, moviePreviews: movies };
type Case = { id: string; path: string; routeId: string; data: unknown; parentData?: Record<string, unknown>; actionData?: unknown };
const c = (id: string, path: string, route: string, data: unknown, parentData?: Record<string, unknown>, actionData?: unknown): Case => ({ id, path, routeId: `routes/${route}`, data, parentData, actionData });
export const cases: Case[] = [
  c("landing", "/", "_index", null),
  c("access-denied", "/access-denied?error=This%20profile%20does%20not%20have%20access%20to%20the%20library.", "access-denied", { username: long }),
  c("auth-cancelled", "/auth/callback", "auth.callback", { redirectTo: "/app" }),
  c("intro", "/intro", "intro", null),
  c("join-missing", "/join", "join", { signedIn: false }),
  c("room-join-missing", "/app/rooms/join", "app.rooms.join", null),
  c("setup-code", "/setup", "setup", { step: "code", username: "Fixture Host" }),
  c("setup-code-error", "/setup", "setup", { step: "code", username: "Fixture Host" }, undefined, { error: "That setup code is not valid." }),
  c("setup-empty", "/setup", "setup", { step: "select", username: long, current: null, servers: [] }),
  c("setup-server-error", "/setup", "setup", { step: "select", username: "Fixture Host", current: null, servers: [], error: "Could not load your servers from plex.tv. Try again." }),
  c("setup-connections", "/setup", "setup", { step: "select", username: "Fixture Host", current: { serverName: long, serverUrl: `https://${long}.example.invalid` }, servers: [{ machineIdentifier: "fixture", name: long, connections: [{ uri: `https://${long}.example.invalid:32400`, local: false, relay: false, ok: true, latencyMs: 25 }, { uri: "http://127.0.0.1:32400", local: true, relay: false, ok: false, error: "Connection timed out while waiting for a response from this server." }] }] }),
  c("setup-disabled", "/setup", "setup", { step: "select", username: "Fixture Host", current: null, servers: [{ machineIdentifier: "fixture", name: "Unavailable Server", connections: [{ uri: "http://127.0.0.1:32400", local: true, relay: false, ok: false, error: "Connection timed out." }] }] }),
  c("setup-services", "/setup?step=services", "setup", { step: "services", username: "Fixture Host", integrations }),
  ...["private", "vote"].flatMap(route => [
    c(`cinema-${route}-guest`, `/${route}`, `${route}._index`, { showings: [], isAuthenticated: false, isOwner: false }, { [`routes/${route}`]: cinemaParent() }),
    c(`cinema-${route}-empty`, `/${route}`, `${route}._index`, { showings: [], isAuthenticated: true, isOwner: true }, { [`routes/${route}`]: cinemaParent(true) }),
    c(`cinema-${route}-full`, `/${route}`, `${route}._index`, { showings: [summary, { ...summary, id: "completed", status: "completed", name: "A Completed Showing", moviePreviews: [] }], isAuthenticated: true, isOwner: true }, { [`routes/${route}`]: cinemaParent(true) }),
  ]),
  c("cinema-detail-host", "/private/fixture-show", "private.$showingId", detail, { "routes/private": cinemaParent(true) }),
  c("cinema-detail-guest", "/private/fixture-show", "private.$showingId", { ...detail, isOwner: false, userId: null }, { "routes/private": cinemaParent() }),
  c("cinema-detail-empty", "/private/fixture-show", "private.$showingId", { ...detail, showing: { ...showing, name: long, movies: [], votes: [], history: [] }, bordaScores: [], currentUserPicks: 0 }, { "routes/private": cinemaParent(true) }),
];
