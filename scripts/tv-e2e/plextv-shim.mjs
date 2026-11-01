// Test-only preload for the local room E2E (scripts/tv-e2e/room-e2e.ts): answers plex.tv identity and
// resource lookups for synthetic harness tokens so no real Plex account is contacted. Never use in production.
const MACHINE = "fake-machine";
const USERS = {
  "fake-account-token": { id: 1001, uuid: "u-owner", username: "owner", title: "Test Owner", serverToken: "fake-owner-token" },
  "bob-token": { id: 1002, uuid: "u-bob", username: "bob", title: "Bob", serverToken: "bob-server-token" },
  "den-account-token": { id: 1003, uuid: "u-den", username: "den", title: "Den", serverToken: "den-server-token" },
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("https://plex.tv/")) return realFetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const user = USERS[headers.get("X-Plex-Token") ?? ""];
  if (!user) return new Response(JSON.stringify({ error: "harness: unknown token" }), { status: 401 });
  if (url.startsWith("https://plex.tv/api/v2/user")) {
    return Response.json({ id: user.id, uuid: user.uuid, username: user.username, email: `${user.username}@example.invalid`, thumb: "", title: user.title });
  }
  if (url.startsWith("https://plex.tv/api/v2/resources")) {
    return Response.json([{ name: "Fake PMS", provides: "server", clientIdentifier: MACHINE, accessToken: user.serverToken, owned: user.id === 1001 }]);
  }
  return new Response(JSON.stringify({ error: "harness: plex.tv endpoint not modeled" }), { status: 404 });
};
