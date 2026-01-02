import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Typography } from "~/components/ui";

interface MediaRowProps {
  title: string;
  children: ReactNode;
}

export function MediaRow({ title, children }: MediaRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrollX, setScrollX] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const showLeftArrow = scrollX > 0;
  const showRightArrow = scrollX < maxScroll;

  // Track desktop vs mobile for transform vs native scroll
  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 640);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
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

  // Update max scroll when children change
  useEffect(() => {
    updateMaxScroll();
  }, [children, updateMaxScroll]);

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

      {/* Scroll container - native touch scroll on mobile, transform-based on desktop */}
      <div
        ref={containerRef}
        className="relative -mx-5 overflow-x-auto px-5 sm:overflow-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        onWheel={handleWheel}
        style={{ touchAction: 'pan-x' }}
      >
        {/* Left navigation arrow - hidden on mobile (touch), visible on desktop hover */}
        <button
          onClick={() => scroll("left")}
          className={`absolute left-5 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white transition-opacity duration-200 hover:bg-black/90 sm:flex ${
            isHovered && showLeftArrow
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        {/* Content container - static on mobile (uses native scroll), transforms on desktop */}
        <div
          ref={contentRef}
          className="flex snap-x snap-mandatory items-center gap-4 py-5 sm:snap-none md:gap-6"
          style={isDesktop ? {
            transform: `translateX(-${scrollX}px)`,
            transition: 'transform 0.3s ease-out',
          } : undefined}
        >
          {children}
        </div>

        {/* Right navigation arrow - hidden on mobile (touch), visible on desktop hover */}
        <button
          onClick={() => scroll("right")}
          className={`absolute right-5 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white transition-opacity duration-200 hover:bg-black/90 sm:flex ${
            isHovered && showRightArrow
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          aria-label="Scroll right"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
