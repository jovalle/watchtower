/**
 * ListSelectorModal - Modal for adding/removing items from playlists.
 *
 * Features:
 * - Shows all user playlists
 * - Checkmarks for playlists containing the item
 * - Toggle to add/remove from playlists
 * - Loading states during API calls
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { List, Check, Loader2, Plus, X } from "lucide-react";
import type { PlexPlaylist } from "~/lib/plex/types";
import { usePageScrollLock } from "~/hooks/usePageScrollLock";

interface PlaylistWithMembership extends PlexPlaylist {
  containsItem: boolean;
  playlistItemId: string | null;
}

interface ListSelectorModalProps {
  /** The rating key of the item to add to playlists */
  itemRatingKey: string;
  /** Title of the item (for display) */
  itemTitle: string;
  /** Position to display the modal */
  position: { x: number; y: number };
  /** Handler called when modal should close */
  onClose: () => void;
  /** Handler called after successful add/remove */
  onSuccess?: () => void;
}

export function ListSelectorModal({
  itemRatingKey,
  itemTitle,
  position,
  onClose,
  onSuccess,
}: ListSelectorModalProps) {
  usePageScrollLock(true);
  const modalRef = useRef<HTMLDialogElement>(null);
  const [playlists, setPlaylists] = useState<PlaylistWithMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Fetch playlists with membership info
  const fetchPlaylists = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/plex/playlist?includeItems=true&itemRatingKey=${itemRatingKey}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch playlists");
      }

      const data = await response.json();
      setPlaylists(data.playlists || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch playlists");
    } finally {
      setIsLoading(false);
    }
  }, [itemRatingKey]);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  useEffect(() => {
    const dialog = modalRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  // Adjust position to stay within viewport
  useEffect(() => {
    const dialog = modalRef.current;
    if (!dialog) return;
    const place = () => {
      const rect = dialog.getBoundingClientRect();
      dialog.style.left = `${Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8))}px`;
      dialog.style.top = `${Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8))}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [position, playlists, mutationError, isLoading]);

  // Toggle playlist membership
  const handleTogglePlaylist = async (playlist: PlaylistWithMembership) => {
    if (loadingPlaylistId) return; // Prevent concurrent operations

    setMutationError("");
    setLoadingPlaylistId(playlist.ratingKey);

    try {
      const isRemoving = playlist.containsItem;
      const response = await fetch("/api/plex/playlist", {
        method: isRemoving ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistRatingKey: playlist.ratingKey,
          itemRatingKey,
          playlistItemId: playlist.playlistItemId,
        }),
      });

      if (!response.ok) {
        throw new Error(isRemoving ? "Failed to remove from playlist" : "Failed to add to playlist");
      }

      // Update local state
      setPlaylists((prev) =>
        prev.map((p) =>
          p.ratingKey === playlist.ratingKey
            ? { ...p, containsItem: !isRemoving, playlistItemId: null, leafCount: p.leafCount + (isRemoving ? -1 : 1) }
            : p
        )
      );

      onSuccess?.();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : "Could not update this playlist.");
    } finally {
      setLoadingPlaylistId(null);
    }
  };

  function close() {
    modalRef.current?.close();
    onClose();
  }

  return (
    <dialog
      ref={modalRef}
      aria-label="Add to Playlist"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }}
      className="fixed inset-auto m-0 max-h-[calc(100dvh-1rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border-subtle bg-background-elevated p-0 text-foreground-primary shadow-xl backdrop:bg-black/40"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-2">
          <List className="h-4 w-4 text-mango" />
          <span className="text-sm font-medium text-white">Add to Playlist</span>
        </div>
        <button
          aria-label="Close"
          onClick={close}
          className="min-h-11 min-w-11 inline-flex items-center justify-center rounded p-1 text-foreground-secondary transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Item title */}
      <div className="border-b border-border-subtle px-3 py-2">
        <p className="truncate text-xs text-foreground-secondary">{itemTitle}</p>
      </div>

      {/* Content */}
      <div className="max-h-[300px] overflow-y-auto">
        {isLoading && (
          <div role="status" aria-label="Loading Playlists" className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-mango" />
          </div>
        )}

        {mutationError && <p role="alert" className="px-3 py-2 text-sm text-red-400">{mutationError}</p>}
        {error && (
          <div role="alert" className="px-3 py-4 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {!isLoading && !error && playlists.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-foreground-secondary">
            <p>No playlists found.</p>
            <p className="mt-1 text-xs">Create a playlist in Plex first.</p>
          </div>
        )}

        {!isLoading && !error && playlists.length > 0 && (
          <div className="py-1">
            {playlists.map((playlist) => {
              const isUpdating = loadingPlaylistId === playlist.ratingKey;
              const isInPlaylist = playlist.containsItem;

              return (
                <button
                  key={playlist.ratingKey}
                  onClick={() => handleTogglePlaylist(playlist)}
                  disabled={loadingPlaylistId !== null}
                  aria-pressed={isInPlaylist}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    isUpdating
                      ? "cursor-wait opacity-50"
                      : "hover:bg-white/10"
                  }`}
                >
                  {/* Checkbox indicator */}
                  <div
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                      isInPlaylist
                        ? "border-mango bg-mango"
                        : "border-border-emphasis bg-transparent"
                    }`}
                  >
                    {isUpdating ? (
                      <Loader2 className="h-3 w-3 animate-spin text-black" />
                    ) : isInPlaylist ? (
                      <Check className="h-3 w-3 text-black" />
                    ) : null}
                  </div>

                  {/* Playlist info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{playlist.title}</p>
                    <p className="text-xs text-foreground-muted">
                      {playlist.leafCount} {playlist.leafCount === 1 ? "item" : "items"}
                    </p>
                  </div>

                  {/* Add indicator for empty checkbox */}
                  {!isInPlaylist && !isUpdating && (
                    <Plus className="h-4 w-4 flex-shrink-0 text-foreground-muted" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </dialog>
  );
}
