export interface HlsProxyOptions {
  request: Request;
  ratingKey: string;
  splat: string;
  serverUrl: string;
  token: string;
  clientId: string;
  rewriteBase: string;
  decisionBeforeStart?: boolean;
  queryOverride?: string | null;
}

function validSplat(splat: string): boolean {
  if (!/^[a-zA-Z0-9._/-]+$/.test(splat) || splat.split("/").some((part) => part === "." || part === "..")) return false;
  return ["start.m3u8", "ping", "stop"].includes(splat) || /^session\/[^/]+\/.+/.test(splat);
}

function rewritePlaylistUrls(content: string, rewriteBase: string, upstreamUrl: string, serverUrl: string): string {
  const serverOrigin = new URL(serverUrl).origin;
  const rewrite = (uri: string) => {
    const url = new URL(uri, upstreamUrl);
    if (url.origin !== serverOrigin) throw new Error("Cross-origin playlist resource");
    url.searchParams.delete("X-Plex-Token");
    const path = url.pathname
      .replace(/^\/video\/:?\/transcode\/universal\//, "")
      .replace(/^\/video:\/transcode\/universal\//, "");
    if (path.startsWith("/")) throw new Error("Unsupported playlist resource");
    return `${rewriteBase}/${path}${url.search}`;
  };
  return content.split("\n").map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    return trimmed.startsWith("#")
      ? line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${rewrite(uri)}"`)
      : rewrite(trimmed);
  }).join("\n");
}

export async function proxyHls(options: HlsProxyOptions): Promise<Response> {
  const { request, ratingKey, splat, token, clientId } = options;
  if (!validSplat(splat)) return new Response("Invalid playback resource", { status: 400 });
  const incoming = new URL(request.url);
  const fetchUrl = new URL(`/video/:/transcode/universal/${splat}${options.queryOverride ?? incoming.search}`, options.serverUrl);
  fetchUrl.searchParams.set("X-Plex-Token", token);
  fetchUrl.searchParams.set("X-Plex-Client-Identifier", clientId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const signal = AbortSignal.any([request.signal, controller.signal]);
  try {
    if (splat === "start.m3u8") {
      fetchUrl.searchParams.set("path", `/library/metadata/${ratingKey}`);
      if (options.decisionBeforeStart !== false) {
        const decisionUrl = new URL(fetchUrl);
        decisionUrl.pathname = "/video/:/transcode/universal/decision";
        const decision = await fetch(decisionUrl, { headers: { Accept: "application/json" }, signal });
        if (!decision.ok) return new Response("Plex playback negotiation failed", { status: decision.status });
        const body = await decision.json();
        if (body.MediaContainer?.generalDecisionCode >= 2000) return new Response("Plex cannot play this item with the requested settings", { status: 422 });
      }
    }
    const response = await fetch(fetchUrl, {
      signal,
      headers: { Accept: "*/*", ...(request.headers.has("Range") ? { Range: request.headers.get("Range")! } : {}) },
    });
    if (!response.ok) {
      return new Response(`Plex error: ${response.status}`, {
        status: response.status,
        headers: response.headers.has("Content-Range") ? { "Content-Range": response.headers.get("Content-Range")! } : {},
      });
    }
    const contentType = response.headers.get("Content-Type") || "";
    if (contentType.includes("mpegurl") || splat.endsWith(".m3u8")) {
      const rewritten = rewritePlaylistUrls(await response.text(), options.rewriteBase, response.url || fetchUrl.toString(), options.serverUrl);
      return new Response(rewritten, { status: 200, headers: { "Content-Type": "application/vnd.apple.mpegurl", "Access-Control-Allow-Origin": "*", "Cache-Control": "private, no-store" } });
    }
    const headers = new Headers({ "Access-Control-Allow-Origin": "*", "Cache-Control": "private, no-store" });
    for (const name of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return new Response("Failed to fetch from Plex", { status: controller.signal.aborted ? 504 : 502 });
  } finally {
    clearTimeout(timeout);
  }
}