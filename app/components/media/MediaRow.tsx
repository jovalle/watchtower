import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Typography } from "~/components/ui";

interface MediaRowPropsWithChildren {
  title: string;
  children: ReactNode;
  items?: never;
  renderItem?: never;
  getKey?: never;
}

interface MediaRowPropsWithItems<T> {
  title: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T) => string;
  children?: never;
}

type MediaRowProps<T = unknown> = MediaRowPropsWithChildren | MediaRowPropsWithItems<T>;

export function MediaRow<T>(props: MediaRowProps<T>) {
  const { title } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrollX, setScrollX] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [useTransformScroll, setUseTransformScroll] = useState(false);

  const showLeftArrow = scrollX > 0;
  const showRightArrow = scrollX < maxScroll;

  // Determine content based on API used
  const content = 'children' in props && props.children
    ? props.children
    : 'items' in props && props.items
    ? props.items.map((item, index) => (
        <div key={props.getKey(item)}>
          {props.renderItem(item, index)}
        </div>
      ))
    : null;

  // Use transform-based scrolling only for non-touch desktop devices
  // Touch devices (iPad, phones) get native scroll regardless of screen size
  useEffect(() => {
    const checkScrollMode = () => {
      const isLargeScreen = window.innerWidth >= 640;
      const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
      setUseTransformScroll(isLargeScreen && !isTouchDevice);
    };
    checkScrollMode();
    window.addEventListener('resize', checkScrollMode);
    return () => window.removeEventListener('resize', checkScrollMode);
  }, []);

  const updateMaxScroll = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const containerWidth = container.clientWidth;
    const contentWidth = content.scrollWidth;
    setMaxScroll(Math.max(0, contentWidth - containerWidth));
  }, []);

  useEffect(() => {
    updateMaxScroll();
    window.addEventListener("resize", updateMaxScroll);
    return () => window.removeEventListener("resize", updateMaxScroll);
  }, [updateMaxScroll]);

  // Update max scroll when content changes
  useEffect(() => {
    updateMaxScroll();
  }, [content, updateMaxScroll]);

  const scroll = (direction: "left" | "right") => {
    const container = containerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.8;
    const newScrollX = direction === "left"
      ? Math.max(0, scrollX - scrollAmount)
      : Math.min(maxScroll, scrollX + scrollAmount);

    setScrollX(newScrollX);
  };

  // Handle mouse wheel scrolling
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      const newScrollX = Math.max(0, Math.min(maxScroll, scrollX + e.deltaX));
      setScrollX(newScrollX);
    }
  }, [scrollX, maxScroll]);

  // Early return for items API with empty array
  if ('items' in props && props.items && props.items.length === 0) return null;

  return (
    <div
      className="relative py-4"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Row title */}
      <Typography variant="title" className="mb-4">
        {title}
      </Typography>

      {/* Scroll container - native touch scroll for touch devices, transform-based for desktop */}
      <div
        ref={containerRef}
        className={`relative -mx-5 px-5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${
          useTransformScroll ? 'overflow-hidden' : 'overflow-x-auto'
        }`}
        onWheel={handleWheel}
        style={{ touchAction: 'pan-x' }}
      >
        {/* Left navigation arrow - only visible when using transform scroll (desktop with pointer) */}
        {useTransformScroll && (
          <button
            onClick={() => scroll("left")}
            className={`absolute left-5 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white transition-opacity duration-200 hover:bg-black/90 ${
              isHovered && showLeftArrow
                ? "opacity-100"
                : "pointer-events-none opacity-0"
            }`}
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* Content container - static for touch devices (uses native scroll), transforms for desktop */}
        <div
          ref={contentRef}
          className={`flex items-center gap-4 py-5 md:gap-6 ${
            useTransformScroll ? '' : 'snap-x snap-mandatory'
          }`}
          style={useTransformScroll ? {
            transform: `translateX(-${scrollX}px)`,
            transition: 'transform 0.3s ease-out',
          } : undefined}
        >
          {content}
        </div>

        {/* Right navigation arrow - only visible when using transform scroll (desktop with pointer) */}
        {useTransformScroll && (
          <button
            onClick={() => scroll("right")}
            className={`absolute right-5 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white transition-opacity duration-200 hover:bg-black/90 ${
              isHovered && showRightArrow
                ? "opacity-100"
                : "pointer-events-none opacity-0"
            }`}
            aria-label="Scroll right"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
}
