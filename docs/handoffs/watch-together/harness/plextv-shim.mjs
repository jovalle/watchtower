// Test-only preload: answers plex.tv identity lookups for the synthetic harness users.
// Plex OAuth and plex.tv resource discovery are NOT exercised by the harness.
const USERS = Object.fromEntries(["alice", "bob", "carol", "dave"].map((name, index) => [
  `${name}-token`,
  { id: 1001 + index, uuid: `u-${name}`, username: name, email: `${name}@example.invalid`, thumb: "", title: name[0].toUpperCase() + name.slice(1) },
]));
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("https://plex.tv/")) return realFetch(input, init);
  const user = USERS[new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get("X-Plex-Token")];
  if (url.startsWith("https://plex.tv/api/v2/user") && user) return Response.json(user);
  return new Response(JSON.stringify({ error: "harness: plex.tv unavailable" }), { status: 401 });
};
