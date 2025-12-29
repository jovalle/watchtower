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

  const showLeftArrow = scrollX > 0;
  const showRightArrow = scrollX < maxScroll;

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

      {/* Scroll container - overflow hidden with padding buffer for hover effects */}
      <div
        ref={containerRef}
        className="relative -mx-5 overflow-hidden px-5"
        onWheel={handleWheel}
      >
        {/* Left navigation arrow */}
        <button
          onClick={() => scroll("left")}
          className={`absolute left-5 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white transition-opacity duration-200 hover:bg-black/90 ${
            isHovered && showLeftArrow
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        {/* Content container - transforms for scrolling */}
        <div
          ref={contentRef}
          className="flex items-center gap-4 py-5 md:gap-6"
          style={{
            transform: `translateX(-${scrollX}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          {children}
        </div>

        {/* Right navigation arrow */}
        <button
          onClick={() => scroll("right")}
          className={`absolute right-5 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white transition-opacity duration-200 hover:bg-black/90 ${
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
