import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Typography, toast } from "~/components/ui";
import { buttonStyles } from "~/components/ui/Button";
import type { TraktConnectionStatus } from "~/lib/trakt/types";

interface DeviceCode {
  userCode: string;
  verificationUrl: string;
  interval: number;
}

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/trakt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

const buttonClass = buttonStyles({ variant: "secondary", size: "sm", className: "gap-2" });

export function TraktConnectSection({
  initial,
}: {
  initial: TraktConnectionStatus;
}) {
  const [status, setStatus] = useState(initial);
  const [device, setDevice] = useState<DeviceCode | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    let delay = device.interval * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const result = await post({ intent: "poll" }).catch(() => ({
        status: "pending",
      }));
      if (cancelled) return;
      if (result.status === "connected") {
        setDevice(null);
        setStatus((s) => ({
          ...s,
          connected: true,
          username: result.username || null,
          scrobble: true,
        }));
        toast("Trakt connected");
      } else if (result.status === "failed") {
        setDevice(null);
        setError(result.error);
      } else {
        if (result.status === "slow_down") delay += 1000;
        timer = setTimeout(poll, delay);
      }
    };
    timer = setTimeout(poll, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [device]);

  const connect = async () => {
    setBusy(true);
    setError("");
    const data = await post({ intent: "start" }).catch(() => ({
      error: "Request failed",
    }));
    setBusy(false);
    if (data.userCode) setDevice(data);
    else setError(data.error || "Couldn't start Trakt sign-in");
  };

  const disconnect = async () => {
    setBusy(true);
    setError("");
    const data = await post({ intent: "disconnect" }).catch(() => ({ error: "Request failed" }));
    setBusy(false);
    if (!data.ok) {
      setError(data.error || "Couldn't disconnect Trakt");
      return;
    }
    setStatus((s) => ({
      ...s,
      connected: false,
      username: null,
      scrobble: false,
    }));
    toast("Trakt disconnected");
  };

  const toggleScrobble = async () => {
    const enabled = !status.scrobble;
    setStatus((s) => ({ ...s, scrobble: enabled }));
    const data = await post({ intent: "scrobble", enabled }).catch(() => ({
      error: "Request failed",
    }));
    if (!data.ok) {
      setStatus((s) => ({ ...s, scrobble: !enabled }));
      setError(data.error || "Failed to save");
    } else {
      toast(`Trakt scrobbling ${enabled ? "on" : "off"}`);
    }
  };

  if (!status.available) return null;

  return (
    <section className="mt-6 rounded-lg border border-border-subtle bg-background-elevated p-6">
      <Typography variant="subtitle" as="h2" className="mb-2">
        Trakt Account
      </Typography>

      {status.connected ? (
        <div className="space-y-4">
          <Typography variant="body" className="text-foreground-secondary">
            <span className="break-words">Connected{status.username ? ` as ${status.username}` : ""}.</span>
          </Typography>
          <div className="flex items-start justify-between gap-4">
            <label htmlFor="trakt-scrobble" className="cursor-pointer">
              <span className="block text-sm font-medium text-foreground-primary">
                Scrobble to Trakt
              </span>
              <span className="block text-sm text-foreground-muted">
                Report what you watch; Trakt marks titles watched past 80%.
              </span>
            </label>
            <input
              id="trakt-scrobble"
              type="checkbox"
              checked={status.scrobble}
              onChange={toggleScrobble}
              className="mt-1 h-5 w-5 flex-shrink-0 cursor-pointer accent-accent-primary"
            />
          </div>
          <button
            type="button"
            onClick={disconnect}
            disabled={busy}
            className={buttonClass}
          >
            Disconnect
          </button>
        </div>
      ) : device ? (
        <div className="space-y-3">
          <Typography variant="body" className="text-foreground-secondary">
            Open Trakt and enter this code:
          </Typography>
          <p className="font-mono text-3xl tracking-widest text-foreground-primary">
            {device.userCode}
          </p>
          <a
            href={device.verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonClass} max-w-full break-all`}
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-all">{device.verificationUrl}</span>
          </a>
          <p role="status" className="flex items-center gap-2 text-sm text-foreground-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for Approval…
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Typography variant="body" className="text-foreground-secondary">
            Connect Trakt to scrobble what you watch in Watchtower.
          </Typography>
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className={buttonClass}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Connect Trakt
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 break-words text-sm text-red-400">{error}</p>}
    </section>
  );
}
