import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";

export interface RequestableItem {
  tmdbId: number;
  type: "movie" | "show";
  title: string;
  year?: string;
  posterUrl?: string | null;
  tmdbUrl: string;
}

type Status =
  | "unknown"
  | "pending"
  | "processing"
  | "partially_available"
  | "available"
  | "blocklisted";

const STATUS_LABEL: Record<Status, string> = {
  unknown: "Not requested",
  pending: "Requested, awaiting approval",
  processing: "Requested",
  partially_available: "Partially available",
  available: "Available",
  blocklisted: "Blocked from requests on Seerr",
};

interface RequestModalProps {
  item: RequestableItem;
  onClose: () => void;
}

export function RequestModal({ item, onClose }: RequestModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mediaType = item.type === "show" ? "tv" : "movie";
  const [status, setStatus] = useState<Status | null>(null);
  const [status4k, setStatus4k] = useState<Status | null>(null);
  const [seasons, setSeasons] = useState<Array<{ number: number; status: Status; status4k: Status }>>([]);
  const [requests, setRequests] = useState<Array<{ id: number; is4k: boolean; state: string }>>([]);
  const [error, setError] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/seerr?type=${mediaType}&tmdbId=${item.tmdbId}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) { setStatus(data.status); setStatus4k(data.status4k); setSeasons(data.seasons ?? []); setRequests(data.requests ?? []); }
        else setError(data.error || "Couldn't reach Seerr");
      })
      .catch(() => !cancelled && setError("Couldn't reach Seerr"));
    return () => {
      cancelled = true;
    };
  }, [mediaType, item.tmdbId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

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
      if (res.ok) { setStatus(data.status); setStatus4k(data.status4k); setSeasons(data.seasons ?? []); setRequests(data.requests ?? []); setError(data.statusError || ""); }
      else setError(data.error || "Request failed");
    } catch {
      setError("Request failed");
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      className="fixed inset-0 m-0 hidden h-dvh max-h-none w-screen max-w-none items-center justify-center border-0 bg-black/70 p-4 text-foreground-primary open:flex"
      aria-label={`Request ${item.title}`}
    >
      <button
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative flex w-full max-w-md gap-4 rounded-lg bg-background-elevated p-5 shadow-2xl ring-1 ring-white/10">
        {item.posterUrl && (
          <img
            src={item.posterUrl}
            alt=""
            className="w-24 flex-shrink-0 self-start rounded"
          />
        )}
        <div className="min-w-0 flex-1">
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded text-foreground-muted transition-colors hover:text-foreground-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="pr-6 text-lg font-semibold text-foreground-primary">
            {item.title}
          </h2>
          {item.year && (
            <p className="text-sm text-foreground-muted">{item.year}</p>
          )}
          <p className="mt-3 text-sm text-foreground-secondary">
            {status ? STATUS_LABEL[status] : error ? "" : "Checking Seerr…"}
          </p>
          {requests.map((request) => <p className="mt-2 text-sm" key={request.id}>Your {request.is4k ? "4K " : ""}request: {request.state}</p>)}
          {status4k && <p className="text-sm text-foreground-secondary">4K: {STATUS_LABEL[status4k]}</p>}
          {seasons.length > 0 && <ul className="mt-3 max-h-40 overflow-y-auto text-sm">{seasons.map((season) => <li key={season.number}>Season {season.number}: {STATUS_LABEL[season.status]}{season.status4k !== "unknown" ? ` · 4K: ${STATUS_LABEL[season.status4k]}` : ""}</li>)}</ul>}
          {status === "partially_available" && item.type === "show" && <p className="mt-3 text-sm">Some episodes are available. Seerr checks which remaining seasons can be requested.</p>}
          {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/app/requests" className="flex min-h-11 items-center rounded-md border border-border-subtle px-4 text-sm">Your requests</a>
            {(status === "unknown" || (item.type === "show" && status === "partially_available")) && (
              <button
                onClick={request}
                disabled={isRequesting}
                className="flex min-h-11 items-center gap-2 rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-background-primary transition-colors hover:bg-accent-primary/90 disabled:opacity-50"
              >
                {isRequesting && <Loader2 className="h-4 w-4 animate-spin" />}
                {status === "partially_available" ? "Request missing seasons" : "Request"}
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
    </dialog>
  );
}
