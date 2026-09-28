import { NativeError } from "./http.server";

interface WindowState {
  startedAtMs: number;
  count: number;
}

const windows = new Map<string, WindowState>();

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
  state.count += 1;
  windows.set(id, state);
  if (state.count >= limit) {
    throw new NativeError(
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
}

export function clearRateLimit(scope: string, key: string): void {
  windows.delete(`${scope}:${key}`);
}

export function resetNativeRateLimitsForTests(): void {
  windows.clear();
}