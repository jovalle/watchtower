import { randomUUID } from "node:crypto";
import type { ErrorCode } from "./contract";

const JSON_CONTENT_TYPE = "application/json";
const MAX_JSON_BYTES = 16 * 1024;

export class NativeError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly retryable = false,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export function nativeRequestId(request: Request): string {
  const supplied = request.headers.get("X-Request-Id")?.trim();
  return supplied && supplied.length <= 128 ? supplied : randomUUID();
}

export function nativeJson(
  data: unknown,
  requestId: string,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Request-Id", requestId);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function nativeEmpty(
  requestId: string,
  init: ResponseInit = { status: 204 },
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Request-Id", requestId);
  return new Response(null, { ...init, headers });
}

export function withNativeResponseHeaders(
  response: Response,
  requestId: string,
  cacheControl = "private, no-store",
): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", cacheControl);
  headers.set("X-Request-Id", requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function nativeErrorResponse(error: unknown, requestId: string): Response {
  const nativeError =
    error instanceof NativeError
      ? error
      : new NativeError(500, "internal_error", "An unexpected error occurred.");
  const headers = new Headers();
  if (
    nativeError.retryAfterSeconds !== undefined &&
    (nativeError.status === 429 ||
      (nativeError.status === 503 && nativeError.retryable))
  ) {
    headers.set("Retry-After", String(nativeError.retryAfterSeconds));
  }
  return nativeJson(
    {
      error: {
        code: nativeError.code,
        message: nativeError.message,
        retryable: nativeError.retryable,
        requestId,
      },
    },
    requestId,
    { status: nativeError.status, headers },
  );
}

export async function withNativeErrors(
  request: Request,
  handler: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = nativeRequestId(request);
  try {
    return await handler(requestId);
  } catch (error) {
    return nativeErrorResponse(error, requestId);
  }
}

export async function nativeMethodNotAllowed({
  request,
}: {
  request: Request;
}): Promise<Response> {
  return withNativeErrors(request, async () => {
    throw new NativeError(405, "method_not_allowed", "Method not allowed.");
  });
}

export function requireMethod(request: Request, ...methods: string[]): void {
  if (!methods.includes(request.method)) {
    throw new NativeError(405, "method_not_allowed", "Method not allowed.");
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== JSON_CONTENT_TYPE) {
    throw new NativeError(415, "unsupported_media_type", "Content-Type must be application/json.");
  }
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    throw new NativeError(413, "payload_too_large", "Request body exceeds 16 KiB.");
  }
  const bytes = new Uint8Array(MAX_JSON_BYTES);
  let length = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        const value = chunk.value;
        if (length + value.byteLength > MAX_JSON_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new NativeError(413, "payload_too_large", "Request body exceeds 16 KiB.");
        }
        bytes.set(value, length);
        length += value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)));
  } catch {
    throw new NativeError(400, "invalid_request", "Request body must be valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NativeError(400, "invalid_request", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export function requestClientIp(_request: Request, context?: unknown): string {
  if (context && typeof context === "object" && "pairingClientIp" in context) {
    const value = (context as { pairingClientIp?: unknown }).pairingClientIp;
    if (typeof value === "string" && value) return value;
  }
  if (context && typeof context === "object" && "clientIp" in context) {
    const value = (context as { clientIp?: unknown }).clientIp;
    if (typeof value === "string" && value) return value;
  }
  return "unknown";
}
