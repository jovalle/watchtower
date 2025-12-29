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
  const modalRef = useRef<HTMLDivElement>(null);
  const [playlists, setPlaylists] = useState<PlaylistWithMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingPlaylistId, setLoadingPlaylistId] = useState<string | null>(null);
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

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        // Stop propagation to prevent the click from reaching the card
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };

    // Delay to prevent immediate close from the triggering click
    const timeoutId = setTimeout(() => {
      // Use capture phase to intercept clicks before they reach the card
      document.addEventListener("mousedown", handleClickOutside, true);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (modalRef.current) {
      const rect = modalRef.current.getBoundingClientRect();
      const padding = 8;

      // Adjust if modal would overflow right edge
      if (rect.right > window.innerWidth - padding) {
        modalRef.current.style.left = `${window.innerWidth - rect.width - padding}px`;
      }

      // Adjust if modal would overflow bottom edge
      if (rect.bottom > window.innerHeight - padding) {
        modalRef.current.style.top = `${window.innerHeight - rect.height - padding}px`;
      }
    }
  }, [position, playlists]);

  // Toggle playlist membership
  const handleTogglePlaylist = async (playlist: PlaylistWithMembership) => {
    if (loadingPlaylistId) return; // Prevent concurrent operations

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
            ? { ...p, containsItem: !isRemoving, playlistItemId: isRemoving ? null : "updated" }
            : p
        )
      );

      onSuccess?.();
    } catch (err) {
      console.error("Playlist operation failed:", err);
    } finally {
      setLoadingPlaylistId(null);
    }
  };

  return (
    <div
      ref={modalRef}
      className="fixed z-[100] min-w-[240px] max-w-[320px] animate-fadeIn overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <List className="h-4 w-4 text-mango" />
          <span className="text-sm font-medium text-white">Add to Playlist</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Item title */}
      <div className="border-b border-zinc-800 px-3 py-2">
        <p className="truncate text-xs text-zinc-400">{itemTitle}</p>
      </div>

      {/* Content */}
      <div className="max-h-[300px] overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-mango" />
          </div>
        )}

        {error && (
          <div className="px-3 py-4 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {!isLoading && !error && playlists.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-zinc-400">
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
                  disabled={isUpdating}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    isUpdating
                      ? "cursor-wait opacity-50"
                      : "hover:bg-zinc-800"
                  }`}
                >
                  {/* Checkbox indicator */}
                  <div
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                      isInPlaylist
                        ? "border-mango bg-mango"
                        : "border-zinc-600 bg-transparent"
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
                    <p className="text-xs text-zinc-500">
                      {playlist.leafCount} {playlist.leafCount === 1 ? "item" : "items"}
                    </p>
                  </div>

                  {/* Add indicator for empty checkbox */}
                  {!isInPlaylist && !isUpdating && (
                    <Plus className="h-4 w-4 flex-shrink-0 text-zinc-500" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
