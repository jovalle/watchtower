import { useRef, useState, useEffect } from "react";
import { Link } from "@remix-run/react";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
import { Typography } from "~/components/ui";
import type { PlexRole } from "~/lib/plex/types";

interface CastCardProps {
  id?: number;
  name: string;
  character?: string;
  photoUrl?: string;
}

function CastCard({ id, name, character, photoUrl }: CastCardProps) {
  const [imageError, setImageError] = useState(false);
  const showFallback = !photoUrl || imageError;

  const content = (
    <div className="w-[100px] flex-shrink-0 snap-start md:w-[120px]">
      {/* Circular photo container */}
      <div className="mx-auto mb-2 aspect-square w-[80px] overflow-hidden rounded-full bg-background-elevated transition-transform duration-200 group-hover:scale-105 group-hover:ring-2 group-hover:ring-accent-primary md:w-[96px]">
        {showFallback ? (
          <div className="flex h-full w-full items-center justify-center bg-background-elevated">
            <User className="h-8 w-8 text-foreground-muted md:h-10 md:w-10" />
          </div>
        ) : (
          <img
            src={photoUrl}
            alt={name}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        )}
      </div>

      {/* Actor name */}
      <Typography
        variant="caption"
        as="p"
        className="truncate text-center text-foreground-primary group-hover:text-accent-primary"
      >
        {name}
      </Typography>

      {/* Character name */}
      {character && (
        <Typography
          variant="caption"
          as="p"
          className="truncate text-center text-foreground-muted"
        >
          {character}
        </Typography>
      )}
    </div>
  );

  // If we have an ID, wrap in a Link
  if (id) {
    // Pass actor name and photo via query params since Plex doesn't return them when filtering
    const searchParams = new URLSearchParams();
    searchParams.set("name", name);
    if (photoUrl) {
      searchParams.set("photo", photoUrl);
    }

    return (
      <Link
        to={`/app/actor/${id}?${searchParams.toString()}`}
        className="group cursor-pointer"
        prefetch="intent"
      >
        {content}
      </Link>
    );
  }

  return content;
}

interface CastRowProps {
  title: string;
  people: PlexRole[];
  buildPhotoUrl?: (thumbPath: string) => string;
}

export function CastRow({ title, people, buildPhotoUrl }: CastRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  const updateArrows = () => {
    const container = scrollRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
  };

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    updateArrows();
    container.addEventListener("scroll", updateArrows);
    window.addEventListener("resize", updateArrows);

    return () => {
      container.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, []);

  const scroll = (direction: "left" | "right") => {
    const container = scrollRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.8;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  if (!people || people.length === 0) {
    return null;
  }

  return (
    <div
      className="relative py-4"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Section title */}
      <Typography variant="title" className="mb-4">
        {title}
      </Typography>

      {/* Mobile: Horizontal scroll container */}
      <div className="relative md:hidden">
        {/* Left navigation arrow */}
        <button
          onClick={() => scroll("left")}
          className={`absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-opacity duration-200 hover:bg-black/80 ${
            isHovered && showLeftArrow
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        {/* Horizontal scroll container */}
        <div
          ref={scrollRef}
          className="scrollbar-hide flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory py-2"
        >
          {people.map((person, index) => (
            <CastCard
              key={person.id ?? `${person.tag}-${index}`}
              id={person.id}
              name={person.tag}
              character={person.role}
              photoUrl={
                person.thumb && buildPhotoUrl
                  ? buildPhotoUrl(person.thumb)
                  : undefined
              }
            />
          ))}
        </div>

        {/* Right navigation arrow */}
        <button
          onClick={() => scroll("right")}
          className={`absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition-opacity duration-200 hover:bg-black/80 ${
            isHovered && showRightArrow
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          aria-label="Scroll right"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Desktop: Wrap layout */}
      <div className="hidden md:flex md:flex-wrap md:gap-4 md:py-2">
        {people.map((person, index) => (
          <CastCard
            key={person.id ?? `${person.tag}-${index}`}
            id={person.id}
            name={person.tag}
            character={person.role}
            photoUrl={
              person.thumb && buildPhotoUrl
                ? buildPhotoUrl(person.thumb)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
