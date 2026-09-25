import { useState } from "react";
import { CheckCircle, Loader2, Radar, XCircle } from "lucide-react";
import { Typography } from "~/components/ui";
import type { PublicIntegrationsConfig } from "~/lib/integrations/types";

type Result = { ok: boolean; message: string } | null;

const inputClass =
  "w-full rounded-md border border-border-subtle bg-background-primary px-4 py-2.5 text-foreground-primary placeholder:text-foreground-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary";
const buttonClass =
  "flex items-center gap-2 rounded-md border border-border-subtle bg-background-primary px-3 py-1.5 text-sm font-medium text-foreground-primary transition-colors hover:bg-background-elevated disabled:cursor-not-allowed disabled:opacity-50";

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function ResultLine({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <p className={`mt-2 flex items-center gap-2 text-sm ${result.ok ? "text-green-500" : "text-red-500"}`}>
      {result.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {result.message}
    </p>
  );
}

export function IntegrationsSection({ initial }: { initial: PublicIntegrationsConfig }) {
  const [config, setConfig] = useState(initial);
  const [seerrUrl, setSeerrUrl] = useState(initial.seerr?.url ?? "");
  const [seerrKey, setSeerrKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [seerrResult, setSeerrResult] = useState<Result>(null);

  const run = async (intent: "detect" | "test" | "save", payload: Record<string, unknown> = {}) => {
    setBusy(intent);
    setSeerrResult(null);
    try {
      const data = await post({ intent, service: "seerr", url: seerrUrl, apiKey: seerrKey, ...payload });
      if (intent === "detect") {
        if (data.url) setSeerrUrl(data.url);
        setSeerrResult(data.url ? { ok: true, message: `Found Seerr at ${data.url}` } : { ok: false, message: "No Seerr found on common addresses" });
      } else if (data.ok) {
        if (data.integrations) {
          setConfig(data.integrations);
          setSeerrKey("");
        }
        setSeerrResult({ ok: true, message: data.message || (payload.url === "" ? "Seerr removed" : "Seerr saved") });
      } else {
        setSeerrResult({ ok: false, message: data.error || "Failed" });
      }
    } catch {
      setSeerrResult({ ok: false, message: "Request failed" });
    } finally {
      setBusy(null);
    }
  };

  const [traktId, setTraktId] = useState(initial.trakt?.clientId ?? "");
  const [traktSecret, setTraktSecret] = useState("");
  const [traktResult, setTraktResult] = useState<Result>(null);

  const runTrakt = async (intent: "test" | "save", payload: Record<string, unknown> = {}) => {
    setBusy(`trakt-${intent}`);
    setTraktResult(null);
    try {
      const data = await post({ intent, service: "trakt", clientId: traktId, clientSecret: traktSecret, ...payload });
      if (data.ok) {
        if (data.integrations) {
          setConfig(data.integrations);
          setTraktSecret("");
        }
        setTraktResult({ ok: true, message: data.message || (payload.clientId === "" ? "Trakt removed" : "Trakt saved") });
      } else {
        setTraktResult({ ok: false, message: data.error || "Failed" });
      }
    } catch {
      setTraktResult({ ok: false, message: "Request failed" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-6 rounded-lg border border-border-subtle bg-background-elevated p-6">
      <Typography variant="subtitle" as="h2" className="mb-2">
        Integrations
      </Typography>
      <Typography variant="body" className="mb-6 text-foreground-secondary">
        Server-wide connections. Secrets are stored on the server and never sent back to the browser.
      </Typography>

      <div className="space-y-3">
        <Typography variant="body" className="font-medium text-foreground-primary">
          Seerr
        </Typography>
        <Typography variant="caption" className="block text-foreground-muted">
          Lets users request titles that aren&apos;t in the library. Requests are made as each user&apos;s own Seerr account.
          Find the API key in Seerr under Settings → General.
        </Typography>
        <div className="flex gap-2">
          <input
            type="url"
            value={seerrUrl}
            onChange={(e) => setSeerrUrl(e.target.value)}
            placeholder="http://seerr:5055"
            aria-label="Seerr URL"
            className={inputClass}
          />
          <button type="button" onClick={() => run("detect")} disabled={busy !== null} className={buttonClass}>
            {busy === "detect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            Detect
          </button>
        </div>
        <input
          type="password"
          value={seerrKey}
          onChange={(e) => setSeerrKey(e.target.value)}
          placeholder={config.seerr?.hasApiKey ? "Saved; leave blank to keep" : "API key"}
          aria-label="Seerr API key"
          autoComplete="off"
          className={inputClass}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => run("test")} disabled={busy !== null || !seerrUrl} className={buttonClass}>
            {busy === "test" && <Loader2 className="h-4 w-4 animate-spin" />}
            Test
          </button>
          <button type="button" onClick={() => run("save")} disabled={busy !== null || !seerrUrl} className={buttonClass}>
            {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
          {config.seerr && (
            <button
              type="button"
              onClick={() => {
                setSeerrUrl("");
                run("save", { url: "" });
              }}
              disabled={busy !== null}
              className={buttonClass}
            >
              Remove
            </button>
          )}
        </div>
        <ResultLine result={seerrResult} />
      </div>

      <div className="mt-8 space-y-3">
        <Typography variant="body" className="font-medium text-foreground-primary">
          Trakt
        </Typography>
        <Typography variant="caption" className="block text-foreground-muted">
          Lets users connect their Trakt accounts for scrobbling. Create an app at trakt.tv/oauth/applications with the
          redirect URI <code>urn:ietf:wg:oauth:2.0:oob</code>, then paste its client ID and secret.
        </Typography>
        <input
          type="text"
          value={traktId}
          onChange={(e) => setTraktId(e.target.value)}
          placeholder="Client ID"
          aria-label="Trakt client ID"
          autoComplete="off"
          className={inputClass}
        />
        <input
          type="password"
          value={traktSecret}
          onChange={(e) => setTraktSecret(e.target.value)}
          placeholder={config.trakt?.hasClientSecret ? "Saved; leave blank to keep" : "Client secret"}
          aria-label="Trakt client secret"
          autoComplete="off"
          className={inputClass}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => runTrakt("test")} disabled={busy !== null || !traktId} className={buttonClass}>
            {busy === "trakt-test" && <Loader2 className="h-4 w-4 animate-spin" />}
            Test
          </button>
          <button type="button" onClick={() => runTrakt("save")} disabled={busy !== null || !traktId} className={buttonClass}>
            {busy === "trakt-save" && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
          {config.trakt && (
            <button
              type="button"
              onClick={() => {
                setTraktId("");
                runTrakt("save", { clientId: "" });
              }}
              disabled={busy !== null}
              className={buttonClass}
            >
              Remove
            </button>
          )}
        </div>
        <ResultLine result={traktResult} />
      </div>
    </section>
  );
}
