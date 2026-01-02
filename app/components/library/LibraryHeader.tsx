import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Play, Shuffle, X, Check, Search } from "lucide-react";

interface FilterOption {
  value: string;
  label: string;
  hasSubmenu?: boolean;
}

interface FilterGroup {
  label?: string;
  options: FilterOption[];
}

interface ActiveFilter {
  type: string; // e.g., "filter", "genre", "year"
  value: string;
  label: string;
}

interface LibraryHeaderProps {
  /** Page title (e.g., "Movies", "TV Shows") */
  title: string;
  /** Total item count */
  itemCount?: number;
  /** Current filter value */
  currentFilter?: string;
  /** Filter options (All, Unwatched, In Progress) */
  filterOptions?: FilterGroup[];
  /** Filter change handler */
  onFilterChange?: (filter: string) => void;
  /** Current sort value */
  currentSort?: string;
  /** Sort direction (asc/desc) */
  sortDirection?: "asc" | "desc";
  /** Sort options */
  sortOptions?: FilterOption[];
  /** Sort change handler - receives sort value and direction */
  onSortChange?: (sort: string, direction: "asc" | "desc") => void;
  /** Play all handler */
  onPlayAll?: () => void;
  /** Shuffle handler */
  onShuffle?: () => void;
  /** Active filters for breadcrumb display */
  activeFilters?: ActiveFilter[];
  /** Clear all filters handler */
  onClearFilters?: () => void;
  /** Available genres for filter submenu */
  genres?: string[];
  /** Current genre filter */
  currentGenre?: string;
  /** Genre filter handler */
  onGenreFilter?: (genre: string | undefined) => void;
  /** Available years for filter submenu */
  years?: number[];
  /** Current year filter */
  currentYear?: number;
  /** Year filter handler */
  onYearFilter?: (year: number | undefined) => void;
}

interface SortDropdownProps {
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  direction?: "asc" | "desc";
  onDirectionToggle?: () => void;
}

