const long = "AnExtraordinarilyLongUnbrokenMediaOrDeviceTitle".repeat(5);
const date = "2026-11-03T12:00:00Z";
const prefs = { autoSkipIntro: false, autoPlayNextEpisode: true, showContinueWatching: true, showRecentlyAdded: true, showTrending: true, showCollections: true, discoveryDisabled: false };
const settings = { settings: { version: 1, traktUsername: null, imdbWatchlistIds: [], preferences: prefs, updatedAt: 0 }, validationCache: { trakt: null, imdb: [] }, isOwner: false, plexServer: null, integrations: null, trakt: { available: false, connected: false, username: null, scrobble: false } };
const parentData = { "routes/app": { user: { id: 1, username: "fixture", title: long, email: `${long}@example.invalid`, thumb: "" }, discoveryDisabled: false } };
const media = { id: 11, tmdbId: 12, mediaType: "movie", status: 5 };
const request = { id: 1, status: 1, title: long, posterUrl: "/__audit/poster.svg", createdAt: date, is4k: false, media, requestedBy: { id: 1 } };
const comments = [{ id: 1, message: `A long description with normal words and a long URL: https://example.invalid/${long}\nSecond line remains readable.`, createdAt: date, user: { displayName: long } }, { id: 2, message: "Thanks. We are investigating this issue.", createdAt: date, user: { username: "Administrator" } }];
const issue = { id: 1, title: long, posterUrl: "/__audit/poster.svg", status: 1, issueType: 1, createdAt: date, media, createdBy: { id: 1 }, comments, canEdit: true };
const requests = { items: [], pages: 0, page: 1, filter: "all", error: null };
const issues = { ...requests, q: "", selected: null, matches: [] };
const devices = [{ deviceSessionId: "fixture-device", name: long, model: long, createdAtMs: Date.parse(date), lastSeenAtMs: Date.parse(date), expiresAtMs: Date.parse(date) + 86400000 }];
const link = { code: "ABCD-EFGH", csrf: "fixture-csrf", devices: [] };
const authorization = { code: "ABCD-EFGH", deviceName: long, platform: "android-tv", model: long, appVersion: "1.8.1", ageSeconds: 20, origin: `https://${long}.example.invalid` };
const notification = { id: "notice", title: long, state: "Available", href: "/app/requests", createdAt: Date.parse(date), read: false };

