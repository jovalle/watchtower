import { useEffect, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";

export interface RequestableItem {
  tmdbId: number;
  type: "movie" | "show";
  title: string;
  year?: string;
  posterUrl?: string | null;
  tmdbUrl: string;
}

type Status = "unknown" | "pending" | "processing" | "partially_available" | "available";

const STATUS_LABEL: Record<Status, string> = {
  unknown: "Not requested",
  pending: "Requested, awaiting approval",
  processing: "Requested",
  partially_available: "Partially available",
  available: "Available",
};

interface RequestModalProps {
  item: RequestableItem;
  onClose: () => void;
}

export function RequestModal({ item, onClose }: RequestModalProps) {
  const mediaType = item.type === "show" ? "tv" : "movie";
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/seerr?type=${mediaType}&tmdbId=${item.tmdbId}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setStatus(data.status);
        else setError(data.error || "Couldn't reach Seerr");
      })
      .catch(() => !cancelled && setError("Couldn't reach Seerr"));
    return () => {
      cancelled = true;
    };
  }, [mediaType, item.tmdbId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const request = async () => {
    setIsRequesting(true);
    setError("");
    try {
      const res = await fetch("/api/seerr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: mediaType, tmdbId: item.tmdbId }),
      });
      const data = await res.json();
      if (res.ok) setStatus(data.status);
      else setError(data.error || "Request failed");
    } catch {
      setError("Request failed");
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`Request ${item.title}`}>
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close" />
      <div className="relative flex w-full max-w-md gap-4 rounded-lg bg-background-elevated p-5 shadow-2xl ring-1 ring-white/10">
        {item.posterUrl && <img src={item.posterUrl} alt="" className="w-24 flex-shrink-0 self-start rounded" />}
        <div className="min-w-0 flex-1">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded p-1 text-foreground-muted transition-colors hover:text-foreground-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="pr-6 text-lg font-semibold text-foreground-primary">{item.title}</h2>
          {item.year && <p className="text-sm text-foreground-muted">{item.year}</p>}
          <p className="mt-3 text-sm text-foreground-secondary">
            {status ? STATUS_LABEL[status] : error ? "" : "Checking Seerr…"}
          </p>
          {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {status === "unknown" && (
              <button
                onClick={request}
                disabled={isRequesting}
                className="flex items-center gap-2 rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-background-primary transition-colors hover:bg-accent-primary/90 disabled:opacity-50"
              >
                {isRequesting && <Loader2 className="h-4 w-4 animate-spin" />}
                Request
              </button>
            )}
            <a
              href={item.tmdbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-border-subtle px-4 py-2 text-sm font-medium text-foreground-primary transition-colors hover:bg-background-primary"
            >
              <ExternalLink className="h-4 w-4" />
              TMDB
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