function SortDropdown({ value, options, onChange, direction, onDirectionToggle }: SortDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentLabel = options.find((o) => o.value === value)?.label || "Sort";
  const DirectionIcon = direction === "desc" ? ChevronDown : ChevronUp;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-foreground-secondary transition-colors hover:bg-white/10 hover:text-foreground-primary"
      >
        {currentLabel}
        {onDirectionToggle && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onDirectionToggle();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onDirectionToggle();
              }
            }}
            className="ml-0.5 cursor-pointer"
          >
            <DirectionIcon className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg bg-background-elevated py-2 shadow-xl ring-1 ring-white/10">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-white/10 hover:text-foreground-primary"
            >
              <span className={option.value === value ? "text-mango" : ""}>{option.label}</span>
              {option.value === value && <Check className="h-4 w-4 text-mango" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface FilterDropdownProps {
  currentFilter: string;
  onFilterChange: (filter: string) => void;
  genres?: string[];
  currentGenre?: string;
  onGenreFilter?: (genre: string | undefined) => void;
  years?: number[];
  currentYear?: number;
  onYearFilter?: (year: number | undefined) => void;
}

function FilterDropdown({
  currentFilter,
  onFilterChange,
  genres = [],
  currentGenre,
  onGenreFilter,
  years = [],
  currentYear,
  onYearFilter,
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [submenu, setSubmenu] = useState<"genre" | "year" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSubmenu(null);
        setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get current label based on active filters
  const getFilterLabel = () => {
    if (currentGenre) return currentGenre;
    if (currentYear) return currentYear.toString();
    switch (currentFilter) {
      case "unwatched":
        return "Unwatched";
      case "inProgress":
        return "In Progress";
      default:
        return "All";
    }
  };

  // Filter items for submenu based on search
  const filteredGenres = genres.filter((g) =>
    g.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredYears = years.filter((y) =>
    y.toString().includes(searchQuery)
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded px-2 py-1 text-sm text-foreground-secondary transition-colors hover:bg-white/10 hover:text-foreground-primary"
      >
        {getFilterLabel()}
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] max-h-[400px] overflow-hidden rounded-lg bg-background-elevated shadow-xl ring-1 ring-white/10">
          {submenu ? (
            <div className="flex flex-col">
              {/* Back button */}
              <button
                onClick={() => {
                  setSubmenu(null);
                  setSearchQuery("");
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-white/10"
              >
                <ChevronLeft className="h-4 w-4" />
                {submenu === "genre" ? "Genre" : "Year"}
              </button>
              <div className="border-t border-white/10" />

              {/* Search input */}
              <div className="px-3 py-2">
                <div className="flex items-center gap-2 rounded bg-white/5 px-2 py-1.5">
                  <Search className="h-4 w-4 text-foreground-muted" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-foreground-primary placeholder-foreground-muted outline-none"
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                  />
                </div>
              </div>

              {/* Clear option */}
              <button
                onClick={() => {
                  if (submenu === "genre") {
                    onGenreFilter?.(undefined);
                  } else {
                    onYearFilter?.(undefined);
                  }
                  setIsOpen(false);
                  setSubmenu(null);
                  setSearchQuery("");
                }}
                className="flex items-center justify-between px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-white/10"
              >
                <span className={submenu === "genre" ? (!currentGenre ? "text-mango" : "") : (!currentYear ? "text-mango" : "")}>
                  Any {submenu === "genre" ? "Genre" : "Year"}
                </span>
                {(submenu === "genre" ? !currentGenre : !currentYear) && (
                  <Check className="h-4 w-4 text-mango" />
                )}
              </button>
              <div className="border-t border-white/10" />

              {/* Submenu items */}
              <div className="max-h-[250px] overflow-y-auto py-1">
                {submenu === "genre" ? (
                  filteredGenres.length > 0 ? (
                    filteredGenres.map((genre) => (
                      <button
                        key={genre}
                        onClick={() => {
                          onGenreFilter?.(genre);
                          setIsOpen(false);
                          setSubmenu(null);
                          setSearchQuery("");
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-white/10"
                      >
                        <span className={currentGenre === genre ? "text-mango" : ""}>{genre}</span>
                        {currentGenre === genre && <Check className="h-4 w-4 text-mango" />}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-foreground-muted">No genres found</div>
                  )
                ) : (
                  filteredYears.length > 0 ? (
                    filteredYears.map((year) => (
                      <button
                        key={year}
                        onClick={() => {
                          onYearFilter?.(year);
                          setIsOpen(false);
                          setSubmenu(null);
                          setSearchQuery("");
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-white/10"
                      >
                        <span className={currentYear === year ? "text-mango" : ""}>{year}</span>
                        {currentYear === year && <Check className="h-4 w-4 text-mango" />}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-foreground-muted">No years found</div>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="py-2">
              {/* Basic filters */}
              <button
                onClick={() => {
                  onFilterChange("all");
                  onGenreFilter?.(undefined);
                  onYearFilter?.(undefined);
                  setIsOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-white/10"
              >
                <span className={currentFilter === "all" && !currentGenre && !currentYear ? "text-mango" : ""}>All</span>
                {currentFilter === "all" && !currentGenre && !currentYear && <Check className="h-4 w-4 text-mango" />}
              </button>
              <button
                onClick={() => {
                  onFilterChange("unwatched");
                  setIsOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-white/10"
              >
                <span className={currentFilter === "unwatched" ? "text-mango" : ""}>Unwatched</span>
                {currentFilter === "unwatched" && <Check className="h-4 w-4 text-mango" />}
              </button>
              <button
                onClick={() => {
                  onFilterChange("inProgress");
                  setIsOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-white/10"
              >
                <span className={currentFilter === "inProgress" ? "text-mango" : ""}>In Progress</span>
                {currentFilter === "inProgress" && <Check className="h-4 w-4 text-mango" />}
              </button>

              {/* Divider */}
              {(genres.length > 0 || years.length > 0) && (
                <>
                  <div className="my-1 border-t border-white/10" />
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase text-foreground-muted">
                    Filter By
                  </div>
                </>
              )}

              {/* Genre submenu trigger */}
              {genres.length > 0 && onGenreFilter && (
                <button
                  onClick={() => setSubmenu("genre")}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-white/10"
                >
                  <span className={currentGenre ? "text-mango" : ""}>
                    Genre{currentGenre && `: ${currentGenre}`}
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}

              {/* Year submenu trigger */}
              {years.length > 0 && onYearFilter && (
                <button
                  onClick={() => setSubmenu("year")}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground-secondary transition-colors hover:bg-white/10"
                >
                  <span className={currentYear ? "text-mango" : ""}>
                    Year{currentYear && `: ${currentYear}`}
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Plex-style library header with filter breadcrumbs.
 */
export function LibraryHeader({
  title,
  itemCount,
  currentFilter = "all",
  onFilterChange,
  currentSort = "titleSort",
  sortDirection = "asc",
  sortOptions = [],
  onSortChange,
  onPlayAll,
  onShuffle,
  onClearFilters,
  genres = [],
  currentGenre,
  onGenreFilter,
  years = [],
  currentYear,
  onYearFilter,
}: LibraryHeaderProps) {
  const hasActiveFilters = currentFilter !== "all" || !!currentGenre || !!currentYear;

  return (
    <div className="space-y-4">
      {/* Title row */}
      <div className="flex items-center">
        <h1 className="text-xl font-semibold text-foreground-primary">{title}</h1>
      </div>

      {/* Filter breadcrumbs row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {/* Clear filters button (X) - only show when filters active */}
          {hasActiveFilters && onClearFilters && (
            <button
              onClick={onClearFilters}
              className="mr-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-foreground-secondary transition-colors hover:bg-white/20 hover:text-foreground-primary"
              aria-label="Clear filters"
              title="Clear filters"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Filter dropdown with submenus */}
          {onFilterChange && (
            <FilterDropdown
              currentFilter={currentFilter}
              onFilterChange={onFilterChange}
              genres={genres}
              currentGenre={currentGenre}
              onGenreFilter={onGenreFilter}
              years={years}
              currentYear={currentYear}
              onYearFilter={onYearFilter}
            />
          )}

          {/* Sort dropdown with direction */}
          {sortOptions.length > 0 && onSortChange && (
            <SortDropdown
              value={currentSort}
              options={sortOptions}
              onChange={(sort) => onSortChange(sort, sortDirection)}
              direction={sortDirection}
              onDirectionToggle={() => onSortChange(currentSort, sortDirection === "asc" ? "desc" : "asc")}
            />
          )}

          {/* Item count */}
          {itemCount !== undefined && (
            <span className="ml-2 text-sm text-foreground-muted">{itemCount}</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {onPlayAll && (
            <button
              onClick={onPlayAll}
              className="rounded-full p-2 text-foreground-secondary transition-colors hover:bg-white/10 hover:text-foreground-primary"
              aria-label="Play all"
              title="Play all"
            >
              <Play className="h-5 w-5 fill-current" />
            </button>
          )}
          {onShuffle && (
            <button
              onClick={onShuffle}
              className="rounded-full p-2 text-foreground-secondary transition-colors hover:bg-white/10 hover:text-foreground-primary"
              aria-label="Shuffle"
              title="Shuffle"
            >
              <Shuffle className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
