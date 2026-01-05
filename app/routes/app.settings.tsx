/**
 * Settings page - User configuration for watchlist sources.
 * GET /app/settings
 *
 * Allows users to configure their own Trakt username and IMDB watchlist IDs.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Settings, Save, Loader2, CheckCircle, AlertCircle, XCircle, Trash2 } from "lucide-react";
import { Container } from "~/components/layout";
import { Typography } from "~/components/ui";
import { requireUser } from "~/lib/auth/user.server";
import { isServerOwner } from "~/lib/auth/session.server";
import {
  getUserSettings,
  getDefaultSettings,
  getValidationCache,
  getDefaultValidationCache,
} from "~/lib/settings/storage.server";
import type { UserSettings, ValidationCache } from "~/lib/settings/types";

// Validation state type
type ValidationStatus = "idle" | "validating" | "valid" | "invalid";

interface ValidationState {
  status: ValidationStatus;
  message?: string;
  itemCount?: number;
}

interface IMDBListValidation {
  listId: string;
  status: ValidationStatus;
  message?: string;
  itemCount?: number;
}

export const meta: MetaFunction = () => {
  return [
    { title: "Settings | Watchtower" },
    { name: "description", content: "Configure your watchlist sources" },
  ];
};

interface LoaderData {
  settings: UserSettings;
  validationCache: ValidationCache;
  isOwner: boolean;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const settings = await getUserSettings(user.id);
  const validationCache = await getValidationCache(user.id);
  const ownerStatus = await isServerOwner(request);

  return json<LoaderData>({
    settings: settings ?? getDefaultSettings(),
    validationCache: validationCache ?? getDefaultValidationCache(),
    isOwner: ownerStatus,
  });
}

type SaveStatus = "idle" | "saving" | "success" | "error";

type ClearCacheStatus = "idle" | "confirming" | "clearing" | "success" | "error";

export default function SettingsPage() {
  const { settings, validationCache, isOwner } = useLoaderData<typeof loader>();

  // Track the "saved" values to detect changes
  const savedTraktUsername = settings.traktUsername ?? "";
  const savedImdbWatchlistIds = settings.imdbWatchlistIds.join(", ");

  // Form state
  const [traktUsername, setTraktUsername] = useState(savedTraktUsername);
  const [imdbWatchlistIds, setImdbWatchlistIds] = useState(savedImdbWatchlistIds);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Clear cache state
  const [clearCacheStatus, setClearCacheStatus] = useState<ClearCacheStatus>("idle");
  const [clearCacheMessage, setClearCacheMessage] = useState("");

  // Initialize Trakt validation from cache
  const initialTraktValidation = (): ValidationState => {
    if (!validationCache.trakt) return { status: "idle" };
    // Only use cached validation if it matches the current saved username
    if (validationCache.trakt.username !== savedTraktUsername) return { status: "idle" };
    return {
      status: validationCache.trakt.status,
      itemCount: validationCache.trakt.itemCount,
      message: validationCache.trakt.message,
    };
  };

  // Initialize IMDB validations from cache
  const initialImdbValidations = (): IMDBListValidation[] => {
    const ids = savedImdbWatchlistIds
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (ids.length === 0) return [];

    return ids.map((listId) => {
      const cached = validationCache.imdb.find((v) => v.listId === listId);
      if (cached) {
        return {
          listId,
          status: cached.status,
          itemCount: cached.itemCount,
          message: cached.message,
        };
      }
      // No cache for this ID - mark as idle (will need validation if user changes it)
      return { listId, status: "idle" as const };
    });
  };

  // Validation state - initialized from cache
  const [traktValidation, setTraktValidation] = useState<ValidationState>(initialTraktValidation);
  const [imdbValidations, setImdbValidations] = useState<IMDBListValidation[]>(initialImdbValidations);

  // Debounce refs
  const traktDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const imdbDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Track if values have changed from saved state (to determine if we need to validate)
  const traktHasChanged = useRef(false);
  const imdbHasChanged = useRef(false);

  // Track if form has unsaved changes
  const [hasChanges, setHasChanges] = useState(false);

  // Validate Trakt username
  const validateTrakt = useCallback(async (username: string) => {
    if (!username.trim()) {
      setTraktValidation({ status: "idle" });
      return;
    }

    setTraktValidation({ status: "validating" });

    try {
      const response = await fetch(`/api/validate/trakt?username=${encodeURIComponent(username.trim())}`);
      const data = await response.json();

      if (data.valid) {
        setTraktValidation({
          status: "valid",
          itemCount: data.itemCount,
        });
      } else {
        setTraktValidation({
          status: "invalid",
          message: data.error || "Validation failed",
        });
      }
    } catch {
      setTraktValidation({
        status: "invalid",
        message: "Failed to validate",
      });
    }
  }, []);

  // Validate IMDB list IDs
  const validateImdb = useCallback(async (idsString: string) => {
    const ids = idsString
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (ids.length === 0) {
      setImdbValidations([]);
      return;
    }

    // Set all to validating
    setImdbValidations(ids.map((id) => ({ listId: id, status: "validating" as const })));

    // Validate each ID
    const results = await Promise.all(
      ids.map(async (listId) => {
        try {
          const response = await fetch(`/api/validate/imdb?listId=${encodeURIComponent(listId)}`);
          const data = await response.json();

          if (data.valid) {
            return {
              listId,
              status: "valid" as const,
              itemCount: data.itemCount,
            };
          } else {
            return {
              listId,
              status: "invalid" as const,
              message: data.error || "Validation failed",
            };
          }
        } catch {
          return {
            listId,
            status: "invalid" as const,
            message: "Failed to validate",
          };
        }
      })
    );

    setImdbValidations(results);
  }, []);

  // Debounced Trakt validation - only validate when value has changed
  useEffect(() => {
    if (traktDebounceRef.current) {
      clearTimeout(traktDebounceRef.current);
    }

    // Skip validation if value hasn't changed from saved state
    // (cached validation is already displayed)
    if (traktUsername === savedTraktUsername && !traktHasChanged.current) {
      return;
    }

    // Mark that the user has changed this value
    traktHasChanged.current = true;

    traktDebounceRef.current = setTimeout(() => {
      validateTrakt(traktUsername);
    }, 500);

    return () => {
      if (traktDebounceRef.current) {
        clearTimeout(traktDebounceRef.current);
      }
    };
  }, [traktUsername, savedTraktUsername, validateTrakt]);

  // Debounced IMDB validation - only validate when value has changed
  useEffect(() => {
    if (imdbDebounceRef.current) {
      clearTimeout(imdbDebounceRef.current);
    }

    // Skip validation if value hasn't changed from saved state
    // (cached validation is already displayed)
    if (imdbWatchlistIds === savedImdbWatchlistIds && !imdbHasChanged.current) {
      return;
    }

    // Mark that the user has changed this value
    imdbHasChanged.current = true;

    imdbDebounceRef.current = setTimeout(() => {
      validateImdb(imdbWatchlistIds);
    }, 500);

    return () => {
      if (imdbDebounceRef.current) {
        clearTimeout(imdbDebounceRef.current);
      }
    };
  }, [imdbWatchlistIds, savedImdbWatchlistIds, validateImdb]);

  useEffect(() => {
    const currentTrakt = settings.traktUsername ?? "";
    const currentImdb = settings.imdbWatchlistIds.join(", ");
    setHasChanges(
      traktUsername !== currentTrakt || imdbWatchlistIds !== currentImdb
    );
  }, [traktUsername, imdbWatchlistIds, settings]);

  // Reset success status after 3 seconds
  useEffect(() => {
    if (saveStatus === "success") {
      const timer = setTimeout(() => setSaveStatus("idle"), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  // Reset clear cache success status after 3 seconds
  useEffect(() => {
    if (clearCacheStatus === "success") {
      const timer = setTimeout(() => setClearCacheStatus("idle"), 3000);
      return () => clearTimeout(timer);
    }
  }, [clearCacheStatus]);

  const handleClearCache = async () => {
    setClearCacheStatus("clearing");
    setClearCacheMessage("");

    try {
      const response = await fetch("/api/cache", {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to clear cache");
      }

      setClearCacheStatus("success");
      setClearCacheMessage(`Cleared ${data.cleared} cached files`);
    } catch (err) {
      setClearCacheStatus("error");
      setClearCacheMessage(err instanceof Error ? err.message : "Failed to clear cache");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus("saving");
    setErrorMessage("");

    try {
      // Parse IMDB IDs from comma-separated string
      const imdbIds = imdbWatchlistIds
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traktUsername: traktUsername.trim() || null,
          imdbWatchlistIds: imdbIds,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save settings");
      }

      setSaveStatus("success");
      setHasChanges(false);

      // Update the "original" values so hasChanges stays false
      // This is handled by the form state matching the saved state
    } catch (err) {
      setSaveStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  return (
    <Container className="py-8 max-w-2xl">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Settings className="h-8 w-8 text-foreground-secondary" />
        <Typography variant="title" as="h1">
          Settings
        </Typography>
      </div>

      {/* Watchlist Sources Section */}
      <section className="rounded-lg border border-border-subtle bg-background-elevated p-6">
        <div className="mb-6">
          <Typography variant="subtitle" as="h2" className="mb-2">
            Watchlist Sources
          </Typography>
          <Typography variant="body" className="text-foreground-secondary">
            Configure external watchlist sources to import. Your Trakt watchlist and IMDB
            lists will be merged with your Plex watchlist.
          </Typography>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Trakt Username */}
          <div>
            <label
              htmlFor="traktUsername"
              className="mb-2 block text-sm font-medium text-foreground-primary"
            >
              Trakt Username
            </label>
            <div className="relative">
              <input
                type="text"
                id="traktUsername"
                value={traktUsername}
                onChange={(e) => setTraktUsername(e.target.value)}
                placeholder="your-trakt-username"
                className="w-full rounded-md border border-border-subtle bg-background-primary px-4 py-2.5 pr-10 text-foreground-primary placeholder:text-foreground-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
              {/* Validation indicator */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {traktValidation.status === "validating" && (
                  <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
                )}
                {traktValidation.status === "valid" && (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
                {traktValidation.status === "invalid" && (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
              </div>
            </div>
            {/* Validation message */}
            {traktValidation.status === "valid" && traktValidation.itemCount !== undefined && (
              <p className="mt-1.5 text-sm text-green-500">
                Valid ({traktValidation.itemCount} items in watchlist)
              </p>
            )}
            {traktValidation.status === "invalid" && traktValidation.message && (
              <p className="mt-1.5 text-sm text-red-500">
                {traktValidation.message}
              </p>
            )}
            {traktValidation.status === "idle" && (
              <p className="mt-1.5 text-sm text-foreground-muted">
                Your public Trakt username to import your watchlist from.
              </p>
            )}
          </div>

          {/* IMDB Watchlist IDs */}
          <div>
            <label
              htmlFor="imdbWatchlistIds"
              className="mb-2 block text-sm font-medium text-foreground-primary"
            >
              IMDB Watchlist IDs
            </label>
            <div className="relative">
              <input
                type="text"
                id="imdbWatchlistIds"
                value={imdbWatchlistIds}
                onChange={(e) => setImdbWatchlistIds(e.target.value)}
                placeholder="ur12345678, ls87654321"
                className="w-full rounded-md border border-border-subtle bg-background-primary px-4 py-2.5 pr-10 text-foreground-primary placeholder:text-foreground-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
              {/* Overall validation indicator */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {imdbValidations.length > 0 && imdbValidations.some((v) => v.status === "validating") && (
                  <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
                )}
                {imdbValidations.length > 0 &&
                  imdbValidations.every((v) => v.status === "valid") && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                {imdbValidations.length > 0 &&
                  imdbValidations.some((v) => v.status === "invalid") &&
                  !imdbValidations.some((v) => v.status === "validating") && (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
              </div>
            </div>
            {/* Individual validation results */}
            {imdbValidations.length > 0 ? (
              <div className="mt-1.5 space-y-1">
                {imdbValidations.map((v) => (
                  <div key={v.listId} className="flex items-center gap-2 text-sm">
                    {v.status === "validating" && (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground-muted" />
                        <span className="text-foreground-muted">{v.listId}: Validating...</span>
                      </>
                    )}
                    {v.status === "valid" && (
                      <>
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-green-500">
                          {v.listId}: Valid ({v.itemCount} items)
                        </span>
                      </>
                    )}
                    {v.status === "invalid" && (
                      <>
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                        <span className="text-red-500">
                          {v.listId}: {v.message}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-foreground-muted">
                Enter IMDB list IDs separated by commas. Use <code className="rounded bg-background-primary px-1 py-0.5 text-xs">ur*</code> for
                user watchlists or <code className="rounded bg-background-primary px-1 py-0.5 text-xs">ls*</code> for public lists.
              </p>
            )}
          </div>

          {/* Save button and status */}
          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={saveStatus === "saving" || !hasChanges}
              className="flex items-center gap-2 rounded-md bg-accent-primary px-4 py-2 font-medium text-background-primary transition-colors hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saveStatus === "saving" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </button>

            {/* Status messages */}
            {saveStatus === "success" && (
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">Settings saved</span>
              </div>
            )}

            {saveStatus === "error" && (
              <div className="flex items-center gap-2 text-red-500">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{errorMessage}</span>
              </div>
            )}
          </div>
        </form>
      </section>

      {/* Server Administration Section - Only for server owner */}
      {isOwner && (
        <section className="mt-6 rounded-lg border border-border-subtle bg-background-elevated p-6">
          <div className="mb-6">
            <Typography variant="subtitle" as="h2" className="mb-2">
              Server Administration
            </Typography>
            <Typography variant="body" className="text-foreground-secondary">
              Server-level settings. These options affect all users.
            </Typography>
          </div>

          {/* Clear Cache */}
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Typography variant="body" className="font-medium text-foreground-primary">
                  Clear Cache
                </Typography>
                <Typography variant="caption" className="text-foreground-muted">
                  Remove all cached data to force fresh API requests. Use if content appears stale or missing.
                </Typography>
              </div>

              {clearCacheStatus === "confirming" ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setClearCacheStatus("idle")}
                    className="rounded-md border border-border-subtle bg-background-primary px-3 py-1.5 text-sm font-medium text-foreground-primary transition-colors hover:bg-background-elevated"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleClearCache}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
                  >
                    Confirm Clear
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setClearCacheStatus("confirming")}
                  disabled={clearCacheStatus === "clearing"}
                  className="flex items-center gap-2 rounded-md border border-border-subtle bg-background-primary px-3 py-1.5 text-sm font-medium text-foreground-primary transition-colors hover:bg-background-elevated disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {clearCacheStatus === "clearing" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Clearing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Clear Cache
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Status messages */}
            {clearCacheStatus === "success" && (
              <div className="mt-3 flex items-center gap-2 text-green-500">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">{clearCacheMessage}</span>
              </div>
            )}

            {clearCacheStatus === "error" && (
              <div className="mt-3 flex items-center gap-2 text-red-500">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{clearCacheMessage}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Info note */}
      <div className="mt-6 rounded-lg border border-border-subtle bg-background-elevated/50 p-4">
        <Typography variant="caption" className="text-foreground-muted">
          Changes take effect immediately. Your watchlist page will show items from all
          configured sources after refresh.
        </Typography>
      </div>
    </Container>
  );
}
