import { useState, useCallback } from "react";
import { ArrowUp } from "lucide-react";

interface AlphabetSidebarProps {
  /** Currently active letter */
  activeLetter?: string;
  /** Letters that have items */
  availableLetters?: string[];
  /** Handler when letter is clicked */
  onLetterClick?: (letter: string) => void;
  /** Handler when letter is hovered (for preview) */
  onLetterHover?: (letter: string | null) => void;
  /** Handler for return to top */
  onReturnToTop?: () => void;
}

const ALPHABET = ["#", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];

/**
 * Plex-style alphabetic navigation sidebar.
 * Shows letters vertically on the right side for quick navigation.
 */
export function AlphabetSidebar({
  activeLetter,
  availableLetters = ALPHABET,
  onLetterClick,
  onLetterHover,
  onReturnToTop,
}: AlphabetSidebarProps) {
  const [hoveredLetter, setHoveredLetter] = useState<string | null>(null);
  const [isTopHovered, setIsTopHovered] = useState(false);

  const handleMouseEnter = useCallback((letter: string) => {
    setHoveredLetter(letter);
    onLetterHover?.(letter);
  }, [onLetterHover]);

  const handleMouseLeave = useCallback(() => {
    setHoveredLetter(null);
    onLetterHover?.(null);
  }, [onLetterHover]);

  const handleReturnToTop = useCallback(() => {
    if (onReturnToTop) {
      onReturnToTop();
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [onReturnToTop]);

  return (
    <div className="fixed right-4 top-1/2 z-40 -translate-y-1/2">
      <div className="flex flex-col items-center gap-0.5 rounded-lg bg-black/40 px-1.5 py-2 backdrop-blur-sm">
        {/* Return to top button */}
        <button
          onClick={handleReturnToTop}
          onMouseEnter={() => setIsTopHovered(true)}
          onMouseLeave={() => setIsTopHovered(false)}
          className={`flex h-5 w-5 items-center justify-center rounded text-xs font-medium transition-colors mb-1 ${
            isTopHovered
              ? "bg-mango text-black"
              : "text-foreground-secondary hover:text-foreground-primary"
          }`}
          aria-label="Return to top"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <div className="w-full border-t border-white/20 mb-1" />
        {ALPHABET.map((letter) => {
          const isAvailable = availableLetters.includes(letter);
          const isActive = activeLetter === letter;
          const isHovered = hoveredLetter === letter;

          return (
            <button
              key={letter}
              onClick={() => isAvailable && onLetterClick?.(letter)}
              onMouseEnter={() => handleMouseEnter(letter)}
              onMouseLeave={handleMouseLeave}
              disabled={!isAvailable}
              className={`flex h-5 w-5 items-center justify-center rounded text-xs font-medium transition-colors ${
                isActive
                  ? "bg-mango text-black"
                  : isHovered && isAvailable
                  ? "bg-white/20 text-foreground-primary"
                  : isAvailable
                  ? "text-foreground-secondary hover:text-foreground-primary"
                  : "cursor-default text-foreground-muted/30"
              }`}
              aria-label={`Jump to ${letter === "#" ? "numbers" : letter}`}
            >
              {letter}
            </button>
          );
        })}
      </div>

      {/* Hover preview tooltip */}
      {(hoveredLetter || isTopHovered) && (
        <div className="absolute right-full top-1/2 mr-2 -translate-y-1/2 rounded-lg bg-background-elevated px-3 py-1.5 shadow-lg ring-1 ring-white/10">
          <span className="text-lg font-bold text-foreground-primary">
            {isTopHovered ? "Top" : hoveredLetter === "#" ? "0-9" : hoveredLetter}
          </span>
        </div>
      )}
    </div>
  );
}
