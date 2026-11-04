import { useRef, useState } from "react";

type WatchlistItem = { ratingKey: string; title: string; isInWatchlist: boolean };

export function useWatchlistActions() {
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const pending = useRef(new Set<string>());
  const isSaved = (item: WatchlistItem) => values[item.ratingKey] ?? item.isInWatchlist;
  const isPending = (key: string) => pending.current.has(key);

  async function toggle(item: WatchlistItem) {
    const key = item.ratingKey;
    if (pending.current.has(key)) return;
    pending.current.add(key);
    const saved = isSaved(item);
    setValues(previous => ({ ...previous, [key]: !saved }));
    setError("");
    let result = saved;
    try {
      const response = await fetch("/api/plex/list", {
        method: saved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingKey: key }),
      });
      if (!response.ok) throw new Error();
      result = !saved;
    } catch {
      setError(`Could not update the watchlist for ${item.title}. Try again.`);
    } finally {
      pending.current.delete(key);
      setValues(previous => ({ ...previous, [key]: result }));
    }
  }
  return { isSaved, isPending, toggle, error };
}
