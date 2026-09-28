import { ERROR_STATUS, ROOM_POLICY, type Parsed, type RoomErrorBody, type RoomErrorCode } from "./protocol";
import { resolveRoomPrincipal, type PlaybackPrincipal } from "./principal.server";
import type { CoordinatorResponse } from "./coordinator.server";

const BASE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
} as const;

export function roomJson(
  result: CoordinatorResponse,
  setCookie: string | null = null,
  extraHeaders?: HeadersInit
): Response {
  const headers = new Headers({ ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8" });
  if (setCookie) headers.append("Set-Cookie", setCookie);
  if (extraHeaders) new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(result.body), { status: result.status, headers });
}

export function roomError(code: RoomErrorCode, message: string, setCookie: string | null = null): Response {
  return roomJson({ status: ERROR_STATUS[code], body: { error: { code, message } } satisfies RoomErrorBody }, setCookie);
}

export function requireMethod(request: Request, method: "GET" | "POST"): Response | null {
  return request.method === method ? null : roomError("method_not_allowed", `Use ${method} for this endpoint.`);
}

export function requireSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) return roomError("csrf_rejected", "This request did not come from Watchtower.");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return roomError("csrf_rejected", "This request did not come from Watchtower.");
  }
  return null;
}

export async function authenticateRoomRequest(
  request: Request
): Promise<{ ok: true; principal: PlaybackPrincipal; setCookie: string | null } | { ok: false; response: Response }> {
  const resolved = await resolveRoomPrincipal(request);
  if (!resolved.ok) return { ok: false, response: roomError(resolved.code, resolved.message) };
  return { ok: true, principal: resolved.principal, setCookie: resolved.setCookie };
}

export async function readRoomJson<T>(request: Request, parser: (body: unknown) => Parsed<T>): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return { ok: false, response: roomError("unsupported_media_type", "Content-Type must be application/json.") };
  }
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > ROOM_POLICY.maxBodyBytes) {
    return { ok: false, response: roomError("payload_too_large", "Request body is too large.") };
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > ROOM_POLICY.maxBodyBytes) {
    return { ok: false, response: roomError("payload_too_large", "Request body is too large.") };
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false, response: roomError("invalid_request", "Request body must be valid JSON.") };
  }
  const parsed = parser(body);
  return parsed.ok
    ? { ok: true, value: parsed.value }
    : { ok: false, response: roomError("invalid_request", parsed.message) };
}

export async function prepareRoomPost<T>(
  request: Request,
  parser: (body: unknown) => Parsed<T>
): Promise<
  | { ok: true; principal: PlaybackPrincipal; setCookie: string | null; value: T }
  | { ok: false; response: Response }
> {
  const methodError = requireMethod(request, "POST");
  if (methodError) return { ok: false, response: methodError };
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return { ok: false, response: roomError("unsupported_media_type", "Content-Type must be application/json.") };
  }
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > ROOM_POLICY.maxBodyBytes) {
    return { ok: false, response: roomError("payload_too_large", "Request body is too large.") };
  }
  // Bearer credentials are never sent ambiently by browsers; cookie requests need same-origin proof.
  const csrfError = request.headers.has("Authorization") ? null : requireSameOrigin(request);
  if (csrfError) return { ok: false, response: csrfError };
  const auth = await authenticateRoomRequest(request);
  if (!auth.ok) return auth;
  const body = await readRoomJson(request, parser);
  if (!body.ok) {
    const headers = new Headers(body.response.headers);
    if (auth.setCookie) headers.append("Set-Cookie", auth.setCookie);
    return { ok: false, response: new Response(body.response.body, { status: body.response.status, headers }) };
  }
  return { ok: true, principal: auth.principal, setCookie: auth.setCookie, value: body.value };
}