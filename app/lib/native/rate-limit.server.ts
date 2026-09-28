import { NativeError } from "./http.server";

interface WindowState {
  startedAtMs: number;
  count: number;
}

const windows = new Map<string, WindowState>();
const queues = new Map<string, Promise<void>>();

function rateLimitError(state: WindowState, windowMs: number, nowMs: number) {
  return new NativeError(
    429,
    "rate_limited",
    "Too many requests.",
    false,
    Math.max(
      1,
      Math.ceil((state.startedAtMs + windowMs - nowMs) / 1000),
    ),
  );
}

export function enforceRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
  nowMs = Date.now(),
): void {
  const id = `${scope}:${key}`;
  const existing = windows.get(id);
  const state = !existing || nowMs - existing.startedAtMs >= windowMs
    ? { startedAtMs: nowMs, count: 0 }
    : existing;
  state.count += 1;
  windows.set(id, state);
  if (state.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((state.startedAtMs + windowMs - nowMs) / 1000));
    throw new NativeError(429, "rate_limited", "Too many requests.", false, retryAfterSeconds);
  }
}

export function recordRateLimitFailure(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
  nowMs = Date.now(),
): void {
  const id = `${scope}:${key}`;
  const existing = windows.get(id);
  const state =
    !existing || nowMs - existing.startedAtMs >= windowMs
      ? { startedAtMs: nowMs, count: 0 }
      : existing;
  state.count = Math.min(state.count + 1, limit);
  windows.set(id, state);
}

export function checkRateLimitFailures(
  scope: string,
  key: string,
  limit: number,
  windowMs: number,
  nowMs = Date.now(),
): void {
  const id = `${scope}:${key}`;
  const state = windows.get(id);
  if (!state) return;
  if (nowMs - state.startedAtMs >= windowMs) {
    windows.delete(id);
    return;
  }
  if (state.count >= limit) throw rateLimitError(state, windowMs, nowMs);
}

export async function serializeRateLimited<T>(
  scope: string,
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const id = `${scope}:${key}`;
  const previous = queues.get(id) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  queues.set(id, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (queues.get(id) === current) queues.delete(id);
  }
}

export function clearRateLimit(scope: string, key: string): void {
  windows.delete(`${scope}:${key}`);
}

export function resetNativeRateLimitsForTests(): void {
  windows.clear();
  queues.clear();
}