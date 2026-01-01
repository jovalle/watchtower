import { useState, useEffect, useCallback, useRef } from "react";
import { ImageOff, RefreshCw, AlertTriangle, Clock } from "lucide-react";

interface ProxiedImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  /** Fallback image URL to use if the main image fails */
  fallback?: string;
}

type ImageStatus = "loading" | "loaded" | "error" | "retrying";
type ErrorType = "rate_limited" | "not_found" | "plex_error" | "network_error" | "unknown";

interface ImageError {
  type: ErrorType;
  message: string;
  retryAfter?: number;
}

/**
 * Image component with error handling, loading states, and retry logic.
 * Designed for images loaded through the Plex proxy API.
 */
export function ProxiedImage({
  src,
  alt,
  className = "",
  loading = "lazy",
  fallback,
}: ProxiedImageProps) {
  const [status, setStatus] = useState<ImageStatus>("loading");
  const [error, setError] = useState<ImageError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [currentSrc, setCurrentSrc] = useState(src);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxRetries = 2;

  // Reset when src changes
  useEffect(() => {
    setStatus("loading");
    setError(null);
    setRetryCount(0);
    setCurrentSrc(src);

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [src]);

  const handleLoad = useCallback(() => {
    setStatus("loaded");
    setError(null);
  }, []);

  const handleError = useCallback(async () => {
    // Try to determine error type by fetching with HEAD
    let errorInfo: ImageError = {
      type: "unknown",
      message: "Failed to load image",
    };

    // Only check error details for proxy URLs
    if (src.includes("/api/plex/image")) {
      try {
        const response = await fetch(src, { method: "HEAD" });

        if (!response.ok) {
          if (response.status === 429) {
            const retryAfter = response.headers.get("Retry-After");
            errorInfo = {
              type: "rate_limited",
              message: "Rate limited",
              retryAfter: retryAfter ? parseInt(retryAfter, 10) : 30,
            };
          } else if (response.status === 404) {
            errorInfo = {
              type: "not_found",
              message: "Image not found",
            };
          } else {
            errorInfo = {
              type: "plex_error",
              message: `Error ${response.status}`,
            };
          }
        }
      } catch {
        errorInfo = {
          type: "network_error",
          message: "Network error",
        };
      }
    }

    setError(errorInfo);

    // Don't retry for not_found errors
    if (errorInfo.type === "not_found") {
      setStatus("error");
      return;
    }

    // Auto-retry logic
    if (retryCount < maxRetries) {
      setStatus("retrying");
      const delay = errorInfo.type === "rate_limited"
        ? (errorInfo.retryAfter ?? 30) * 1000
        : 2000 * (retryCount + 1);

      console.log(`[Image] Retrying "${alt}" in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);

      retryTimeoutRef.current = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        setCurrentSrc(`${src}${src.includes("?") ? "&" : "?"}_t=${Date.now()}`);
        setStatus("loading");
      }, delay);
    } else {
      setStatus("error");
      // Use fallback if provided
      if (fallback) {
        setCurrentSrc(fallback);
        setStatus("loading");
      }
    }
  }, [src, alt, retryCount, fallback]);

  const handleRetryClick = () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    setRetryCount(0);
    setError(null);
    setCurrentSrc(`${src}${src.includes("?") ? "&" : "?"}_t=${Date.now()}`);
    setStatus("loading");
  };

  const isLoading = status === "loading" || status === "retrying";
  const hasError = status === "error";

  // For images to fill containers properly with absolute positioning,
  // we render the image directly without a wrapper div when no error handling UI is needed
  return (
    <>
      {/* Loading skeleton - positioned absolutely within parent */}
      {isLoading && (
        <div className={`absolute inset-0 animate-pulse bg-background-elevated ${className}`}>
          {status === "retrying" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Clock className="h-5 w-5 text-foreground-muted animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* Actual image - fills parent container */}
      <img
        src={currentSrc}
        alt={alt}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
          status === "loaded" ? "opacity-100" : "opacity-0"
        }`}
        loading={loading}
        onLoad={handleLoad}
        onError={handleError}
      />

      {/* Error state */}
      {hasError && error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background-elevated p-2">
          {error.type === "rate_limited" ? (
            <AlertTriangle className="h-6 w-6 text-yellow-500" />
          ) : (
            <ImageOff className="h-6 w-6 text-foreground-muted" />
          )}
          <span className="mt-1 text-center text-xs text-foreground-muted line-clamp-2">
            {error.message}
          </span>
          <button
            onClick={handleRetryClick}
            className="mt-2 flex items-center gap-1 rounded px-2 py-1 text-xs text-foreground-secondary hover:bg-white/10 transition-colors"
            type="button"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}
    </>
  );
}
