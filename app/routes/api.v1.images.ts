import type { LoaderFunctionArgs } from "@remix-run/node";
import { getCachedImage, setCachedImage } from "~/lib/cache/image-cache.server";
import { sha256 } from "~/lib/native/crypto.server";
import { NativeError, requireMethod, withNativeErrors, withNativeResponseHeaders } from "~/lib/native/http.server";
import { requireNativePrincipal } from "~/lib/native/principal.server";
import { resolveImageUrl } from "~/lib/plex/image-proxy.server";

function dimension(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 4000) throw new NativeError(400, "invalid_request", "Image dimensions must be integers from 1 to 4000.");
  return parsed;
}

export async function loader({ request }: LoaderFunctionArgs) {
  return withNativeErrors(request, async (requestId) => {
    requireMethod(request, "GET");
    const principal = await requireNativePrincipal(request);
    const url = new URL(request.url);
    const source = url.searchParams.get("src");
    if (!source) throw new NativeError(400, "invalid_request", "src is required.");
    const width = dimension(url.searchParams.get("w"));
    const height = dimension(url.searchParams.get("h"));
    const upstreamUrl = resolveImageUrl(source, principal.serverToken, principal.serverUrl);
    if (!upstreamUrl) throw new NativeError(400, "invalid_request", "Image source is not allowed.");
    const upstream = new URL(upstreamUrl);
    if (width) upstream.searchParams.set("width", String(width));
    if (height) upstream.searchParams.set("height", String(height));
    const scope = sha256(`${principal.serverMachineId}:${principal.userId}`);
    const cacheKey = `${scope}:${source}:${width ?? ""}:${height ?? ""}`;
    const cached = await getCachedImage(cacheKey);
    if (cached?.contentType.startsWith("image/")) {
      return withNativeResponseHeaders(new Response(new Uint8Array(cached.data), { headers: { "Content-Type": cached.contentType, "Content-Length": String(cached.data.length), "X-Cache": "HIT" } }), requestId, "private, max-age=3600");
    }
    const response = await fetch(upstream, { headers: { Accept: "image/*" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new NativeError(response.status === 404 ? 404 : 502, response.status === 404 ? "not_found" : "upstream_unavailable", "Image unavailable.");
    const contentType = response.headers.get("Content-Type") ?? "";
    if (!contentType.startsWith("image/")) throw new NativeError(502, "upstream_unavailable", "Image upstream returned invalid content.");
    const data = Buffer.from(await response.arrayBuffer());
    await setCachedImage(cacheKey, data, contentType);
    return withNativeResponseHeaders(new Response(new Uint8Array(data), { headers: { "Content-Type": contentType, "Content-Length": String(data.length), "X-Cache": "MISS" } }), requestId, "private, max-age=3600");
  });
}