export const cases = [
  { id: "settings-member", path: "/app/settings", routeId: "routes/app.settings", data: settings },
  { id: "settings-owner-long", path: "/app/settings", routeId: "routes/app.settings", data: { ...settings, isOwner: true, plexServer: { name: long, url: `https://${long}.example.invalid:32400` }, integrations: { seerr: { url: "http://seerr.invalid:5055", hasApiKey: true }, trakt: { clientId: long, hasClientSecret: true } }, trakt: { available: true, connected: true, username: long, scrobble: true } }, parentData },
  { id: "settings-invalid-sources", path: "/app/settings", routeId: "routes/app.settings", data: { ...settings, settings: { ...settings.settings, traktUsername: "missing-user", imdbWatchlistIds: [long] }, validationCache: { trakt: { username: "missing-user", status: "invalid", message: "Could not find this public watchlist.", validatedAt: 0 }, imdb: [{ listId: long, status: "invalid", message: "List not found.", validatedAt: 0 }] }, trakt: { available: true, connected: false, username: null, scrobble: false } } },
  { id: "link-empty", path: "/app/link", routeId: "routes/app.link", data: link },
  { id: "link-devices-long", path: "/app/link", routeId: "routes/app.link", data: { ...link, devices }, parentData },
  { id: "link-error", path: "/app/link", routeId: "routes/app.link", data: link, actionData: { ok: false, message: "That code is invalid or has expired.", authorization: null } },
  { id: "link-authorization", path: "/app/link", routeId: "routes/app.link", data: { ...link, devices }, actionData: { ok: true, message: null, authorization } },
  { id: "link-pending", path: "/app/link", routeId: "routes/app.link", data: link, actionData: { ok: true, message: "TV linked. You can return to the device.", authorization: null }, delayMs: 1800 },
  { id: "notifications-empty", path: "/app/notifications", routeId: "routes/app.notifications", data: { notifications: [], error: null, limited: false } },
  { id: "notifications-long", path: "/app/notifications", routeId: "routes/app.notifications", data: { notifications: [notification, { ...notification, id: "read", title: "Normal Movie Title", read: true }], error: null, limited: true }, actionData: { unread: 0 }, delayMs: 1200 },
  { id: "notifications-error", path: "/app/notifications", routeId: "routes/app.notifications", data: { notifications: [], error: "Couldn't refresh requests. Check Seerr and your account access. Your saved notifications are still available.", limited: false } },
  { id: "requests-empty", path: "/app/requests", routeId: "routes/app.requests", data: requests },
  { id: "requests-error", path: "/app/requests", routeId: "routes/app.requests", data: { ...requests, error: "Requests are not configured. Ask your server administrator to configure Seerr." } },
  { id: "requests-statuses", path: "/app/requests", routeId: "routes/app.requests", data: { ...requests, pages: 3, items: [{ ...request, media: { ...media, status: 2 } }, { ...request, id: 2, status: 2, media: { ...media, status: 3 } }, { ...request, id: 3, status: 2, media }, { ...request, id: 4, status: 4, title: "A Failed Request" }, { ...request, id: 5, status: 3, title: "A Declined Request" }, { ...request, id: 6, media: { ...media, mediaType: "tv", status: 4 }, seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }] }] }, actionData: { error: "Could not cancel this request. Try again." }, delayMs: 1200 },
  { id: "issues-empty", path: "/app/issues", routeId: "routes/app.issues", data: issues },
  { id: "issues-error", path: "/app/issues", routeId: "routes/app.issues", data: { ...issues, error: "Seerr is unavailable. Check your connection or try again." } },
  { id: "issues-search-empty", path: "/app/issues?q=missing", routeId: "routes/app.issues", data: { ...issues, q: "missing" } },
  { id: "issues-search-long", path: "/app/issues?q=movie", routeId: "routes/app.issues", data: { ...issues, q: "movie", matches: [{ id: 12, mediaType: "movie", title: long, mediaInfo: media }, { id: 13, mediaType: "tv", name: "Example Series", mediaInfo: { ...media, mediaType: "tv" } }] } },
  { id: "issues-selected", path: "/app/issues?type=movie&tmdbId=12", routeId: "routes/app.issues", data: { ...issues, selected: { id: 12, mediaType: "movie", title: long, mediaInfo: media } }, actionData: { error: "Couldn't report this issue. Try again." }, delayMs: 1200 },
  { id: "issues-untracked", path: "/app/issues?type=movie&tmdbId=12", routeId: "routes/app.issues", data: { ...issues, selected: { id: 12, mediaType: "movie", title: "Not Yet Tracked" } } },
  { id: "issues-list", path: "/app/issues", routeId: "routes/app.issues", data: { ...issues, pages: 3, items: [issue, { ...issue, id: 2, title: "An Ordinary Issue", status: 2 }] } },
  { id: "issue-owner-open", path: "/app/issues/1", routeId: "routes/app.issues_.$id", data: { item: issue, error: null }, actionData: { error: "Couldn't update this issue. Try again." }, delayMs: 1200 },
  { id: "issue-owner-resolved", path: "/app/issues/1", routeId: "routes/app.issues_.$id", data: { item: { ...issue, status: 2 }, error: null } },
  { id: "issue-member", path: "/app/issues/1", routeId: "routes/app.issues_.$id", data: { item: { ...issue, canEdit: false }, error: null } },
  { id: "issue-error", path: "/app/issues/1", routeId: "routes/app.issues_.$id", data: { item: null, error: "This issue is not available to your account." } },
];
