import { PLEX_HEADERS, PLEX_REQUEST_TIMEOUT, PLEX_TV_URL } from "~/lib/plex/constants";
import type { HomeProfile, ProfileSummary } from "./contract";
import { NativeError } from "./http.server";

interface PlexHomeUser {
  id?: number | string;
  uuid?: string;
  title?: string;
  username?: string;
  restricted?: boolean;
  protected?: boolean;
  admin?: boolean;
}

function homeHeaders(token: string): HeadersInit {
  return {
    Accept: "application/json",
    "X-Plex-Token": token,
    "X-Plex-Product": PLEX_HEADERS["X-Plex-Product"],
    "X-Plex-Version": PLEX_HEADERS["X-Plex-Version"],
  };
}

export async function listPlexHomeUsers(
  accountToken: string,
  currentUserId: string,
): Promise<{ raw: PlexHomeUser; profile: HomeProfile }[]> {
  const response = await fetch(`${PLEX_TV_URL}/api/v2/home/users`, {
    headers: homeHeaders(accountToken),
    signal: AbortSignal.timeout(PLEX_REQUEST_TIMEOUT),
  });
  if (!response.ok) throw new NativeError(503, "upstream_unavailable", "Plex Home is unavailable.", true, 30);
  const body = await response.json();
  const users: PlexHomeUser[] = Array.isArray(body) ? body : body?.users ?? [];
  return users
    .filter((user) => user.uuid && (user.title || user.username) && user.id !== undefined)
    .map((raw) => ({
      raw,
      profile: {
        profileId: raw.uuid!,
        title: raw.title ?? raw.username!,
        restricted: Boolean(raw.restricted),
        protected: Boolean(raw.protected),
        admin: Boolean(raw.admin),
        current: String(raw.id) === currentUserId,
      },
    }));
}

export async function switchPlexHomeUser(
  accountToken: string,
  user: PlexHomeUser,
  pin: string | null,
): Promise<{ authToken: string; profile: ProfileSummary }> {
  const form = new URLSearchParams();
  if (pin) form.set("pin", pin);
  // Plex Home's switch transport is undocumented; verify this form-encoded call with the operator spike.
  const response = await fetch(`${PLEX_TV_URL}/api/v2/home/users/${encodeURIComponent(user.uuid!)}/switch`, {
    method: "POST",
    headers: { ...homeHeaders(accountToken), "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(PLEX_REQUEST_TIMEOUT),
  });
  if (response.status === 401 || response.status === 403) {
    throw new NativeError(403, pin ? "invalid_pin" : "pin_required", pin ? "The profile PIN is incorrect." : "This profile requires a PIN.");
  }
  if (!response.ok) throw new NativeError(503, "upstream_unavailable", "Plex Home is unavailable.", true, 30);
  const body = await response.json();
  if (typeof body?.authToken !== "string" || typeof body?.id === "undefined") {
    throw new NativeError(503, "upstream_unavailable", "Plex Home returned an invalid response.", true, 30);
  }
  return {
    authToken: body.authToken,
    profile: {
      userId: String(body.id),
      title: body.title ?? body.username ?? user.title ?? user.username ?? "Profile",
      restricted: Boolean(body.restricted ?? user.restricted),
      owner: Boolean(body.admin ?? user.admin),
      protected: Boolean(body.protected ?? user.protected),
    },
  };
}