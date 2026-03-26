/**
 * GuestIdentity — Prompts unauthenticated users for a display name.
 * Persists the committed name in localStorage so guests don't re-enter it each visit.
 * Uses a two-stage flow: type name → confirm via API (conflict check) → then vote actions become available.
 */

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "watchtower-guest-name";

/**
 * Returns [committedName, setCommittedName].
 * `committedName` is only set once the user explicitly confirms their name.
 */
export function useGuestName(): [string, (name: string) => void] {
  const [name, setNameState] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setNameState(stored);
  }, []);

  const setName = useCallback((newName: string) => {
    setNameState(newName);
    if (newName) {
      localStorage.setItem(STORAGE_KEY, newName);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return [name, setName];
}

interface GuestIdentityProps {
  guestName: string;
  guestToken: string;
  onNameConfirmed: (name: string, token: string) => void;
}

export function GuestIdentity({
  guestName,
  guestToken,
  onNameConfirmed,
}: GuestIdentityProps) {
  const [draft, setDraft] = useState(guestName);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/vote/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, token: guestToken || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to claim name");
        return;
      }

      onNameConfirmed(trimmed, data.token);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <label
        htmlFor="guest-name-input"
        className="block text-sm font-medium text-foreground-secondary mb-2"
      >
        What&apos;s your name?
      </label>
      <div className="flex gap-3">
        <input
          id="guest-name-input"
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
          placeholder="Enter your name to vote"
          maxLength={30}
          className="flex-1 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-foreground-primary placeholder:text-foreground-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
        />
        <button
          onClick={handleConfirm}
          disabled={!draft.trim() || loading}
          className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "..." : "Join"}
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 text-xs text-red-400">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-foreground-muted">
          Your name will be shown alongside your votes.
        </p>
      )}
    </div>
  );
}
