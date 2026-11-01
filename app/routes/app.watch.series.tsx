import WatchNavigation from "~/components/library/WatchNavigation";
/**
 * Series library page - displays all TV series with filtering and sorting.
 * GET /app/tv
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useSearchParams,
  useNavigation,
  useNavigate,
} from "@remix-run/react";
import { Tv, Plus, ListX } from "lucide-react";
import { Container } from "~/components/layout";
import { PosterCard } from "~/components/media";
import { LibraryHeader, AlphabetSidebar } from "~/components/library";
import { ContextMenu, type ContextMenuItem } from "~/components/ui";
import { requireServerToken, requirePlexToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";
import { libraryPage } from "~/lib/library-page";
import { getLibraryIndex } from "~/lib/library-index.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Series | Watchtower" },
    { name: "description", content: "Browse your TV series library" },
  ];
};

interface ShowItemView {
  ratingKey: string;
  guid: string;
  title: string;
  year?: string;
  posterUrl: string;
  logoUrl?: string; // TV show logos (when available via TMDB integration)
  viewCount: number;
  leafCount?: number; // Total episodes
  viewedLeafCount?: number; // Watched episodes
  isInWatchlist: boolean;
  // Sort-relevant fields
  audienceRating?: number;
  userRating?: number;
  releaseDate?: string;
  addedAt?: number;
  details: {
    backdropUrl?: string;
    releaseDate?: string;
    seasons?: number;
    episodes?: number;
    rating?: string;
    audienceRating?: string;
    userRating?: string;
    genres?: string[];
    directors?: string[]; // Creators for TV shows
    cast?: string[];
    summary?: string;
  };
}

interface LoaderData {
  items: ShowItemView[];
  libraryKey: string | null;
  page: number;
  pages: number;
  total: number;
  letters: Record<string, { page: number; ratingKey: string }>;
  keys: string[];
  currentFilters: {
    sort: string;
    sortDirection: "asc" | "desc";
    filter: string;
    genre?: string;
    year?: number;
  };
  availableFilters: {
    genres: string[];
    years: number[];
  };
}

const SORT_OPTIONS = [
  { value: "titleSort", label: "Alphabetical" },
  { value: "audienceRating", label: "Audience Score" },
  { value: "rating", label: "Critic Score" },
  { value: "originallyAvailableAt", label: "Release Date" },
  { value: "addedAt", label: "Date Added" },
  { value: "userRating", label: "Your Rating" },
  { value: "leafCount", label: "Episode Count" },
];

// Use shared image URL helpers with proper sizing
import { buildPosterUrl, buildBackdropUrl } from "~/lib/plex/images";

function formatReleaseDate(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export async function loader({
  request,
}: LoaderFunctionArgs): Promise<Response> {
  const token = await requireServerToken(request);
  const plexToken = await requirePlexToken(request);
  const url = new URL(request.url);

  const sort = url.searchParams.get("sort") || "titleSort";
  const sortDirection = (url.searchParams.get("dir") || "asc") as
    | "asc"
    | "desc";
  const filter = url.searchParams.get("filter") || "all";
  const genreFilter = url.searchParams.get("genre") || undefined;
  const yearFilter = url.searchParams.get("year")
    ? parseInt(url.searchParams.get("year")!)
    : undefined;

  // Build the Plex sort parameter (field:direction)
  // Note: leafCount isn't a valid Plex sort field, so we'll use titleSort and sort client-side
  const actualSort = sort === "leafCount" ? "titleSort" : sort;
  const plexSort = sortDirection === "desc" ? `${actualSort}:desc` : actualSort;

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  const emptyFilters = { genres: [] as string[], years: [] as number[] };

  const librariesResult = await client.getLibraries();
  if (!librariesResult.success) throw new Response("Couldn't load your libraries. Refresh to try again.", { status: 503 });

  const sections = librariesResult.data.filter((lib) => lib.type === "show");
  const tvLibrary = sections[0];
  if (!tvLibrary) {
    return json<LoaderData>({
      ...libraryPage([], null),
      libraryKey: null,
      currentFilters: {
        sort,
        sortDirection,
        filter,
        genre: genreFilter,
        year: yearFilter,
      },
      availableFilters: emptyFilters,
    });
  }

  // Build Plex filter based on selected filter option
  const filterParts: string[] = [];
  if (filter === "unwatched") {
    filterParts.push("unwatched=1");
  } else if (filter === "inProgress") {
    filterParts.push("inProgress=1");
  }
  const plexFilter = filterParts.length > 0 ? filterParts.join("&") : undefined;

  // Fetch items and watchlist in parallel
  // Note: Genre filtering is done client-side because Plex API requires genre IDs, not names
  const [itemsResult, watchlistResult] = await Promise.all([
    getLibraryIndex(client, token, sections.map((section) => section.key), {
      sort: plexSort,
      filter: plexFilter,
      // genre: genreFilter, // Disabled - using client-side filtering instead
      year: yearFilter,
    }),
    new PlexClient({ serverUrl: env.PLEX_SERVER_URL, token: plexToken, clientId: env.PLEX_CLIENT_ID }).getWatchlist({ type: "show" }),
  ]);

  if (!itemsResult.success) throw new Response("Could not finish loading your library. Refresh to try again.", { status: 503 });

  // Build a set of GUIDs that are in watchlist for fast lookup
  const watchlistGuids = new Set(
    watchlistResult.success ? watchlistResult.data.map((item) => item.guid) : []
  );

  // Build items list (before genre filtering to extract available filters)
  const allItems: ShowItemView[] = itemsResult.success
    ? itemsResult.data.map((item) => ({
        ratingKey: item.ratingKey,
        guid: item.guid,
        title: item.title,
        year: item.year?.toString(),
        posterUrl: buildPosterUrl(item.thumb),
        // logoUrl would come from TMDB integration (Phase 6)
        logoUrl: undefined,
        viewCount: item.viewCount ?? 0,
        leafCount: item.leafCount,
        viewedLeafCount: item.viewedLeafCount,
        isInWatchlist: watchlistGuids.has(item.guid),
        // Sort-relevant fields
        audienceRating: item.audienceRating,
        userRating: item.userRating,
        releaseDate: item.originallyAvailableAt,
        addedAt: item.addedAt,
        details: {
          backdropUrl: buildBackdropUrl(item.art),
          releaseDate: formatReleaseDate(item.originallyAvailableAt),
          seasons: item.childCount,
          episodes: item.leafCount,
          rating: item.contentRating,
          audienceRating: item.audienceRating?.toFixed(1),
          userRating: item.userRating?.toFixed(1),
          genres: item.Genre?.map((g) => g.tag),
          directors: item.Director?.map((d) => d.tag),
          cast: item.Role?.slice(0, 5).map((r) => r.tag),
          summary: item.summary,
        },
      }))
    : [];

  // Apply client-side genre filtering (Plex API requires genre IDs, not names)
  let items = genreFilter
    ? allItems.filter((item) => item.details.genres?.includes(genreFilter))
    : allItems;

  // Client-side sorting for leafCount (episode count) since Plex doesn't support this sort field
  if (sort === "leafCount" && items.length > 0) {
    items = [...items].sort((a, b) => {
      const aCount = a.leafCount ?? 0;
      const bCount = b.leafCount ?? 0;
      return sortDirection === "desc" ? bCount - aCount : aCount - bCount;
    });
  }

  // Apply client-side sorting for rating fields (Plex API doesn't handle nulls consistently)
  if (sort === "audienceRating" || sort === "userRating" || sort === "rating") {
    const getRatingValue = (item: ShowItemView): number | null => {
      if (sort === "userRating") return item.userRating ?? null;
      if (sort === "audienceRating") return item.audienceRating ?? null;
      return item.audienceRating ?? null;
    };

    items = [...items].sort((a, b) => {
      const aVal = getRatingValue(a);
      const bVal = getRatingValue(b);
      // Items without ratings go to the end
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      // Sort by rating value
      return sortDirection === "desc" ? bVal - aVal : aVal - bVal;
    });
  }

  // Extract available filter values from raw items
  const genreSet = new Set<string>();
  const yearSet = new Set<number>();
  if (itemsResult.success) {
    for (const item of itemsResult.data) {
      if (item.Genre) {
        for (const g of item.Genre) {
          genreSet.add(g.tag);
        }
      }
      if (item.year) {
        yearSet.add(item.year);
      }
    }
  }

  return json<LoaderData>({
    ...libraryPage(items, url.searchParams.get("page")),
    libraryKey: tvLibrary.key,
    currentFilters: {
      sort,
      sortDirection,
      filter,
      genre: genreFilter,
      year: yearFilter,
    },
    availableFilters: {
      genres: Array.from(genreSet).sort(),
      years: Array.from(yearSet).sort((a, b) => b - a), // Descending (newest first)
    },
  });
}

// Context menu state type
interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  item: ShowItemView | null;
}

// Helper to format sort indicator based on current sort
function getSortIndicator(
  item: ShowItemView,
  sort: string
): string | undefined {
  // Skip rating indicators - handled by showRating/showScore props
  if (sort === "audienceRating" || sort === "rating" || sort === "userRating") {
    return undefined;
  }
  if (sort === "originallyAvailableAt" && item.releaseDate) {
    // Show full date when sorting by first aired
    try {
      const date = new Date(item.releaseDate);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return item.releaseDate;
    }
  }
  if (sort === "addedAt" && item.addedAt) {
    // Show when added
    const date = new Date(item.addedAt * 1000);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (sort === "leafCount" && item.leafCount !== undefined) {
    // Show episode count
    return `${item.leafCount} ep`;
  }
  return undefined;
}

export default function TVShowsPage() {
  const { items, libraryKey, currentFilters, availableFilters, page, pages, total, letters, keys } =
    useLoaderData<LoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isLoading = navigation.state === "loading";

  // Local state for optimistic updates
  const [localWatchlistState, setLocalWatchlistState] = useState<
    Record<string, boolean>
  >({});

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    item: null,
  });

  const handleContextMenu = useCallback(
    (item: ShowItemView, position: { x: number; y: number }) => {
      setContextMenu({
        isOpen: true,
        position,
        item,
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleAddToWatchlist = useCallback(async (item: ShowItemView) => {
    // Optimistic update
    setLocalWatchlistState((prev) => ({ ...prev, [item.ratingKey]: true }));

    try {
      const response = await fetch("/api/plex/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingKey: item.ratingKey }),
      });

      if (!response.ok) {
        // Revert on failure
        setLocalWatchlistState((prev) => ({
          ...prev,
          [item.ratingKey]: false,
        }));
      }
    } catch {
      // Revert on error
      setLocalWatchlistState((prev) => ({ ...prev, [item.ratingKey]: false }));
    }
  }, []);

  const handleRemoveFromWatchlist = useCallback(async (item: ShowItemView) => {
    // Optimistic update
    setLocalWatchlistState((prev) => ({ ...prev, [item.ratingKey]: false }));

    try {
      const response = await fetch("/api/plex/list", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingKey: item.ratingKey }),
      });

      if (!response.ok) {
        // Revert on failure
        setLocalWatchlistState((prev) => ({ ...prev, [item.ratingKey]: true }));
      }
    } catch {
      // Revert on error
      setLocalWatchlistState((prev) => ({ ...prev, [item.ratingKey]: true }));
    }
  }, []);

  const handleMarkAsUnwatched = useCallback(async (item: ShowItemView) => {
    try {
      await fetch("/api/plex/scrobble", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingKey: item.ratingKey }),
      });
      // Would need a full reload to show updated state
      // For now, we just close the menu
    } catch {
      // Silent fail
    }
  }, []);

  // Get the effective watchlist state for an item
  const getIsInWatchlist = (item: ShowItemView): boolean => {
    if (item.ratingKey in localWatchlistState) {
      return localWatchlistState[item.ratingKey];
    }
    return item.isInWatchlist;
  };

  // Check if a TV show is fully watched (all episodes watched)
  const getIsWatched = (item: ShowItemView): boolean => {
    if (
      item.leafCount !== undefined &&
      item.viewedLeafCount !== undefined &&
      item.leafCount > 0
    ) {
      return item.viewedLeafCount >= item.leafCount;
    }
    return false;
  };

  // Build context menu items for the current item
  const getContextMenuItems = (item: ShowItemView): ContextMenuItem[] => {
    const isInWatchlist = getIsInWatchlist(item);
    const isWatched = getIsWatched(item);
    const menuItems: ContextMenuItem[] = [];

    if (isInWatchlist) {
      menuItems.push({
        label: "Remove from Watchlist",
        icon: <ListX className="h-4 w-4" />,
        onClick: () => handleRemoveFromWatchlist(item),
        destructive: true,
      });
    } else {
      menuItems.push({
        label: "Add to Watchlist",
        icon: <Plus className="h-4 w-4" />,
        onClick: () => handleAddToWatchlist(item),
      });
    }

    if (isWatched) {
      menuItems.push({
        label: "Mark as Unwatched",
        icon: <ListX className="h-4 w-4" />,
        onClick: () => handleMarkAsUnwatched(item),
      });
    }

    return menuItems;
  };

  const gridRef = useRef<HTMLDivElement>(null);
  const scrollToLetter = useCallback((letter: string) => {
    const target = letters[letter];
    const element = [...(gridRef.current?.querySelectorAll<HTMLElement>("[data-rating-key]") ?? [])].find((node) => node.dataset.ratingKey === target?.ratingKey);
    if (element) window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 120, behavior: "smooth" });
  }, [letters]);
  useEffect(() => {
    const letter = searchParams.get("letter");
    if (!isLoading && letter && letters[letter]?.page === page) scrollToLetter(letter);
  }, [isLoading, letters, page, scrollToLetter, searchParams]);
  const handleLetterClick = useCallback((letter: string) => {
    const target = letters[letter];
    if (!target) return;
    if (target.page === page && searchParams.get("letter") === letter) { scrollToLetter(letter); return; }
    const params = new URLSearchParams(searchParams);
    params.set("page", String(target.page));
    params.set("letter", letter);
    setSearchParams(params);
  }, [letters, page, scrollToLetter, searchParams, setSearchParams]);
  const changePage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(next));
    params.delete("letter");
    setSearchParams(params);
  };

  // Handle filter change
  const handleFilterChange = useCallback(
    (filter: string) => {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("page");
      newParams.delete("letter");
      if (filter === "all") {
        newParams.delete("filter");
      } else {
        newParams.set("filter", filter);
      }
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  // Handle shuffle
  const handleShuffle = useCallback(() => {
    if (keys.length > 0) {
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      navigate(`/app/media/show/${randomKey}`);
    }
  }, [keys, navigate]);

  // Handle clear all filters
  const handleClearFilters = useCallback(() => {
    const newParams = new URLSearchParams();
    // Keep only sort, reset everything else
    newParams.set("sort", "titleSort");
    newParams.set("dir", "asc");
    setSearchParams(newParams);
  }, [setSearchParams]);

  // Handle genre filter
  const handleGenreFilter = useCallback(
    (genre: string | undefined) => {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("page");
      newParams.delete("letter");
      if (genre) {
        newParams.set("genre", genre);
        newParams.delete("year"); // Only one advanced filter at a time
      } else {
        newParams.delete("genre");
      }
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  // Handle year filter
  const handleYearFilter = useCallback(
    (year: number | undefined) => {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("page");
      newParams.delete("letter");
      if (year) {
        newParams.set("year", year.toString());
        newParams.delete("genre"); // Only one advanced filter at a time
      } else {
        newParams.delete("year");
      }
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  // Check sorting mode for badge display
  const isSortingByAudienceScore = currentFilters.sort === "audienceRating";
  const isSortingByCriticScore = currentFilters.sort === "rating";
  const isSortingByMyRating = currentFilters.sort === "userRating";

  return (
    <>
      <WatchNavigation />
      <div className="min-h-screen pb-16">
        <Container size="wide" className="pt-6">
          {/* Plex-style Library Header */}
          <LibraryHeader
            title="Series"
            itemCount={total}
            currentFilter={currentFilters.filter}
            onFilterChange={handleFilterChange}
            currentSort={currentFilters.sort}
            sortDirection={currentFilters.sortDirection}
            sortOptions={SORT_OPTIONS}
            onSortChange={(sort, direction) => {
              const newParams = new URLSearchParams(searchParams);
      newParams.delete("page");
      newParams.delete("letter");
              newParams.set("sort", sort);
              // Default to descending for rating, episode count, and date sorts
              const defaultDesc = [
                "audienceRating",
                "rating",
                "userRating",
                "leafCount",
                "addedAt",
              ].includes(sort);
              const newDirection =
                sort !== currentFilters.sort
                  ? defaultDesc
                    ? "desc"
                    : "asc"
                  : direction;
              newParams.set("dir", newDirection);
              setSearchParams(newParams);
            }}
            onShuffle={handleShuffle}
            onClearFilters={handleClearFilters}
            genres={availableFilters.genres}
            currentGenre={currentFilters.genre}
            onGenreFilter={handleGenreFilter}
            years={availableFilters.years}
            currentYear={currentFilters.year}
            onYearFilter={handleYearFilter}
          />

          {/* Loading State */}
          {isLoading && (
            <div className="mt-8 flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
            </div>
          )}

          {/* Empty State */}
          {!isLoading && items.length === 0 && (
            <div className="mt-8 flex flex-col items-center justify-center py-16 text-center">
              <Tv className="mb-4 h-16 w-16 text-foreground-muted" />
              <p className="mb-2 text-lg font-medium text-foreground-primary">
                No series found
              </p>
              <p className="text-foreground-secondary">
                {libraryKey
                  ? "Your series library appears to be empty."
                  : "No series library found on your Plex server."}
              </p>
            </div>
          )}

          {/* Series Grid - Vertical Posters */}
          {!isLoading && items.length > 0 && (
            <div
              ref={gridRef}
              className="mt-6 grid grid-cols-3 gap-4 pr-12 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8"
            >
              {items.map((item) => (
                <div key={item.ratingKey} data-rating-key={item.ratingKey}>
                  <PosterCard
                    ratingKey={item.ratingKey}
                    posterUrl={item.posterUrl}
                    logoUrl={item.logoUrl}
                    title={item.title}
                    year={item.year}
                    details={item.details}
                    hideHoverPlay
                    viewCount={item.viewCount}
                    leafCount={item.leafCount}
                    viewedLeafCount={item.viewedLeafCount}
                    rating={item.userRating}
                    score={item.audienceRating}
                    isInWatchlist={getIsInWatchlist(item)}
                    sortIndicator={
                      !isSortingByAudienceScore &&
                      !isSortingByCriticScore &&
                      !isSortingByMyRating
                        ? getSortIndicator(item, currentFilters.sort)
                        : undefined
                    }
                    showRating={isSortingByMyRating}
                    showScore={
                      isSortingByAudienceScore || isSortingByCriticScore
                    }
                    onClick={() =>
                      navigate(`/app/media/show/${item.ratingKey}`)
                    }
                    onMoreInfo={() =>
                      navigate(`/app/media/show/${item.ratingKey}`)
                    }
                    onPlay={() => navigate(`/app/media/show/${item.ratingKey}`)}
                    onAddToWatchlist={() => {
                      const isInWatchlist = getIsInWatchlist(item);
                      if (isInWatchlist) {
                        handleRemoveFromWatchlist(item);
                      } else {
                        handleAddToWatchlist(item);
                      }
                    }}
                    onContextMenu={(position) =>
                      handleContextMenu(item, position)
                    }
                  />
                </div>
              ))}
            </div>
          )}

          {pages > 1 && !isLoading && <nav aria-label="Library pages" className="mt-8 flex items-center justify-center gap-4">
            <button className="min-h-11 rounded border px-4 disabled:opacity-40" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</button>
            <span aria-live="polite">Page {page} of {pages}</span>
            <button className="min-h-11 rounded border px-4 disabled:opacity-40" disabled={page === pages} onClick={() => changePage(page + 1)}>Next</button>
          </nav>}

          {/* Context Menu */}
          {contextMenu.isOpen && contextMenu.item && (
            <ContextMenu
              items={getContextMenuItems(contextMenu.item)}
              position={contextMenu.position}
              onClose={closeContextMenu}
            />
          )}
        </Container>

        {/* Alphabet Sidebar */}
        {!isLoading &&
          items.length > 0 &&
          currentFilters.sort.startsWith("titleSort") && (
            <AlphabetSidebar
              availableLetters={Object.keys(letters)}
              onLetterClick={handleLetterClick}
            />
          )}
      </div>
    </>
  );
}
