import { useWatchlistActions } from "~/hooks/useWatchlistActions";
import WatchNavigation from "~/components/library/WatchNavigation";
/**
 * Movies library page - displays all movies with filtering and sorting.
 * GET /app/movies
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  useLoaderData,
  useSearchParams,
  useNavigation,
  useRevalidator,
  useNavigate,
} from "@remix-run/react";
import { Film, Plus, ListX } from "lucide-react";
import { Container } from "~/components/layout";
import { PosterCard } from "~/components/media";
import { LibraryHeader, AlphabetSidebar } from "~/components/library";
import { Button, ContextMenu, type ContextMenuItem } from "~/components/ui";
import { requireServerToken, requirePlexToken } from "~/lib/auth/session.server";
import { PlexClient } from "~/lib/plex/client.server";
import { env } from "~/lib/env.server";
import { libraryPage } from "~/lib/library-page";
import { loadUpstreamLibrary } from "~/lib/upstream-library.server";
import type { PlexMediaItem } from "~/lib/plex/types";

export const meta: MetaFunction = () => {
  return [
    { title: "Movies | Watchtower" },
    { name: "description", content: "Browse your movie library" },
  ];
};

interface MovieItemView {
  ratingKey: string;
  guid: string;
  title: string;
  year?: string;
  posterUrl: string;
  viewCount: number;
  isInWatchlist: boolean;
  // Sort-relevant fields (accessible at top level for sort indicator)
  criticRating?: number;
  audienceRating?: number;
  userRating?: number;
  releaseDate?: string; // Full date for sorting by date
  addedAt?: number; // Unix timestamp for added sorting
  details: {
    backdropUrl?: string;
    releaseDate?: string;
    runtime?: string;
    rating?: string;
    audienceRating?: string;
    userRating?: string;
    genres?: string[];
    directors?: string[];
    cast?: string[];
    summary?: string;
  };
}

interface LoaderData {
  items: MovieItemView[];
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
  { value: "duration", label: "Runtime" },
  { value: "addedAt", label: "Date Added" },
  { value: "userRating", label: "Your Rating" },
];

// Use shared image URL helpers with proper sizing
import { buildPosterUrl, buildBackdropUrl } from "~/lib/plex/images";

function formatRuntime(durationMs?: number): string | undefined {
  if (!durationMs) return undefined;
  const minutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${remainingMinutes}m`;
}

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

function toView(item: PlexMediaItem, watchlistGuids: Set<string>): MovieItemView {
  return {
    ratingKey: item.ratingKey,
    guid: item.guid,
    title: item.title,
    year: item.year?.toString(),
    posterUrl: buildPosterUrl(item.thumb),
    viewCount: item.viewCount ?? 0,
    isInWatchlist: watchlistGuids.has(item.guid),
    // Sort-relevant fields
    criticRating: item.rating,
    audienceRating: item.audienceRating,
    userRating: item.userRating,
    releaseDate: item.originallyAvailableAt,
    addedAt: item.addedAt,
    details: {
      backdropUrl: buildBackdropUrl(item.art),
      releaseDate: formatReleaseDate(item.originallyAvailableAt),
      runtime: formatRuntime(item.duration),
      rating: item.contentRating,
      audienceRating: item.audienceRating?.toFixed(1),
      userRating: item.userRating?.toFixed(1),
      genres: item.Genre?.map((g) => g.tag),
      directors: item.Director?.map((d) => d.tag),
      cast: item.Role?.map((r) => r.tag),
      summary: item.summary,
    },
  };
}

export async function loader({
  request,
}: LoaderFunctionArgs): Promise<Response> {
  const token = await requireServerToken(request);
  const plexToken = await requirePlexToken(request);
  const url = new URL(request.url);

  const requestedSort = url.searchParams.get("sort") || "titleSort";
  const sort = SORT_OPTIONS.some((option) => option.value === requestedSort) ? requestedSort : "titleSort";
  const sortDirection = url.searchParams.get("dir") === "desc" ? "desc" : "asc";
  const filter = url.searchParams.get("filter") || "all";
  const genreFilter = url.searchParams.get("genre") || undefined;
  const yearFilter = url.searchParams.get("year")
    ? parseInt(url.searchParams.get("year")!)
    : undefined;

  // Build the Plex sort parameter (field:direction)
  const plexSort = sortDirection === "desc" ? `${sort}:desc` : sort;

  const client = new PlexClient({
    serverUrl: env.PLEX_SERVER_URL,
    token,
    clientId: env.PLEX_CLIENT_ID,
  });

  const emptyFilters = { genres: [] as string[], years: [] as number[] };

  const librariesResult = await client.getLibraries();
  if (!librariesResult.success) throw new Response("Couldn't load your libraries. Refresh to try again.", { status: 503 });

  const sections = librariesResult.data.filter((lib) => lib.type === "movie");
  const movieLibrary = sections[0];
  if (!movieLibrary) {
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

  const requestedPage = Number(url.searchParams.get("page") || 1);
  const [paged, watchlist] = await Promise.all([
    loadUpstreamLibrary(client, sections.map((section) => section.key), { sort: plexSort, filter: plexFilter, year: yearFilter, genre: genreFilter }, requestedPage),
    new PlexClient({ serverUrl: env.PLEX_SERVER_URL, token: plexToken, clientId: env.PLEX_CLIENT_ID }).getWatchlist({ type: "movie" }),
  ]);
  if (url.searchParams.has("shuffle") && paged.total) {
    let choice = Math.floor(Math.random() * paged.total);
    const part = paged.sections.find((section) => { if (choice < section.total) return true; choice -= section.total; return false; });
    if (part) {
      const random = await client.getLibraryPage(part.section, { ...part.query, offset: choice, limit: 1 });
      if (!random.success || !random.data.items[0]) throw new Response("Could not shuffle your library. Refresh to try again.", { status: 503 });
      return redirect(`/app/watch/${random.data.items[0].ratingKey}`);
    }
  }
  const watchlistGuids = new Set(watchlist.success ? watchlist.data.map((item) => item.guid) : []);
  return json<LoaderData>({
    items: paged.items.map((item) => toView(item, watchlistGuids)),
    page: paged.page, pages: paged.pages, total: paged.total, letters: paged.letters,
    keys: paged.firstKey ? [paged.firstKey] : [],
    libraryKey: movieLibrary.key,
    currentFilters: { sort, sortDirection, filter, genre: genreFilter, year: yearFilter },
    availableFilters: paged.availableFilters,
  });

}

// Context menu state type
interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  item: MovieItemView | null;
}

// Helper to format sort indicator based on current sort
function getSortIndicator(
  item: MovieItemView,
  sort: string
): string | undefined {
  // Skip rating indicators - handled by showRating/showScore props
  if (sort === "audienceRating" || sort === "rating" || sort === "userRating") {
    return undefined;
  }
  if (sort === "originallyAvailableAt" && item.releaseDate) {
    // Show full date when sorting by release date
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
  if (sort === "duration" && item.details.runtime) {
    // Show runtime when sorting by duration
    return item.details.runtime;
  }
  return undefined;
}

export default function MoviesPage() {
  const { items, libraryKey, currentFilters, availableFilters, page, pages, total, letters, keys } =
    useLoaderData<LoaderData>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isLoading = navigation.state === "loading" && navigation.location?.pathname === "/app/watch/movies";

  const revalidator = useRevalidator();
  const watchlist = useWatchlistActions();
  const [actionError, setActionError] = useState("");

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    item: null,
  });

  const handleContextMenu = useCallback(
    (item: MovieItemView, position: { x: number; y: number }) => {
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

  const handleMarkAsUnwatched = useCallback(async (item: MovieItemView) => {
    try {
      setActionError("");
      const response = await fetch("/api/plex/scrobble", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratingKey: item.ratingKey }),
      });
      if (!response.ok) throw new Error();
      revalidator.revalidate();
    } catch {
      setActionError("Could not update the watched status. Try again.");
    }
  }, [revalidator]);


  // Build context menu items for the current item
  const getContextMenuItems = (item: MovieItemView): ContextMenuItem[] => {
    const isInWatchlist = watchlist.isSaved(item);
    const menuItems: ContextMenuItem[] = [];

    if (isInWatchlist) {
      menuItems.push({
        label: "Remove from Watchlist",
        icon: <ListX className="h-4 w-4" />,
        disabled: watchlist.isPending(item.ratingKey),
        onClick: () => watchlist.toggle(item),
        destructive: true,
      });
    } else {
      menuItems.push({
        label: "Add to Watchlist",
        icon: <Plus className="h-4 w-4" />,
        disabled: watchlist.isPending(item.ratingKey),
        onClick: () => watchlist.toggle(item),
      });
    }

    if (item.viewCount > 0) {
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
        newParams.delete("genre");
        newParams.delete("year");
      } else {
        newParams.set("filter", filter);
      }
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  // Handle play all
  const handlePlayAll = useCallback(() => {
    if (keys.length > 0) navigate(`/app/watch/${keys[0]}`);
  }, [keys, navigate]);

  // Request a fresh random item from the complete filtered library.
  const handleShuffle = useCallback(() => {
    if (!total) return;
    const params = new URLSearchParams(searchParams);
    params.set("shuffle", String(Date.now()));
    setSearchParams(params);
  }, [searchParams, setSearchParams, total]);

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
            title="Movies"
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
              // Default to descending for rating and date sorts
              const defaultDesc = [
                "audienceRating",
                "rating",
                "userRating",
                "addedAt",
                "originallyAvailableAt",
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
            onPlayAll={keys.length ? handlePlayAll : undefined}
            onShuffle={keys.length ? handleShuffle : undefined}
            onClearFilters={handleClearFilters}
            genres={availableFilters.genres}
            currentGenre={currentFilters.genre}
            onGenreFilter={handleGenreFilter}
            years={availableFilters.years}
            currentYear={currentFilters.year}
            onYearFilter={handleYearFilter}
          />

          {isLoading && <p role="status" className="sr-only">Loading Movies</p>}

          {(watchlist.error || actionError) && <p role="alert" className="my-4 text-red-400">{watchlist.error || actionError}</p>}
          {/* Empty State */}
          {items.length === 0 && (
            <div className="mt-8 flex flex-col items-center justify-center py-16 text-center">
              <Film className="mb-4 h-16 w-16 text-foreground-muted" />
              <p className="mb-2 text-lg font-medium text-foreground-primary">
                No Movies Found
              </p>
              <p className="text-foreground-secondary">
                {!libraryKey
                  ? "No movie library found on your Plex server."
                  : currentFilters.filter !== "all" || currentFilters.genre || currentFilters.year
                    ? "No titles match your filters. Try clearing them."
                    : "Your movie library is empty."}
              </p>
            </div>
          )}

          {/* Movies Grid - Vertical Posters */}
          {items.length > 0 && (
            <div
              ref={gridRef}
              aria-busy={isLoading}
              className="mt-6 grid grid-cols-3 gap-4 pr-12 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8"
            >
              {items.map((item) => (
                <div key={item.ratingKey} data-rating-key={item.ratingKey}>
                  <PosterCard
                    ratingKey={item.ratingKey}
                    posterUrl={item.posterUrl}
                    title={item.title}
                    year={item.year}
                    details={item.details}
                    hideHoverPlay
                    viewCount={item.viewCount}
                    rating={item.userRating}
                    score={isSortingByCriticScore ? item.criticRating : item.audienceRating}
                    isInWatchlist={watchlist.isSaved(item)}
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
                      navigate(`/app/media/movie/${item.ratingKey}`)
                    }
                    onMoreInfo={() =>
                      navigate(`/app/media/movie/${item.ratingKey}`)
                    }
                    onPlay={() => navigate(`/app/watch/${item.ratingKey}`)}
                    watchlistPending={watchlist.isPending(item.ratingKey)}
                    onAddToWatchlist={() => watchlist.toggle(item)}
                    onContextMenu={(position) =>
                      handleContextMenu(item, position)
                    }
                  />
                </div>
              ))}
            </div>
          )}

          {pages > 1 && <nav aria-label="Library pages" className="mt-8 flex items-center justify-center gap-4">
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => changePage(page - 1)}>Previous</Button>
            <span aria-live="polite">Page {page} of {pages}</span>
            <Button variant="secondary" size="sm" disabled={page === pages} onClick={() => changePage(page + 1)}>Next</Button>
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
        {items.length > 0 &&
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
