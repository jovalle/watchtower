import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { Button, buttonStyles } from "~/components/ui";
import { usePageScrollLock } from "~/hooks/usePageScrollLock";

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
  usePageScrollLock(true);
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
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
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
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border border-border-subtle bg-background-elevated p-0 text-foreground-primary shadow-2xl backdrop:bg-black/70"
      aria-label={`Request ${item.title}`}
    >
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row">
        {item.posterUrl && (
          <img
            src={item.posterUrl}
            alt=""
            className="aspect-[2/3] w-20 shrink-0 self-start rounded object-cover sm:w-24"
          />
        )}
        <div className="min-w-0 flex-1 break-words">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="absolute right-3 top-3"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
          <h2 className="pr-10 text-lg font-semibold text-foreground-primary">
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
          {error && <p role="alert" className="mt-1 text-sm text-red-400">{error}</p>}
          <div role="group" aria-label="Request Actions" className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a href="/app/requests" className={buttonStyles({ variant: "secondary" })}>Your Requests</a>
            {(status === "unknown" || (item.type === "show" && status === "partially_available")) && (
              <Button
                onClick={request}
                disabled={isRequesting}
                className="gap-2"
              >
                {isRequesting && <Loader2 className="h-4 w-4 animate-spin" />}
                {status === "partially_available" ? "Request Missing Seasons" : "Request"}
              </Button>
            )}
            <a
              href={item.tmdbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonStyles({ variant: "secondary", className: "gap-2" })}
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
